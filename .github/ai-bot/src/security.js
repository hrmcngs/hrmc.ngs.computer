import {readFile,writeFile,mkdir,appendFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {GitHub,botOwned} from './github.js';
import {config,SafeError,number,aiIdentity,cleanOutput,scrub} from './core.js';
import {chooseAI,runAI} from './ai-selection.js';
import {collectFiles} from './main.js';
import {fixConfig,fixPrompt,parsePlan,planHash,literal} from './fix-core.js';
import {validateFix} from './fix.js';
import {guidance} from './guidance.js';
import {markdown} from './markdown.js';
import {createLinkedProposal,proposalLink} from './proposals.js';

export const SECURITY_MARKER='<!-- ai-security-audit:v1 -->';
const REPORT='reports/ai/security-audit.md';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
async function json(path,max=1000000){if((await stat(path)).size>max)throw new SafeError('CONFIG');return JSON.parse(await readFile(path,'utf8'));}
async function save(path,value){await mkdir('.work',{recursive:true});await writeFile(path,JSON.stringify(value),{mode:0o600});}
async function summary(env,text){console.log(text);if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,text+'\n');}
export function auditId(cfg,context){return hash({policy:1,cfg,files:context.files,guidance:guidance('fix')});}
export async function auditAccess(gh,event,env,cfg){
  config(cfg);
  if(!cfg.securityAudit?.enabled)return null;
  if(env.GITHUB_REPOSITORY!==gh.repo||event.repository?.full_name!==gh.repo||!['push','schedule','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME))throw new SafeError('ACCESS');
  const repo=await gh.request(gh.path());
  if(env.GITHUB_REF!==`refs/heads/${repo.default_branch}`)throw new SafeError('ACCESS');
  if(repo.private&&env.ALLOW_PRIVATE_REPOSITORY!=='true')throw new SafeError('PRIVATE');
  if(env.GITHUB_EVENT_NAME!=='schedule'){
    const role=await gh.request(gh.path(`/collaborators/${encodeURIComponent(env.GITHUB_ACTOR)}/permission`));
    if(!['admin','maintain','write'].includes(role.permission))throw new SafeError('ACCESS');
  }
  return repo;
}
export async function existingAudit(gh,id,branch){
  return(await gh.list(gh.path('/pulls?state=all'))).find(pr=>botOwned(pr)&&pr.body?.startsWith(`${SECURITY_MARKER}\n<!-- ai-security-context:${id} -->\n`)
    &&pr.head?.repo?.full_name===gh.repo&&pr.base?.repo?.full_name===gh.repo&&pr.base.ref===branch&&/^ai-security\/bot-[a-f0-9]{12}-[1-9]\d*$/.test(pr.head.ref||''));
}
export async function prepareSecurity(env=process.env,ghArg){
  const cfg=config(await json('.github/ai-bot/config.json'));
  const gh=ghArg||new GitHub(env.GITHUB_REPOSITORY,env.GH_TOKEN),event=await json(env.GITHUB_EVENT_PATH,2000000);
  const repo=await auditAccess(gh,event,env,cfg);
  if(!repo){await summary(env,'自動セキュリティ監査は無効です。securityAudit.enabled=trueで有効にできます。');return;}
  const selected=chooseAI(cfg,{...event,inputs:{ai:'default'}},env);
  const targetSha=(await gh.request(gh.path(`/git/ref/heads/${encodeURIComponent(repo.default_branch)}`))).object?.sha;
  if(!sha(targetSha)||targetSha!==env.GITHUB_SHA)throw new SafeError('STALE');
  const context=await collectFiles(gh,targetSha,selected,[]);
  if(!context.files.length){await summary(env,'監査できる資料がありません。includeを確認してください。');return;}
  const id=auditId(selected,context),existing=await existingAudit(gh,id,repo.default_branch);
  if(existing){await summary(env,`同じ資料の監査は ${proposalLink(gh,existing.number)} にあります。新しいAI呼び出し・PR作成は省略します。`);return;}
  // Internal target only: no synthetic Issue is created or published.
  const target={kind:'issue',number:1,sha:targetSha,title:'許可されたソースのセキュリティ監査',body:'同梱のセキュリティ指針に基づき、入力から処理先までの経路・既存防御・実害・不確実性を確認し、根拠のある最小修正を提案してください。'};
  await save('.work/fix-bundle.json',{version:1,security:true,repo:gh.repo,branch:repo.default_branch,cfg:selected,rawConfigHash:hash(cfg),targets:[target],context,id});
  if(env.GITHUB_OUTPUT)await appendFile(env.GITHUB_OUTPUT,`ready=true\nprovider=${selected.aiMode==='all'?'all':selected.provider}\nsha=${targetSha}\n`);
}
function bundleValid(bundle,env){
  config(bundle.cfg);
  if(bundle.security!==true||bundle.repo!==env.GITHUB_REPOSITORY||bundle.targets?.length!==1||!sha(bundle.targets[0].sha)||bundle.id!==auditId(bundle.cfg,bundle.context))throw new SafeError('OUTPUT');
}
export async function generateSecurity(env=process.env,providers){
  const bundle=await json('.work/fix-bundle.json');bundleValid(bundle,env);
  try{
    const canFix=bundle.cfg.fix?.enabled===true;if(canFix)fixConfig(bundle.cfg);
    const input='これはIssue対応ではなく、取得範囲内の静的セキュリティ監査です。summaryに根拠・入力経路・既存防御・要検証の点・取得範囲の制約を含めてください。脆弱性を無理に作らず、検出なしと安全性保証を区別してください。\n'
      +(canFix?'検証できる最小のコード案だけを提案してください。\n':'コード修正は無効です。changesは必ず空配列にし、監査結果だけをsummaryに記載してください。\n')+fixPrompt(bundle);
    if(Buffer.byteLength(input)>190000)throw new SafeError('CONFIG');
    const text=await runAI(bundle.cfg,input,env,providers,60000),plan=parsePlan(text,bundle);
    if(!canFix&&plan.changes.length)throw new SafeError('OUTPUT');
    await save('.work/fix-plan.json',{ok:true,plan});
    if(plan.changes.length&&env.GITHUB_OUTPUT)await appendFile(env.GITHUB_OUTPUT,'has-changes=true\n');
  }catch(error){await save('.work/fix-plan.json',{ok:false,code:['AUTH','LIMIT','NETWORK','RUNTIME','CONFIG','OUTPUT'].includes(error.code)?error.code:'INTERNAL'});}
}
export async function validateSecurity(env=process.env,tools){
  const bundle=await json('.work/fix-bundle.json'),result=await json('.work/fix-plan.json',100000);bundleValid(bundle,env);
  if(!result.ok){await save('.work/fix-verdict.json',{ok:false,stage:'generation'});return;}
  const plan=parsePlan(result.plan,bundle);
  if(!plan.changes.length){await save('.work/fix-verdict.json',{ok:false,code:'NO_CHANGES',reason:'コード修正を行わず、静的監査レポートとして提案します。'});return;}
  if(bundle.cfg.fix?.enabled!==true)throw new SafeError('ACCESS');
  await validateFix(env,tools);
}
export async function securityDestination(gh,targetSha){
  const data=await gh.request(gh.path(`/git/trees/${targetSha}?recursive=1`));
  if(data.truncated||!Array.isArray(data.tree))throw new SafeError('OUTPUT');
  for(const parent of ['reports','reports/ai']){
    const entry=data.tree.find(row=>row.path===parent);if(entry&&(entry.type!=='tree'||entry.mode!=='040000'))throw new SafeError('OUTPUT');
  }
  const entry=data.tree.find(row=>row.path===REPORT);
  if(entry){
    if(entry.type!=='blob'||entry.mode!=='100644'||!sha(entry.sha)||entry.size>100000)throw new SafeError('OUTPUT');
    const blob=await gh.request(gh.path(`/git/blobs/${entry.sha}`));
    if(blob.encoding!=='base64'||typeof blob.content!=='string'||!Buffer.from(blob.content,'base64').toString('utf8').startsWith(SECURITY_MARKER+'\n'))throw new SafeError('OUTPUT');
  }
}
export async function publishSecurity(env=process.env,ghArg){
  const gh=ghArg||new GitHub(env.GITHUB_REPOSITORY,env.GH_TOKEN),event=await json(env.GITHUB_EVENT_PATH,2000000);
  const bundle=await json('.work/fix-bundle.json'),result=await json('.work/fix-plan.json',100000),verdict=await json('.work/fix-verdict.json',100000);bundleValid(bundle,env);
  const raw=config(await json('.github/ai-bot/config.json')),repo=await auditAccess(gh,event,env,raw);
  if(!repo||hash(raw)!==bundle.rawConfigHash||repo.default_branch!==bundle.branch)throw new SafeError('STALE');
  const availability=Object.fromEntries(['tokyo','claude','codex'].map(p=>[`AI_BOT_HAS_${p.toUpperCase()}`,String(bundle.cfg.aiProviders?.includes(p)===true)]));
  if(hash(chooseAI(raw,{inputs:{ai:'default'}},{GITHUB_EVENT_NAME:'workflow_dispatch',...availability}))!==hash(bundle.cfg))throw new SafeError('OUTPUT');
  if(!result.ok)throw new SafeError(['AUTH','LIMIT','NETWORK','RUNTIME','CONFIG','OUTPUT'].includes(result.code)?result.code:'INTERNAL');
  const plan=parsePlan(result.plan,bundle),targetSha=bundle.targets[0].sha;
  const existing=await existingAudit(gh,bundle.id,repo.default_branch);
  if(existing){await summary(env,`監査PRは ${proposalLink(gh,existing.number)} です。重複作成はしません。`);return;}
  const fixed=verdict.ok===true;
  if(fixed&&(raw.fix?.enabled!==true||!plan.changes.length||verdict.hash!==planHash(plan)||verdict.sha!==targetSha||JSON.stringify(verdict.commands)!==JSON.stringify(fixConfig(raw).commands)))throw new SafeError('OUTPUT');
  let files;
  if(fixed){
    const data=await gh.request(gh.path(`/git/trees/${targetSha}?recursive=1`));if(data.truncated||!Array.isArray(data.tree))throw new SafeError('OUTPUT');
    for(const change of plan.changes){
      const entry=data.tree.find(row=>row.path===change.path&&row.type==='blob'&&row.mode==='100644');if(!entry||!sha(entry.sha))throw new SafeError('OUTPUT');
      const blob=await gh.request(gh.path(`/git/blobs/${entry.sha}`));if(blob.encoding!=='base64'||Buffer.from(blob.content,'base64').toString('utf8')!==bundle.context.files.find(row=>row.path===change.path)?.content)throw new SafeError('OUTPUT');
    }
    files=plan.changes;
  }else{
    await securityDestination(gh,targetSha);
    const reason=verdict.code==='NO_CHANGES'?'コードの修正・テストは行っていません。':'修正案の検証は成功していません。修正コードは含めず、結果をレポートします。';
    files=[{path:REPORT,content:`${SECURITY_MARKER}\n# AIセキュリティ監査レポート\n\n${aiIdentity(bundle.cfg)}\n\n対象SHA: ${targetSha}\n\n${reason}\n\n${markdown(cleanOutput(plan.summary))}\n\n検証情報:\n${literal(scrub(JSON.stringify({code:verdict.code,stage:verdict.stage,checks:verdict.checks}))) }\n\n取得したファイル: ${bundle.context.files.map(file=>'`'+file.path+'`').join(', ')}\n\n限定された資料の静的調査です。独立した脆弱性再現や網羅的監査は行っていません。人間によるレビューが必要です。\n`}];
  }
  // No code or report is published against a changed source or revoked consent.
  if(!await auditAccess(gh,event,env,raw)||(await gh.request(gh.path(`/git/ref/heads/${encodeURIComponent(bundle.branch)}`))).object?.sha!==targetSha)throw new SafeError('STALE');
  const run=number(env.GITHUB_RUN_ID);
  return createLinkedProposal(gh,{kind:'security',runId:run,sha:targetSha,id:bundle.id,base:bundle.branch,title:fixed?'fix: AIセキュリティ監査による修正提案':'docs: AIセキュリティ監査レポート',
    body:`${SECURITY_MARKER}\n<!-- ai-security-context:${bundle.id} -->\n\n${aiIdentity(bundle.cfg)}\n\n対象SHA: ${targetSha}\n\n${fixed?'Secretなし・オフラインの検証に成功したコード修正案です。テスト成功は脆弱性の再現や修正の完全性を保証しません。':'修正コードを含まない静的監査レポートです。'}\n\n${markdown(cleanOutput(plan.summary))}\n\n検証: ${literal(scrub(JSON.stringify({ok:verdict.ok,code:verdict.code,stage:verdict.stage,commands:verdict.commands,checks:verdict.checks})))}\n\n[Actionsの実行結果](https://github.com/${gh.repo}/actions/runs/${run})\n\n人間によるレビューが必要です。この監査PRは自動マージ対象ではありません。`,files,notify:async pr=>summary(env,`セキュリティ監査PR: ${proposalLink(gh,pr.number)}`)});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{const action={prepare:prepareSecurity,generate:generateSecurity,validate:validateSecurity,publish:publishSecurity}[process.argv[2]];if(!action)throw new SafeError('CONFIG');await action();}
  catch(error){const text=error.code==='PR'?'セキュリティ監査PRを作成できませんでした。導入先の Settings → Actions → General → Workflow permissions で Allow GitHub Actions to create and approve pull requests を有効にしてSaveし、security-audit.ymlのpublishジョブのcontents/write・pull-requests/writeを確認してください。':`セキュリティ監査を完了できませんでした。安全なエラー分類: ${['AUTH','LIMIT','NETWORK','RUNTIME','CONFIG','OUTPUT','ACCESS','PRIVATE','STALE'].includes(error.code)?error.code:'INTERNAL'}。AIキー・有効化・許可パス・権限を確認してください。`;console.error(text);if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,text+'\n').catch(()=>{});process.exitCode=1;}
}
