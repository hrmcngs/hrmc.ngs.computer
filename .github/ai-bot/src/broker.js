// This process alone receives the real AI key. Never log requests, bodies or headers.
import http from 'node:http';
import { pathToFileURL } from 'node:url';

export function route(provider, path) {
  if (provider === 'claude' && /^\/v1\/messages(?:\?beta=true)?$/.test(path)) return 'https://api.anthropic.com/v1/messages';
  if (provider === 'codex' && path === '/v1/responses') return 'https://api.openai.com/v1/responses';
  return null;
}
export function statusCode(status) {
  if ([401,403].includes(status)) return 'AUTH';
  if ([402,429].includes(status)) return 'LIMIT';
  return 'NETWORK';
}
export function createBroker({ provider, key, fetcher = fetch, log = console.log }) {
  let calls = 0;
  return http.createServer(async (req, res) => {
    const destination = route(provider, req.url);
    if (req.method !== 'POST' || !destination) { res.writeHead(404).end(); return; }
    if (++calls > 8) { log('AI_STATUS:LIMIT'); res.writeHead(429).end(); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 150000);
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1500000) throw new Error('body limit');
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString('utf8');
      const data = JSON.parse(body);
      // No server-side tools, arbitrary remote endpoints, background jobs or stored conversations.
      if (data.previous_response_id || data.background || data.stream_options?.include_obfuscation === false) {
        res.writeHead(400).end('{"error":{"message":"Unsupported request"}}'); return;
      }
      // Strip every tool declaration before inference: providers cannot invoke local or hosted tools.
      delete data.tools;
      delete data.tool_choice;
      if (provider === 'codex') data.store = false;
      const headers = { 'content-type': 'application/json' };
      if (provider === 'claude') {
        headers['x-api-key'] = key;
        headers['anthropic-version'] = '2023-06-01';
        if (typeof req.headers['anthropic-beta'] === 'string' && /^[\w,.-]{1,1000}$/.test(req.headers['anthropic-beta'])) headers['anthropic-beta'] = req.headers['anthropic-beta'];
      } else headers.authorization = `Bearer ${key}`;
      const upstream = await fetcher(destination, { method: 'POST', headers, body: JSON.stringify(data), signal: controller.signal, redirect: 'error' });
      if (!upstream.ok) {
        log(`AI_STATUS:${statusCode(upstream.status)}`);
        await upstream.body?.cancel();
        res.writeHead(upstream.status, { 'content-type': 'application/json' }).end('{"type":"error","error":{"type":"api_error","message":"AI request failed"}}');
        return;
      }
      res.writeHead(200, { 'content-type': upstream.headers.get('content-type') || 'application/json' });
      let received = 0;
      for await (const chunk of upstream.body) {
        received += chunk.length;
        if (received > 4000000) throw new Error('response limit');
        res.write(chunk);
      }
      res.end();
    } catch {
      log('AI_STATUS:NETWORK');
      if (!res.headersSent) res.writeHead(502);
      res.end();
    } finally { clearTimeout(timer); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!['claude','codex'].includes(process.env.AI_PROVIDER) || !process.env.AI_API_KEY) process.exit(1);
  const server = createBroker({ provider: process.env.AI_PROVIDER, key: process.env.AI_API_KEY });
  server.requestTimeout = 160000;
  server.headersTimeout = 10000;
  server.listen(8080, '0.0.0.0');
}
