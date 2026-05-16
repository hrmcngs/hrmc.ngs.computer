'use strict';

/**
 * fetch-stats.js
 * --------------------------------------------------------------------------
 * content.json の "stats" に書かれた各プロジェクトのリンクから、
 * ダウンロード(インストール)数を集計し、リポジトリ直下の stats.json を生成する。
 *
 * ◆ リンクを貼るだけで自動判別 ◆
 *   - CurseForge          (curseforge.com)
 *   - Modrinth            (modrinth.com)
 *   - VS Code Marketplace (marketplace.visualstudio.com)
 *   - GitHub Releases     (github.com) … リリース添付ファイルのDL数合計
 *
 * Planet Minecraft は Cloudflare により自動取得できないため自動でスキップする。
 *
 * 集計対象を増やすには content.json の "stats" にプロジェクトを足し、
 * "links" にURLを貼るだけでよい（このファイルの編集は不要）。
 *
 * GitHub Actions (.github/workflows/update-stats.yml) から定期実行。
 * ローカル実行 : node scripts/fetch-stats.js
 * 必要環境     : Node.js 20 以降（グローバル fetch を使用）
 * --------------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONTENT_PATH = path.join(ROOT, 'content.json');
const OUT_PATH = path.join(ROOT, 'stats.json');

const UA = 'hrmc.ngs.computer stats bot (+https://hrmc.ngs.computer)';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// CurseForge / Modrinth のプロジェクト種別 → 表示ラベル
const CF_TYPE_LABELS = {
  'mc-mods': 'Mod', 'data-packs': 'Data Pack', 'modpacks': 'Modpack',
  'texture-packs': 'Resource Pack', 'shaders': 'Shader', 'worlds': 'World',
  'customization': 'Customization', 'bukkit-plugins': 'Plugin', 'addons': 'Addon',
};
const MODRINTH_TYPE_LABELS = {
  mod: 'Mod', datapack: 'Data Pack', plugin: 'Plugin',
  resourcepack: 'Resource Pack', modpack: 'Modpack', shader: 'Shader',
};

// ---- URL から取得元プラットフォームを判別 -------------------------------
function detectSource(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);

  // CurseForge: /minecraft/mc-mods/<slug> など
  if (host === 'curseforge.com' && parts.length >= 3) {
    const type = parts[1];
    return {
      platform: 'curseforge',
      cfPath: `${parts[0]}/${type}/${parts[2]}`,
      label: `CurseForge (${CF_TYPE_LABELS[type] || type})`,
      url: rawUrl,
    };
  }
  // Modrinth: /mod/<slug> など
  if (host === 'modrinth.com' && parts.length >= 2) {
    return {
      platform: 'modrinth',
      slug: parts[1],
      label: `Modrinth (${MODRINTH_TYPE_LABELS[parts[0]] || parts[0]})`,
      url: rawUrl,
    };
  }
  // VS Code Marketplace: /items?itemName=<publisher>.<ext>
  if (host === 'marketplace.visualstudio.com') {
    const id = u.searchParams.get('itemName');
    if (id) return { platform: 'vscode', extensionId: id, label: 'VS Code Marketplace', url: rawUrl };
  }
  // GitHub: /<owner>/<repo>
  if (host === 'github.com' && parts.length >= 2) {
    return {
      platform: 'github',
      owner: parts[0],
      repo: parts[1].replace(/\.git$/, ''),
      label: 'GitHub Releases',
      url: rawUrl,
    };
  }
  // Planet Minecraft: Cloudflare 保護で自動取得不可
  if (host === 'planetminecraft.com') {
    return { platform: 'unsupported', label: 'Planet Minecraft', url: rawUrl,
             reason: 'Cloudflare により自動取得不可' };
  }
  return null;
}

// ---- 各プラットフォームの取得関数 ---------------------------------------
async function fetchCurseForge(src) {
  const url = `https://api.cfwidget.com/${src.cfPath}`;
  // 未キャッシュのプロジェクトは 202（キュー投入中）を返すので数回リトライ
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status === 202) { await sleep(10000); continue; }
    if (!res.ok) throw new Error(`cfwidget HTTP ${res.status}`);
    const data = await res.json();
    const total = data && data.downloads && data.downloads.total;
    if (typeof total !== 'number') throw new Error('downloads.total が見つかりません');
    return total;
  }
  throw new Error('cfwidget が 202 を返し続けました');
}

async function fetchModrinth(src) {
  const res = await fetch(
    `https://api.modrinth.com/v2/project/${encodeURIComponent(src.slug)}`,
    { headers: { 'User-Agent': UA } },
  );
  if (!res.ok) throw new Error(`Modrinth HTTP ${res.status}`);
  const data = await res.json();
  if (typeof data.downloads !== 'number') throw new Error('downloads が見つかりません');
  return data.downloads;
}

async function fetchVscode(src) {
  const res = await fetch(
    'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json;api-version=3.0-preview.1',
        'User-Agent': UA,
      },
      body: JSON.stringify({
        filters: [{ criteria: [{ filterType: 7, value: src.extensionId }] }],
        flags: 256, // IncludeStatistics
      }),
    },
  );
  if (!res.ok) throw new Error(`Marketplace HTTP ${res.status}`);
  const data = await res.json();
  const ext = data?.results?.[0]?.extensions?.[0];
  if (!ext) throw new Error('拡張機能が見つかりません');
  const stat = (ext.statistics || []).find((s) => s.statisticName === 'install');
  if (!stat) throw new Error('install 統計が見つかりません');
  return Math.round(Number(stat.value));
}

async function fetchGithub(src) {
  const headers = { 'User-Agent': UA, 'Accept': 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  let total = 0;
  // 全リリースの添付ファイルの download_count を合算する
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${src.owner}/${src.repo}/releases?per_page=100&page=${page}`,
      { headers },
    );
    if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
    const releases = await res.json();
    if (!Array.isArray(releases) || releases.length === 0) break;
    for (const rel of releases) {
      for (const asset of rel.assets || []) total += asset.download_count || 0;
    }
    if (releases.length < 100) break;
  }
  return total; // リリースが無い場合は 0
}

function fetchSource(src) {
  switch (src.platform) {
    case 'curseforge': return fetchCurseForge(src);
    case 'modrinth':   return fetchModrinth(src);
    case 'vscode':     return fetchVscode(src);
    case 'github':     return fetchGithub(src);
    default: return Promise.reject(new Error(`未対応のプラットフォーム: ${src.platform}`));
  }
}

// ---- ユーティリティ -----------------------------------------------------
function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function findPrevSource(prev, projectTitle, label) {
  const proj = prev?.projects?.find((p) => p.title === projectTitle);
  return proj?.sources?.find((s) => s.label === label) || null;
}

// generatedAt を無視して数値だけを比較する（無駄なコミットを防ぐため）
function numbersEqual(a, b) {
  if (!a || !b || a.total !== b.total) return false;
  if (!Array.isArray(a.projects) || !Array.isArray(b.projects)) return false;
  if (a.projects.length !== b.projects.length) return false;
  return a.projects.every((pa, i) => {
    const pb = b.projects[i];
    if (!pb || pa.total !== pb.total || pa.sources.length !== pb.sources.length) return false;
    return pa.sources.every((sa, j) => sa.downloads === pb.sources[j].downloads);
  });
}

// ---- メイン -------------------------------------------------------------
async function main() {
  const content = readJsonSafe(CONTENT_PATH);
  const config = content && Array.isArray(content.stats) ? content.stats : null;
  if (!config) {
    console.error('content.json に "stats" 配列がありません。集計対象が未設定です。');
    process.exit(1);
  }

  const prev = readJsonSafe(OUT_PATH);
  const projects = [];
  let grandTotal = 0;

  for (const proj of config) {
    const links = Array.isArray(proj.links) ? proj.links : [];
    const sources = [];
    let projectTotal = 0;

    for (const link of links) {
      const src = detectSource(link);
      if (!src) {
        console.warn(`  SKIP ${proj.title}: 判別できないURL → ${link}`);
        continue;
      }
      if (src.platform === 'unsupported') {
        console.warn(`  SKIP ${proj.title} / ${src.label}: ${src.reason}`);
        continue;
      }

      let downloads = null;
      let live = false;
      let note = '';
      try {
        downloads = await fetchSource(src);
        live = true;
        console.log(`  OK   ${proj.title} / ${src.label}: ${downloads}`);
      } catch (err) {
        console.warn(`  FAIL ${proj.title} / ${src.label}: ${err.message}`);
        // 一時的な失敗に備え、前回取得値があればそれを使う
        const prevSrc = findPrevSource(prev, proj.title, src.label);
        if (prevSrc && typeof prevSrc.downloads === 'number') {
          downloads = prevSrc.downloads;
          note = '前回取得値';
        } else {
          note = '取得失敗';
        }
      }

      if (typeof downloads === 'number') projectTotal += downloads;
      sources.push({
        platform: src.label.split(' (')[0],
        label: src.label,
        url: src.url,
        downloads: typeof downloads === 'number' ? downloads : null,
        live,
        note,
      });
    }

    grandTotal += projectTotal;
    projects.push({
      title: proj.title,
      color: proj.color || '#7c6af7',
      total: projectTotal,
      sources,
    });
  }

  const result = { generatedAt: new Date().toISOString(), total: grandTotal, projects };

  // 数値に変化がなければファイルを据え置く（generatedAt だけの差分コミットを防ぐ）
  if (prev && numbersEqual(prev, result)) {
    console.log('数値に変化なし — stats.json は据え置きました。');
    return;
  }
  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2) + '\n');
  console.log(`stats.json を更新しました（合計 ${grandTotal} DL）`);
}

main().catch((err) => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
