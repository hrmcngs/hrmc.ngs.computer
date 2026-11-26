import {chooseAI,runAI,selectionMarker} from './ai-selection.js';
import {workerEvent} from './bulk.js';
import { readFile, writeFile, mkdir, appendFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { config, number, allowedPath, scrub, fingerprint, prompt, cleanOutput, comment, SafeError, messages } from './core.js';
import { GitHub, comments, reportIssue, completed, botOwned, REPORT_MARKER } from './github.js';
import { tokyo, agent } from './providers.js';
import { isCommand, requireCommand, referenceChoice } from './commands.js';
import { openReport, publishReport } from './report-pr.js';
import {issueRevision,previousProposals} from './proposal-state.js';

async function json(path, max = 1000000) {
  if ((await stat(path)).size > max) throw new SafeError('CONFIG');
  return JSON.parse(await readFile(path, 'utf8'));
}
async function save(path, value) { await mkdir('.work', { recursive: true }); await writeFile(path, JSON.stringify(value), { mode: 0o600 }); }
export function issueTarget(issue) {
  if (issue.pull_request || issue.state !== 'open') throw new SafeError('ACCESS');
  return { kind: 'issue', number: number(issue.number), revision: issueRevision(issue), title: String(issue.title).slice(0,1000), body: scrub(String(issue.body || '')).slice(0,18000) };
}
function alertTarget(alert) {
  if (alert.state !== 'open') throw new SafeError('ACCESS');
  const advisory = alert.security_advisory || {}, vulnerability = alert.security_vulnerability || {};
  return { kind: 'dependabot', number: number(alert.number), dependency: alert.dependency, advisory: {
    ghsa_id: advisory.ghsa_id, cve_id: advisory.cve_id, summary: advisory.summary,
    description: scrub(String(advisory.description || '')).slice(0,18000), severity: advisory.severity
  }, vulnerability: { package: vulnerability.package, vulnerable_version_range: vulnerability.vulnerable_version_range, first_patched_version: vulnerability.first_patched_version } };
}
export async function collectFiles(gh, sha, cfg, targets) {
  const tree = await gh.request(gh.path(`/git/trees/${sha}?recursive=1`));
  if (tree.truncated || !Array.isArray(tree.tree)) throw new SafeError('ACCESS');
  const priority = new Set(targets.map(t => t.dependency?.manifest_path).filter(Boolean));
  const candidates = tree.tree.filter(f => f.type === 'blob' && f.mode === '100644' && f.size <= cfg.maxFileBytes && allowedPath(f.path,cfg))
    .sort((a,b) => Number(priority.has(b.path))-Number(priority.has(a.path)) || a.path.localeCompare(b.path));
  const files = []; let used = 0;
  for (const f of candidates) {
    if (files.length >= cfg.maxFiles) break;
    if (used+f.size > cfg.maxContextBytes) continue;
    if (!/^[a-f0-9]{40}$/.test(f.sha)) throw new SafeError('ACCESS');
    const blob = await gh.request(gh.path(`/git/blobs/${f.sha}`));
    if (blob.encoding !== 'base64' || typeof blob.content !== 'string' || blob.size > cfg.maxFileBytes) throw new SafeError('ACCESS');
    const bytes = Buffer.from(blob.content,'base64');
    if (bytes.length > cfg.maxFileBytes || bytes.includes(0)) continue;
    const content = scrub(bytes.toString('utf8'));
    if (used+Buffer.byteLength(content) > cfg.maxContextBytes) continue;
    files.push({ path: f.path, content }); used += Buffer.byteLength(content);
  }
  return { files, omittedFiles: candidates.length-files.length, note: '許可パス・容量・件数の制限で一部だけを取得。Issueコメントや外部URLは調査資料に含めていません。' };
}
export async function prepare(env = process.env, ghArg) {
  const gh = ghArg || new GitHub(env.GITHUB_REPOSITORY, env.GH_TOKEN);
  let cfg = config(await json('.github/ai-bot/config.json'));
  const event = workerEvent(env,await json(env.GITHUB_EVENT_PATH,2000000));
  cfg=chooseAI(cfg,event,env);
  cfg.referencePreviousPRs=referenceChoice(event,env,cfg);
  const reportPR = isCommand(event,env,'/ai-report-pr') || (env.GITHUB_EVENT_NAME === 'workflow_dispatch' && event.inputs?.result === 'report-pr');
  if (env.GITHUB_EVENT_NAME === 'issue_comment' && !isCommand(event,env,'/ai-investigate') && !reportPR) return;
  const repo = await gh.request(gh.path());
  if (repo.private && env.ALLOW_PRIVATE_REPOSITORY !== 'true') throw new SafeError('PRIVATE');
  if (env.GITHUB_EVENT_NAME === 'schedule' && cfg.mode !== 'automatic') return;
  const branch = repo.default_branch;
  // No workflow or implementation from arbitrary dispatch branches.
  if (env.GITHUB_REF !== `refs/heads/${branch}`) throw new SafeError('ACCESS');
  if (event.repository?.full_name !== gh.repo) throw new SafeError('ACCESS');
  const ref = await gh.request(gh.path(`/git/ref/heads/${encodeURIComponent(branch)}`));
  const sha = ref.object?.sha;
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new SafeError('ACCESS');
  let targets = [];
  const trigger = env.GITHUB_EVENT_NAME;
  if (!['workflow_dispatch','issues','schedule','issue_comment'].includes(trigger)) throw new SafeError('ACCESS');
  if (trigger !== 'schedule') {
    const permission = await gh.request(gh.path(`/collaborators/${encodeURIComponent(env.GITHUB_ACTOR)}/permission`));
    if (!['admin','maintain','write'].includes(permission.permission)) throw new SafeError('ACCESS');
  }
  if (trigger === 'workflow_dispatch') {
    const kind = event.inputs?.target, n = number(event.inputs?.number);
    if (!['issue','dependabot'].includes(kind) || (reportPR && kind !== 'issue')) throw new SafeError('CONFIG');
    targets = [kind === 'issue' ? issueTarget(await gh.request(gh.path(`/issues/${n}`))) : alertTarget(await gh.request(gh.path(`/dependabot/alerts/${n}`)))];
  } else if (trigger === 'issue_comment') {
    const n = await requireCommand(gh,event,env,reportPR?'/ai-report-pr':'/ai-investigate');
    targets = [issueTarget(await gh.request(gh.path(`/issues/${n}`)))];
  } else if (trigger === 'issues') {
    if (cfg.mode !== 'automatic' || event.action !== 'labeled' || event.label?.name !== cfg.issueLabel) return;
    const issue = await gh.request(gh.path(`/issues/${number(event.issue?.number)}`));
    if (!issue.labels.some(l => l.name === cfg.issueLabel)) return;
    targets = [issueTarget(issue)];
  } else if (cfg.mode === 'automatic') {
    const alerts = await gh.list(gh.path('/dependabot/alerts?state=open&sort=created&direction=asc'));
    targets = alerts.map(alertTarget);
  }
  const report = targets.some(t=>t.kind==='dependabot') ? await reportIssue(gh) : null;
  const reportComments = report ? await comments(gh,report.number) : [];
  const pending = [];
  for (const target of targets) {
    const fp = fingerprint(target,sha,cfg);
    const rows = target.kind === 'issue' ? await comments(gh,target.number) : reportComments;
    if (reportPR || !completed(rows,fp)) pending.push({ ...target, sha, fingerprint: fp });
    if (pending.length >= cfg.maxTargetsPerRun) break;
  }
  if (!pending.length) return;
  const existingReportPR = reportPR ? (await openReport(gh,pending[0],cfg.referencePreviousPRs,cfg))?.number : undefined;
  const context = existingReportPR ? {files:[],omittedFiles:0} : await collectFiles(gh,sha,cfg,pending);
  if(reportPR&&!existingReportPR)context.previousProposals=await previousProposals(gh,'report',pending[0],cfg);
  await save('.work/bundle.json',{ version: 1, repo: gh.repo, cfg, targets: pending, context, reportPR, existingReportPR });
  if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT,`ready=true\nprovider=${cfg.aiMode==='all'?'all':cfg.provider}\nreport-pr=${reportPR?'true':'false'}\nreuse-report=${existingReportPR?'true':'false'}\n`);
}
export async function analyze(env = process.env) {
  const bundle = await json('.work/bundle.json');
  const cfg = config(bundle.cfg);
  if (bundle.repo !== env.GITHUB_REPOSITORY || !Array.isArray(bundle.targets) || bundle.targets.length > cfg.maxTargetsPerRun) throw new SafeError('CONFIG');
  const results = [];
  let stopError;
  for (const target of bundle.targets) {
    try {
      if(bundle.reportPR && bundle.existingReportPR){results.push({ok:true,provider:cfg.provider,text:'既存の調査PRを参照します。'});continue;}
      if (stopError) throw stopError;
      const input = prompt({ repository: bundle.repo, target, context: bundle.context });
      if (Buffer.byteLength(input) > 190000) throw new SafeError('CONFIG');
      const text = await runAI(cfg,input,env);
      results.push({ ok: true, provider: cfg.provider, text: cleanOutput(text,[env.AI_API_KEY]) });
    } catch (error) {
      const code = error instanceof SafeError ? error.code : 'INTERNAL';
      if (['AUTH','LIMIT','NETWORK','RUNTIME'].includes(code)) stopError = error;
      results.push({ ok: false, provider: cfg.provider, text: messages[code] || messages.INTERNAL });
    }
  }
  await save('.work/result.json',{ version: 1, results });
}
export async function publish(env = process.env, ghArg) {
  const gh = ghArg || new GitHub(env.GITHUB_REPOSITORY, env.GH_TOKEN);
  const bundle = await json('.work/bundle.json');
  const result = await json('.work/result.json', 200000);
  const event = workerEvent(env,await json(env.GITHUB_EVENT_PATH,2000000));
  if (bundle.repo !== gh.repo || result.results?.length !== bundle.targets?.length || bundle.targets.length > 3) throw new SafeError('OUTPUT');
  const cfg = config(bundle.cfg);
  if(bundle.reportPR)return publishReport({env,gh,bundle,result,event,issueTarget});
  if(event.repository?.full_name!==gh.repo||!['workflow_dispatch','issues','schedule','issue_comment'].includes(env.GITHUB_EVENT_NAME))throw new SafeError('ACCESS');
  const repo=await gh.request(gh.path());
  if(repo.private&&env.ALLOW_PRIVATE_REPOSITORY!=='true')throw new SafeError('PRIVATE');
  if(env.GITHUB_REF!==`refs/heads/${repo.default_branch}`)throw new SafeError('ACCESS');
  if(env.GITHUB_EVENT_NAME==='schedule'){
    if(cfg.mode!=='automatic')throw new SafeError('ACCESS');
  }else{
    const role=await gh.request(gh.path(`/collaborators/${encodeURIComponent(env.GITHUB_ACTOR)}/permission`));
    if(!['admin','maintain','write'].includes(role.permission))throw new SafeError('ACCESS');
  }
  const ref=await gh.request(gh.path(`/git/ref/heads/${encodeURIComponent(repo.default_branch)}`));
  let report;
  for (const [i,target] of bundle.targets.entries()) {
    if (!['issue','dependabot'].includes(target.kind)) throw new SafeError('OUTPUT');
    const n = number(target.number);
    // Target routing comes from prepare, never the AI. Check original event again before writing.
    if (env.GITHUB_EVENT_NAME === 'workflow_dispatch' && (event.inputs?.target !== target.kind || number(event.inputs?.number) !== n)) throw new SafeError('ACCESS');
    if (env.GITHUB_EVENT_NAME === 'issues' && (target.kind !== 'issue' || number(event.issue?.number) !== n)) throw new SafeError('ACCESS');
    if (env.GITHUB_EVENT_NAME === 'schedule' && target.kind !== 'dependabot') throw new SafeError('ACCESS');
    if (env.GITHUB_EVENT_NAME === 'issue_comment') {
      if (target.kind !== 'issue' || number(event.issue?.number) !== n) throw new SafeError('ACCESS');
      await requireCommand(gh,event,env,'/ai-investigate');
    }
    const live=await gh.request(gh.path(target.kind==='issue'?`/issues/${n}`:`/dependabot/alerts/${n}`));
    const current=target.kind==='issue'?issueTarget(live):alertTarget(live);
    if(ref.object?.sha!==target.sha||fingerprint(current,target.sha,cfg)!==target.fingerprint)throw new SafeError('STALE');
    if(env.GITHUB_EVENT_NAME==='issues'&&(cfg.mode!=='automatic'||event.action!=='labeled'||event.label?.name!==cfg.issueLabel||!live.labels?.some(label=>label.name===cfg.issueLabel)))throw new SafeError('ACCESS');
    if (result.results[i].provider !== cfg.provider) throw new SafeError('OUTPUT');
    const body = comment(result.results[i],target,`https://github.com/${gh.repo}/actions/runs/${env.GITHUB_RUN_ID}`,cfg);
    let issueNumber = n;
    if (target.kind === 'dependabot') {
      report ||= await reportIssue(gh);
      if (!report) report = await gh.request(gh.path('/issues'),'POST',{
        title: 'Dependabot調査レポート', body: `${REPORT_MARKER}\n\nAIによるDependabotアラートの調査結果です。結果は公開されます。人間による確認が必要です。`
      });
      issueNumber = number(report.number);
    }
    const rows = await comments(gh,issueNumber);
    const existing = rows.find(row => botOwned(row) && row.body?.startsWith(`<!-- ai-bot:${target.fingerprint}:`));
    if (existing) await gh.request(gh.path(`/issues/comments/${number(existing.id)}`),'PATCH',{ body });
    else await gh.request(gh.path(`/issues/${issueNumber}/comments`),'POST',{ body });
    if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY,`${body}\n\n`);
  }
  if (result.results.some(r=>!r.ok)) throw new SafeError('OUTPUT');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const action = { prepare, analyze, publish }[process.argv[2]];
    if (!action) throw new SafeError('CONFIG');
    await action();
  } catch (error) {
    const code = error instanceof SafeError ? error.code : 'INTERNAL';
    const message = messages[code] || messages.INTERNAL;
    console.error(message);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,`${message}\n`).catch(()=>{});
    process.exitCode = 1;
  }
}
