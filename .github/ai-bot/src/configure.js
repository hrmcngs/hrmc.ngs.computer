import {readFile,writeFile,rename,lstat,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {config,providers} from './core.js';

// Inspect script names only; never run project code during setup.
export function settings(raw,{provider,mode,scripts={},sourcePaths=[],autoReview,securityAudit}) {
  config(raw);
  if(!['all',...providers].includes(provider)||!['manual','automatic'].includes(mode))throw new Error('Invalid setup choice');
  const next=structuredClone(raw);
  next.provider=provider==='all'?raw.provider:provider;next.mode=mode;
  if(provider==='all')next.aiMode='all';else delete next.aiMode;
  delete next.aiProviders;delete next.aiSelection;
  const commands=[];
  if(typeof scripts.check==='string'&&scripts.check.trim())commands.push(['npm','run','check']);
  const tests=typeof scripts.test==='string'&&scripts.test.trim()&&!/no test specified/i.test(scripts.test);
  if(tests)commands.push(['npm','test']);
  next.fix={...next.fix,enabled:Boolean(tests),commands,botFiles:[]};
  next.autoMerge={...next.autoMerge,enabled:false};
  next.include=[...new Set([...next.include,...sourcePaths])];
  if(autoReview!==undefined){if(typeof autoReview!=='boolean')throw new Error('Invalid automatic review choice');next.autoReview={enabled:autoReview};}
  if(securityAudit!==undefined){if(typeof securityAudit!=='boolean')throw new Error('Invalid security audit choice');next.securityAudit={enabled:securityAudit};}
  config(next);
  return next;
}
export async function configure(root,provider,mode,review,audit) {
  if(audit!==undefined&&!['true','false'].includes(audit))throw new Error('Invalid security audit choice');
  if(review!==undefined&&!['true','false'].includes(review))throw new Error('Invalid automatic review choice');
  const file=join(root,'.github/ai-bot/config.json');
  if(!(await lstat(file)).isFile())throw new Error('Configuration must be a regular file');
  let scripts={};
  try{
    const pkg=join(root,'package.json');
    if(!(await lstat(pkg)).isFile())throw new Error('Package must be a regular file');
    scripts=JSON.parse(await readFile(pkg,'utf8')).scripts||{};
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const sourcePaths=[];
  for(const name of ['src','lib','app','js','frontend','backend','server','client']){
    try{if((await lstat(join(root,name))).isDirectory())sourcePaths.push(name+'/');}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const next=settings(JSON.parse(await readFile(file,'utf8')),{provider,mode,scripts,sourcePaths,autoReview:review===undefined?undefined:review==='true',securityAudit:audit===undefined?undefined:audit==='true'});
  const pending=file+'.setup-'+randomUUID();
  try{await writeFile(pending,JSON.stringify(next,null,2)+'\n',{flag:'wx',mode:0o644});await rename(pending,file);}
  finally{await unlink(pending).catch(()=>{});}
  console.log(next.fix.enabled?'修正PR：有効（npmのcheck/testを検証に使用）':'修正PR：無効（有効なnpm testがありません）。調査・調査結果PRは使えます。');
  console.log(next.autoReview?.enabled?'PR自動レビュー：有効（AI利用枠を消費・提案コメントのみ）':'PR自動レビュー：無効');
  console.log('自動マージ：無効。対象パスと検証コマンドは、取り込み前に差分を確認してください。');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  configure(resolve(process.argv[2]||'.'),process.argv[3],process.argv[4],process.argv[5],process.argv[6]).catch(()=>{console.error('設定を保存できませんでした。config.jsonとpackage.jsonの形式・権限を確認してください。');process.exitCode=1;});
}
