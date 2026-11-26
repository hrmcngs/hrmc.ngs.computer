import { SafeError } from './core.js';
import {setTimeout as pause} from 'node:timers/promises';
export const temporaryStatus=status=>[500,502,503,504].includes(status);
// Retry idempotent reads only. Never retry PR creation, commits or other writes.
export async function responseWithRetry(fetcher,url,options={},wait=pause){
  const attempts=(options.method||'GET')==='GET'?3:1;
  for(let attempt=0;attempt<attempts;attempt++){
    const response=await fetcher(url,{...options,signal:AbortSignal.timeout(30000)});
    if(!temporaryStatus(response.status)||attempt===attempts-1)return response;
    await response.body?.cancel();await wait(500*(attempt+1));
  }
}

export class GitHub {
  constructor(repo, token, fetcher = fetch) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) throw new SafeError('ACCESS');
    this.repo = repo; this.token = token; this.fetcher = fetcher;
  }
  async request(path, method = 'GET', body) {
    if (!path.startsWith(`/repos/${this.repo}/`) && path !== `/repos/${this.repo}`) throw new SafeError('ACCESS');
    try {
      const res = await responseWithRetry(this.fetcher,`https://api.github.com${path}`, { method, headers: {
        Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json'
      }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (!res.ok) { await res.body?.cancel(); throw new SafeError(temporaryStatus(res.status)?'API_UNAVAILABLE':'ACCESS'); }
      return res.status === 204 ? null : await res.json();
    } catch(error) { throw error instanceof SafeError?error:new SafeError('ACCESS'); }
  }
  async list(path) {
    const all = [];
    for (let page=1; page<=10; page++) {
      const rows = await this.request(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      if (!Array.isArray(rows)) throw new SafeError('ACCESS');
      all.push(...rows);
      if (rows.length < 100) return all;
    }
    // Never silently miss deduplication markers beyond the pagination limit.
    throw new SafeError('ACCESS');
  }
  path(tail = '') { return `/repos/${this.repo}${tail}`; }
}
export const REPORT_MARKER = '<!-- ai-bot-dependabot-report:v1 -->';
export function botOwned(item) { return item?.user?.login === 'github-actions[bot]' && item?.user?.type === 'Bot'; }
export async function reportIssue(gh) {
  const issues = await gh.list(gh.path('/issues?state=all&sort=created&direction=desc'));
  return issues.find(item => !item.pull_request && botOwned(item) && item.body?.startsWith(REPORT_MARKER));
}
export async function comments(gh, issueNumber) { return gh.list(gh.path(`/issues/${issueNumber}/comments`)); }
export function completed(rows, fp) { return rows.some(row => botOwned(row) && row.body?.startsWith(`<!-- ai-bot:${fp}:ok -->`)); }
