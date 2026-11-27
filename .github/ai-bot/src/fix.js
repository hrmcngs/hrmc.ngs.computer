import {chooseAI,runAI,selectionMarker} from './ai-selection.js';
import {prepareRepair,publishRepair} from './conflicts.js';
import {workerEvent} from './bulk.js';
import { readFile, writeFile, mkdir, appendFile, stat, chmod, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { config, number, fingerprint, aiIdentity, SafeError, messages } from './core.js';
import { GitHub, botOwned, comments } from './github.js';
import { collectFiles, issueTarget } from './main.js';
import { tokyo, agent, command } from './providers.js';
import { isCommand, requireCommand, referenceChoice } from './commands.js';
import { markdown } from './markdown.js';
import { proposalLink, createLinkedProposal } from './proposals.js';
import {currentProposal,previousProposals,previousLinks,revisionMarker,referenceMarker} from './proposal-state.js';
import { changeable, editable, fixConfig, fixPrompt, parsePlan, planHash, fixId, literal, validationResult, validationFailure } from './fix-core.js';
const exec = promisify(execFile);
const marker = n => `<!-- ai-fix:issue:${number(n)} -->`;
const instructions = '修正PRを作成できませんでした。Issueの具体性、許可パス、検証設定を確認してください。';
const reasons = {
  STALE: '調査中にデフォルトブランチまたはIssueが更新されました。新しい実行で再調査してください。',
  OUTPUT: 'AIの修正案または取得データが形式・変更範囲の制約を満たしませんでした。PRは作成していません。',
  VALIDATION: 'オフライン環境での構文チェックまたは指定した検証が失敗しました。PRは作成していません。',
  DEPENDENCIES: '検証に必要な依存パッケージをオフライン環境に用意できません。検証を省略せず、PR作成を停止しました。',
  NOTIFY: 'PRは作成しましたがIssueへの返信に失敗しました。同じコマンドで再実行すると既存PRのリンクを返信します。',
  PR: '修正PRを作成できませんでした。ActionsによるPR作成の許可とリポジトリ権限を確認してください。'
};
async function json(file, limit=1000000) {
  if ((await stat(file)).size>limit)throw new SafeError('OUTPUT');
  try{return JSON.parse(await readFile(file,'utf8'));}catch{throw new SafeError('OUTPUT');}
}
async function save(file,data) { await mkdir('.work',{recursive:true});await writeFile(file,JSON.stringify(data),{mode:0o600}); }
async function summary(text,env) { if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,`${text}\n\n`); }
const generationCode=code=>['AUTH','LIMIT','NETWORK','RUNTIME','CONFIG','OUTPUT','INTERNAL'].includes(code)?code:'OUTPUT';
function generationFailure(code){const error=new SafeError(generationCode(code));error.phase='generation';return error;}
function safeReason(error) {
  const text=error instanceof SafeError && error.validation ? validationFailure(error.validation) : reasons[error?.code] || messages[error?.code] || instructions;
  return error instanceof SafeError && error.phase==='generation' ? `修正案の生成に失敗しました。構文チェック・テストは実行していません。\n\n${text}` : text;
}
function bundleValid(bundle,env) {
  config(bundle.cfg);fixConfig(bundle.cfg);
  if(bundle.repo!==env.GITHUB_REPOSITORY || !Array.isArray(bundle.targets) || bundle.targets.length!==1 || bundle.targets[0].kind!=='issue' || !/^[a-f0-9]{40}$/.test(bundle.targets[0].sha) || !Array.isArray(bundle.context?.files))throw new SafeError('OUTPUT');
  number(bundle.targets[0].number);
}
async function currentTarget(gh,n){return issueTarget(await gh.request(gh.path(`/issues/${number(n)}`)));}
async function post(gh,n,body,commandId) {
  const prefix=`${marker(n)}${commandId ? `<!-- ai-command:${number(commandId)} -->` : ''}\n`;
  const rows=await comments(gh,n);
  const existing=rows.find(row=>botOwned(row)&&row.body?.startsWith(prefix));
  if(existing)await gh.request(gh.path(`/issues/comments/${number(existing.id)}`),'PATCH',{body:prefix+body});
  else await gh.request(gh.path(`/issues/${number(n)}/comments`),'POST',{body:prefix+body});
}
export async function prepareFix(env=process.env,ghArg) {
  const gh=ghArg || new GitHub(env.GITHUB_REPOSITORY,env.GH_TOKEN);
  let cfg=config(await json('.github/ai-bot/config.json'));
  const event=workerEvent(env,await json(env.GITHUB_EVENT_PATH,2000000));
  cfg=chooseAI(cfg,event,env);
  if(env.GITHUB_EVENT_NAME==='issue_comment'&&event.issue?.pull_request)return prepareRepair(gh,event,env,cfg);
  if(!cfg.fix?.enabled)return;
  const settings=fixConfig(cfg);
  cfg.referencePreviousPRs=referenceChoice(event,env,cfg);
  if(!['issues','workflow_dispatch','issue_comment'].includes(env.GITHUB_EVENT_NAME))throw new SafeError('ACCESS');
  if(env.GITHUB_EVENT_NAME==='issues' && (event.action!=='labeled' || event.label?.name!==settings.label))return;
  if(env.GITHUB_EVENT_NAME==='issue_comment' && !isCommand(event,env,'/ai-fix'))return;
  const repo=await gh.request(gh.path());
  if(repo.private && env.ALLOW_PRIVATE_REPOSITORY!=='true')throw new SafeError('PRIVATE');
  if(event.repository?.full_name!==gh.repo || env.GITHUB_REF!==`refs/heads/${repo.default_branch}`)throw new SafeError('ACCESS');
  const permission=await gh.request(gh.path(`/collaborators/${encodeURIComponent(env.GITHUB_ACTOR)}/permission`));
  if(!['admin','maintain','write'].includes(permission.permission))throw new SafeError('ACCESS');
  const n=env.GITHUB_EVENT_NAME==='issue_comment'
    ? await requireCommand(gh,event,env,'/ai-fix')
    : number(env.GITHUB_EVENT_NAME==='issues'?event.issue?.number:event.inputs?.number);
  const issue=await gh.request(gh.path(`/issues/${n}`));
  const target=issueTarget(issue);
  if(env.GITHUB_EVENT_NAME==='issues' && !issue.labels.some(l=>l.name===settings.label))return;
  const existing=await currentProposal(gh,'fix',target,cfg.referencePreviousPRs,cfg);
  if(existing){
    const body=`${proposalLink(gh,existing.number)} が既にあります。追加のAI呼び出しやPR作成は行いません。`;
    await post(gh,n,body,env.GITHUB_EVENT_NAME==='issue_comment'?event.comment.id:undefined);
    await summary(body,env);return;
  }
  const ref=await gh.request(gh.path(`/git/ref/heads/${encodeURIComponent(repo.default_branch)}`));
  const sha=ref.object?.sha;
  if(!/^[a-f0-9]{40}$/.test(sha))throw new SafeError('ACCESS');
  if(env.GITHUB_SHA && env.GITHUB_SHA!==sha)throw new SafeError('STALE');
  const context=await collectFiles(gh,sha,cfg,[target]);
  context.previousProposals=await previousProposals(gh,'fix',target,cfg);
  const bundle={version:1,repo:gh.repo,branch:repo.default_branch,cfg,targets:[{...target,sha,fingerprint:fingerprint(target,sha,cfg)}],context};
  await save('.work/fix-bundle.json',bundle);
  if(env.GITHUB_OUTPUT)await appendFile(env.GITHUB_OUTPUT,`ready=true\nprovider=${cfg.aiMode==='all'?'all':cfg.provider}\nsha=${sha}\n`);
}
export async function generateFix(env=process.env,providers={tokyo,agent}) {
  const bundle=await json('.work/fix-bundle.json');bundleValid(bundle,env);
  try {
    if(!bundle.context.files.some(f=>changeable(f.path,bundle))) {
      await save('.work/fix-plan.json',{ok:true,plan:{confidence:'low',summary:'取得資料に変更可能な既存JavaScriptファイルがありません。includeの設定とIssueに関連するファイルを確認してください。',changes:[]}});return;
    }
    const input=fixPrompt(bundle);
    if(Buffer.byteLength(input)>190000)throw new SafeError('CONFIG');
    const cfg=bundle.cfg;
    const text=await runAI(cfg,input,env,providers,60000);
    const plan=parsePlan(text,bundle);
    await save('.work/fix-plan.json',{ok:true,plan});
    if(plan.changes.length && env.GITHUB_OUTPUT)await appendFile(env.GITHUB_OUTPUT,'has-changes=true\n');
  }catch(error){const failure=generationFailure(error instanceof SafeError?error.code:'INTERNAL');await save('.work/fix-plan.json',{ok:false,code:failure.code,reason:safeReason(failure)});}
}
export async function validateFix(env=process.env,{run=command,git=exec}={}) {
  const bundle=await json('.work/fix-bundle.json');bundleValid(bundle,env);
  const result=await json('.work/fix-plan.json',100000);
  const target=bundle.targets[0];
  let verdict;
  let container;
  try{
    if(!result.ok)verdict={ok:false,code:generationCode(result.code),stage:'generation',reason:result.reason};
    else {
      const plan=parsePlan(result.plan,bundle);
      if(!plan.changes.length)verdict={ok:false,code:'NO_CHANGES',reason:plan.summary};
      else {
        const settings=fixConfig(bundle.cfg);
        const archive=resolve('.work/fix-source.tar'),validation=resolve('.work/fix-validation.json');
        const {stdout}=await git('git',['ls-tree','-r','-l',target.sha],{encoding:'utf8',maxBuffer:2000000});
        const rows=stdout.trim().split('\n');
        const total=rows.reduce((sum,row)=>sum+Number(row.split('\t')[0].trim().split(/\s+/)[3] || 0),0);
        if(rows.length>5000 || !Number.isFinite(total) || total>32000000)throw new SafeError('VALIDATION');
        await git('git',['archive','--format=tar',`--output=${archive}`,target.sha],{timeout:30000,maxBuffer:1000});
        await chmod(archive,0o644);
        await save(validation,{plan,commands:settings.commands,originals:bundle.context.files.filter(f=>plan.changes.some(c=>c.path===f.path))});
        await chmod(validation,0o644);
        container=`ai-fix-verify-${randomBytes(8).toString('hex')}`;
        const output=await run(['run','--name',container,'--network=none','--read-only','--user=0:0','--cap-drop=ALL','--cap-add=SETUID','--cap-add=SETGID','--security-opt=no-new-privileges','--pids-limit=128','--memory=1g','--cpus=1','--ulimit','cpu=180:180','--ulimit','fsize=8388608:8388608','--ulimit','nofile=256:256','--tmpfs','/workspace:rw,nosuid,nodev,size=128m,uid=0,gid=0','--tmpfs','/tmp:rw,exec,nosuid,nodev,size=64m,uid=1000,gid=1000','--mount',`type=bind,src=${archive},dst=/input/source.tar,readonly`,'--mount',`type=bind,src=${validation},dst=/input/validation.json,readonly`,'--log-driver=none','ai-bot-verify:local'],{timeout:540000});
        const report=validationResult(output,plan,settings.commands);
        verdict=report.ok
          ? {ok:true,hash:planHash(plan),sha:target.sha,commands:settings.commands,checks:report.checks}
          : {ok:false,code:report.stage==='dependencies'?'DEPENDENCIES':'VALIDATION',reason:validationFailure(report),checks:report.checks,stage:report.stage};
      }
    }
  }catch(error){verdict={ok:false,code:error.code==='DEPENDENCIES'?'DEPENDENCIES':'VALIDATION',reason:error.code==='DEPENDENCIES'?reasons.DEPENDENCIES:reasons.VALIDATION};}
  finally{
    if(container)await run(['rm','--force',container]).catch(()=>{});
    await rm('.work/fix-source.tar',{force:true});await rm('.work/fix-validation.json',{force:true});
  }
  await save('.work/fix-verdict.json',verdict);
}
export async function publishFix(env=process.env,ghArg) {
  const gh=ghArg || new GitHub(env.GITHUB_REPOSITORY,env.GH_TOKEN);
  const bundle=await json('.work/fix-bundle.json');bundleValid(bundle,env);
  const result=await json('.work/fix-plan.json',100000),verdict=await json('.work/fix-verdict.json',100000);
  const event=workerEvent(env,await json(env.GITHUB_EVENT_PATH,2000000));
  const target=bundle.targets[0],n=number(target.number);
  if(bundle.repair)return publishRepair(gh,event,env,bundle,result,verdict);
  const settings=fixConfig(bundle.cfg);
  if(!settings.enabled)throw new SafeError('ACCESS');
  if(event.repository?.full_name!==gh.repo)throw new SafeError('ACCESS');
  if(env.GITHUB_EVENT_NAME==='issues') {
    if(event.action!=='labeled' || event.label?.name!==settings.label || number(event.issue?.number)!==n)throw new SafeError('ACCESS');
  }else if(env.GITHUB_EVENT_NAME==='issue_comment'){
    if(number(event.issue?.number)!==n)throw new SafeError('ACCESS');
    await requireCommand(gh,event,env,'/ai-fix');
  }else if(env.GITHUB_EVENT_NAME!=='workflow_dispatch' || number(event.inputs?.number)!==n)throw new SafeError('ACCESS');
  const repo=await gh.request(gh.path());
  if(repo.private && env.ALLOW_PRIVATE_REPOSITORY!=='true')throw new SafeError('PRIVATE');
  if(env.GITHUB_REF!==`refs/heads/${repo.default_branch}` || bundle.branch!==repo.default_branch)throw new SafeError('ACCESS');
  const permission=await gh.request(gh.path(`/collaborators/${encodeURIComponent(env.GITHUB_ACTOR)}/permission`));
  if(!['admin','maintain','write'].includes(permission.permission))throw new SafeError('ACCESS');
  const commandId=env.GITHUB_EVENT_NAME==='issue_comment'?number(event.comment.id):undefined;
  const runUrl=`https://github.com/${gh.repo}/actions/runs/${number(env.GITHUB_RUN_ID)}`;
  const footer=`\n\n[Actionsの実行結果](${runUrl})\n\n人間によるレビューが必要です。自動マージは専用ラベルと保護ルールを設定した場合だけ有効です。`;
  const failure=async(reason)=>{const body=`修正PRは作成していません。\n\n今回の設定 — ${aiIdentity(bundle.cfg)}\n\n${markdown(reason)}${footer}`;await post(gh,n,body,commandId);await summary(body,env);};
  if(!result.ok || !verdict.ok){
    let reason=verdict.reason || result.reason || instructions;
    if(result.ok){try{const proposal=parsePlan(result.plan,bundle);if(proposal.summary!==reason)reason+=`\n\nAIの調査結果:\n${proposal.summary}`;}catch{}}
    await failure(reason);
    // Abstaining is an expected outcome, not a test failure. Verify the empty plan again.
    if(result.ok && verdict.code==='NO_CHANGES' && parsePlan(result.plan,bundle).changes.length===0)return;
    const error=!result.ok?generationFailure(result.code??verdict.code):new SafeError(verdict.code==='DEPENDENCIES'?'DEPENDENCIES':'VALIDATION');
    if(result.ok && verdict.stage && Array.isArray(verdict.checks)){
      try{error.validation=validationResult(JSON.stringify({version:1,ok:false,stage:verdict.stage,checks:verdict.checks}),parsePlan(result.plan,bundle),settings.commands);}catch{}
    }
    throw error;
  }
  const plan=parsePlan(result.plan,bundle);
  if(!plan.changes.length || verdict.hash!==planHash(plan) || verdict.sha!==target.sha || JSON.stringify(verdict.commands)!==JSON.stringify(settings.commands))throw new SafeError('OUTPUT');
  const ref=await gh.request(gh.path(`/git/ref/heads/${encodeURIComponent(repo.default_branch)}`));
  const issue=await gh.request(gh.path(`/issues/${n}`));
  if(ref.object?.sha!==target.sha || fingerprint(issueTarget(issue),target.sha,bundle.cfg)!==target.fingerprint || (env.GITHUB_EVENT_NAME==='issues' && !issue.labels.some(l=>l.name===settings.label))) {
    await failure(reasons.STALE);throw new SafeError('STALE');
  }
  const existing=await currentProposal(gh,'fix',target,bundle.cfg.referencePreviousPRs,bundle.cfg);
  if(existing){await post(gh,n,`${proposalLink(gh,existing.number)} が既にあります。${footer}`,commandId);return;}
  // Re-read original blobs before any writes. Every proposed path must remain a regular tracked file.
  const tree=await gh.request(gh.path(`/git/trees/${target.sha}?recursive=1`));
  if(tree.truncated)throw new SafeError('ACCESS');
  for(const change of plan.changes){
    const entry=tree.tree.find(f=>f.path===change.path && f.type==='blob' && f.mode==='100644');
    if(!entry || !/^[a-f0-9]{40}$/.test(entry.sha))throw new SafeError('OUTPUT');
    const blob=await gh.request(gh.path(`/git/blobs/${entry.sha}`));
    if(blob.encoding!=='base64' || Buffer.from(blob.content,'base64').toString('utf8')!==bundle.context.files.find(f=>f.path===change.path)?.content)throw new SafeError('OUTPUT');
  }
  const prBody=`${marker(n)}\n${revisionMarker(target)}\n${referenceMarker(bundle.cfg.referencePreviousPRs??true)}\n${selectionMarker(bundle.cfg)}\nCloses #${n}\n\n${aiIdentity(bundle.cfg)}\n\nAIによる修正提案です。人間のレビューが必要です。\n\n旧PRの参照: ${(bundle.cfg.referencePreviousPRs??true)?'あり':'なし'}\n\n${markdown(plan.summary)}\n\n検証対象SHA: \`${target.sha}\`\n変更したJavaScriptの構文チェック: 成功\nオフライン・Secretなし環境での検証: 成功\n\n${literal(settings.commands.map(args=>args.join(' ')).join('\n'))}\n\nネットワークを必要とする検証は行っていません。検証成功は修正の正しさを保証しません。${previousLinks(gh,bundle.context.previousProposals)}${footer}`;
  try{
    await createLinkedProposal(gh,{kind:'fix',issue:n,runId:env.GITHUB_RUN_ID,sha:target.sha,id:fixId(bundle),base:bundle.branch,title:`fix: address issue #${n}`,body:prBody,files:plan.changes,notify:async(pr)=>{
      const body=`修正案を ${proposalLink(gh,pr.number)} に作成しました。\n\n${aiIdentity(bundle.cfg)}\n\n${markdown(plan.summary)}\n\n構文チェックと設定された検証は成功しました。変更内容とテストの妥当性をレビューしてください。${footer}`;
      await post(gh,n,body,commandId);await summary(body,env);
    }});
  }catch(error){
    if(error.code==='NOTIFY'){await summary(`${proposalLink(gh,error.proposalNumber)} は作成済みです。${reasons.NOTIFY}`,env);throw error;}
    await failure(reasons.PR);throw new SafeError('PR');
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const action={prepare:prepareFix,generate:generateFix,validate:validateFix,publish:publishFix}[process.argv[2]];
    if(!action)throw new SafeError('CONFIG');await action();
  }catch(error){const text=safeReason(error);console.error(text);await summary(text,process.env).catch(()=>{});process.exitCode=1;}
}
