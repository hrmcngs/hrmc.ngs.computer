import {selectionMarker} from './ai-selection.js';
import {appendFile} from 'node:fs/promises';
import {number,config,cleanOutput,fingerprint,aiIdentity,SafeError,messages} from './core.js';
import {botOwned,comments} from './github.js';
import {requireCommand} from './commands.js';
import {markdown} from './markdown.js';
import {createLinkedProposal,proposalLink} from './proposals.js';
import {currentProposal,previousLinks,revisionMarker,referenceMarker} from './proposal-state.js';
const marker=n=>`<!-- ai-report:issue:${number(n)} -->`;
export const openReport=(gh,issue,reference,cfg)=>currentProposal(gh,'report',issue,reference,cfg);
export function reportFile(bundle,text){
  const target=bundle.targets[0],n=number(target.number);
  return {path:`reports/ai/issue-${n}.md`,content:`${marker(n)}\n# Issue #${n} のAI調査結果\n\n対象: https://github.com/${bundle.repo}/issues/${n}\n\n${aiIdentity(bundle.cfg)} / 対象SHA: \`${target.sha}\`\n\nAIによる静的調査です。コード修正・テストは行っていません。人間による確認が必要です。\n\n${markdown(cleanOutput(text))}\n`};
}
export async function reportDestination(gh,sha,n){
  const path=`reports/ai/issue-${number(n)}.md`;
  const tree=await gh.request(gh.path(`/git/trees/${sha}?recursive=1`));
  if(tree.truncated||!Array.isArray(tree.tree))throw new SafeError('OUTPUT');
  for(const ancestor of ['reports','reports/ai']){
    const entry=tree.tree.find(f=>f.path===ancestor);
    if(entry && (entry.type!=='tree'||entry.mode!=='040000'))throw new SafeError('OUTPUT');
  }
  const file=tree.tree.find(f=>f.path===path);
  if(file){
    if(file.type!=='blob'||file.mode!=='100644'||!/^[a-f0-9]{40}$/.test(file.sha))throw new SafeError('OUTPUT');
    const blob=await gh.request(gh.path(`/git/blobs/${file.sha}`));
    if(blob.encoding!=='base64'||!Buffer.from(blob.content,'base64').toString('utf8').startsWith(marker(n)))throw new SafeError('OUTPUT');
  }
}
export async function publishReport({env,gh,bundle,result,event,issueTarget}){
  config(bundle.cfg);
  if(bundle.targets.length!==1||bundle.targets[0].kind!=='issue'||result.results.length!==1)throw new SafeError('OUTPUT');
  const target=bundle.targets[0],n=number(target.number);
  if(!/^[a-f0-9]{40}$/.test(target.sha)||!['tokyo','claude','codex'].includes(result.results[0].provider)||result.results[0].provider!==bundle.cfg.provider)throw new SafeError('OUTPUT');
  if(event.repository?.full_name!==gh.repo)throw new SafeError('ACCESS');
  if(env.GITHUB_EVENT_NAME==='issue_comment'){
    if(await requireCommand(gh,event,env,'/ai-report-pr')!==n)throw new SafeError('ACCESS');
  }else if(env.GITHUB_EVENT_NAME!=='workflow_dispatch'||event.inputs?.result!=='report-pr'||event.inputs?.target!=='issue'||number(event.inputs?.number)!==n)throw new SafeError('ACCESS');
  const repo=await gh.request(gh.path());
  if(repo.private&&env.ALLOW_PRIVATE_REPOSITORY!=='true')throw new SafeError('PRIVATE');
  if(env.GITHUB_REF!==`refs/heads/${repo.default_branch}`)throw new SafeError('ACCESS');
  const permission=await gh.request(gh.path(`/collaborators/${encodeURIComponent(env.GITHUB_ACTOR)}/permission`));
  if(!['admin','maintain','write'].includes(permission.permission))throw new SafeError('ACCESS');
  const command=env.GITHUB_EVENT_NAME==='issue_comment'?`<!-- ai-command:${number(event.comment.id)} -->`:'';
  const prefix=marker(n)+command+'\n';
  const run=`https://github.com/${gh.repo}/actions/runs/${number(env.GITHUB_RUN_ID)}`;
  const footer=`\n\n[Actionsの実行結果](${run})\n\n人間によるレビューが必要です。自動マージは専用ラベルと保護ルールを設定した場合だけ有効です。`;
  const notify=async body=>{
    const rows=await comments(gh,n),own=rows.find(row=>botOwned(row)&&row.body?.startsWith(prefix));
    if(own)await gh.request(gh.path(`/issues/comments/${number(own.id)}`),'PATCH',{body:prefix+body+footer});
    else await gh.request(gh.path(`/issues/${n}/comments`),'POST',{body:prefix+body+footer});
    if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,body+footer+'\n');
  };
  const current=issueTarget(await gh.request(gh.path(`/issues/${n}`)));
  if(fingerprint(current,target.sha,bundle.cfg)!==target.fingerprint){await notify(messages.STALE);throw new SafeError('STALE');}
  const existing=await openReport(gh,target,bundle.cfg.referencePreviousPRs,bundle.cfg);
  if(existing){await notify(`調査結果の ${proposalLink(gh,existing.number)} が既にあります。重複作成はしていません。`);return;}
  const analysis=result.results[0];
  if(!analysis.ok){await notify(`調査結果のPRは作成していません。\n\n${markdown(cleanOutput(analysis.text))}`);throw new SafeError('OUTPUT');}
  // A reused PR might have been closed while this run was queued: never publish the placeholder.
  if(bundle.existingReportPR){await notify('既存の調査PRが閉じられました。新しいコマンドで再調査してください。');throw new SafeError('STALE');}
  const ref=await gh.request(gh.path(`/git/ref/heads/${encodeURIComponent(repo.default_branch)}`));
  if(ref.object?.sha!==target.sha||fingerprint(current,target.sha,bundle.cfg)!==target.fingerprint){await notify(messages.STALE);throw new SafeError('STALE');}
  const file=reportFile(bundle,analysis.text);
  try{await reportDestination(gh,target.sha,n);}catch(error){await notify('調査結果の保存先が既存ファイルまたはシンボリックリンクと競合しています。PRは作成していません。');throw error;}
  try{
    await createLinkedProposal(gh,{kind:'report',issue:n,runId:env.GITHUB_RUN_ID,sha:target.sha,id:target.fingerprint,base:repo.default_branch,title:`docs: investigation report for issue #${n}`,body:`${marker(n)}\n${revisionMarker(target)}\n${referenceMarker(bundle.cfg.referencePreviousPRs??true)}\n${selectionMarker(bundle.cfg)}\nRefs #${n}\n\n${aiIdentity(bundle.cfg)}\n\n調査結果を \`${file.path}\` にまとめました。コード修正のPRではありません。\n\n旧PRの参照: ${(bundle.cfg.referencePreviousPRs??true)?'あり':'なし'}\n\n確認: Markdownの整形・容量・保存先・元SHA・Issue内容を検査済み。コードのテストは行っていません。人間による根拠の照合とレビューが必要です。${previousLinks(gh,bundle.context.previousProposals)}${footer}`,files:[file],notify:async pr=>notify(`調査結果を ${proposalLink(gh,pr.number)} にまとめました。\n\n${aiIdentity(bundle.cfg)}\n\n保存先: \`${file.path}\`\n\nコードの修正はしていません。Markdownの差分と調査内容をレビューしてください。`)});
  }catch(error){
    if(error.code==='NOTIFY'){
      if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,`${proposalLink(gh,error.proposalNumber)} は作成済みです。${messages.NOTIFY}\n`);
      throw error;
    }
    await notify(messages.PR);throw new SafeError('PR');
  }
}
