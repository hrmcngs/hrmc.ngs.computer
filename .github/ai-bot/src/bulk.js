import {readFile,appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {GitHub,botOwned} from './github.js';
import {config,number,SafeError,messages} from './core.js';
import {isCommand,requireCommand} from './commands.js';

const updateOnly=(event,env,mode)=>mode==='investigate'&&env.GITHUB_EVENT_NAME==='workflow_dispatch'&&event.inputs?.operation==='update-only';

// Reusable workers receive routing from the trusted selector, never from AI output.
export function workerEvent(env,event){
  if(env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.AI_BOT_WORKER!=='true')return event;
  return {...event,inputs:{...event.inputs,number:env.AI_BOT_NUMBER,target:env.AI_BOT_TARGET,
    result:env.AI_BOT_RESULT||'comment',reference_previous:env.AI_BOT_REFERENCE||'default',ai:env.AI_BOT_AI||'default'}};
}
export async function selectTargets(gh,event,env,cfg,mode,onWarning){
  if(!['fix','investigate'].includes(mode))throw new SafeError('CONFIG');
  if(event.repository?.full_name!==gh.repo)throw new SafeError('ACCESS');
  if(updateOnly(event,env,mode))return [];
  const trigger=env.GITHUB_EVENT_NAME;
  if(mode==='investigate'&&trigger==='workflow_dispatch'&&event.inputs?.operation!==undefined&&!['investigate','update-only'].includes(event.inputs.operation))throw new SafeError('CONFIG');
  if(trigger==='issue_comment'&&!isCommand(event,env,mode==='fix'?'/ai-fix':'/ai-investigate',mode==='fix')
    &&!(mode==='investigate'&&isCommand(event,env,'/ai-report-pr')))return [];
  const repo=await gh.request(gh.path());
  if(env.GITHUB_REF!==`refs/heads/${repo.default_branch}`)throw new SafeError('BULK_BRANCH');
  if(repo.private&&env.ALLOW_PRIVATE_REPOSITORY!=='true')throw new SafeError('PRIVATE');
  if(!['workflow_dispatch','issue_comment','issues','schedule'].includes(trigger))throw new SafeError('ACCESS');
  if(trigger!=='schedule'){
    const role=await gh.request(gh.path(`/collaborators/${encodeURIComponent(env.GITHUB_ACTOR)}/permission`));
    if(!['write','maintain','admin'].includes(role.permission))throw new SafeError('BULK_ROLE');
  }
  if(trigger==='issue_comment'){
    const command=mode==='fix'?'/ai-fix':isCommand(event,env,'/ai-report-pr')?'/ai-report-pr':'/ai-investigate';
    return [{kind:event.issue?.pull_request?'pull':'issue',number:String(await requireCommand(gh,event,env,command,mode==='fix'))}];
  }
  if(trigger==='issues'){
    const label=mode==='fix'?cfg.fix?.label:cfg.issueLabel;
    if(event.action!=='labeled'||event.label?.name!==label||event.issue?.pull_request||(mode==='investigate'&&cfg.mode!=='automatic')||(mode==='fix'&&!cfg.fix?.enabled))return [];
    return [{kind:'issue',number:String(number(event.issue.number))}];
  }
  if(trigger==='schedule'&&(mode==='fix'||cfg.mode!=='automatic'))return [];
  if(trigger==='schedule')return [{kind:'dependabot',number:'schedule'}];
  const kind=mode==='fix'?'issue':trigger==='schedule'?'dependabot':event.inputs?.target||'all';
  if(!['issue','dependabot','all'].includes(kind))throw new SafeError('BULK_TARGET');
  if(String(event.inputs?.number||'').trim()){
    if(kind==='all')throw new SafeError('BULK_NUMBER');
    return [{kind,number:String(number(event.inputs.number))}];
  }
  if(mode==='investigate'&&event.inputs?.result==='report-pr'&&kind!=='issue')throw new SafeError('BULK_REPORT');
  const targets=[];
  if(kind!=='dependabot'){
    let issues;try{issues=await gh.list(gh.path('/issues?state=open&sort=created&direction=asc'));}catch(error){if(error.code==='API_UNAVAILABLE')throw error;throw new SafeError('BULK_ISSUES');}
    for(const issue of issues)if(!issue.pull_request&&issue.state==='open'&&!botOwned(issue))targets.push({kind:'issue',number:String(number(issue.number))});
  }
  if(kind!=='issue'){
    // A partial all-target scan is allowed only when the caller explicitly reports the missing coverage.
    let alerts;
    try{alerts=await gh.list(gh.path('/dependabot/alerts?state=open&sort=created&direction=asc'));}
    catch(error){
      if(error.code==='API_UNAVAILABLE')throw error;
      if(kind!=='all'||error.code!=='ACCESS'||typeof onWarning!=='function')throw new SafeError('BULK_ALERTS');
      onWarning('Dependabotアラート一覧を取得できないため、Dependabotは未調査です。取得できたIssueだけを処理します。Dependabotも調査する場合は、導入先のDependabot alertsの有効化とワークフローのvulnerability-alerts: readを確認し、target=dependabotで再実行してください。');
      alerts=[];
    }
    for(const alert of alerts)if(alert.state==='open')targets.push({kind:'dependabot',number:String(number(alert.number))});
  }
  if(targets.length>256)throw new SafeError('BULK_LIMIT');
  return targets;
}
export async function select(env=process.env,ghArg){
  const gh=ghArg||new GitHub(env.GITHUB_REPOSITORY,env.GH_TOKEN);
  const event=JSON.parse(await readFile(env.GITHUB_EVENT_PATH,'utf8'));
  const mode=process.argv[2]==='scan-fix'?'fix':'investigate';
  const onlyUpdate=updateOnly(event,env,mode);
  const cfg=onlyUpdate?undefined:config(JSON.parse(await readFile('.github/ai-bot/config.json','utf8')));
  const warnings=[];
  const targets=await selectTargets(gh,event,env,cfg,mode,warning=>warnings.push(warning));
  if(env.GITHUB_OUTPUT)await appendFile(env.GITHUB_OUTPUT,`ready=${targets.length>0}\nmatrix=${JSON.stringify({include:targets})}\n`);
  for(const warning of warnings)console.log(`::warning::${warning}`);
  const text=onlyUpdate?'Bot更新のみを選択したため、AI調査は起動しません。Bot更新ジョブの結果を確認してください。':(warnings.length?`警告：一部の対象は未調査です。\n\n${warnings.join('\n\n')}\n\n`:'')+`起動対象: ${targets.length}件。各対象を個別に処理し、検証失敗時は修正PRを作成しません。`;
  console.log(text);if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,text+'\n');
}
// Report known failure categories without exposing inputs or API response bodies.
export function selectionError(error){
  const specific={
    BULK_BRANCH:'デフォルトブランチを選んで実行してください。',
    BULK_ROLE:'起動にはリポジトリのwrite以上の権限が必要です。',
    BULK_TARGET:'targetはall・issue・dependabotから選んでください。',
    BULK_NUMBER:'番号を指定するときはtargetをissueまたはdependabotにしてください。全件なら番号を空欄にします。',
    BULK_REPORT:'report-prはIssue用です。target=issueを選んでください。Dependabotはcommentによる調査のみです。',
    BULK_ISSUES:'Issue一覧を取得できませんでした。Issuesの有効化とissues: read権限を確認してください。',
    BULK_ALERTS:'Dependabotアラート一覧を取得できませんでした。Dependabot alertsとvulnerability-alerts: read権限を確認してください。Issueだけならtarget=issueで実行できます。',
    BULK_LIMIT:'対象が256件を超えています。IssueとDependabotを分けるか、対象を整理して再実行してください。'
  };
  return specific[error?.code]||messages[error?.code]||'対象一覧を取得できませんでした。GitHub権限とActionsの設定を確認してください。';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{await select();}catch(error){const text=selectionError(error);console.error(text);if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,text+'\n');process.exitCode=1;}
}
