import {readFile,appendFile,mkdtemp,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {GitHub,botOwned,responseWithRetry,temporaryStatus} from './github.js';
import {SafeError,number} from './core.js';
import {isCommand,requireCommand} from './commands.js';
import {createLinkedProposal,proposalLink} from './proposals.js';
export const SOURCE='hrmcngs/github-ai-fix-bot';
// Track installed file hashes so update proposals preserve repository-specific settings.
export const STATE='.github/ai-bot/installation.json';
export const MANIFEST='.github/ai-bot/distribution.json';
export const UPDATE_MARKER='<!-- ai-bot-update:v1 -->';
// Update checks inspect upstream files as data; downloaded code is never executed.
const sha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
export function managedPath(path){
  return typeof path==='string'&&(/^\.github\/ai-bot\/(?:src\/[a-z][a-z-]*\.js|Dockerfile(?:\.verify)?|package\.json|config\.json|distribution\.json|\.dockerignore)$/.test(path)
    ||/^\.github\/workflows\/[a-z][a-z-]*\.yml$/.test(path));
}
export function manifest(data){
  if(data?.version!==1||!Array.isArray(data.files)||data.files.length<1||data.files.length>60
    ||new Set(data.files).size!==data.files.length||data.files.some(path=>!managedPath(path))||!data.files.includes(MANIFEST))throw new SafeError('UPDATE_SOURCE');
  return data.files;
}
export function installation(data){
  if(data?.version!==1||data.source!==SOURCE||!sha(data.commit)||!data.files||typeof data.files!=='object'||Array.isArray(data.files)
    ||Object.keys(data.files).length>60||Object.entries(data.files).some(([path,hash])=>!managedPath(path)||!sha(hash)))throw new SafeError('UPDATE_STATE');
  return data;
}
// Anonymous access to one fixed public upstream. The destination token is never sent upstream.
const execute=promisify(execFile);
// Hosted runners may share an exhausted anonymous REST quota. Read Git objects
// from a fresh bare repository instead; never check out or execute upstream code.
export async function gitReleaseSnapshot(ref='main'){
  if(ref!=='main'&&!sha(ref))throw new SafeError('UPDATE_SOURCE');
  const directory=await mkdtemp(join(tmpdir(),'ai-bot-source-'));
  const env={PATH:process.env.PATH,HOME:directory,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'};
  const git=async(args,maxBuffer=3000000)=>{
    const {stdout}=await execute('git',['-c','core.hooksPath=/dev/null','-c','credential.helper=','-c','http.followRedirects=false','-c','protocol.allow=never','-c','protocol.https.allow=always',...args],{cwd:directory,env,encoding:'buffer',maxBuffer,timeout:60000});
    return stdout;
  };
  try{
    await git(['init','--bare','--template=','.']);
    await git(['fetch','--depth=1','--no-tags',`https://github.com/${SOURCE}.git`,ref]);
    const commit=(await git(['rev-parse','FETCH_HEAD'])).toString('ascii').trim();
    if(!sha(commit)||(ref!=='main'&&commit!==ref))throw new SafeError('UPDATE_SOURCE');
    const rows=(await git(['ls-tree','-r','-t','-l','-z',commit])).toString('utf8').split('\0').filter(Boolean);
    const tree=rows.map(row=>{
      const match=row.match(/^(\d{6}) (blob|tree) ([a-f0-9]{40}) +(-|\d+)\t([\s\S]+)$/);
      if(!match)throw new SafeError('UPDATE_SOURCE');
      return{mode:match[1],type:match[2],sha:match[3],size:match[4]==='-'?0:Number(match[4]),path:match[5]};
    });
    const entries=new Map(tree.map(entry=>[entry.path,entry])),blobs=new Map();let total=0;
    const read=async path=>{
      const entry=entries.get(path);
      if(entry?.type!=='blob'||entry.mode!=='100644'||entry.size>128000)throw new SafeError('UPDATE_SOURCE');
      if(blobs.has(entry.sha))return blobs.get(entry.sha);
      total+=entry.size;if(total>1000000)throw new SafeError('UPDATE_SOURCE');
      const bytes=await git(['cat-file','blob',entry.sha],128001);
      if(bytes.length!==entry.size||createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')!==entry.sha)throw new SafeError('UPDATE_SOURCE');
      const data={encoding:'base64',content:bytes.toString('base64')};blobs.set(entry.sha,data);return data;
    };
    const data=await read(MANIFEST);
    const paths=manifest(JSON.parse(Buffer.from(data.content,'base64').toString('utf8')));
    for(const path of paths)if(path!=='.github/ai-bot/config.json')await read(path);
    return{commit,tree,blobs};
  }catch{throw new SafeError('UPDATE_SOURCE');}finally{await rm(directory,{recursive:true,force:true});}
}
export class Upstream{
  constructor(fetcher=fetch,snapshot=gitReleaseSnapshot){this.fetcher=fetcher;this.snapshot=snapshot;}
  async gitRequest(tail){
    const ref=this.ref||'main';
    this.gitData??=await this.snapshot(ref);
    if(tail==='/commits/main')return{sha:this.gitData.commit};
    if(tail===`/git/trees/${this.gitData.commit}?recursive=1`)return{tree:this.gitData.tree,truncated:false};
    if(tail.startsWith('/git/blobs/')&&this.gitData.blobs.has(tail.split('/')[3]))return this.gitData.blobs.get(tail.split('/')[3]);
    throw new SafeError('UPDATE_SOURCE');
  }
  async request(tail){
    if(!/^\/(?:commits\/main|git\/trees\/[a-f0-9]{40}\?recursive=1|git\/blobs\/[a-f0-9]{40})$/.test(tail))throw new SafeError('UPDATE_SOURCE');
    if(tail.startsWith('/git/trees/'))this.ref=tail.split('/')[3].split('?')[0];
    try{
      if(this.gitData)return await this.gitRequest(tail);
      const res=await responseWithRetry(this.fetcher,`https://api.github.com/repos/${SOURCE}${tail}`,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',signal:AbortSignal.timeout(30000)});
      if(res.status===429||(res.status===403&&res.headers.get('x-ratelimit-remaining')==='0')){
        await res.body?.cancel();return await this.gitRequest(tail);
      }
      if(!res.ok){await res.body?.cancel();throw new SafeError(temporaryStatus(res.status)?'API_UNAVAILABLE':'UPDATE_SOURCE');}
      const length=Number(res.headers.get('content-length')||0);if(length>3000000)throw new Error();
      const chunks=[];let used=0;
      for await(const chunk of res.body){used+=chunk.length;if(used>3000000)throw new Error();chunks.push(chunk);}
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }catch(error){throw error instanceof SafeError?error:new SafeError('UPDATE_SOURCE');}
  }
}
function treeMap(data){
  if(data.truncated||!Array.isArray(data.tree))throw new SafeError('UPDATE_SOURCE');
  return new Map(data.tree.map(file=>[file.path,file]));
}
async function blob(source,entry){
  if(entry?.type!=='blob'||entry.mode!=='100644'||!sha(entry.sha)||entry.size>128000)throw new SafeError('UPDATE_SOURCE');
  const data=await source.request(`/git/blobs/${entry.sha}`);
  if(data.encoding!=='base64'||typeof data.content!=='string')throw new SafeError('UPDATE_SOURCE');
  const bytes=Buffer.from(data.content,'base64');
  if(bytes.length>128000||bytes.includes(0)||!Buffer.from(bytes.toString('utf8')).equals(bytes)||createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')!==entry.sha)throw new SafeError('UPDATE_SOURCE');
  return bytes.toString('utf8');
}
export async function release(source,commit){
  const target=commit||(await source.request('/commits/main')).sha;
  if(!sha(target))throw new SafeError('UPDATE_SOURCE');
  const tree=treeMap(await source.request(`/git/trees/${target}?recursive=1`));
  const paths=manifest(JSON.parse(await blob(source,tree.get(MANIFEST))));
  const files={};let total=0;
  for(const path of paths){
    const entry=tree.get(path);
    if(entry?.type!=='blob'||entry.mode!=='100644'||!sha(entry.sha)||entry.size>128000)throw new SafeError('UPDATE_SOURCE');
    total+=Number(entry.size||0);if(total>1000000)throw new SafeError('UPDATE_SOURCE');
    if(path!=='.github/ai-bot/config.json')files[path]=entry.sha;
  }
  return{commit:target,files,tree};
}
// Keep workflow installation hashes unchanged: runtime-only updates must not claim
// that skipped workflow files were installed, or repeatedly propose them.
export function scopedRelease(latest,state,scope='full'){
  if(!['runtime','full'].includes(scope))throw new SafeError('CONFIG');
  if(scope==='full')return latest;
  const workflow=path=>path.startsWith('.github/workflows/');
  const files=Object.fromEntries(Object.entries(latest.files).filter(([path])=>!workflow(path)));
  for(const [path,hash]of Object.entries(state.files))if(workflow(path))files[path]=hash;
  const manualWorkflows=[...new Set([...Object.keys(state.files),...Object.keys(latest.files)])]
    .filter(path=>workflow(path)&&state.files[path]!==latest.files[path]);
  return{...latest,files,scope,manualWorkflows};
}
const targetMarker=commit=>`<!-- ai-bot-update-target:${commit} -->`;
export function updateTarget(issue){
  const found=issue.body?.split('\n')[1]?.match(/^<!-- ai-bot-update-target:([a-f0-9]{40}) -->$/);
  if(!botOwned(issue)||issue.pull_request||issue.state!=='open'||!issue.body?.startsWith(UPDATE_MARKER+'\n')||!found)throw new SafeError('ACCESS');
  return found[1];
}
export async function checkUpdate(gh,state,source=new Upstream(),scope='full'){
  installation(state);
  if(gh.repo===SOURCE)return;
  const latest=scopedRelease(await release(source),state,scope);
  if(JSON.stringify(Object.entries(state.files).sort())===JSON.stringify(Object.entries(latest.files).sort()))return;
  return{commit:latest.commit};
}
export async function authorizeUpdate(gh,event,env){
  if(!isCommand(event,env,'/ai-update'))return;
  const repo=await gh.request(gh.path());
  if(event.repository?.full_name!==gh.repo||env.GITHUB_REF!==`refs/heads/${repo.default_branch}`)throw new SafeError('ACCESS');
  const role=await gh.request(gh.path(`/collaborators/${encodeURIComponent(env.GITHUB_ACTOR)}/permission`));
  if(!['admin','maintain','write'].includes(role.permission))throw new SafeError('ACCESS');
  const n=await requireCommand(gh,event,env,'/ai-update');
  const approved=updateTarget(event.issue),current=updateTarget(await gh.request(gh.path(`/issues/${n}`)));
  if(approved!==current)throw new SafeError('STALE');
  return{number:n,commit:current,branch:repo.default_branch};
}
const automaticEvent=(event,env)=>['schedule','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)
  ||(env.GITHUB_EVENT_NAME==='push'&&!event.deleted&&event.ref===env.GITHUB_REF&&sha(env.GITHUB_SHA)&&event.after===env.GITHUB_SHA);
// Automatic proposals are authorized by the trusted push/scheduled/check job, not Issue text.
export async function authorizeAutomaticUpdate(gh,event,env){
  if(env.AI_BOT_UPDATE_AUTOMATIC!=='true'||!automaticEvent(event,env))throw new SafeError('ACCESS');
  const repo=await gh.request(gh.path());
  if(event.repository?.full_name!==gh.repo||env.GITHUB_REF!==`refs/heads/${repo.default_branch}`)throw new SafeError('ACCESS');
  if(env.GITHUB_EVENT_NAME!=='schedule'){
    const role=await gh.request(gh.path(`/collaborators/${encodeURIComponent(env.GITHUB_ACTOR)}/permission`));
    if(!['admin','maintain','write'].includes(role.permission))throw new SafeError('ACCESS');
  }
  const commit=env.AI_BOT_UPDATE_COMMIT;
  if(!sha(commit))throw new SafeError('ACCESS');
  return{commit,branch:repo.default_branch};
}
async function updateSummary(env,text){
  console.log(text);
  if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,text+'\n\n');
}
const authorizeRequest=(gh,event,env)=>env.AI_BOT_UPDATE_AUTOMATIC==='true'?authorizeAutomaticUpdate(gh,event,env):authorizeUpdate(gh,event,env);
export async function updateStatus(gh,n,commit,text){
  if(!sha(commit))throw new SafeError('ACCESS');
  const marker=`<!-- ai-bot-update-status:${commit} -->`,body=marker+'\n'+text;
  const rows=await gh.list(gh.path(`/issues/${number(n)}/comments`));
  const current=rows.find(row=>botOwned(row)&&row.body?.startsWith(marker+'\n'));
  if(current){if(current.body!==body)await gh.request(gh.path(`/issues/comments/${number(current.id)}`),'PATCH',{body});}
  else await gh.request(gh.path(`/issues/${number(n)}/comments`),'POST',{body});
}
export async function updateFiles(gh,state,latest,source,baseSha){
  const tree=treeMap(await gh.request(gh.path(`/git/trees/${baseSha}?recursive=1`)));
  const changes=[];
  const paths=new Set([...Object.keys(state.files),...Object.keys(latest.files)]);
  for(const path of paths){
    if(path==='.github/ai-bot/config.json'||(latest.scope==='runtime'&&path.startsWith('.github/workflows/')))continue;
    if(!managedPath(path))throw new SafeError('UPDATE_STATE');
    for(const parent of [STATE,path].flatMap(path=>{const parts=path.split('/');return parts.slice(0,-1).map((_,i)=>parts.slice(0,i+1).join('/'));})){
      const entry=tree.get(parent);if(entry&&(entry.type!=='tree'||entry.mode!=='040000'))throw new SafeError('UPDATE_CONFLICT');
    }
    const current=tree.get(path),installed=state.files[path],next=latest.files[path];
    if(current&&(current.type!=='blob'||current.mode!=='100644'))throw new SafeError('UPDATE_CONFLICT');
    if(!installed&&current)throw new SafeError('UPDATE_CONFLICT');
    if(current?.sha===next&&next)continue;
    if((installed&&current?.sha!==installed)||(!installed&&current))throw new SafeError('UPDATE_CONFLICT');
    if(!next){if(current)changes.push({path,sha:null});continue;}
    changes.push({path,content:await blob(source,latest.tree.get(path))});
  }
  if(tree.get(STATE)?.mode!=='100644')throw new SafeError('UPDATE_CONFLICT');
  changes.push({path:STATE,content:JSON.stringify({version:1,source:SOURCE,commit:latest.commit,files:latest.files,...(latest.scope==='runtime'?{updateScope:'runtime',manualWorkflows:latest.manualWorkflows}:{})},null,2)+'\n'});
  return changes;
}
export async function applyUpdate(gh,writer,event,env,state,source=new Upstream()){
  installation(state);
  const auth=await authorizeRequest(gh,event,env);if(!auth)throw new SafeError('ACCESS');
  const notify=body=>auth.number?updateStatus(gh,auth.number,auth.commit,body):updateSummary(env,body);
  const scope=env.AI_BOT_UPDATE_SCOPE||'full';
  if(!['runtime','full'].includes(scope))throw new SafeError('CONFIG');
  if(scope==='runtime')writer=gh;
  const marker=`<!-- ai-bot-update-pr:${auth.commit}${scope==='runtime'?':runtime':''} -->`;
  const appFull=`<!-- ai-bot-update-pr:${auth.commit}:runtime -->\n<!-- ai-bot-app-scope:full -->\n`;
  const proposals=(await gh.list(gh.path('/pulls?state=all'))).filter(pr=>(pr.body?.startsWith(marker+'\n')||(scope==='full'&&pr.body?.startsWith(appFull)))&&pr.head?.repo?.full_name===gh.repo&&pr.base?.repo?.full_name===gh.repo&&pr.base.ref===auth.branch&&/^ai-update\/(?:bot|issue-[1-9]\d*)-[a-f0-9]{12}-[1-9]\d*$/.test(pr.head.ref||''));
  const existing=proposals.find(pr=>pr.state==='open');
  if(existing){await notify(`更新PRは ${proposalLink(gh,existing.number)} です。レビューしてマージするとBotが更新されます。`);return;}
  if(env.AI_BOT_UPDATE_AUTOMATIC==='true'&&proposals.some(pr=>pr.state==='closed')){await notify('この版の更新PRは既に閉じられています。同じ版のPRは自動で作り直しません。');return;}
  if(!writer){await notify('自動更新PRにはActions Secret `AI_BOT_UPDATE_TOKEN` が必要です。導入先だけのContents・Pull requests・Workflowsのwrite権限を設定してください。登録後は次の定期実行、またはBot update noticesのRun workflowでPRを作成します。キーはコメントに貼らないでください。');throw new SafeError('UPDATE_TOKEN');}
  const latest=scopedRelease(await release(source,auth.commit),state,scope);
  const ref=await gh.request(gh.path(`/git/ref/heads/${encodeURIComponent(auth.branch)}`));
  const base=ref.object?.sha;if(!sha(base))throw new SafeError('ACCESS');
  if(env.GITHUB_SHA&&env.GITHUB_SHA!==base)throw new SafeError('STALE');
  const files=await updateFiles(gh,state,latest,source,base);
  const fresh=await authorizeRequest(gh,event,env);
  const freshRef=await gh.request(gh.path(`/git/ref/heads/${encodeURIComponent(auth.branch)}`));
  if(fresh.commit!==auth.commit||freshRef.object?.sha!==base)throw new SafeError('STALE');
  if(scope==='runtime'&&Object.entries(latest.files).every(([path,hash])=>state.files[path]===hash)&&Object.keys(state.files).length===Object.keys(latest.files).length){await notify('Bot本体の更新はありません。Actions定義の変更は手動更新の対象です。');return;}
  const id=createHash('sha256').update(auth.commit+(scope==='runtime'?':runtime':'')).digest('hex');
  const workflowNote=scope==='runtime'?`\n\n更新範囲: Bot本体のみ（GITHUB_TOKENを使用）。Actions定義は変更していません。${latest.manualWorkflows.length?'\n手動更新が必要なActions定義:\n'+latest.manualWorkflows.map(path=>'- '+path).join('\n'):' 現在、Actions定義の更新差分はありません。'}\nActions定義の変更に依存する新機能は、手動更新するまで利用できない場合があります。導入記録のコミットSHAは本体の配布元を示し、全ファイルの一括更新を意味しません。`:'';
  await createLinkedProposal(writer,{kind:'update',issue:auth.number,runId:env.GITHUB_RUN_ID,sha:base,id,base:auth.branch,title:scope==='runtime'?'chore: update GitHub AI Bot runtime':'chore: update GitHub AI Bot',body:`${marker}\n${auth.number?`Refs #${auth.number}\n`:''}\n[配布元の変更](https://github.com/${SOURCE}/compare/${state.commit}...${auth.commit})\n\nAI使用: なし（配布元ファイルの更新）。\n\nBot専用ファイルを更新します。設定とAPIキーは保持します。取得ファイルのGit blobハッシュと更新対象の導入済みファイルの一致を検査しました。${workflowNote}上流コード・コマンド・インストーラーは実行していません。更新PRの差分とCIを人間がレビューしてください。自動マージは行いません。`,files,notify:pr=>notify(`更新PRを ${proposalLink(gh,pr.number)} に作成しました。差分とCIを確認してからマージしてください。`)});
}
export async function loadInstallation(gh,event,env,action){
  const auth=action==='apply'?await authorizeRequest(gh,event,env):null;
  if(action==='apply'&&!auth)throw new SafeError('ACCESS');
  try{return installation(JSON.parse(await readFile(STATE,'utf8')));}catch{
    const text='導入記録がないか破損しています。新しいインストーラーで導入・移行し、差分を確認してから再実行してください。自動上書きはしていません。';
    if(auth){
      if(auth.number)await gh.request(gh.path(`/issues/${auth.number}/comments`),'POST',{body:text});
      else await updateSummary(env,text);
      throw new SafeError('UPDATE_STATE');
    }
    console.log(text);return null;
  }
}
export function updateContext(gh,event,env,repo){
  if(event.repository?.full_name!==gh.repo)throw new SafeError('UPDATE_REPOSITORY');
  if(env.GITHUB_REF!==`refs/heads/${repo.default_branch}`)throw new SafeError('UPDATE_BRANCH');
}
export function updateError(error,env={}){
  if(error?.code==='PR'){
    const repo=typeof env.GITHUB_REPOSITORY==='string'&&/^[A-Za-z0-9_][A-Za-z0-9_.-]*\/[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(env.GITHUB_REPOSITORY)?env.GITHUB_REPOSITORY:null;
    const settings=repo?`\n設定画面: https://github.com/${repo}/settings/actions#workflow-permissions`:'';
    const full=env.AI_BOT_UPDATE_SCOPE==='full';
    return '更新PRを作成できませんでした。次の設定を確認してください。\n'
      +'1. 導入先の Settings → Actions → General → Workflow permissions で「Allow GitHub Actions to create and approve pull requests」を有効にし、Saveします。'+settings+'\n'
      +'   GitHubではPR作成とレビュー承認が共通の設定ですが、Botはレビュー承認しません。\n'
      +'2. .github/workflows/bot-updates.yml の update-pr ジョブに contents: write と pull-requests: write が必要です。リポジトリ全体の既定権限をwriteに変更する必要はありません。\n'
      +'3. 設定が変更できない場合は、リポジトリ管理者に確認してください。組織のポリシーで制限されている場合は組織管理者の対応が必要です。\n'
      +(full?'4. scope=fullでは、導入先限定の AI_BOT_UPDATE_TOKEN に Contents / Pull requests / Workflows の Read and write が必要です。Settings → Secrets and variables → Actions で登録・更新してください。'+(repo?`\nSecret設定: https://github.com/${repo}/settings/secrets/actions`:''):'scope=runtimeでは追加トークン・AIキーは不要です。')+'\n'
      +'設定後に Bot update notices → Run workflow から新しく実行してください。APIキーやトークンを入力欄・コメントへ貼らないでください。';
  }
  const known={
    UPDATE_REPOSITORY:'イベントのリポジトリと実行先が一致しません。導入先のActionsから起動してください。',
    UPDATE_BRANCH:'デフォルトブランチを選んで更新確認を実行してください。',
    UPDATE_EVENT:'この起動方法では更新を確認できません。Run workflowから実行してください。',
    API_UNAVAILABLE:'GitHub APIが一時的なサーバーエラーを返し、読み取りの再試行上限に達しました。時間をおいて新しい実行で再確認してください。',
    ACCESS:'更新確認のGitHub APIにアクセスできませんでした。contents: read権限を確認してください。',
    UPDATE_SOURCE:'配布元の取得または形式の確認に失敗しました。GitHub APIの一時的な制限や配布ファイルを確認してください。',
    UPDATE_STATE:'Botの導入記録が不正です。インストーラーの --upgrade で移行してください。',
    CONFIG:'更新範囲はruntimeまたはfullを指定してください。',
    STALE:'確認中にブランチが更新されました。新しい実行で再確認してください。'
  };
  return known[error?.code]||'Bot更新の処理に失敗しました。安全なエラー分類: '+(['TypeError','SyntaxError','Error'].includes(error?.name)?error.name:'INTERNAL');
}
export async function updates(env=process.env){
  const gh=new GitHub(env.GITHUB_REPOSITORY,env.GH_TOKEN);
  const event=JSON.parse(await readFile(env.GITHUB_EVENT_PATH,'utf8'));
  const repo=await gh.request(gh.path());
  updateContext(gh,event,env,repo);
  if(gh.repo===SOURCE)return;
  const action=process.argv[2];
  const scope=env.AI_BOT_UPDATE_SCOPE||'runtime';
  if(!['runtime','full'].includes(scope))throw new SafeError('CONFIG');
  env={...env,AI_BOT_UPDATE_SCOPE:scope};
  if(action==='authorize'){
    if(await authorizeUpdate(gh,event,env))if(env.GITHUB_OUTPUT)await appendFile(env.GITHUB_OUTPUT,'ready=true\n');
    return;
  }
  const state=await loadInstallation(gh,event,env,action);if(!state)return;
  if(action==='check'){
    if(!automaticEvent(event,env))throw new SafeError('UPDATE_EVENT');
    const update=await checkUpdate(gh,state,undefined,scope);
    if(!update)await updateSummary(env,scope==='runtime'?'Bot本体の更新はありません。Actions定義の更新は手動で確認してください。':'Botは最新版です。');
    if(update&&env.GITHUB_OUTPUT)await appendFile(env.GITHUB_OUTPUT,`ready=true\ncommit=${update.commit}\n`);
  }else if(action==='apply'){
    const writer=env.AI_BOT_UPDATE_TOKEN?new GitHub(gh.repo,env.AI_BOT_UPDATE_TOKEN):null;
    try{await applyUpdate(gh,writer,event,env,state);}catch(error){
      if(error.code==='NOTIFY')throw error;
      const text=error.code==='PR'?updateError(error,env):error.code==='STALE'?'確認中にIssueまたはデフォルトブランチが更新されました。変更内容を確認して、次の定期実行、またはRun workflowで再実行してください。':error.code==='UPDATE_CONFLICT'?'Botファイルに独自の変更または保存先の競合があります。上書きせず停止しました。差分を確認して手動で更新してください。':'更新PRを作成できませんでした。トークンの権限と配布元へのアクセスを確認してください。ファイルを直接上書きしていません。';
      if(error.code!=='UPDATE_TOKEN'){
        // The CLI handler prints the actionable PR guide and Summary once.
        if(env.AI_BOT_UPDATE_AUTOMATIC==='true'){if(error.code!=='PR')await updateSummary(env,text);}
        else await updateStatus(gh,number(event.issue?.number),updateTarget(event.issue),text);
      }
      throw error;
    }
  }else throw new SafeError('CONFIG');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{await updates();}catch(error){const text=updateError(error,process.env);console.error(text);if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,text+'\n').catch(()=>{});process.exitCode=1;}
}
