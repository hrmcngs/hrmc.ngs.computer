(() => {
  'use strict';
  const grid = document.getElementById('photos-grid');
  const status = document.getElementById('photos-status');
  let loading = false;
  let previousList = null;
  let allPhotos = [];
  let activeCategory = 'all';
  let currentGallery = [];
  const cards = new Map();
  const photoObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = entry.target;
      img.src = img.dataset.src;
      delete img.dataset.src;
      photoObserver.unobserve(img);
    }
  }, { rootMargin: '120px 0px' }) : null;
  const categoryButtons = document.querySelectorAll('[data-photo-category]');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

  async function request(url, options = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      window.clearTimeout(timer);
    }
  }

  // 通常の python -m http.server でも、実際のフォルダーから写真を発見する。
  async function localPhotoFiles() {
    const files = new Set();
    const visited = new Set();
    async function scan(directory) {
      if (visited.has(directory)) return;
      if (visited.size >= 100) throw new Error('Too many photo directories');
      visited.add(directory);
      const response = await request(directory, { cache: 'no-store' });
      if (!response.ok) throw new Error('Directory listing unavailable');
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      if (!/directory listing|index of|listing directory/i.test(doc.title)) {
        throw new Error('Not a directory listing');
      }
      for (const link of doc.querySelectorAll('a[href]')) {
        const url = new URL(link.getAttribute('href'), window.location.origin + directory);
        if (url.origin !== window.location.origin || !url.pathname.startsWith(directory)) continue;
        const relative = decodeURIComponent(url.pathname.slice(directory.length));
        if (!relative || relative.startsWith('.') || relative.replace(/\/$/, '').includes('/')) continue;
        if (/\.(jpe?g|png|webp|avif|gif)$/i.test(url.pathname)) files.add(url.pathname);
        else if (url.pathname.endsWith('/')) await scan(url.pathname);
      }
    }
    await scan('/image/photos/');
    return [...files].sort();
  }

  function renderPhotos(photos) {
    const fragment = document.createDocumentFragment();
    const gallery = [];
    photoObserver?.disconnect();
    const present = new Set(allPhotos.filter(photo => photo && typeof photo.src === 'string')
      .map(photo => new URL(photo.src, window.location.origin).href));
    for (const src of cards.keys()) if (!present.has(src)) cards.delete(src);
    for (const photo of photos) {
      if (!photo || typeof photo.src !== 'string' || !photo.src.trim()) continue;
      const url = new URL(photo.src, window.location.origin);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      const folder = url.pathname.split('/')[3];
      if (activeCategory !== 'all' && folder !== activeCategory) continue;
      gallery.push({ ...photo, src: url.href });
      const signature = JSON.stringify(photo);
      const cached = cards.get(url.href);
      if (cached?.signature === signature) {
        fragment.append(cached.figure);
        continue;
      }
      const figure = document.createElement('figure');
      figure.className = 'photo';
      const link = document.createElement('a');
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.addEventListener('click', event => {
        if (!window.openPhotoViewer || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const selected = currentGallery.findIndex(item => item.src === url.href);
        if (selected >= 0) window.openPhotoViewer(currentGallery, selected, link);
      });
      const img = document.createElement('img');
      // src は表示直前に設定する。元画像のデータは変更しない。
      if (photoObserver) img.dataset.src = url.href;
      else img.src = url.href;
      img.alt = photo.alt || photo.caption || '写真';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => {
        link.replaceWith(document.createTextNode('写真を読み込めませんでした。'));
      }, { once: true });
      link.append(img);
      figure.append(link);
      if (photo.caption) {
        const caption = document.createElement('figcaption');
        caption.textContent = photo.caption;
        figure.append(caption);
      }
      cards.set(url.href, { figure, signature });
      fragment.append(figure);
    }
    currentGallery = gallery;
    window.updatePhotoViewer?.(gallery);
    grid.replaceChildren(fragment);
    grid.querySelectorAll('img[data-src]').forEach(img => photoObserver?.observe(img));
    status.hidden = grid.childElementCount > 0;
    status.textContent = activeCategory === 'all' ? '写真は準備中です。' : 'このカテゴリーの写真は準備中です。';
  }

  async function loadPhotos() {
    if (loading) return;
    loading = true;
    try {
      const response = await request('/photos/data.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let photos = await response.json();
      if (!Array.isArray(photos)) throw new Error('Invalid photo list');
      let discovered = response.headers.get('X-Photo-Catalog') === 'live';
      if (local && !discovered) {
        try {
          const files = await localPhotoFiles();
          const metadata = new Map(photos.filter(photo => photo && typeof photo.src === 'string')
            .map(photo => [new URL(photo.src, window.location.origin).pathname, photo]));
          photos = files.map((src, i) => ({ alt: `写真 ${i + 1}`, ...metadata.get(src), src }));
          discovered = true;
        } catch (error) {
          console.warn('[Photos] フォルダー一覧を取得できないため保存済み一覧を使用:', error);
        }
      }
      // 一覧が古いままでも、サイト上の実ファイルの削除を検出する。
      // 通信エラーを削除扱いせず、同一サイトの画像の404/410だけを除く。
      if (!discovered) {
        const exists = await Promise.all(photos.map(async photo => {
          if (!photo || typeof photo.src !== 'string') return false;
          try {
            const url = new URL(photo.src, window.location.origin);
            if (url.origin !== window.location.origin) return true;
            const check = await request(url, { method: 'HEAD', cache: 'no-store' });
            return check.status !== 404 && check.status !== 410;
          } catch { return true; }
        }));
        photos = photos.filter((_, i) => exists[i]);
      }
      const serialized = JSON.stringify(photos);
      if (serialized === previousList) return;
      allPhotos = photos;
      renderPhotos(allPhotos);
      previousList = serialized;
    } catch (error) {
      if (previousList === null) {
        status.textContent = '写真を読み込めませんでした。時間をおいて再読み込みしてください。';
      }
      console.warn('[Photos]', error);
    } finally {
      loading = false;
    }
  }
  categoryButtons.forEach(button => {
    button.addEventListener('click', () => {
      if (activeCategory === button.dataset.photoCategory) return;
      activeCategory = button.dataset.photoCategory;
      categoryButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      if (previousList !== null) renderPhotos(allPhotos);
    });
  });
  loadPhotos();
  window.setInterval(() => { if (!document.hidden) loadPhotos(); }, 5000);
  window.addEventListener('focus', loadPhotos);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadPhotos(); });
})();
