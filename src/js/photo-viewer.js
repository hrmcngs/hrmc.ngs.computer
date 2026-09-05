(() => {
  'use strict';
  const dialog = document.getElementById('photo-viewer');
  const stage = dialog.querySelector('.viewer-stage');
  const image = dialog.querySelector('img');
  const label = dialog.querySelector('.viewer-caption');
  const counter = dialog.querySelector('.viewer-counter');
  const resetButton = dialog.querySelector('[data-action="reset"]');
  let photos = [], index = 0, scale = 1, x = 0, y = 0, opener;
  let start, pinching = false;
  const pointers = new Map();
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  function draw() {
    const maxX = Math.max(0, (image.offsetWidth * scale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (image.offsetHeight * scale - stage.clientHeight) / 2);
    x = clamp(x, -maxX, maxX);
    y = clamp(y, -maxY, maxY);
    image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    stage.classList.toggle('is-zoomed', scale > 1);
    resetButton.textContent = `${Math.round(scale * 100)}%`;
  }
  function zoom(next, px = 0, py = 0) {
    next = clamp(next, 1, 6);
    x = px - (px - x) * next / scale;
    y = py - (py - y) * next / scale;
    scale = next;
    draw();
  }
  function reset() { scale = 1; x = y = 0; draw(); }
  function show(next) {
    index = (next + photos.length) % photos.length;
    pointers.clear(); start = null; pinching = false;
    image.src = photos[index].src;
    image.alt = photos[index].alt || '写真';
    image.hidden = false;
    label.textContent = photos[index].caption || '';
    counter.textContent = `${index + 1} / ${photos.length}`;
    dialog.querySelector('.viewer-original').href = image.src;
    reset();
  }
  window.openPhotoViewer = (items, selected, trigger) => {
    photos = items; opener = trigger;
    if (!photos.length) return;
    dialog.showModal();
    document.documentElement.classList.add('photo-viewer-open');
    show(selected);
  };
  window.updatePhotoViewer = items => {
    if (!dialog.open) return;
    const selected = items.findIndex(photo => photo.src === photos[index]?.src);
    if (selected < 0) {
      dialog.close();
      return;
    }
    photos = items;
    index = selected;
    counter.textContent = `${index + 1} / ${photos.length}`;
  };
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('photo-viewer-open');
    pointers.clear(); reset(); opener?.focus();
  });
  dialog.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'close') dialog.close();
    if (action === 'prev') show(index - 1);
    if (action === 'next') show(index + 1);
    if (action === 'in') zoom(scale * 1.5);
    if (action === 'out') zoom(scale / 1.5);
    if (action === 'reset') reset();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); show(index + 1); }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(scale * 1.5); }
    if (event.key === '-') { event.preventDefault(); zoom(scale / 1.5); }
    if (event.key === '0') reset();
  });
  stage.addEventListener('wheel', event => {
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    zoom(scale * Math.exp(-event.deltaY * 0.002), event.clientX - rect.left - rect.width / 2,
      event.clientY - rect.top - rect.height / 2);
  }, { passive: false });
  stage.addEventListener('dblclick', event => {
    event.preventDefault();
    if (scale > 1) reset(); else zoom(2);
  });
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  let pinchDistance = 0;
  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      pinching = false;
      start = { x: event.clientX, y: event.clientY, background: event.target === stage };
    }
    if (pointers.size === 2) { pinching = true; pinchDistance = distance(); }
  });
  stage.addEventListener('pointermove', event => {
    const before = pointers.get(event.pointerId);
    if (!before) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const nextDistance = distance();
      if (pinchDistance > 0) zoom(scale * nextDistance / pinchDistance);
      pinchDistance = nextDistance;
    } else if (scale > 1) {
      x += event.clientX - before.x; y += event.clientY - before.y; draw();
    }
  });
  function release(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (!pointers.size && start && !pinching && event.type === 'pointerup' && scale === 1) {
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1));
      else if (Math.hypot(dx, dy) < 5 && start.background) dialog.close();
    }
    if (!pointers.size) start = null;
  }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('lostpointercapture', release);
  image.addEventListener('load', reset);
  image.addEventListener('error', () => { image.hidden = true; label.textContent = '写真を読み込めませんでした。'; });
  window.addEventListener('resize', () => { if (dialog.open) draw(); });
})();
