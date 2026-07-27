'use strict';

/**
 * gen-downloads.js — content.json の stats 配列から CurseForge / Modrinth / VS Code
 * のダウンロード数を集計し charts/downloads.json として書き出す。
 *
 * CurseForge URL の game/category/slug からダウンロード数を取得する。
 *
 * GitHub Actions (.github/workflows/update-charts.yml) から定期実行される想定。
 * Node 20+ のグローバル fetch を使用。
 */

const fs = require('fs');
const path = require('path');

const CONTENT_PATH = path.join(__dirname, '..', 'content.json');
const OUT_PATH     = path.join(__dirname, '..', 'charts', 'downloads.json');
const UA = 'Mozilla/5.0 (compatible; hrmc-stats-bot/1.0; +https://hrmc.ngs.computer)';
const CURSEFORGE_API_KEY = process.env.CURSEFORGE_API_KEY || '';

// ── CurseForge公式API（ページと同じ最新値・slug検索） ─────────
async function curseforgeOfficial(slug) {
  if (!CURSEFORGE_API_KEY) return null;
  const endpoint = `https://api.curseforge.com/v1/mods/search?gameId=432&slug=${encodeURIComponent(slug)}&pageSize=1`;
  const r = await fetch(endpoint, {
    headers: {
      'Accept': 'application/json',
      'x-api-key': CURSEFORGE_API_KEY,
    },
  });
  if (!r.ok) return null;
  const d = await r.json();
  const project = d?.data?.[0];
  return typeof project?.downloadCount === 'number'
    ? { count: project.downloadCount, projectId: project.id }
    : null;
}

// ── CurseForge cfwidget API（指標がある mod 用） ──────────────
async function cfwidget(game, category, slug) {
  const endpoint = `https://api.cfwidget.com/${encodeURIComponent(game)}/${encodeURIComponent(category)}/${encodeURIComponent(slug)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(endpoint);
    if (r.ok) {
      const d = await r.json();
      return typeof d?.downloads?.total === 'number' ? d.downloads.total : null;
    }
    if (r.status !== 202) return null;
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  return null;
}

// ── CurseForge HTML を直接パース（cfwidget 未索引の新規 mod 用） ──
async function curseforgeHtml(game, category, slug) {
  const r = await fetch(`https://www.curseforge.com/${game}/${category}/${slug}`, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html' },
    redirect: 'follow',
  });
  if (!r.ok) return null;
  const html = await r.text();

  // CurseForge は Next.js なので __NEXT_DATA__ にプロジェクト情報がある
  let m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (m) {
    try {
      const data = JSON.parse(m[1]);
      const candidates = [
        data?.props?.pageProps?.project?.downloads,
        data?.props?.pageProps?.project?.downloadCount,
        data?.props?.pageProps?.mod?.downloads,
        data?.props?.pageProps?.mod?.downloadCount,
      ];
      for (const c of candidates) {
        if (typeof c === 'number') return c;
        if (c && typeof c === 'object' && typeof c.total === 'number') return c.total;
      }
    } catch (_) { /* fallthrough */ }
  }
  // フォールバック: JSON 文字列中の "downloads":N を拾う
  m = html.match(/"(?:downloads|downloadCount)"\s*:\s*(\d{2,})/);
  if (m) return parseInt(m[1], 10);
  // フォールバック: og:description にダウンロード数が入る場合
  m = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/);
  if (m && /(\d[\d,]*)\s*Downloads/i.test(m[1])) {
    return parseInt(RegExp.$1.replace(/,/g, ''), 10);
  }
  return null;
}

// ── Modrinth ──────────────────────────────────────────────────
async function modrinth(slug) {
  const r = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}`, {
    headers: { 'User-Agent': UA },
  });
  if (!r.ok) return null;
  const d = await r.json();
  return typeof d.downloads === 'number' ? d.downloads : null;
}

// ── VS Code Marketplace ───────────────────────────────────────
async function vscode(id) {
  const r = await fetch('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/json',
      'Accept': 'application/json;api-version=3.0-preview.1',
    },
    body: JSON.stringify({ filters: [{ criteria: [{ filterType: 7, value: id }] }], flags: 256 }),
  });
  if (!r.ok) return null;
  const d = await r.json();
  const ext  = d?.results?.[0]?.extensions?.[0];
  const stat = (ext?.statistics ?? []).find(s => s.statisticName === 'install');
  return stat ? Math.round(stat.value) : null;
}

// ── URL から数を取得（複数戦略） ──────────────────────────────
async function fetchCount(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const host  = u.hostname.replace(/^www\./, '').toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);

  // CurseForge: /<game>/<category>/<slug>  例) minecraft/mc-mods/foo, minecraft/data-packs/bar
  if (host === 'curseforge.com' && parts.length >= 3) {
    const [game, category, slug] = parts;
    let n = null, source = null, projectId = null;
    // ① 公式APIをslug検索（Project IDの手書き不要）
    try {
      const official = await curseforgeOfficial(slug);
      if (official) {
        n = official.count;
        projectId = official.projectId;
        source = 'curseforge-api';
      }
    } catch (_) {}
    // ② CurseForge本体のページ
    if (n == null) {
      try { n = await curseforgeHtml(game, category, slug); if (n != null) source = 'curseforge-html'; } catch (_) {}
    }
    // ③ ページ取得が拒否された場合だけcfwidgetへフォールバック
    if (n == null) {
      try { n = await cfwidget(game, category, slug); if (n != null) source = 'cfwidget'; } catch (_) {}
    }
    return n != null ? { count: n, source, ...(projectId ? { projectId } : {}) } : null;
  }
  if (host === 'modrinth.com' && parts[1]) {
    try { const n = await modrinth(parts[1]); if (n != null) return { count: n, source: 'modrinth' }; } catch (_) {}
  }
  if (host === 'marketplace.visualstudio.com') {
    const id = u.searchParams.get('itemName');
    if (id) {
      try { const n = await vscode(id); if (n != null) return { count: n, source: 'vscode-marketplace' }; } catch (_) {}
    }
  }
  return null;
}

(async () => {
  const content = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
  const stats = Array.isArray(content.stats) ? content.stats : [];
  let previousEntries = {};
  try {
    previousEntries = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'))?.entries ?? {};
  } catch (_) {}
  const out = { generated: new Date().toISOString(), entries: {} };

  for (const s of stats) {
    const title = s.title || '(no title)';
    for (const url of s.links || []) {
      process.stdout.write(`→ ${title}: ${url} … `);
      let r = null;
      try { r = await fetchCount(url); } catch (e) { console.log('err:', e.message); continue; }
      if (r) {
        const previousCount = previousEntries[url]?.count;
        if (typeof previousCount === 'number' && previousCount > r.count) {
          r = { count: previousCount, source: 'cached-newer' };
        }
        out.entries[url] = r;
        console.log(`${r.count.toLocaleString('en-US')}  (${r.source})`);
      } else if (previousEntries[url] && typeof previousEntries[url].count === 'number') {
        out.entries[url] = { ...previousEntries[url], source: 'cached-fallback' };
        console.log(`${previousEntries[url].count.toLocaleString('en-US')}  (cached fallback)`);
      } else {
        console.log('not found');
      }
    }
  }

  // 数値が変わっていない場合は generated も維持し、不要な定期コミットを防ぐ
  let previous = null;
  try { previous = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')); } catch (_) {}
  if (previous && JSON.stringify(previous.entries) === JSON.stringify(out.entries)) {
    out.generated = previous.generated;
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(`\n✓ wrote ${path.relative(process.cwd(), OUT_PATH)} (${Object.keys(out.entries).length} entries)`);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
