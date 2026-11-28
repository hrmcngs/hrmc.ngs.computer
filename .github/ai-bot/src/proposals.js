import { number, SafeError } from './core.js';

export function proposalLink(gh, n) {
  return `[PR #${number(n)}](https://github.com/${gh.repo}/pull/${number(n)})`;
}
// GitHub has no atomic PR+comment API. Keep the PR if notification fails so a retry can link it.
export async function createLinkedProposal(gh, options) {
  const n=['update','security'].includes(options.kind)&&options.issue===undefined?null:number(options.issue),run=number(options.runId);
  if(!['fix','report','update','security'].includes(options.kind) || !/^[a-f0-9]{40}$/.test(options.sha)
    || !/^[a-f0-9]{64}$/.test(options.id) || !Array.isArray(options.files) || !options.files.length)throw new SafeError('OUTPUT');
  const base=await gh.request(gh.path(`/git/commits/${options.sha}`));
  const tree=await gh.request(gh.path('/git/trees'),'POST',{base_tree:base.tree.sha,tree:options.files.map(file=>({path:file.path,mode:'100644',type:'blob',...(options.kind==='update'&&file.sha===null?{sha:null}:{content:file.content})}))});
  const commit=await gh.request(gh.path('/git/commits'),'POST',{message:options.kind==='security'?'security: propose repository audit':n===null?'chore: update GitHub AI Bot':`${options.kind==='fix'?'fix':options.kind==='update'?'chore':'docs'}: propose ${options.kind} for issue #${n}`,tree:tree.sha,parents:[options.sha]});
  const branch=`ai-${options.kind}/${n===null?'bot':`issue-${n}`}-${options.id.slice(0,12)}-${run}`;
  let created=false,pr;
  try{
    await gh.request(gh.path('/git/refs'),'POST',{ref:`refs/heads/${branch}`,sha:commit.sha});created=true;
    pr=await gh.request(gh.path('/pulls'),'POST',{title:options.title,head:branch,base:options.base,body:options.body});
  }catch{
    if(created)await gh.request(gh.path(`/git/refs/heads/${branch}`),'DELETE').catch(()=>{});
    throw new SafeError('PR');
  }
  try{await options.notify(pr);}catch{
    const error=new SafeError('NOTIFY');error.proposalNumber=number(pr.number);throw error;
  }
  return pr;
}
