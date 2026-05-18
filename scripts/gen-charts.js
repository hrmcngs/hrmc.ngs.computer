'use strict';

/**
 * gen-charts.js — GitHub統計チャートを SVG ファイルとして生成する
 * --------------------------------------------------------------------------
 * Markdown（.md）は JavaScript を実行できないため、チャートを「画像」として
 * 用意する必要がある。このスクリプトは GitHub のデータを取得し、共有ライブラリ
 * charts.js で SVG を描画して charts/ ディレクトリに書き出す。
 *
 * 生成された .svg は Markdown から画像として埋め込める:
 *     ![activity](charts/activity.svg)
 *
 * GitHub Actions (.github/workflows/update-charts.yml) から定期実行される。
 * ローカル実行 : node scripts/gen-charts.js
 * 必要環境     : Node.js 20 以降（グローバル fetch を使用）
 *
 * ◆ 設定 ◆ 下の CONFIG を編集する（種類・色を変えれば見た目が変わる）。
 *          これが「Markdown 側のチャート設定」にあたる。
 * --------------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const GHSCharts = require('../src/js/charts.js');

// ============================ 設定（ここを編集） ============================
const CONFIG = {
  user: 'hrmcngs',          // GitHub ユーザー名
  orgs: [],                 // 追加 organization（公開メンバーは自動取得）
  periodDays: 365,          // 集計期間（日数）
  outDir: 'charts',         // SVG の出力先ディレクトリ

  // 生成するチャート。type / color を変えると見た目が変わる。
  //   activity      : type = radar | pie | bar | hbar | area
  //   languages     : type = hbar | pie | bar | area
  //                   （exclude / pin / other で Other 集約を調整可）
  //   contributions : type = bars3d
  charts: [
    // 見本用（全種類）— SAMPLE.md で使用
    { file: 'activity-radar.svg', section: 'activity',  type: 'radar', color: '#2f81f7' },
    { file: 'activity-pie.svg',   section: 'activity',  type: 'pie',   color: '#2f81f7' },
    { file: 'activity-bar.svg',   section: 'activity',  type: 'bar',   color: '#2f81f7' },
    { file: 'activity-hbar.svg',  section: 'activity',  type: 'hbar',  color: '#2f81f7' },
    { file: 'activity-area.svg',  section: 'activity',  type: 'area',  color: '#2f81f7' },
    { file: 'languages-hbar.svg', section: 'languages', type: 'hbar',  other: 1 },
    { file: 'languages-pie.svg',  section: 'languages', type: 'pie',   other: 1 },
    { file: 'languages-bar.svg',  section: 'languages', type: 'bar',   other: 1 },
    { file: 'languages-area.svg', section: 'languages', type: 'area',  other: 1 },
    // 既定（README 等で使う推奨セット）
    { file: 'activity.svg',      section: 'activity',      type: 'radar',  color: '#2f81f7' },
    { file: 'languages.svg',     section: 'languages',     type: 'hbar',   other: 1,
      pin: ['Common Lisp', 'NewLisp'], exclude: ['YAML', 'JSON'] },
    { file: 'contributions.svg', section: 'contributions', type: 'bars3d', color: '#39d353' },
  ],
};
// ============================== 設定ここまで ==============================

const API = 'https://api.github.com';
const UA = 'hrmc.ngs.computer chart generator';

function ghHeaders() {
  const h = { 'User-Agent': UA, Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function ghJson(p) {
  const res = await fetch(API + p, { headers: ghHeaders() });
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status} (${p})`);
  return res.json();
}

async function searchCount(kind, q) {
  const d = await ghJson(`/search/${kind}?q=${encodeURIComponent(q)}&per_page=1`);
  return typeof d.total_count === 'number' ? d.total_count : 0;
}

async function repoList(ownerPath) {
  let repos = [];
  for (let page = 1; page <= 3; page++) {
    const list = await ghJson(`${ownerPath}/repos?per_page=100&page=${page}&sort=pushed`);
    if (!Array.isArray(list) || !list.length) break;
    repos = repos.concat(list);
    if (list.length < 100) break;
  }
  return repos;
}

// 現在の季節（北半球基準）
function currentSeason() {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

// オーナーの地域（GitHub の location）から現在の天気を判定（Open-Meteo・無料・認証不要）
async function fetchWeather(location) {
  if (!location || !String(location).trim()) return 'clear';
  try {
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`,
    ).then((r) => r.json());
    const place = geo && geo.results && geo.results[0];
    if (!place) return 'clear';
    const w = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=weather_code`,
    ).then((r) => r.json());
    const code = w && w.current && w.current.weather_code;
    if (code == null) return 'clear';
    // WMO天気コード: 51-67/80-82=雨, 71-77/85-86=雪
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'snow';
    return 'clear';
  } catch (e) {
    return 'clear';
  }
}

// GitHub と jogruber から統計データをまとめて取得する
async function fetchData() {
  const user = CONFIG.user;
  const since = new Date(Date.now() - CONFIG.periodDays * 86400000).toISOString().slice(0, 10);
  const sinceMs = Date.parse(since);
  const info = await ghJson(`/users/${user}`).catch(() => ({}));

  // 所属 org（公開メンバーシップ＋手動指定）
  let orgs = CONFIG.orgs.slice();
  try {
    const list = await ghJson(`/users/${user}/orgs?per_page=100`);
    if (Array.isArray(list)) orgs = orgs.concat(list.map((o) => o.login));
  } catch (e) { /* 取得失敗でも継続 */ }
  const seenOrg = new Set();
  orgs = orgs.filter((o) => o && !seenOrg.has(o.toLowerCase()) && seenOrg.add(o.toLowerCase()));

  // 本人＋org のリポジトリ（fork除外・重複除去・期間内に更新されたもの）
  let repos = await repoList(`/users/${user}`);
  for (const org of orgs) {
    try { repos = repos.concat(await repoList(`/orgs/${org}`)); }
    catch (e) { /* skip */ }
  }
  const seen = new Set();
  repos = repos.filter((r) => {
    if (r.fork || seen.has(r.full_name)) return false;
    seen.add(r.full_name);
    return r.pushed_at && Date.parse(r.pushed_at) >= sinceMs;
  });

  // 使用言語（各リポジトリの言語別バイト数を合算）
  const langBytes = {};
  const results = await Promise.all(
    repos.slice(0, 30).map((r) => ghJson(`/repos/${r.full_name}/languages`).catch(() => ({}))),
  );
  results.forEach((obj) => {
    for (const [lang, bytes] of Object.entries(obj || {})) {
      langBytes[lang] = (langBytes[lang] || 0) + bytes;
    }
  });
  const langs = Object.entries(langBytes).sort((a, b) => b[1] - a[1]);

  // 活動件数（検索API・1つ失敗しても0で続行）
  const safe = (p) => p.catch(() => 0);
  const [commits, prs, issues, reviews, involved] = await Promise.all([
    safe(searchCount('commits', `author:${user} author-date:>=${since}`)),
    safe(searchCount('issues', `type:pr author:${user} created:>=${since}`)),
    safe(searchCount('issues', `type:issue author:${user} created:>=${since}`)),
    safe(searchCount('issues', `type:pr reviewed-by:${user} created:>=${since}`)),
    safe(searchCount('issues', `type:pr involves:${user} created:>=${since}`)),
  ]);

  // contribution（草）データ（jogruber の公開API）
  let contrib = null;
  try {
    const res = await fetch(
      `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(user)}?y=last`);
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d.contributions)) {
        contrib = { days: d.contributions, total: (d.total && d.total.lastYear) || 0 };
      }
    }
  } catch (e) { /* 草グラフなしで続行 */ }

  // 季節（日付）と天気（オーナーの地域）— 立体棒グラフの装飾に使う
  const season = currentSeason();
  const weather = await fetchWeather(info.location);

  // github-stats.js の render() が期待する形に揃える（HTML側のフォールバック用）
  return {
    name: info.name || user,
    login: info.login || user,
    avatar: info.avatar_url || '',
    htmlUrl: info.html_url || `https://github.com/${user}`,
    metrics: { commits, prs, issues, reviews, involved, repos: repos.length },
    langs,
    orgs,
    contrib,
    season,
    weather,
    generatedAt: new Date().toISOString(),
  };
}

// ── チャート用 items の組み立て ──────────────────────────
function activityItems(m) {
  return [
    { label: 'Commit', value: m.commits || 0 },
    { label: 'PullReq', value: m.prs || 0 },
    { label: 'Issue', value: m.issues || 0 },
    { label: 'Involved', value: m.involved || 0 },
    { label: 'Review', value: m.reviews || 0 },
    { label: 'Repo', value: m.repos || 0 },
  ];
}

function languageItems(langs, opt) {
  opt = opt || {};
  const lc = (a) => (a || []).map((s) => String(s).toLowerCase());
  const exclude = lc(opt.exclude);
  const pin = lc(opt.pin);
  const merge = lc(opt.merge);
  const threshold = opt.other != null ? opt.other : 1;

  const usable = langs.filter(([n]) => exclude.indexOf(n.toLowerCase()) < 0);
  const total = usable.reduce((a, [, b]) => a + b, 0) || 1;

  const shown = [];
  let otherBytes = 0;
  usable.forEach(([n, b]) => {
    const key = n.toLowerCase();
    if (pin.indexOf(key) >= 0) { shown.push([n, b]); return; }
    if (merge.indexOf(key) >= 0) { otherBytes += b; return; }
    if ((b / total) * 100 >= threshold) shown.push([n, b]);
    else otherBytes += b;
  });

  const mk = (name, bytes, color) => {
    const pct = (bytes / total) * 100;
    return { label: name, value: bytes, color,
      display: (pct < 0.1 ? '<0.1' : pct.toFixed(1)) + '%' };
  };
  const items = shown.slice(0, 14).map(([n, b]) => mk(n, b, opt.color || GHSCharts.langColor(n)));
  if (otherBytes > 0) items.push(mk('Other', otherBytes, opt.color || '#8b949e'));
  return items;
}

// ── メイン ───────────────────────────────────────────────
async function main() {
  console.log('GitHub からデータを取得中…');
  const data = await fetchData();
  console.log(`  metrics: ${JSON.stringify(data.metrics)}`);
  console.log(`  languages: ${data.langs.length} 言語 / contributions: ${data.contrib ? data.contrib.days.length + '日' : 'なし'}`);

  const outDir = path.join(__dirname, '..', CONFIG.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  let count = 0;
  for (const ch of CONFIG.charts) {
    let svg = '';
    try {
      if (ch.section === 'activity') {
        const fn = GHSCharts[ch.type] || GHSCharts.radar;
        svg = fn(activityItems(data.metrics), { scale: 'log', accent: ch.color || '#7c6af7' });
      } else if (ch.section === 'languages') {
        const fn = GHSCharts[ch.type] || GHSCharts.hbar;
        const items = languageItems(data.langs, ch);
        svg = items.length ? fn(items, { scale: 'linear', accent: ch.color || '#7c6af7' }) : '';
      } else if (ch.section === 'contributions') {
        if (!data.contrib) { console.warn(`  スキップ ${ch.file}: contribution データなし`); continue; }
        svg = GHSCharts.bars3d(data.contrib.days, {
          accent: ch.color || '#39d353', season: data.season, weather: data.weather,
        });
      } else {
        console.warn(`  スキップ ${ch.file}: 未知の section "${ch.section}"`);
        continue;
      }
    } catch (err) {
      console.warn(`  スキップ ${ch.file}: ${err.message}`);
      continue;
    }
    if (!svg) { console.warn(`  スキップ ${ch.file}: 描画結果が空`); continue; }
    fs.writeFileSync(path.join(outDir, ch.file), svg);
    console.log(`  生成: ${CONFIG.outDir}/${ch.file}`);
    count++;
  }

  // HTML 側のフォールバック用にデータ本体も JSON で出力する
  fs.writeFileSync(path.join(outDir, 'data.json'), JSON.stringify(data, null, 2) + '\n');
  console.log(`  生成: ${CONFIG.outDir}/data.json`);

  console.log(`完了: ${count} 件の SVG ＋ data.json を生成しました。`);
}

main().catch((err) => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
