/* items ページのコントローラ。
 * items/repos.json に書かれた URL を読み、リポジトリごとに Item を表示する。
 * 取得は McItems (src/js/mc-items.js) に任せる（＝内部 API）。 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const sectionsEl = $('sections');
  const toolbar = $('toolbar');
  const filterEl = $('filter');
  const totalEl = $('total');
  const form = $('items-form');
  const urlInput = $('repo-url');
  const tokenInput = $('gh-token');
  const loadBtn = $('load-btn');
  const excludeEl = $('exclude-list');

  const TOKEN_KEY = 'mc-items:token';
  const EXCLUDE_KEY = 'mc-items:exclude';
  // 手動入力欄（token / URL）は任意。HTML から外されていても動くよう null 安全にする。
  const token = () => (tokenInput && tokenInput.value ? tokenInput.value.trim() : '') || undefined;

  if (tokenInput) {
    try {
      const t = localStorage.getItem(TOKEN_KEY);
      if (t) tokenInput.value = t;
    } catch (_) {}
    tokenInput.addEventListener('change', () => {
      try { localStorage.setItem(TOKEN_KEY, tokenInput.value.trim()); } catch (_) {}
    });
  }

 
  let excludeTerms = [];
  function parseExclude() {
    excludeTerms = (excludeEl.value || '')
      .split(/[\n,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  try {
    const ex = localStorage.getItem(EXCLUDE_KEY);
    if (ex) excludeEl.value = ex;
  } catch (_) {}
  parseExclude();
  excludeEl.addEventListener('input', () => {
    parseExclude();
    try { localStorage.setItem(EXCLUDE_KEY, excludeEl.value); } catch (_) {}
    applyFilter();
  });


  function normalizeSpec(spec) {
    if (typeof spec === 'string') return { url: spec };
    if (spec && typeof spec === 'object' && spec.url) return spec;
    return null;
  }


  const has3D = window.McModel3D && window.McModel3D.available;
  const render3dObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries, obs) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const canvas = e.target;
          obs.unobserve(canvas);
          const r3d = canvas._r3d;
          window.McModel3D.render(canvas, r3d).then((ok) => {
            if (!ok && canvas._fallback) { canvas.replaceWith(canvas._fallback); }
          });
        }
      }, { rootMargin: '200px' })
    : null;

  function flatIcon(it) {
    const img = document.createElement('img');
    img.className = 'item-icon';
    img.loading = 'lazy';
    img.alt = it.name;
    img.onerror = () => { img.style.visibility = 'hidden'; };
    const check = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (w > 0 && h > w && h % w === 0) img.replaceWith(spriteIcon(it.texture, w, h / w));
    };
    img.addEventListener('load', check);
    if (it.texture) img.src = it.texture;
    if (img.complete && img.naturalWidth) check();
    return img;
  }

  function spriteIcon(url, w, frames) {
    const cv = document.createElement('canvas');
    cv.className = 'item-icon';
    cv.width = cv.height = 64;
    const im = new Image();
    im.onload = () => {
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      let f = 0;
      const draw = () => {
        ctx.clearRect(0, 0, 64, 64);
        ctx.drawImage(im, 0, f * w, w, w, 0, 0, 64, 64); // f 番目のフレーム矩形
      };
      draw();
      const t = setInterval(() => {
        if (!cv.isConnected) { clearInterval(t); return; }
        f = (f + 1) % frames;
        draw();
      }, 120);
    };
    im.src = url;
    return cv;
  }

  function itemCard(it) {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.title = it.ref;
    card.dataset.search = `${it.name} ${it.ref} ${it.nameEn}`.toLowerCase();
    card.dataset.tab = it.tab || '';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'item-iconwrap';

    if (it.render3d && has3D && render3dObserver) {
      // 3D 描画用 canvas（フォールバックの平面テクスチャも用意）
      const canvas = document.createElement('canvas');
      canvas.className = 'item-icon item-canvas';
      canvas._r3d = it.render3d;
      canvas._fallback = flatIcon(it);
      iconWrap.append(canvas);
      render3dObserver.observe(canvas);
    } else {
      iconWrap.append(flatIcon(it));
    }
    if (it.is3d) {
      const badge = document.createElement('span');
      badge.className = 'item-3d';
      badge.textContent = '3D';
      iconWrap.append(badge);
    }

    const name = document.createElement('div');
    name.className = 'item-name';
    name.textContent = it.name;

    const ref = document.createElement('div');
    ref.className = 'item-ref';
    ref.textContent = it.ref;

    card.append(iconWrap, name, ref);
    if (it.nameEn && it.nameEn !== it.name) {
      const en = document.createElement('div');
      en.className = 'item-en';
      en.textContent = it.nameEn;
      card.append(en);
    }
    return card;
  }

  function loadRepo(spec, prepend) {
    const section = document.createElement('section');
    section.className = 'repo-section';

    const head = document.createElement('div');
    head.className = 'repo-head';
    const nameEl = document.createElement('span');
    nameEl.className = 'repo-name';
    const countEl = document.createElement('span');
    countEl.className = 'repo-count';
    head.append(nameEl, countEl);

    const tabsBar = document.createElement('div');
    tabsBar.className = 'repo-tabs';

    const statusEl = document.createElement('p');
    statusEl.className = 'repo-status';

    const grid = document.createElement('div');
    grid.className = 'repo-grid';

    section.append(head, tabsBar, statusEl, grid);
    if (prepend) sectionsEl.prepend(section);
    else sectionsEl.append(section);

    let repo = null;
    try { repo = McItems.parseRepoUrl(spec.url); } catch (_) {}
    if (repo) {
      const a = document.createElement('a');
      a.href = `https://github.com/${repo.owner}/${repo.repo}`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = spec.title || `${repo.owner}/${repo.repo}`;
      nameEl.append(a);
    } else {
      nameEl.textContent = spec.title || spec.url;
    }

    statusEl.innerHTML = '<span class="spinner"></span>読み込み中…';

    McItems.fetchItems(spec.url, {
      token: token(),
      subPath: spec.subPath,
      onProgress: (m) => { statusEl.innerHTML = '<span class="spinner"></span>' + m; },
    }).then((items) => {
      countEl.textContent = `${items.length} 件`;
      if (!items.length) {
        statusEl.textContent = 'Item が見つかりませんでした（textures/item/*.png を含むリポジトリが対象です）';
        return;
      }
      statusEl.remove();
      const frag = document.createDocumentFragment();
      for (const it of items) frag.append(itemCard(it));
      grid.append(frag);
      buildTabChips(section, tabsBar, items);
      toolbar.hidden = false;
      $('exclude-adv').hidden = false;
      applyFilter();
    }).catch((e) => {
      statusEl.className = 'repo-status error';
      statusEl.textContent = e.message || String(e);
    });
  }

  function buildTabChips(section, bar, items) {
    const seen = new Map(); // tabId -> title
    let hasNone = false;
    for (const it of items) {
      if (it.tab) { if (!seen.has(it.tab)) seen.set(it.tab, it.tabTitle || it.tab); }
      else hasNone = true;
    }
    if (!seen.size) return; 
    bar.innerHTML = '';
    section._activeTab = '';
    const mk = (id, label) => {
      const b = document.createElement('button');
      b.className = 'tab-chip' + (id === '' ? ' active' : '');
      b.textContent = label;
      b.addEventListener('click', () => {
        section._activeTab = id;
        bar.querySelectorAll('.tab-chip').forEach((c) => c.classList.toggle('active', c === b));
        applyFilter();
      });
      return b;
    };
    bar.append(mk('', 'すべて'));
    for (const [id, title] of seen) bar.append(mk(id, title));
    if (hasNone) bar.append(mk('__none__', 'その他'));
  }

  function applyFilter() {
    const q = filterEl.value.trim().toLowerCase();
    let shown = 0, total = 0;
    sectionsEl.querySelectorAll('.repo-section').forEach((sec) => {
      const at = sec._activeTab || '';
      let secShown = 0;
      sec.querySelectorAll('.item-card').forEach((card) => {
        total++;
        const s = card.dataset.search;
        const excluded = excludeTerms.some((t) => s.includes(t)); // 除外リストに一致→非表示
        const tabHit = !at || (at === '__none__' ? !card.dataset.tab : card.dataset.tab === at);
        const hit = !excluded && tabHit && (!q || s.includes(q));
        card.style.display = hit ? '' : 'none';
        if (hit) { shown++; secShown++; }
      });
      sec.style.display = q && secShown === 0 ? 'none' : '';
    });
    totalEl.textContent = shown < total ? `${shown} / ${total} 件` : `計 ${total} 件`;
  }
  filterEl.addEventListener('input', applyFilter);

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = urlInput.value.trim();
      if (!url) return;
      loadRepo({ url }, true);
      urlInput.value = '';
    });
  }

  (async function init() {
    const q = new URLSearchParams(location.search).get('repo');
    if (q) { loadRepo({ url: q }, true); if ($('manual')) $('manual').open = true; }

    let cfg = null;
    try {
      const res = await fetch('./repos.json', { cache: 'no-cache' });
      if (res.ok) cfg = await res.json();
    } catch (_) {}
    const specs = (cfg && Array.isArray(cfg.repos) ? cfg.repos : [])
      .map(normalizeSpec)
      .filter(Boolean);

    if (!specs.length && !q) {
      const p = document.createElement('p');
      p.className = 'items-empty';
      p.innerHTML = 'repos.json に GitHub の URL を追加してください。';
      sectionsEl.append(p);
      return;
    }
    specs.forEach((s) => loadRepo(s, false));
  })();
})();
