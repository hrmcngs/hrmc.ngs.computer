(() => {
  'use strict';
  const grid = document.getElementById('photos-grid');
  const status = document.getElementById('photos-status');
  let loading = false;
  let previousList = null;

  async function loadPhotos() {
    if (loading) return;
    loading = true;
    try {
      const response = await fetch('/photos/data.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let photos = await response.json();
      if (!Array.isArray(photos)) throw new Error('Invalid photo list');
      // 一覧が古いままでも、サイト上の実ファイルの削除を検出する。
      // 通信エラーを削除扱いせず、同一サイトの画像の404/410だけを除く。
      if (response.headers.get('X-Photo-Catalog') !== 'live') {
        const exists = await Promise.all(photos.map(async photo => {
          if (!photo || typeof photo.src !== 'string') return false;
          try {
            const url = new URL(photo.src, window.location.origin);
            if (url.origin !== window.location.origin) return true;
            const check = await fetch(url, { method: 'HEAD', cache: 'no-store' });
            return check.status !== 404 && check.status !== 410;
          } catch { return true; }
        }));
        photos = photos.filter((_, i) => exists[i]);
      }
      const serialized = JSON.stringify(photos);
      if (serialized === previousList) return;
      const fragment = document.createDocumentFragment();
      const gallery = [];
      for (const photo of photos) {
        if (!photo || typeof photo.src !== 'string' || !photo.src.trim()) continue;
        const url = new URL(photo.src, window.location.origin);
        if (!['http:', 'https:'].includes(url.protocol)) continue;
        const selected = gallery.length;
        gallery.push({ ...photo, src: url.href });
        const figure = document.createElement('figure');
        figure.className = 'photo';
        const link = document.createElement('a');
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.addEventListener('click', event => {
          if (!window.openPhotoViewer || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          window.openPhotoViewer(gallery, selected, link);
        });
        const img = document.createElement('img');
        img.src = url.href;
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
        fragment.append(figure);
      }
      window.updatePhotoViewer?.(gallery);
      grid.replaceChildren(fragment);
      previousList = serialized;
      status.hidden = grid.childElementCount > 0;
      status.textContent = '写真は準備中です。';
    } catch (error) {
      if (previousList === null) {
        status.textContent = '写真を読み込めませんでした。時間をおいて再読み込みしてください。';
      }
      console.warn('[Photos]', error);
    } finally {
      loading = false;
    }
  }
  loadPhotos();
  window.setInterval(() => { if (!document.hidden) loadPhotos(); }, 5000);
  window.addEventListener('focus', loadPhotos);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadPhotos(); });
})();
