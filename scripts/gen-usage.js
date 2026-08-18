'use strict';

/**
 * gen-usage.js — github-stats-charts の使用回数を集計し charts/usage.json に書き出す。
 *
 * 集計対象:
 *   1. "Use this template" 系: hrmcngs/github-stats-charts の
 *      - forks_count（API）
 *      - "Used by" 数（HTML スクレイプ・公式 API なし）
 *      - 他リポジトリのコード内 "hrmcngs/github-stats-charts" 参照数（Search API）
 *   2. bootstrap.sh 系:
 *      - 他リポジトリで raw.githubusercontent.com/hrmcngs/hrmcngs/main/bootstrap.sh
 *        を含むファイル数（README や setup 手順を貼った痕跡）
 *
 * 結果は静的 JSON として content.js から fetch して Works カードに表示する。
 * GitHub Actions (.github/workflows/update-charts.yml) から定期実行される想定。
 * Node 20+（グローバル fetch）。
 */

const fs = require('fs');
const path = require('path');

const TEMPLATE_REPO = 'hrmcngs/github-stats-charts';
const BOOTSTRAP_URL = 'raw.githubusercontent.com/hrmcngs/hrmcngs/main/bootstrap.sh';
const SELF_EXCLUDE = ['hrmcngs/hrmcngs', 'hrmcngs/hrmc.ngs.computer'];
const KNOWN_REPOS = [
  'aya526dev/aya526dev',
  'hrmcngs/hrmc.ngs.computer',
  'hrmcngs/hrmcngs',
  'yuqiuwuu/yuqiuwuu',
];
const MARKER_FILES = [
  'scripts/gen-charts.js',
  'src/js/charts.js',
  '.github/workflows/update-charts.yml',
];

// 注意: /search/code は Actions の GITHUB_TOKEN では cross-repo 検索ができず
// 429 で失敗する。USAGE_TOKEN（repo スコープの PAT）をリポジトリ secret に
// 設定するとフル検索が動く。未設定時は GITHUB_TOKEN にフォールバック。
const TOKEN = process.env.USAGE_TOKEN || process.env.GITHUB_TOKEN || '';
const UA = 'hrmcngs-usage-counter';
const HEADERS = {
  'Accept': 'application/vnd.github+json',
  'User-Agent': UA,
  ...(TOKEN ? { 'Authorization': 'Bearer ' + TOKEN } : {}),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(p) {
  const r = await fetch('https://api.github.com' + p, { headers: HEADERS });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`${p}: ${r.status} ${body.slice(0, 120)}`);
  }
  return r.json();
}

// /search/code は二次レート制限が厳しい。呼び出し間に小休止を挟む。
async function searchCount(q) {
  try {
    const d = await api('/search/code?q=' + encodeURIComponent(q) + '&per_page=1');
    return d.total_count || 0;
  } catch (e) {
    console.warn('search failed (' + q + '):', e.message);
    return 0;
  } finally {
    await sleep(2500);
  }
}

async function scrapeUsedBy(repo) {
  try {
    const r = await fetch('https://github.com/' + repo, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
    });
    if (!r.ok) return 0;
    const html = await r.text();
    // 例: <a href="/<owner>/<repo>/network/dependents"><svg.../> Used by <span title="1,234">1.2k</span>
    let m = /Used by[\s\S]{0,400}?title="([\d,]+)"/.exec(html);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10) || 0;
    m = /Used by[\s\S]{0,400}?>(\d[\d,]*)</.exec(html);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10) || 0;
    return 0;
  } catch (e) {
    console.warn('scrape failed:', e.message);
    return 0;
  }
}

// テンプレート本体で重複排除・手動検証まで行った公開カウンターを取得する。
// GitHub の "Use this template" には公式の集計APIがないため、この値を正とする。
async function fetchPublishedUsage() {
  try {
    const d = await api(`/repos/${TEMPLATE_REPO}/contents/.usage.json?ref=main`);
    if (d?.encoding !== 'base64' || typeof d.content !== 'string') return 0;
    const usage = JSON.parse(Buffer.from(d.content, 'base64').toString('utf8'));
    const count = Number.parseInt(usage.message, 10);
    return Number.isFinite(count) && count >= 0 ? count : 0;
  } catch (e) {
    console.warn('published usage failed:', e.message);
    return 0;
  }
}

// コード検索に出ない導入先は、配布ファイルの実在を確認してから数える。
async function verifyKnownRepos() {
  const verified = [];
  for (const repo of KNOWN_REPOS) {
    try {
      const info = await api(`/repos/${repo}`);
      if (info.private) continue;
      for (const file of MARKER_FILES) {
        try {
          await api(`/repos/${repo}/contents/${file}`);
          verified.push(info.full_name);
          break;
        } catch (e) { /* 次のマーカーファイルを確認 */ }
      }
    } catch (e) {
      console.warn(`known repo failed (${repo}):`, e.message);
    }
  }
  return verified;
}

(async () => {
  // ── テンプレート（"Use this template"）利用数 ─────────────
  let forks = 0;
  try { forks = (await api('/repos/' + TEMPLATE_REPO)).forks_count || 0; }
  catch (e) { console.warn('repo info failed:', e.message); }
  const usedBy = await scrapeUsedBy(TEMPLATE_REPO);
  const codeRefs = await searchCount(`"${TEMPLATE_REPO}" -repo:${TEMPLATE_REPO}`);
  const rawRefs  = await searchCount(`"raw.githubusercontent.com/${TEMPLATE_REPO}" -repo:${TEMPLATE_REPO}`);
  const publishedUsage = await fetchPublishedUsage();
  const knownRepos = await verifyKnownRepos();
  // raw URL ヒットは概ね codeRefs に含まれるため max で重複除去
  const discoveredTemplate = forks + Math.max(codeRefs, rawRefs) + usedBy;

  // ── bootstrap.sh 利用数 ─────────────────────────────────
  const excludeArgs = SELF_EXCLUDE.map(r => `-repo:${r}`).join(' ');
  const bootstrap = await searchCount(`"${BOOTSTRAP_URL}" ${excludeArgs}`);

  // 公開カウンターには bootstrap 経由の導入も含まれるため、単純加算せず
  // このサイト独自集計との大きい方を採用して二重計上を避ける。
  const total = Math.max(publishedUsage, knownRepos.length, discoveredTemplate + bootstrap);
  const template = Math.max(discoveredTemplate, knownRepos.length, publishedUsage - bootstrap);
  const out = {
    schemaVersion: 1,
    total,
    template,
    bootstrap,
    breakdown: {
      forks, usedBy, codeRefs, rawRefs, publishedUsage,
      knownRepos: knownRepos.length,
    },
    verifiedRepos: knownRepos,
    generatedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(out, null, 2));

  const outPath = path.join(__dirname, '..', 'charts', 'usage.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
  console.log('Wrote ' + path.relative(path.join(__dirname, '..'), outPath));
})().catch((e) => { console.error(e); process.exit(1); });
