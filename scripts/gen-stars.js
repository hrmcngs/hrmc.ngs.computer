'use strict';

// Works と追加リンクからスター数を収集する。APIキーはActions内だけで使う。
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const validCount = n => Number.isSafeInteger(n) && n >= 0;

// Read only GitHub's repository metadata, never rounded "1.2k" labels.
function githubStarsFromHtml(html) {
  // Locate GitHub's known metadata field, not arbitrary HTML tags. Nothing
  // extracted here is rendered as HTML; only validated integers are returned.
  const lower = html.toLowerCase();
  for (const quote of ['"', "'"]) {
    const marker = `data-target=${quote}react-app.embeddedData${quote}`;
    const position = html.indexOf(marker);
    if (position < 0) continue;
    const start = html.indexOf('>', position + marker.length);
    const end = lower.indexOf('</script', start + 1);
    if (start < 0 || end < 0) continue;
    try {
      const payload = JSON.parse(html.slice(start + 1, end)).payload;
      const count = payload?.sidebarAbout?.stargazerCount
        ?? payload?.codeViewRepoRoute?.overview?.sidebarAboutData?.stargazerCount;
      if (validCount(count)) return count;
    } catch (_) {}
  }
  for (const quote of ['"', "'"]) {
    const marker = `id=${quote}repo-stars-counter-star${quote}`;
    const position = html.indexOf(marker);
    if (position < 0) continue;
    const start = html.lastIndexOf('<', position);
    const end = html.indexOf('>', position + marker.length);
    if (start < 0 || end < 0) continue;
    const title = html.slice(start, end).match(/\btitle=["'](\d{1,3}(?:,\d{3})+|\d+)["']/i)?.[1];
    const nextTag = html.indexOf('<', end + 1);
    // Reject nested markup instead of trying to sanitize it by removing tags.
    const text = title ?? (nextTag < 0 || !html.startsWith('</', nextTag)
      ? '' : html.slice(end + 1, nextTag).trim());
    if (/^(?:\d{1,3}(?:,\d{3})+|\d+)$/.test(text)) {
      const count = Number(text.replaceAll(',', ''));
      if (validCount(count)) return count;
    }
  }
  return null;
}

function curseforgeFavoritesFromHtml(html) {
  // Read the Favorite tooltip's number; do not confuse it with thumbsUpCount.
  const match = html.match(/\b(?:title|aria-label|data-tooltip-content|data-tooltip)=["']Favorite \((\d{1,3}(?:,\d{3})+|\d+)\)["']/i);
  if (!match) return null;
  const count = Number(match[1].replaceAll(',', ''));
  return validCount(count) ? count : null;
}

async function fetchStars(url) {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);
  const headers = { Accept: 'application/json', 'User-Agent': 'hrmc-stats-bot' };
  let endpoint;
  if (host === 'github.com' && parts.length >= 2) {
    endpoint = `https://github.com/${parts.slice(0, 2).map(encodeURIComponent).join('/')}`;
    headers.Accept = 'text/html';
  } else if (host === 'curseforge.com' && parts.length >= 3) {
    endpoint = `https://www.curseforge.com/${parts.slice(0, 3).map(encodeURIComponent).join('/')}`;
    headers.Accept = 'text/html';
  } else return null;
  const res = await fetch(endpoint, { headers, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const count = host === 'github.com' ? githubStarsFromHtml(await res.text())
    : curseforgeFavoritesFromHtml(await res.text());
  if (!validCount(count)) throw new Error('Project count not present in public page; keeping previous verified value');
  return { count, platform: host === 'github.com' ? 'GitHub' : 'CurseForge',
    metric: host === 'github.com' ? 'stars' : 'favorites' };
}

// Node handles HTTP only; Lisp owns collection, deduplication and persistence.
async function main() {
  if (process.argv[2] === '--fetch') {
    const entries = {};
    for (const url of process.argv.slice(3)) {
      try {
        const stats = await fetchStars(url);
        if (stats) entries[url] = stats;
      } catch (error) { console.error(`${url}: ${error.message}`); }
    }
    process.stdout.write(JSON.stringify(entries));
    return;
  }
  const result = spawnSync('sbcl', ['--script', path.join(__dirname, 'gen-stars.lisp')], { stdio: 'inherit' });
  if (result.error) throw new Error(`SBCLが必要です: ${result.error.message}`);
  process.exitCode = result.status ?? 1;
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { fetchStars, githubStarsFromHtml, curseforgeFavoritesFromHtml };
