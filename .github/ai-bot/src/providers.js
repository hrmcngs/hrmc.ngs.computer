import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { SafeError, cleanOutput } from './core.js';
import { statusCode } from './broker.js';

export async function tokyo(text, key, fetcher = fetch, outputLimit = 18000) {
  if (!key) throw new SafeError('AUTH');
  try {
    const response = await fetcher('https://ai-api.metro.tokyo.lg.jp/api/v1/public/message', {
      method: 'POST', headers: { Accept: 'application/json', Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: text, conversation_id: '' }), redirect: 'error', signal: AbortSignal.timeout(90000)
    });
    if (!response.ok) { await response.body?.cancel(); throw new SafeError(statusCode(response.status)); }
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 200000) throw new SafeError('OUTPUT');
      chunks.push(Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks).toString('utf8');
    let data; try { data = JSON.parse(body); } catch { throw new SafeError('OUTPUT'); }
    return cleanOutput(data.message, [key], outputLimit);
  } catch (error) { throw error instanceof SafeError ? error : new SafeError('NETWORK'); }
}
export function command(args, { input, env = {}, timeout = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { env: { PATH: process.env.PATH, ...env }, stdio: ['pipe','pipe','pipe'] });
    let output = ''; let size = 0;
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.stdout.on('data', chunk => { size += chunk.length; if (size < 2000000) output += chunk; else child.kill('SIGKILL'); });
    child.stderr.on('data', chunk => { size += chunk.length; if (size > 2000000) child.kill('SIGKILL'); });
    child.on('error', () => { clearTimeout(timer); reject(new SafeError('RUNTIME')); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new SafeError('RUNTIME')); });
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
}
export async function agent(provider, model, text, key, run = command, outputLimit = 18000) {
  if (!key) throw new SafeError('AUTH');
  const id = `ai-bot-${randomBytes(8).toString('hex')}`;
  const network = `${id}-internal`, broker = `${id}-broker`, client = `${id}-client`;
  const limits = ['--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=96','--memory=1g','--cpus=1','--ulimit','fsize=8388608:8388608','--tmpfs','/tmp:rw,noexec,nosuid,size=128m,uid=1000,gid=1000','--log-driver=local','--log-opt','max-size=1m','--log-opt','max-file=1'];
  try {
    // Image builds happen in a separate workflow step without secrets.
    await run(['network','create','--internal',network]);
    await run(['create','--name',broker,'--network','bridge',...limits,'--env','AI_API_KEY','--env',`AI_PROVIDER=${provider}`,'--entrypoint','node','ai-bot-broker:local','/opt/ai-bot/broker.js'], { env: { AI_API_KEY: key } });
    await run(['network','connect','--alias','broker',network,broker]);
    await run(['start',broker]);
    for (let i=0; i<20; i++) {
      try { await run(['exec',broker,'node','-e',"require('net').connect(8080,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"]); break; }
      catch { if (i===19) throw new SafeError('RUNTIME'); await new Promise(resolve=>setTimeout(resolve,100)); }
    }
    const result = await run(['run','--name',client,'--network',network,'--dns=127.0.0.1',...limits,'--env',`AI_PROVIDER=${provider}`,'--env',`AI_MODEL=${model}`,'--interactive',`ai-bot-${provider}:local`], { input: text });
    return cleanOutput(result, [key], outputLimit);
  } catch (error) {
    const logs = await run(['logs',broker]).catch(() => '');
    const status = logs.match(/AI_STATUS:(AUTH|LIMIT|NETWORK)/)?.[1];
    throw status ? new SafeError(status) : error;
  } finally {
    await run(['rm','--force',client,broker]).catch(() => {});
    await run(['network','rm',network]).catch(() => {});
  }
}
