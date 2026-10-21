'use strict';

// Works と追加リンクからスター数を収集する。APIキーはActions内だけで使う。
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const validCount = n => Number.isSafeInteger(n) && n >= 0;

// Read only GitHub's repository metadata, never rounded "1.2k" labels.
function githubStarsFromHtml(html) {
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/data-target=["']react-app\.embeddedData["']/.test(script[1])) continue;
    try {
      const payload = JSON.parse(script[2]).payload;
      const count = payload?.sidebarAbout?.stargazerCount
        ?? payload?.codeViewRepoRoute?.overview?.sidebarAboutData?.stargazerCount;
      if (validCount(count)) return count;
    } catch (_) {}
  }
  const counter = html.match(/<[^>]+\bid=["']repo-stars-counter-star["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
  if (counter) {
    const title = counter[0].match(/\btitle=["']([\d,]+)["']/i)?.[1];
    const text = title ?? counter[1].replace(/<[^>]*>/g, '').trim();
    if (/^\d[\d,]*$/.test(text)) {
      const count = Number(text.replaceAll(',', ''));
      if (validCount(count)) return count;
    }
  }
  return null;
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
    // CurseForgeの公開指標はthumbsUpCount（高評価数）。未提供は0にしない。
    if (!process.env.CURSEFORGE_API_KEY || parts[0] !== 'minecraft') return null;
    endpoint = `https://api.curseforge.com/v1/mods/search?gameId=432&slug=${encodeURIComponent(parts[2])}&pageSize=50`;
    headers['x-api-key'] = process.env.CURSEFORGE_API_KEY;
  } else return null;
  const res = await fetch(endpoint, { headers, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const count = host === 'github.com' ? githubStarsFromHtml(await res.text())
    : (await res.json()).data?.find(p => p.slug === parts[2])?.thumbsUpCount;
  return validCount(count) ? { count, platform: host === 'github.com' ? 'GitHub' : 'CurseForge' } : null;
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
module.exports = { fetchStars, githubStarsFromHtml };
