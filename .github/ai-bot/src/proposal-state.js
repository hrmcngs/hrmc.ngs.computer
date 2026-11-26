import {sameAI} from './ai-selection.js';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {number,scrub,SafeError} from './core.js';
import {GitHub,botOwned} from './github.js';
import {editable} from './fix-core.js';

export function issueRevision(issue){
  return issue.revision || createHash('sha256').update(JSON.stringify([String(issue.title),String(issue.body||'')])).digest('hex');
}
export const revisionMarker=issue=>`<!-- ai-issue-revision:${issueRevision(issue)} -->`;
export function sameRevision(pr,issue){return pr.body?.split('\n')[1]===revisionMarker(issue);}
export function ownedProposal(pr,gh,kind,n){
  return botOwned(pr)&&pr.body?.startsWith(`<!-- ai-${kind}:issue:${number(n)} -->\n`)
    &&pr.head?.repo?.full_name===gh.repo&&pr.base?.repo?.full_name===gh.repo
    &&new RegExp(`^ai-${kind}/issue-${n}-[a-f0-9]{12}-[1-9]\\d*$`).test(pr.head.ref);
}
export const referenceMarker=enabled=>`<!-- ai-reference-previous:${enabled?'on':'off'} -->`;
export function sameReference(pr,enabled){return pr.body?.split('\n')[2]===referenceMarker(enabled) || (enabled&&!pr.body?.includes('<!-- ai-reference-previous:'));}
export async function currentProposal(gh,kind,issue,reference,cfg){
  return (await gh.list(gh.path('/pulls?state=open'))).find(pr=>ownedProposal(pr,gh,kind,issue.number)&&sameRevision(pr,issue)&&(!cfg||sameAI(pr,cfg))&&(reference===undefined||sameReference(pr,reference)));
}
// Prior patches are bounded, scrubbed data, never instructions or executable input.
export async function previousProposals(gh,kind,issue,cfg){
  if(cfg.referencePreviousPRs===false)return [];
  const rows=await gh.list(gh.path('/pulls?state=all&sort=created&direction=desc'));
  const previous=[];
  for(const pr of rows.filter(pr=>ownedProposal(pr,gh,kind,issue.number)&&!sameRevision(pr,issue)).slice(0,2)){
    const files=await gh.list(gh.path(`/pulls/${number(pr.number)}/files`));
    let remaining=6000;
    const patches=[];
    for(const file of files){
      if(remaining<=0)break;
      if(!(kind==='fix'?editable(file.filename,cfg):file.filename===`reports/ai/issue-${number(issue.number)}.md`))continue;
      const patch=scrub(String(file.patch||'')).slice(0,remaining);remaining-=patch.length;
      if(patch)patches.push({path:file.filename,patch});
    }
    previous.push({number:number(pr.number),patches});
  }
  return previous;
}
export function previousLinks(gh,previous=[]){
  return previous.length?`\n\n以前の提案（現在のIssueを優先して再検討）: ${previous.map(pr=>`[PR #${number(pr.number)}](https://github.com/${gh.repo}/pull/${number(pr.number)})`).join(', ')}`:'';
}
export async function closeOutdated(gh,issue){
  const closed=[];
  for(const candidate of await gh.list(gh.path('/pulls?state=open'))){
    const kind=['fix','report'].find(kind=>ownedProposal(candidate,gh,kind,issue.number));
    if(!kind)continue;
    // Re-fetch both records: delayed edit events must not close a proposal for the latest Issue.
    const current=await gh.request(gh.path(`/issues/${number(issue.number)}`));
    const pr=await gh.request(gh.path(`/pulls/${number(candidate.number)}`));
    if(pr.state!=='open'||!ownedProposal(pr,gh,kind,issue.number)||sameRevision(pr,current))continue;
    await gh.request(gh.path(`/pulls/${number(pr.number)}`),'PATCH',{state:'closed'});
    await gh.request(gh.path(`/issues/${number(pr.number)}/comments`),'POST',{body:`Issue #${number(issue.number)} の本文またはタイトルが更新されたため、旧版の提案を閉じました。ブランチと履歴は保持します。次の実行では旧PRを参照するか選択できます。現在のIssueを優先して再検討します。`});
    closed.push(number(pr.number));
  }
  return closed;
}
export async function updateProposals(env=process.env,ghArg){
  const event=JSON.parse(await readFile(env.GITHUB_EVENT_PATH,'utf8'));
  if(env.GITHUB_EVENT_NAME!=='issues'||event.action!=='edited'||event.issue?.pull_request
    ||!event.changes||!['title','body'].some(key=>Object.hasOwn(event.changes,key)))return;
  const gh=ghArg||new GitHub(env.GITHUB_REPOSITORY,env.GH_TOKEN);
  const repo=await gh.request(gh.path());
  if(event.repository?.full_name!==gh.repo||env.GITHUB_REF!==`refs/heads/${repo.default_branch}`)throw new SafeError('ACCESS');
  const permission=await gh.request(gh.path(`/collaborators/${encodeURIComponent(env.GITHUB_ACTOR)}/permission`));
  if(!['admin','maintain','write'].includes(permission.permission))throw new SafeError('ACCESS');
  const closed=await closeOutdated(gh,event.issue);
  console.log(`古いBot PRを閉じました: ${closed.length}件。履歴とブランチは保持しています。`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{await updateProposals();}catch{console.error('古いPRの整理に失敗しました。GitHub権限とActionsの実行結果を確認してください。');process.exitCode=1;}
}
