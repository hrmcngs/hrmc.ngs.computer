import {readFile,appendFile,mkdtemp,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {config,number,SafeError} from './core.js';
import {GitHub,botOwned} from './github.js';
import {editable} from './fix-core.js';
import {sameRevision} from './proposal-state.js';
const exec=promisify(execFile);
export function mergeConfig(cfg){
  const settings=cfg.autoMerge??{enabled:false,label:'ai-auto-merge',method:'squash',requiredChecks:['test']};
  if(typeof settings.enabled!=='boolean'||typeof settings.label!=='string'||!/^[\w-]{1,50}$/.test(settings.label)||!['squash','merge','rebase'].includes(settings.method)
    ||!Array.isArray(settings.requiredChecks)||!settings.requiredChecks.length||settings.requiredChecks.length>20||settings.requiredChecks.some(name=>typeof name!=='string'||!name.trim()||name.length>100))throw new SafeError('CONFIG');
  return settings;
}
export function botProposal(pr,repo,label){
  if(!botOwned(pr)||pr.state!=='open'||pr.draft||pr.merged||pr.head?.repo?.full_name!==repo||pr.base?.repo?.full_name!==repo||!pr.labels?.some(l=>l.name===label))return null;
  const match=pr.body?.match(/^<!-- ai-(fix|report):issue:([1-9]\d*) -->/);
  if(!match)return null;
  const n=number(match[2]),kind=match[1];
  if(!new RegExp(`^ai-${kind}/issue-${n}-[a-f0-9]{12}-[1-9]\\d*$`).test(pr.head.ref)||!/^[a-f0-9]{40}$/.test(pr.head.sha))return null;
  return{kind,issue:n};
}
export async function protection(gh,n){
  const [owner,name]=gh.repo.split('/');
  const query=`query($owner:String!,$name:String!,$n:Int!){repository(owner:$owner,name:$name){pullRequest(number:$n){headRefOid reviewDecision baseRef{branchProtectionRule{requiresApprovingReviews requiredApprovingReviewCount dismissesStaleReviews requiresStatusChecks requiredStatusCheckContexts requiresStrictStatusChecks isAdminEnforced}}}}}`;
  try{
    const response=await gh.fetcher('https://api.github.com/graphql',{method:'POST',headers:{Authorization:`Bearer ${gh.token}`,'Content-Type':'application/json'},body:JSON.stringify({query,variables:{owner,name,n:number(n)}}),redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error();
    const data=await response.json();if(data.errors?.length)throw new Error();
    const pr=data.data?.repository?.pullRequest;
    return{head:pr?.headRefOid,decision:pr?.reviewDecision,rule:pr?.baseRef?.branchProtectionRule};
  }catch{throw new SafeError('ACCESS');}
}
export function protectedPolicy(state,settings,sha){
  const rule=state?.rule;
  return state?.head===sha&&state.decision==='APPROVED'&&rule?.requiresApprovingReviews===true&&rule.requiredApprovingReviewCount>=1
    &&rule.dismissesStaleReviews===true&&rule.requiresStatusChecks===true&&rule.requiresStrictStatusChecks===true&&rule.isAdminEnforced===true
    &&Array.isArray(rule.requiredStatusCheckContexts)&&settings.requiredChecks.every(name=>rule.requiredStatusCheckContexts.includes(name));
}
async function humanApprovals(gh,n,sha,required){
  const reviews=await gh.list(gh.path(`/pulls/${number(n)}/reviews`));
  const latest=new Map();
  for(const review of reviews.sort((a,b)=>a.id-b.id)){
    if(review.user?.type==='User'&&['APPROVED','CHANGES_REQUESTED','DISMISSED'].includes(review.state))latest.set(review.user.login,review);
  }
  let count=0;
  for(const [login,review]of latest){
    const role=await gh.request(gh.path(`/collaborators/${encodeURIComponent(login)}/permission`));
    if(!['admin','maintain','write'].includes(role.permission))continue;
    if(review.state==='CHANGES_REQUESTED')return false;
    if(review.state==='APPROVED'&&review.commit_id===sha)count++;
  }
  return count>=required;
}
async function checks(gh,pr,names,workflowPath){
  const rows=[];
  for(let page=1;page<=10;page++){
    const data=await gh.request(gh.path(`/commits/${pr.head.sha}/check-runs?per_page=100&page=${page}`));
    if(!Array.isArray(data.check_runs))return false;
    rows.push(...data.check_runs);
    if(data.check_runs.length<100)break;
    if(page===10)return false;
  }
  const runs=new Map();
  for(const name of names){
    const check=rows.filter(row=>row.name===name&&row.app?.slug==='github-actions').sort((a,b)=>b.id-a.id)[0];
    if(!check||check.head_sha!==pr.head.sha||check.status!=='completed'||check.conclusion!=='success')return false;
    const url=check.details_url?.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/actions\/runs\/(\d+)\/jobs?\/\d+$/);
    if(!url||url[1]!==gh.repo)return false;
    let run=runs.get(url[2]);
    if(!run){run=await gh.request(gh.path(`/actions/runs/${number(url[2])}`));runs.set(url[2],run);}
    if(run.path!==workflowPath||run.head_sha!==pr.head.sha||run.head_repository?.full_name!==gh.repo||run.status!=='completed'||run.conclusion!=='success'||!['push','pull_request'].includes(run.event))return false;
  }
  return true;
}
export async function enableNativeMerge(gh,pr,method,run=exec){
  const home=await mkdtemp(join(tmpdir(),'ai-auto-merge-'));
  try{
    // --match-head-commit prevents a new unreviewed head from being merged. Never use --admin.
    await run('gh',['pr','merge',String(number(pr.number)),'--repo',gh.repo,'--auto',`--${method}`,'--match-head-commit',pr.head.sha],{env:{PATH:process.env.PATH,HOME:home,GH_CONFIG_DIR:home,GH_TOKEN:gh.token,GH_HOST:'github.com',GH_PROMPT_DISABLED:'1'},timeout:30000,maxBuffer:100000});
  }catch{throw new SafeError('ACCESS');}finally{await rm(home,{recursive:true,force:true});}
}
export async function considerMerge(gh,n,cfg,{getProtection=protection,enable=enableNativeMerge}={}){
  const settings=mergeConfig(cfg),wait=reason=>({merged:false,reason});
  if(!settings.enabled)return wait('設定で無効です。');
  const repo=await gh.request(gh.path());
  if(!repo.allow_auto_merge)return wait('GitHubのAllow auto-mergeが無効、またはプランが非対応です。');
  const pr=await gh.request(gh.path(`/pulls/${number(n)}`));
  const proposal=botProposal(pr,gh.repo,settings.label);
  if(!proposal||pr.base.ref!==repo.default_branch)return wait('対象のラベル付きBot PRではありません。');
  const currentIssue=await gh.request(gh.path(`/issues/${proposal.issue}`));
  if(currentIssue.state!=='open'||!sameRevision(pr,currentIssue))return wait('Issueが更新された旧版のPR、または版情報がないPRです。');
  if(pr.mergeable!==true||pr.mergeable_state!=='clean')return wait('競合、未完了の条件、またはマージ状態の確認待ちです。');
  if(!repo[settings.method==='merge'?'allow_merge_commit':`allow_${settings.method}_merge`])return wait('選択したマージ方法は許可されていません。');
  const state=await getProtection(gh,n);
  if(!protectedPolicy(state,settings,pr.head.sha))return wait('必須レビュー・必須CI・古い承認の失効・最新baseへの追従・バイパス禁止の保護ルールを確認できません。');
  if(!await humanApprovals(gh,n,pr.head.sha,state.rule.requiredApprovingReviewCount))return wait('最新コミットに対するwrite以上の人間の承認が不足しています。');
  const files=await gh.list(gh.path(`/pulls/${number(n)}/files`));
  if(!files.length||files.length>3||files.some(file=>!['added','modified'].includes(file.status)||!(proposal.kind==='report'?files.length===1&&file.filename===`reports/ai/issue-${proposal.issue}.md`:file.status==='modified'&&editable(file.filename,cfg))))return wait('Botが自動マージできる変更範囲ではありません。');
  // This repository's CI is fixed by trusted default-branch code, never by the PR body.
  if(!await checks(gh,pr,settings.requiredChecks,'.github/workflows/check.yml'))return wait('最新コミットの信頼したCIがすべて成功していません。');
  const fresh=await gh.request(gh.path(`/pulls/${number(n)}`));
  if(fresh.head.sha!==pr.head.sha||fresh.base.sha!==pr.base.sha||fresh.base.ref!==repo.default_branch||!botProposal(fresh,gh.repo,settings.label))return wait('確認中にPRが更新されました。');
  const freshIssue=await gh.request(gh.path(`/issues/${proposal.issue}`));
  if(freshIssue.state!=='open'||freshIssue.pull_request||!sameRevision(fresh,freshIssue))return wait('確認中にIssueが更新されました。');
  await enable(gh,fresh,settings.method);
  return{merged:true,reason:'人間の承認と必須CIを確認し、GitHubの保護ルールに従う自動マージを要求しました。'};
}
export async function autoMerge(env=process.env,ghArg){
  const cfg=config(JSON.parse(await readFile('.github/ai-bot/config.json','utf8'))),settings=mergeConfig(cfg);
  if(!settings.enabled)return;
  const gh=ghArg||new GitHub(env.GITHUB_REPOSITORY,env.GH_TOKEN);
  const event=JSON.parse(await readFile(env.GITHUB_EVENT_PATH,'utf8'));
  if(event.repository?.full_name!==gh.repo)throw new SafeError('ACCESS');
  if(!['workflow_dispatch','workflow_run','pull_request_review','schedule'].includes(env.GITHUB_EVENT_NAME))throw new SafeError('ACCESS');
  const repo=await gh.request(gh.path());
  let targets;
  if(env.GITHUB_EVENT_NAME==='workflow_dispatch'){
    if(env.GITHUB_REF!==`refs/heads/${repo.default_branch}`)throw new SafeError('ACCESS');
    const role=await gh.request(gh.path(`/collaborators/${encodeURIComponent(env.GITHUB_ACTOR)}/permission`));
    if(!['admin','maintain','write'].includes(role.permission))throw new SafeError('ACCESS');
    targets=[number(event.inputs?.number)];
  }else if(env.GITHUB_EVENT_NAME==='pull_request_review')targets=[number(event.pull_request?.number)];
  else targets=(await gh.list(gh.path('/pulls?state=open'))).filter(pr=>botProposal(pr,gh.repo,settings.label)).slice(0,10).map(pr=>number(pr.number));
  for(const n of targets){
    let result;
    try{result=await considerMerge(gh,n,cfg);}catch{result={merged:false,reason:'保護ルールまたはGitHub権限を確認できませんでした。設定とプランを確認してください。'};}
    const text=`PR #${n}: ${result.reason}`;console.log(text);
    if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,text+'\n\n');
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{await autoMerge();}catch{console.error('自動マージの設定またはGitHub権限を確認してください。');process.exitCode=1;}
}
