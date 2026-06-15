const PLATFORM_ICONS = {
  x: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  instagram_main: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  instagram_sub: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  'instagram (main)': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  'instagram (sub)': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  github: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>',
  pixiv: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 2h20v20H2V2zm5.5 4v12h2v-4h2.5c2.76 0 5-1.79 5-4s-2.24-4-5-4H7.5zm2 2H12c1.66 0 3 .9 3 2s-1.34 2-3 2H9.5V8z"/></svg>',
  bluesky: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.785 2.627 3.59 3.513 6.182 3.2-3.832.655-7.128 2.59-2.806 7.553 4.394 4.625 6.16-1.174 8-4.363 1.84 3.19 3.178 8.736 8 4.363 4.322-4.963 1.026-6.898-2.806-7.553 2.592.313 5.397-.573 6.182-3.2C23.622 9.418 24 4.458 24 3.768c0-.69-.139-1.861-.902-2.203-.659-.3-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z"/></svg>',
  buymeacoffee: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.216 6.415l-.132-.666c-.119-.598-.388-1.163-1.001-1.379-.197-.069-.42-.098-.57-.241-.152-.143-.196-.366-.231-.572-.065-.378-.125-.756-.192-1.133-.057-.325-.102-.69-.25-.987-.195-.4-.597-.634-.996-.788a5.723 5.723 0 00-.626-.194c-1-.263-2.05-.36-3.077-.416a25.834 25.834 0 00-3.7.062c-.915.083-1.88.184-2.75.5-.318.116-.646.256-.888.501-.297.302-.393.77-.177 1.146.154.267.415.456.692.58.36.162.737.284 1.123.366 1.075.238 2.189.331 3.287.37 1.218.05 2.437.01 3.65-.118.299-.033.598-.073.896-.119.352-.054.578-.513.474-.834-.124-.383-.457-.531-.834-.473-.466.074-.96.108-1.382.146-1.177.08-2.358.082-3.536.006a22.228 22.228 0 01-1.157-.107c-.086-.01-.18-.025-.258-.036-.243-.036-.484-.08-.724-.13-.111-.027-.111-.185 0-.212h.005c.277-.06.557-.108.838-.147h.002c.131-.009.263-.032.394-.048a25.076 25.076 0 013.426-.12c.674.019 1.347.062 2.014.13l.04.005c.11.01.207.023.337.033.257.02.514.04.77.07.485.058.964.152 1.413.36.416.19.752.5.953.899.108.215.167.455.197.696.038.29.067.584.109.875.013.088.039.18.06.26.133.482.516.564.882.435.367-.13.583-.474.587-.87 0-.006 0-.015.002-.023z"/><path fill-rule="evenodd" d="M7.5 12.5v5.5a2.5 2.5 0 002.5 2.5h4a2.5 2.5 0 002.5-2.5v-5.5h-9z"/></svg>',
};

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(s) {
  if (typeof s !== 'string') return '';
  const t = s.trim().toLowerCase();
  if (/^(javascript|data|vbscript):/.test(t)) return '';
  return s;
}


// ── color フィールドをCSSに変換 ──────────────────────
// 単色:     "#7c6af7"
// グラデーション（stops指定）:
//   { "type":"gradient", "angle":135, "stops":[{"color":"#7c6af7","pos":0},{"color":"#3ecfcf","pos":100}] }
// グラデーション（均等割り）:
//   { "type":"gradient", "angle":90, "colors":["#7c6af7","#3ecfcf","#f87171"] }
// ノイズ:
//   { "type":"noise", "base":"#7c6af7", "colors":["#3ecfcf","#f87171"], "intensity":0.3 }

let _colorStyleSheet = null;
function getColorStyleSheet() {
  if (_colorStyleSheet) return _colorStyleSheet;
  const style = document.createElement('style');
  document.head.appendChild(style);
  _colorStyleSheet = style.sheet;
  return _colorStyleSheet;
}

function makeGradientCss(color) {
  const angle = color.angle ?? 135;
  if (color.stops && color.stops.length) {
    return color.stops.map(s => `${s.color} ${s.pos ?? ''}%`.trim()).join(', ');
  }
  if (color.colors && color.colors.length) {
    const step = 100 / Math.max(color.colors.length - 1, 1);
    return color.colors.map((c, i) => `${c} ${Math.round(i * step)}%`).join(', ');
  }
  return `${color.base ?? '#888'} 0%, ${color.base ?? '#888'} 100%`;
}

function makeNoiseDataUrl(colorDef, w = 120, h = 120) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx    = canvas.getContext('2d');
  ctx.fillStyle = colorDef.base ?? '#888';
  ctx.fillRect(0, 0, w, h);
  const colors    = colorDef.colors?.length ? colorDef.colors : [colorDef.base ?? '#fff'];
  const intensity = colorDef.intensity ?? 0.3;
  for (let i = 0; i < w * h * intensity * 2; i++) {
    const x = Math.floor(Math.random() * w);
    const y = Math.floor(Math.random() * h);
    ctx.globalAlpha = 0.1 + Math.random() * 0.5;
    ctx.fillStyle   = colors[Math.floor(Math.random() * colors.length)];
    ctx.fillRect(x, y, 1 + Math.floor(Math.random() * 2), 1 + Math.floor(Math.random() * 2));
  }
  ctx.globalAlpha = 1;
  return canvas.toDataURL();
}

// color定義から{ baseColor, accentCss }を返す
// baseColor: --link-color / --work-color に設定するベース色（ホバーボーダー・シャドウ用）
// accentCss: カード左端のアクセントバーに使うCSS値（linear-gradient or url(...) or 単色）
function resolveColorDef(color) {
  if (!color) return null;
  if (typeof color === 'string') return { base: color, accent: color, type: 'solid' };

  if (color.type === 'gradient') {
    const gradStops = makeGradientCss(color);
    const angle     = color.angle ?? 135;
    const base      = color.stops?.[0]?.color ?? color.colors?.[0] ?? color.base ?? '#888';
    return {
      base,
      accent : `linear-gradient(${angle}deg, ${gradStops})`,
      type   : 'gradient',
    };
  }

  if (color.type === 'noise') {
    return {
      base   : color.base ?? '#888',
      accent : makeNoiseDataUrl(color),
      type   : 'noise',
      isUrl  : true,
    };
  }

  return { base: color.base ?? '#888', accent: color.base ?? '#888', type: 'solid' };
}

// education の日付テキスト色スタイルを返す
function eduDateStyle(color) {
  if (!color) return '';
  if (typeof color === 'string') return `color:${color}`;
  if (color.type === 'gradient') {
    const gradStops = makeGradientCss(color);
    const angle = color.angle ?? 90;
    return `display:inline-block;background:linear-gradient(${angle}deg,${gradStops});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text`;
  }
  if (color.type === 'noise') return `color:${color.base ?? '#888'}`;
  return '';
}

let _colorIdCounter = 0;
// カード要素にカラー定義を適用する
function applyColor(el, color, varName = '--link-color') {
  const def = resolveColorDef(color);
  if (!def) return;

  el.style.setProperty(varName, def.base);

  if (def.type === 'solid') return;

  const uid = `cc${++_colorIdCounter}`;
  el.classList.add(uid);

  if (def.type === 'noise') {
    // ノイズ: 左端バー（単色）+ カード全体にノイズ背景を薄く重ねる
    const noiseUrl = def.accent;
    // 左端バーは単色で表示
    el.style.borderLeft = `3px solid ${def.base}`;
    el.style.borderRadius = '14px';
    // カード全体にノイズを薄く重ねる（pseudo要素はCSSルール不要）
    const noiseEl = document.createElement('div');
    noiseEl.style.cssText = `position:absolute;inset:0;border-radius:inherit;background:url(${noiseUrl});opacity:0.12;pointer-events:none;mix-blend-mode:screen;`;
    el.appendChild(noiseEl);
    return;
  }

  // グラデーション
  const accentVal = def.accent;
  const sheet = getColorStyleSheet();
  try {
    sheet.insertRule(`.${uid}::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; background:${accentVal}; border-radius:14px 0 0 14px; }`, sheet.cssRules.length);
    sheet.insertRule(`.${uid}:hover::after { content:''; position:absolute; inset:0; border-radius:inherit; background:${accentVal}; opacity:0.07; pointer-events:none; }`, sheet.cssRules.length);
  } catch(e) { console.warn('applyColor gradient rule failed', e); }
}

// ── ダウンロード数を live 取得（ブラウザから直接APIを叩く・Actions 不要） ──
// CurseForge → cfwidget API（Project ID 指定があれば slug 索引待ちを回避）
// Modrinth → 公式API / VS Code Marketplace → extensionquery API
// いずれも CORS 対応なのでブラウザから直接呼べる。
// 結果は localStorage に1時間キャッシュし、失敗時は古い値にフォールバックする。
const DL_CACHE_TTL = 60 * 60 * 1000;

// content.json の stats から作る URL → cfProjectId のマップ
// （DOMContentLoaded 後の content.json fetch 時にセットされる）
const CF_PROJECT_IDS = new Map();

function dlCacheGet(url) {
  try {
    const v = JSON.parse(localStorage.getItem('dl:' + url));
    if (v && typeof v.n === 'number' && typeof v.t === 'number') return v;
  } catch (e) { /* localStorage 無効でも継続 */ }
  return null;
}
function dlCacheSet(url, n) {
  try { localStorage.setItem('dl:' + url, JSON.stringify({ n, t: Date.now() })); }
  catch (e) { /* localStorage 無効でも継続 */ }
}

// 1つのリンクからダウンロード(インストール)数を取得する
async function fetchOneDownload(url) {
  let u;
  try { u = new URL(url); } catch (e) { return null; }
  const host  = u.hostname.replace(/^www\./, '').toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);

  // CurseForge: Project ID があれば最優先で ID 直叩き（cfwidget が slug を索引してなくても確実に取れる）
  if (host === 'curseforge.com') {
    const pid = CF_PROJECT_IDS.get(url);
    if (pid) {
      const res = await fetch(`https://api.cfwidget.com/${pid}`);
      if (res.ok) {
        const d = await res.json();
        if (typeof d?.downloads?.total === 'number') return d.downloads.total;
      }
    }
    if (parts.length >= 3) {
      const res = await fetch(`https://api.cfwidget.com/${parts[0]}/${parts[1]}/${parts[2]}`);
      if (!res.ok) return null;
      const d = await res.json();
      return typeof d?.downloads?.total === 'number' ? d.downloads.total : null;
    }
    return null;
  }
  // Modrinth → 公式API
  if (host === 'modrinth.com' && parts.length >= 2) {
    const res = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(parts[1])}`);
    if (!res.ok) return null;
    const d = await res.json();
    return typeof d.downloads === 'number' ? d.downloads : null;
  }
  // VS Code Marketplace → extensionquery API
  if (host === 'marketplace.visualstudio.com') {
    const id = u.searchParams.get('itemName');
    if (!id) return null;
    const res = await fetch('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json;api-version=3.0-preview.1' },
      body: JSON.stringify({ filters: [{ criteria: [{ filterType: 7, value: id }] }], flags: 256 }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    const ext  = d?.results?.[0]?.extensions?.[0];
    const stat = (ext?.statistics ?? []).find(s => s.statisticName === 'install');
    return stat ? Math.round(stat.value) : null;
  }
  return null; // 未対応プラットフォーム（Planet Minecraft 等）
}

// キャッシュ込みで1リンクのダウンロード数を返す
async function getDownloadCount(url) {
  const cached = dlCacheGet(url);
  if (cached && Date.now() - cached.t < DL_CACHE_TTL) return cached.n;
  try {
    const n = await fetchOneDownload(url);
    if (typeof n === 'number') { dlCacheSet(url, n); return n; }
  } catch (e) { /* 取得失敗 */ }
  return cached ? cached.n : null; // 失敗時は古いキャッシュにフォールバック
}

// Works カードにダウンロード数バッジを表示する
async function showDownloadCount(cardEl, links) {
  const results = await Promise.all(links.map(getDownloadCount));
  const nums = results.filter(n => typeof n === 'number');
  if (!nums.length) return;
  const count = nums.reduce((a, b) => a + b, 0).toLocaleString('en-US');
  const badge = document.createElement('div');
  badge.className = 'work-dl';
  badge.title = `ダウンロード数 合計 ${count}`;
  badge.innerHTML = `<span class="work-dl-label">ダウンロード：</span><span class="work-dl-count">${count}</span>`;
  cardEl.appendChild(badge);
}

fetch('/content.json')
  .then(r => r.json())
  .then(data => {
    const { hero, footer, terminal, links, about, profile, works } = data;

    // ---- Hero ----
    if (hero) {
      setText('hero-tag', hero.tag);
      setText('hero-title', hero.title);
      setText('hero-sub', hero.sub);
    }

    // ---- Links ----
    if (links) {
      setText('links-group-name', links.groupName);
      if (links.notice) setText('links-notice', links.notice);
      const linksEl = document.getElementById('links-row');
      if (linksEl) {
        linksEl.innerHTML = links.items.map((l, i) => `
          <a class="link-card" href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer" data-platform="${escHtml(l.platform)}" data-color-idx="${i}">
            <span class="link-icon">${PLATFORM_ICONS[l.platform] ?? ''}</span>
            <span class="link-info">
              <span class="link-platform">${escHtml(l.label)}</span>
              <span class="link-handle">${escHtml(l.handle)}</span>
            </span>
            <span class="link-arrow">↗</span>
          </a>
        `).join('');
        // カラーを適用（グラデーション・ノイズ対応）
        linksEl.querySelectorAll('.link-card').forEach((el, i) => {
          const l = links.items[i];
          if (l?.color) applyColor(el, l.color, '--link-color');
        });
      }
    }

    // ---- Terminal ----
    if (terminal) {
      setText('term-title', terminal.title);
      setText('term-prompt', terminal.prompt);
    }

    // ---- Footer ----
    if (footer) {
      setText('footer-logo', footer.logo);
      setText('footer-copy', footer.copy);
    }

    // ---- About (index page snippet) ----
    const aboutEl = document.getElementById('about-text');
    if (aboutEl && about) {
      const bios = about.bio.map(t => `<p>${t}</p>`).join('');
      const chips = about.chips.map(c => `<span class="chip">${c}</span>`).join('');
      aboutEl.innerHTML = `
        <p>はじめまして、<strong>${about.name}</strong> です。</p>
        ${bios}
        <div class="tags">${chips}</div>
      `;
    }

    // ---- Profile (about page) ----
    if (profile) {
      setText('profile-label', profile.label);
      setText('profile-name', profile.name);
      setText('profile-handle', profile.handle);

      const bioEl = document.getElementById('profile-bio');
      if (bioEl) bioEl.innerHTML = profile.bio.join('<br>');

      const chipsEl = document.getElementById('profile-chips');
      if (chipsEl) {
        chipsEl.innerHTML = profile.chips.map(c => `<span class="chip">${c}</span>`).join('');
      }

      const infoEl = document.getElementById('profile-info');
      if (infoEl) {
        let infoHtml = '';
        if (profile.birthday) {
          const bd = new Date(profile.birthday);
          const age = Math.floor((new Date() - bd) / (365.25 * 24 * 3600 * 1000));
          const formatted = `${bd.getFullYear()}.${String(bd.getMonth()+1).padStart(2,'0')}.${String(bd.getDate()).padStart(2,'0')}`;
          infoHtml += `<p class="info-birthday">生年月日 <strong>${formatted}</strong>（${age}歳）</p>`;
        }
        if (profile.education?.length) {
          const items = profile.education.map(e => {
            const dateStyle = eduDateStyle(e.color);
            const nyuLabel = e.key === 'kindergarten' ? '入園' : '入学';
            return `<div class="edu-item"><span class="edu-date" style="${dateStyle}">${e.entered}</span><span class="edu-label">${escHtml(e.label)} ${nyuLabel}</span></div>`;
          }).join('');
          infoHtml += `<div class="edu-timeline">${items}</div>`;
        }
        infoEl.innerHTML = infoHtml;
      }

      setText('code-file-name', profile.codeFile ?? 'hrmcngs.js');

      const codeEl = document.getElementById('code-block');
      if (codeEl) {
        // educationからcodeBlockを動的生成
        const now = new Date();
        // 各学校の在学期間（年）
        const durations = {
          kindergarten         : 3,
          elementarySchool     : 6,
          juniorHighSchool     : 3,
        };
        let block = '// @hrmcngs\n\nconst hrmcngs = {\n';
        if (profile.name)   block += `  name:   "${profile.name}",\n`;
        if (profile.handle) block += `  handle: "${profile.handle.split('·')[0].trim()}",\n`;
        if (profile.birthday) {
          const age = Math.floor((new Date() - new Date(profile.birthday)) / (365.25 * 24 * 3600 * 1000));
          block += `  age:    ${age},\n`;
        }
        block += `  making: ["Minecraft1.20.1mod", "Web"],\n`;
        block += `  note:   "絡んでくる時はラフな感じでいいですよ",\n`;
        block += '};\n\n// log\n\nconst log = {\n';
        if (profile.birthday) {
          const bd = profile.birthday.replace('-','').replace('-','').slice(0,8);
          block += `  birth:  ${bd},\n`;
        }
        if (profile.education?.length) {
          // 最大キー長でパディング
          const maxLen = Math.max(...profile.education.map(e => e.key.length));
          profile.education.forEach(e => {
            const ym = e.entered.replace('-','');
            const enteredDate = new Date(
              parseInt(e.entered.slice(0,4)),
              parseInt(e.entered.slice(5,7)) - 1
            );
            const dur = durations[e.key];
            const graduatedDate = dur
              ? new Date(enteredDate.getFullYear() + dur, enteredDate.getMonth())
              : null;
            const isGraduated = graduatedDate ? now >= graduatedDate : false;
            const label = isGraduated ? 'entered' : 'enter';
            const pad = ' '.repeat(maxLen - e.key.length + 2);
            block += `  ${e.key}:${pad}${ym}, // ${label}\n`;
          });
        }
        block += '};';

        codeEl.textContent = block;
        if (typeof hljs !== 'undefined') hljs.highlightElement(codeEl);
      }
    }

    // ---- Works ----
    const worksEl = document.getElementById('works-grid');
    if (worksEl && works) {
      worksEl.innerHTML = works.map(w => {
        const icon = w.icon.startsWith('http')
          ? `<img src="${safeUrl(w.icon)}" alt="${escHtml(w.title)}" style="width:100%;height:100%;object-fit:contain;">`
          : w.icon;
        const tags = (w.tags ?? []).map(t => `<span class="work-tag">${escHtml(t)}</span>`).join('');
        return `
          <a class="work-card" href="${safeUrl(w.url)}" target="_blank" rel="noopener noreferrer">
            <div class="work-icon">${icon}</div>
            <h3>${escHtml(w.title)}</h3>
            <p>${escHtml(w.desc)}</p>
            ${tags ? `<div class="work-tags">${tags}</div>` : ''}
          </a>
        `;
      }).join('');
      // カラーを適用（グラデーション・ノイズ対応）
      worksEl.querySelectorAll('.work-card').forEach((el, i) => {
        const w = works[i];
        if (w?.color) applyColor(el, w.color, '--work-color');
      });

      // content.json の stats 設定をもとに、各 Works カードへ live でダウンロード数を表示
      if (Array.isArray(data.stats)) {
        const statByTitle = {};
        data.stats.forEach(p => {
          statByTitle[String(p.title).toLowerCase()] = p;
          // cfProjectId 指定があれば URL → ID のマップを構築（cfwidget 索引待ちを回避）
          if (p.cfProjectId && Array.isArray(p.links)) {
            p.links.forEach(url => {
              if (/curseforge\.com/.test(url)) CF_PROJECT_IDS.set(url, p.cfProjectId);
            });
          }
        });
        worksEl.querySelectorAll('.work-card').forEach((el, i) => {
          const conf = statByTitle[String(works[i]?.title ?? '').toLowerCase()];
          if (conf && Array.isArray(conf.links) && conf.links.length) {
            showDownloadCount(el, conf.links);
          }
        });
      }

      // github-stats-charts カードに「Use template / bootstrap.sh 利用回数」を表示
      fetch('/charts/usage.json', { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .then(usage => {
          if (!usage || typeof usage.total !== 'number') return;
          worksEl.querySelectorAll('.work-card').forEach((el, i) => {
            const title = String(works[i]?.title ?? '').toLowerCase();
            if (title !== 'github-stats-charts') return;
            const badge = document.createElement('div');
            badge.className = 'work-dl';
            const tmpl = usage.template || 0;
            const boot = usage.bootstrap || 0;
            badge.title = `Use this template: ${tmpl} / bootstrap.sh: ${boot}`;
            badge.innerHTML =
              `<span class="work-dl-label">使用：</span>` +
              `<span class="work-dl-count">${usage.total.toLocaleString('en-US')}</span>`;
            el.appendChild(badge);
          });
        })
        .catch(() => { /* usage.json 未生成でも無視 */ });
    }

  })
  .catch(err => console.error('content.json の読み込みに失敗:', err));
