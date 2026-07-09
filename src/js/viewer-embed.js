/*!
 * viewer-embed.js — Item Viewer を外部ページに 1 行で埋め込むためのセルフマウント UI。
 * 依存する McItems / McModel3D は同じバンドル(mc-item-viewer.js)に同梱される。
 * three.js は CDN から自動ロードする。
 *
 * 使い方（どの Web ページでも）:
 *   <script src="https://hrmc.ngs.computer/mc-item-viewer.js"
 *           data-repos="owner/repo, https://github.com/owner2/repo2"></script>
 * または:
 *   <div data-mc-item-viewer data-repos="owner/repo"></div>
 *   <script src="https://hrmc.ngs.computer/mc-item-viewer.js"></script>
 * プログラムから:
 *   McItemViewer.mount(el, { repos: ['owner/repo', ...] });
 */
(function (root) {
  'use strict';
  const McItems = root.McItems;
  if (!McItems) return;

  // ---- three.js を CDN から自動ロード ----
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.min.js';
  let threePromise = null;
  function loadThree() {
    if (root.THREE) return Promise.resolve();
    if (threePromise) return threePromise;
    threePromise = new Promise((res) => {
      const s = document.createElement('script');
      s.src = THREE_URL;
      s.onload = res; s.onerror = res;
      document.head.appendChild(s);
    });
    return threePromise;
  }

  // ---- 自己完結 CSS（.mciv 配下にスコープ、ホストページと干渉しない）----
  const CSS = `
.mciv { --bg2:#111115; --surface:#1a1a22; --border:rgba(255,255,255,0.09); --accent:#7c6af7;
  --accent2:#3ecfcf; --text:#e8e8f0; --muted:#888896;
  --font:ui-monospace,Menlo,Consolas,"Noto Sans JP",monospace;
  color:var(--text); font-family:var(--font); font-size:14px; line-height:1.5; }
.mciv * { box-sizing:border-box; }
.mciv-toolbar { display:flex; align-items:center; gap:.8rem; margin:0 0 1.2rem; flex-wrap:wrap; }
.mciv-filter { flex:1 1 auto; max-width:280px; padding:.55rem .8rem; background:var(--bg2);
  border:1px solid var(--border); border-radius:6px; color:var(--text); font-family:var(--font); font-size:.85rem; }
.mciv-total { font-size:.78rem; color:var(--muted); }
.mciv-exsummary { cursor:pointer; font-size:.76rem; color:var(--muted); margin-bottom:.4rem; }
.mciv-exclude { width:100%; margin-bottom:1.2rem; padding:.55rem .75rem; background:var(--bg2);
  border:1px solid var(--border); border-radius:6px; color:var(--text); font-family:var(--font);
  font-size:.8rem; resize:vertical; min-height:2.4rem; }
.mciv-section { margin:0 0 2.5rem; }
.mciv-head { display:flex; align-items:baseline; gap:.7rem; padding-bottom:.7rem; margin-bottom:1rem;
  border-bottom:1px solid var(--border); }
.mciv-name { font-size:.95rem; font-weight:700; }
.mciv-name a { color:var(--accent2); text-decoration:none; }
.mciv-count { font-size:.78rem; color:var(--muted); }
.mciv-status { font-size:.82rem; color:var(--muted); margin-bottom:1rem; }
.mciv-status.err { color:#ff6b6b; }
.mciv-tabs { display:flex; flex-wrap:wrap; gap:.4rem; margin-bottom:1.1rem; }
.mciv-tabs:empty { display:none; }
.mciv-chip { padding:.35rem .7rem; background:transparent; border:1px solid var(--border);
  border-radius:999px; color:var(--muted); font-family:var(--font); font-size:.78rem; cursor:pointer; }
.mciv-chip:hover { border-color:var(--accent); color:var(--text); }
.mciv-chip.on { background:var(--accent); border-color:var(--accent); color:#fff; }
.mciv-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:.7rem; }
.mciv-card { background:var(--bg2); border:1px solid var(--border); border-radius:6px;
  padding:.9rem .7rem; text-align:center; }
.mciv-card:hover { border-color:var(--accent); }
.mciv-iw { position:relative; width:64px; height:64px; margin:0 auto .6rem; }
.mciv-icon { width:100%; height:100%; image-rendering:pixelated; object-fit:contain; display:block; }
.mciv-canvas { image-rendering:auto; }
.mciv-3d { position:absolute; top:-4px; right:-6px; padding:0 3px; font-size:.55rem; line-height:1.4;
  color:var(--muted); border:1px solid var(--border); border-radius:3px; background:var(--surface); }
.mciv-nm { font-size:.82rem; font-weight:700; line-height:1.3; word-break:break-word; }
.mciv-ref { margin-top:.3rem; font-size:.66rem; color:var(--muted); word-break:break-all; }
.mciv-en { margin-top:.2rem; font-size:.66rem; color:var(--muted); }
.mciv-empty { color:var(--muted); font-size:.86rem; margin:1.5rem 0; }
.mciv-spin { display:inline-block; width:.85em; height:.85em; margin-right:.4em; border:2px solid var(--border);
  border-top-color:var(--accent); border-radius:50%; animation:mciv-spin .7s linear infinite; vertical-align:-.1em; }
@keyframes mciv-spin { to { transform:rotate(360deg); } }`;

  let cssDone = false;
  function injectCSS() {
    if (cssDone) return; cssDone = true;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // 3D 描画を遅延実行する共有 Observer
  const observer = 'IntersectionObserver' in window
    ? new IntersectionObserver((ents, obs) => {
        for (const e of ents) {
          if (!e.isIntersecting) continue;
          const cv = e.target; obs.unobserve(cv);
          root.McModel3D.render(cv, cv._r3d).then((ok) => {
            if (!ok && cv._fallback) cv.replaceWith(cv._fallback);
          });
        }
      }, { rootMargin: '200px' })
    : null;

  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };

  // URL / owner/repo のリストを spec 配列へ
  function parseSpecs(str) {
    if (Array.isArray(str)) str = str.join(',');
    return String(str || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
      .map((s) => (typeof s === 'string' ? { url: s } : s));
  }

  // ---- 1 つのビューアを rootEl 内に構築 ----
  function createViewer(rootEl, specs) {
    rootEl.classList.add('mciv');
    rootEl.innerHTML = '';
    const has3D = () => root.McModel3D && root.McModel3D.available;

    const toolbar = el('div', 'mciv-toolbar');
    const filter = el('input', 'mciv-filter'); filter.type = 'search'; filter.placeholder = '絞り込み';
    const total = el('span', 'mciv-total');
    toolbar.append(filter, total);

    const exWrap = el('details', 'mciv-ex');
    const exSum = el('summary', 'mciv-exsummary'); exSum.textContent = '非表示にするアイテム（id / キーワード）';
    const exArea = el('textarea', 'mciv-exclude'); exArea.rows = 2;
    exArea.placeholder = 'id やキーワードを改行・カンマ区切りで。部分一致で非表示。例: blueprint, bone';
    exWrap.append(exSum, exArea);

    const sections = el('div', 'mciv-sections');
    rootEl.append(toolbar, exWrap, sections);

    let excludeTerms = [];
    const EX_KEY = 'mc-items:exclude';
    try { const s = localStorage.getItem(EX_KEY); if (s) exArea.value = s; } catch (_) {}
    const parseEx = () => { excludeTerms = exArea.value.split(/[\n,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean); };
    parseEx();
    exArea.addEventListener('input', () => {
      parseEx();
      try { localStorage.setItem(EX_KEY, exArea.value); } catch (_) {}
      applyFilter();
    });
    filter.addEventListener('input', applyFilter);

    function spriteIcon(url, w, frames) {
      const cv = el('canvas', 'mciv-icon'); cv.width = cv.height = 64;
      const im = new Image();
      im.onload = () => {
        const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
        let f = 0;
        const draw = () => { ctx.clearRect(0, 0, 64, 64); ctx.drawImage(im, 0, f * w, w, w, 0, 0, 64, 64); };
        draw();
        const t = setInterval(() => { if (!cv.isConnected) return clearInterval(t); f = (f + 1) % frames; draw(); }, 120);
      };
      im.src = url;
      return cv;
    }
    function flatIcon(it) {
      const img = el('img', 'mciv-icon'); img.loading = 'lazy'; img.alt = it.name;
      img.onerror = () => { img.style.visibility = 'hidden'; };
      const check = () => { const w = img.naturalWidth, h = img.naturalHeight;
        if (w > 0 && h > w && h % w === 0) img.replaceWith(spriteIcon(it.texture, w, h / w)); };
      img.addEventListener('load', check);
      if (it.texture) img.src = it.texture;
      if (img.complete && img.naturalWidth) check();
      return img;
    }
    function itemCard(it) {
      const card = el('div', 'mciv-card'); card.title = it.ref;
      card.dataset.search = `${it.name} ${it.ref} ${it.nameEn}`.toLowerCase();
      card.dataset.tab = it.tab || '';
      const iw = el('div', 'mciv-iw');
      if (it.render3d && has3D() && observer) {
        const cv = el('canvas', 'mciv-icon mciv-canvas');
        cv._r3d = it.render3d; cv._fallback = flatIcon(it);
        iw.append(cv); observer.observe(cv);
      } else iw.append(flatIcon(it));
      if (it.is3d) { const b = el('span', 'mciv-3d'); b.textContent = '3D'; iw.append(b); }
      const nm = el('div', 'mciv-nm'); nm.textContent = it.name;
      const rf = el('div', 'mciv-ref'); rf.textContent = it.ref;
      card.append(iw, nm, rf);
      if (it.nameEn && it.nameEn !== it.name) { const en = el('div', 'mciv-en'); en.textContent = it.nameEn; card.append(en); }
      return card;
    }
    function buildChips(section, bar, items) {
      const seen = new Map(); let none = false;
      for (const it of items) { if (it.tab) { if (!seen.has(it.tab)) seen.set(it.tab, it.tabTitle || it.tab); } else none = true; }
      if (!seen.size) return;
      bar.innerHTML = ''; section._tab = '';
      const mk = (id, label) => { const b = el('button', 'mciv-chip' + (id === '' ? ' on' : '')); b.textContent = label;
        b.onclick = () => { section._tab = id; bar.querySelectorAll('.mciv-chip').forEach((c) => c.classList.toggle('on', c === b)); applyFilter(); };
        return b; };
      bar.append(mk('', 'すべて'));
      for (const [id, t] of seen) bar.append(mk(id, t));
      if (none) bar.append(mk('__none__', 'その他'));
    }
    function applyFilter() {
      const q = filter.value.trim().toLowerCase();
      let shown = 0, tot = 0;
      sections.querySelectorAll('.mciv-section').forEach((sec) => {
        const at = sec._tab || ''; let ss = 0;
        sec.querySelectorAll('.mciv-card').forEach((card) => {
          tot++;
          const s = card.dataset.search;
          const ex = excludeTerms.some((t) => s.includes(t));
          const tabHit = !at || (at === '__none__' ? !card.dataset.tab : card.dataset.tab === at);
          const hit = !ex && tabHit && (!q || s.includes(q));
          card.style.display = hit ? '' : 'none';
          if (hit) { shown++; ss++; }
        });
        sec.style.display = q && ss === 0 ? 'none' : '';
      });
      total.textContent = shown < tot ? `${shown} / ${tot} 件` : `計 ${tot} 件`;
    }

    function loadRepo(spec) {
      const section = el('section', 'mciv-section');
      const head = el('div', 'mciv-head');
      const name = el('span', 'mciv-name'); const count = el('span', 'mciv-count');
      head.append(name, count);
      const tabsBar = el('div', 'mciv-tabs');
      const status = el('p', 'mciv-status'); status.innerHTML = '<span class="mciv-spin"></span>読み込み中…';
      const grid = el('div', 'mciv-grid');
      section.append(head, tabsBar, status, grid);
      sections.append(section);

      let repo = null; try { repo = McItems.parseRepoUrl(spec.url); } catch (_) {}
      if (repo) { const a = el('a'); a.href = `https://github.com/${repo.owner}/${repo.repo}`; a.target = '_blank';
        a.rel = 'noopener'; a.textContent = spec.title || `${repo.owner}/${repo.repo}`; name.append(a); }
      else name.textContent = spec.title || spec.url;

      McItems.fetchItems(spec.url, {
        token: spec.token, subPath: spec.subPath,
        onProgress: (m) => { status.innerHTML = '<span class="mciv-spin"></span>' + m; },
      }).then((items) => {
        count.textContent = `${items.length} 件`;
        if (!items.length) { status.textContent = 'Item が見つかりませんでした'; return; }
        status.remove();
        const frag = document.createDocumentFragment();
        for (const it of items) frag.append(itemCard(it));
        grid.append(frag);
        buildChips(section, tabsBar, items);
        applyFilter();
      }).catch((e) => { status.className = 'mciv-status err'; status.textContent = e.message || String(e); });
    }

    if (!specs.length) { const p = el('p', 'mciv-empty'); p.textContent = 'data-repos に GitHub の URL を指定してください。'; sections.append(p); return; }
    specs.forEach(loadRepo);
  }

  // repos.json の各要素を { url, title?, subPath? } に正規化
  function normalizeRepos(list) {
    return (Array.isArray(list) ? list : []).map((s) =>
      typeof s === 'string' ? { url: s } : (s && s.url ? s : null)).filter(Boolean);
  }

  function mount(target, opts) {
    injectCSS();
    loadThree();
    const token = opts && opts.token;
    const withTok = (specs) => { if (token) specs.forEach((s) => { s.token = s.token || token; }); return specs; };
    const specs = parseSpecs((opts && opts.repos) || []);
    if (specs.length) { createViewer(target, withTok(specs)); return; }
    // data-repos が無ければ同ディレクトリの repos.json を読む
    fetch('repos.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : { repos: [] }))
      .catch(() => ({ repos: [] }))
      .then((cfg) => createViewer(target, withTok(normalizeRepos(cfg && cfg.repos))));
  }

  // ---- 自動起動 ----
  function boot() {
    injectCSS();
    let mounted = 0;
    document.querySelectorAll('[data-mc-item-viewer]').forEach((elm) => {
      mount(elm, { repos: elm.getAttribute('data-repos'), token: elm.getAttribute('data-token') }); mounted++;
    });
    // script タグ自身に data-repos があれば、その直後にビューアを作る
    const sc = document.currentScript ||
      [].slice.call(document.scripts).reverse().find((s) => /mc-item-viewer|viewer-embed/.test(s.src || ''));
    if (sc && sc.getAttribute('data-repos') && !mounted) {
      const div = el('div'); sc.parentNode.insertBefore(div, sc.nextSibling);
      mount(div, { repos: sc.getAttribute('data-repos'), token: sc.getAttribute('data-token') });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  root.McItemViewer = { mount };
})(typeof self !== 'undefined' ? self : this);
