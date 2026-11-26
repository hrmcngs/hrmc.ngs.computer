import {chooseAI} from './ai-selection.js';
import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {config,number,scrub,SafeError,aiIdentity} from './core.js';
import {requireCommand} from './commands.js';
import {editable,parsePlan,planHash,fixConfig,literal,repairEditable} from './fix-core.js';
import {markdown} from './markdown.js';
import {createLinkedProposal,proposalLink} from './proposals.js';
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export async function repairAccess(gh,event,env){
  const n=await requireCommand(gh,event,env,'/ai-fix',true);
  if(!event.issue?.pull_request)throw new SafeError('ACCESS');
  const repo=await gh.request(gh.path());
  if(env.GITHUB_REF!==`refs/heads/${repo.default_branch}`)throw new SafeError('ACCESS');
  if(repo.private&&env.ALLOW_PRIVATE_REPOSITORY!=='true')throw new SafeError('PRIVATE');
  const role=await gh.request(gh.path(`/collaborators/${encodeURIComponent(env.GITHUB_ACTOR)}/permission`));
  if(!['admin','maintain','write'].includes(role.permission))throw new SafeError('ACCESS');
  const pr=await gh.request(gh.path(`/pulls/${n}`));
  if(pr.state!=='open'||pr.draft||pr.merged||pr.base?.repo?.full_name!==gh.repo||pr.base.ref!==repo.default_branch||(pr.head?.repo?.full_name===gh.repo&&pr.head.ref===repo.default_branch)||!sha(pr.head?.sha)||!sha(pr.base?.sha))throw new SafeError('ACCESS');
  const ref=await gh.request(gh.path(`/git/ref/heads/${encodeURIComponent(repo.default_branch)}`));
  if(!sha(ref.object?.sha))throw new SafeError('ACCESS');
  return{n,repo,pr,base:ref.object.sha};
}
export async function repairContext(gh,pr,base,cfg){
  const files=await gh.list(gh.path(`/pulls/${number(pr.number)}/files`));
  if(!files.length||files.length>3||files.some(f=>f.status!=='modified'||!(editable(f.filename,cfg)||repairEditable(f.filename))))throw new SafeError('CONFIG');
  const compare=await gh.request(gh.path(`/compare/${base}...${pr.head.sha}`));
  const ancestor=compare.merge_base_commit?.sha;if(!sha(ancestor))throw new SafeError('ACCESS');
  const trees=await Promise.all([base,ancestor,pr.head.sha].map(async commit=>{
    const tree=await gh.request(gh.path(`/git/trees/${commit}?recursive=1`));
    if(tree.truncated||!Array.isArray(tree.tree))throw new SafeError('ACCESS');return tree.tree;
  }));
  let total=0;
  const contexts=[];
  for(const file of files){
    const contents=[];
    for(const tree of trees){
      const entry=tree.find(f=>f.path===file.filename);
      if(entry?.type!=='blob'||entry.mode!=='100644'||!sha(entry.sha))throw new SafeError('ACCESS');
      const blob=await gh.request(gh.path(`/git/blobs/${entry.sha}`));
      if(blob.encoding!=='base64'||blob.size>12000)throw new SafeError('OUTPUT');
      const bytes=Buffer.from(blob.content,'base64'),content=bytes.toString('utf8');
      total+=bytes.length;
      if(bytes.length>12000||bytes.includes(0)||!Buffer.from(content).equals(bytes)||scrub(content)!==content||total>96000)throw new SafeError('OUTPUT');
      contents.push(content);
    }
    contexts.push({path:file.filename,content:contents[0],ancestor:contents[1],proposed:contents[2]});
  }
  return{files:contexts,note:'PRの元変更をすべて維持し、ancestorからproposedへの意図と現在のcontentの両方を統合してください。確信がなければ変更しないでください。'};
}
export async function prepareRepair(gh,event,env,cfg){
  const {n,repo,pr,base}=await repairAccess(gh,event,env);
  const reply=body=>gh.request(gh.path(`/issues/${n}/comments`),'POST',{body});
  if(!cfg.fix?.enabled){await reply('修正機能が無効です。テスト設定と fix.enabled を確認してください。');return;}
  fixConfig(cfg);
  if(env.GITHUB_SHA&&env.GITHUB_SHA!==base)throw new SafeError('STALE');
  if(pr.mergeable!==false){await reply(pr.mergeable===null?'GitHubが競合を判定中です。少し待って /ai-fix を再投稿してください。':'このPRにマージ競合はありません。');return;}
  let context;
  try{context=await repairContext(gh,pr,base,cfg);}catch(error){
    await reply('競合の自動修正を停止しました。対象は既存JavaScript・Markdownの変更3ファイルまでです。追加・削除・設定・依存更新・保護ファイル、資料不足は手動で確認してください。元PRは変更していません。');throw error;
  }
  const repair={number:n,head:pr.head.sha,headRef:pr.head.ref,headRepo:pr.head.repo?.full_name||'',base,request:hash([pr.title,pr.body||''])};
  const target={kind:'issue',number:n,sha:base,title:`PR #${n} の競合修正: ${scrub(pr.title).slice(0,1000)}`,body:scrub(pr.body||'').slice(0,12000)};
  const bundle={version:1,repo:gh.repo,branch:repo.default_branch,cfg,targets:[target],context,repair};
  await mkdir('.work',{recursive:true});await writeFile('.work/fix-bundle.json',JSON.stringify(bundle),{mode:0o600});
  if(env.GITHUB_OUTPUT)await appendFile(env.GITHUB_OUTPUT,`ready=true\nprovider=${cfg.aiMode==='all'?'all':cfg.provider}\nsha=${base}\n`);
  await reply('競合の修正案を作成します。最新ブランチとの統合後にSecretなしの隔離環境で検証し、成功した場合だけ反映します。');
}
export async function publishRepair(gh,event,env,bundle,result,verdict){
  const access=await repairAccess(gh,event,env),{n,pr,repo,base}=access,r=bundle.repair;
  const reply=body=>gh.request(gh.path(`/issues/${n}/comments`),'POST',{body});
  const raw=config(JSON.parse(await readFile('.github/ai-bot/config.json','utf8')));
  const availability=Object.fromEntries((bundle.cfg.aiProviders||[]).map(p=>['AI_BOT_HAS_'+p.toUpperCase(),'true']));
  const fresh=chooseAI(raw,event,{...env,...availability});
  if(JSON.stringify(fresh)!==JSON.stringify(bundle.cfg)||!fresh.fix?.enabled)throw new SafeError('STALE');
  if(n!==r.number||base!==r.base||base!==bundle.targets[0].sha||pr.head.sha!==r.head||pr.head.ref!==r.headRef||pr.head.repo?.full_name!==r.headRepo||hash([pr.title,pr.body||''])!==r.request)throw new SafeError('STALE');
  const context=await repairContext(gh,pr,base,fresh);
  if(JSON.stringify(context)!==JSON.stringify(bundle.context))throw new SafeError('STALE');
  if(!result.ok||!verdict.ok){await reply(`競合修正は反映していません。${verdict.code==='NO_CHANGES'?'確信のある統合案を作成できませんでした。':'修正案の生成または隔離環境の検証に失敗しました。Actionsの実行結果を確認してください。'}`);return;}
  const plan=parsePlan(result.plan,bundle),commands=fixConfig(fresh).commands;
  if(!plan.changes.length||verdict.hash!==planHash(plan)||verdict.sha!==base||JSON.stringify(verdict.commands)!==JSON.stringify(commands))throw new SafeError('OUTPUT');
  // Every original PR path must be represented; never silently drop a nonconflicting change.
  if(context.files.some(f=>!plan.changes.some(c=>c.path===f.path))||plan.changes.some(c=>!context.files.some(f=>f.path===c.path)))throw new SafeError('OUTPUT');
  const run=`https://github.com/${gh.repo}/actions/runs/${number(env.GITHUB_RUN_ID)}`;
  const body=`<!-- ai-conflict:pull:${n} -->\nPR #${n} の変更と最新の ${repo.default_branch} を統合した提案です。\n\n${aiIdentity(fresh)}\n\n${markdown(scrub(plan.summary))}\n\nSecretなし・オフライン環境の検証：成功\n${literal(commands.map(c=>c.join(' ')).join('\n'))}\n\n[Actionsの実行結果](${run})\n人間が差分をレビューしてください。自動マージは行いません。`;
  if(pr.head.repo.full_name===gh.repo){
    // A merge commit preserves both histories. Non-force ref update rejects concurrent head changes.
    const tree=await gh.request(gh.path(`/git/commits/${base}`));
    const created=await gh.request(gh.path('/git/trees'),'POST',{base_tree:tree.tree.sha,tree:plan.changes.map(c=>({path:c.path,mode:'100644',type:'blob',content:c.content}))});
    const commit=await gh.request(gh.path('/git/commits'),'POST',{message:`fix: resolve merge conflicts for PR #${n}`,tree:created.sha,parents:[r.head,base]});
    const again=await repairAccess(gh,event,env);
    if(again.base!==base||again.pr.head.sha!==r.head||hash([again.pr.title,again.pr.body||''])!==r.request)throw new SafeError('STALE');
    await gh.request(gh.path(`/git/refs/heads/${encodeURIComponent(r.headRef)}`),'PATCH',{sha:commit.sha,force:false});
    await reply(`競合修正コミットをこのPRへ追加しました。追加コミット後のCIと差分を再確認してください。\n\n${body}`);
  }else{
    await createLinkedProposal(gh,{kind:'fix',issue:n,runId:env.GITHUB_RUN_ID,sha:base,id:hash(r),base:repo.default_branch,title:`fix: resolve conflicts from PR #${n}`,body,files:plan.changes,notify:pr=>reply(`forkのブランチは変更せず、統合案を ${proposalLink(gh,pr.number)} に作成しました。元PRは閉じていません。\n\n${body}`)});
  }
}
