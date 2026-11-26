import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
// Empty working directory and home: target configuration, MCP, skills and hooks are absent.
await mkdir('/tmp/home', { recursive: true });
let text = ''; for await (const chunk of process.stdin) { text += chunk; if (Buffer.byteLength(text) > 200000) process.exit(1); }
const provider = process.env.AI_PROVIDER;
const model = process.env.AI_MODEL;
const args = provider === 'claude'
  ? ['-p', '--bare', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '', '--no-session-persistence', '--output-format', 'json', '--max-turns', '1', '--max-budget-usd', '1', '--model', model]
  : ['exec', '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--sandbox', 'read-only', '-c', 'approval_policy="never"', '-c', 'features.shell_tool=false', '-c', 'web_search="disabled"', '-c', 'model_provider="broker"', '-c', 'model_providers.broker.name="isolated-broker"', '-c', 'model_providers.broker.base_url="http://broker:8080/v1"', '-c', 'model_providers.broker.wire_api="responses"', '-c', 'model_providers.broker.requires_openai_auth=false', '-c', 'model_providers.broker.request_max_retries=0', '-c', 'model_providers.broker.stream_max_retries=0', '--model', model, '--output-last-message', '/tmp/answer.txt', '-'];
const env = { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp/home', TMPDIR: '/tmp', CI: 'true', TERM: 'dumb' };
if (provider === 'claude') Object.assign(env, { ANTHROPIC_API_KEY: 'placeholder-not-a-secret', ANTHROPIC_BASE_URL: 'http://broker:8080', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_AUTOUPDATER: '1' });
else env.CODEX_HOME = '/tmp/home/codex';
const child = spawn(provider === 'claude' ? 'claude' : 'codex', args, { env, stdio: ['pipe','pipe','pipe'] });
let output = ''; let bytes = 0;
for (const stream of [child.stdout,child.stderr]) stream.on('data', chunk => {
  bytes += chunk.length;
  if (bytes > 2000000) child.kill('SIGKILL');
});
child.stdout.on('data', chunk => { if (provider === 'claude' && bytes <= 2000000) output += chunk; });
child.stdin.on('error', () => {});
child.stdin.end(text);
const timer = setTimeout(() => child.kill('SIGKILL'), 240000);
child.on('error', () => { clearTimeout(timer); process.exitCode = 1; });
child.on('close', async code => {
  clearTimeout(timer);
  if (code !== 0) { process.exitCode = 1; return; }
  try {
    if (provider === 'claude') {
      const result = JSON.parse(output);
      if (result.is_error || result.subtype !== 'success' || typeof result.result !== 'string') throw new Error();
      output = result.result;
    } else output = await readFile('/tmp/answer.txt', 'utf8');
    if (!output.trim() || Buffer.byteLength(output) > 100000) throw new Error();
    process.stdout.write(output);
  } catch { process.exitCode = 1; }
});
