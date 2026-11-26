// Trusted verifier. Never emit target-controlled logs, bodies, environment or exception messages.
import { readFile, writeFile, lstat, mkdir, readdir, chmod } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
let targetExecution=false;
const env={ AI_BOT_VERIFIER_PID:String(process.pid), PATH:'/usr/local/bin:/usr/bin:/bin', HOME:'/tmp/home', TMPDIR:'/tmp', CI:'true', npm_config_cache:'/tmp/npm', npm_config_userconfig:'/opt/ai-bot/npm-user.npmrc', npm_config_globalconfig:'/opt/ai-bot/npm-global.npmrc', npm_config_offline:'true', npm_config_ignore_scripts:'true', npm_config_update_notifier:'false' };
const report={version:1,ok:false,stage:'setup',checks:[]};
async function readonly(dir) {
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const file=path.join(dir,entry.name);
    if(entry.isSymbolicLink())continue;
    if(entry.isDirectory())await readonly(file);
    else if(entry.isFile()){const info=await lstat(file);await chmod(file,info.mode & 0o111 ? 0o555 : 0o444);}
    else throw new Error();
  }
  await chmod(dir,0o555);
}
function run(argv,record=false) {
  const result=spawnSync(argv[0],argv.slice(1),{cwd:'/workspace',env,timeout:90000,maxBuffer:1000000,stdio:['ignore','pipe','pipe'],...(targetExecution?{uid:1000,gid:1000}:{})});
  const ok=result.status===0 && !result.error;
  if(record){
    const output=String(result.stderr||'')+String(result.stdout||'');
    let detail='';
    if(!ok){
      if(/double-loading config/i.test(output))detail='CONFIG_CONFLICT';
      else if(result.error?.code==='ETIMEDOUT'||result.signal==='SIGTERM')detail='TIMEOUT';
      else if(/EACCES|Permission denied/i.test(output)||result.error?.code==='EACCES')detail='PERMISSION_DENIED';
      else if(/ENOENT|not found|is required/i.test(output)||result.error?.code==='ENOENT')detail='MISSING_TOOL';
    }
    report.checks.push({argv,exitCode:result.status,detail});
  }
  return ok;
}
try {
  await mkdir('/tmp/home',{recursive:true});
  report.stage='extract';
  if(!run(['tar','--no-same-owner','--no-same-permissions','-xf','/input/source.tar','-C','/workspace','--exclude=.git','--exclude=.work','--exclude=node_modules']))throw new Error();
  report.stage='apply';
  const data=JSON.parse(await readFile('/input/validation.json','utf8'));
  for(const change of data.plan.changes) {
    const pieces=change.path.split('/');let current='/workspace';
    for(const piece of pieces) {
      if(!piece || piece==='.' || piece==='..')throw new Error();
      current=path.join(current,piece);
      const entry=await lstat(current);
      if(entry.isSymbolicLink())throw new Error();
    }
    const original=await readFile(current,'utf8');
    const expected=data.originals.find(f=>f.path===change.path);
    if(!expected || original!==expected.content)throw new Error();
    await writeFile(current,change.content);
  }
  report.stage='dependencies';
  try {
    const pkg=JSON.parse(await readFile('/workspace/package.json','utf8'));
    if(Object.keys({...pkg.dependencies,...pkg.devDependencies,...pkg.optionalDependencies}).length)throw new Error();
  } catch(error) { if(error.code!=='ENOENT')throw error; }
  report.stage='setup';
  await chmod('/tmp/home',0o777);
  await readonly('/workspace');
  // Keep attestation authority separate from target commands, which always run as UID/GID1000.
  // A same-UID test must not signal or debug the process that certifies its result.
  if(process.getuid()!==0)throw new Error();
  process.setgroups([]);targetExecution=true;
  report.stage='syntax';
  for(const change of data.plan.changes.filter(c=>/\.[cm]?js$/.test(c.path)))if(!run(['node','--check',change.path],true))throw new Error();
  report.stage='command';
  for(const command of data.commands)if(!run(command,true))throw new Error();
  report.ok=true;report.stage='complete';
} catch { /* Only trusted stage names and bounded command statuses are returned. */ }
process.stdout.write(JSON.stringify(report));
