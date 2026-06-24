/* matrix-cam.js — カメラ映像を ASCII Matrix オーバーレイで表示する
   Terminal セクションの ./matrix.sh コマンドから window.MATRIX_CAM.mount() で起動される。
   getUserMedia でカメラを取得 → タイル単位で輝度サンプリング → 文字に置換して描画。
*/
(() => {
  'use strict';
  if (window.MATRIX_CAM) return;

  const CHARS = '!@#$%^&*()_+-=[]{}|;:,.<>?/`~ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
  const pickChar = () => CHARS[(Math.random() * CHARS.length) | 0];

  function mount(container, opts = {}) {
    container.innerHTML = '';

    // ── レイアウト ───────────────────────────────────
    const root = document.createElement('div');
    root.style.cssText = [
      'position:relative',
      'width:100%',
      'aspect-ratio:16/9',
      'background:#000',
      'overflow:hidden',
      'border-radius:8px',
    ].join(';');
    container.appendChild(root);

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    root.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const video = document.createElement('video');
    video.style.display = 'none';
    video.autoplay = true; video.playsInline = true; video.muted = true;
    root.appendChild(video);

    const off = document.createElement('canvas');
    const offCtx = off.getContext('2d', { willReadFrequently: true });

    const status = document.createElement('div');
    status.style.cssText = 'position:absolute;top:0.6rem;left:0.8rem;color:#0f0;font-family:monospace;font-size:0.78rem;opacity:0.75;text-shadow:0 0 4px #000;';
    status.textContent = 'カメラを起動中...';
    root.appendChild(status);

    // ── コントロール ─────────────────────────────────
    const ctrl = document.createElement('div');
    ctrl.style.cssText = [
      'position:absolute', 'bottom:0.6rem', 'right:0.6rem',
      'background:rgba(0,0,0,0.6)', 'border:1px solid rgba(0,255,0,0.25)',
      'padding:0.55rem 0.7rem', 'font-family:monospace', 'font-size:0.72rem',
      'color:#0f0', 'display:flex', 'flex-direction:column', 'gap:0.35rem',
      'min-width:170px', 'backdrop-filter:blur(2px)',
    ].join(';');

    const btnStyle = 'background:transparent;color:#0f0;border:1px solid rgba(0,255,0,0.35);padding:0.25rem 0.5rem;font:inherit;cursor:pointer;text-align:left;';

    const fsBtn = document.createElement('button');
    fsBtn.type = 'button'; fsBtn.textContent = 'Toggle Fullscreen';
    fsBtn.style.cssText = btnStyle;

    const tileRow = makeSlider('Tile Size', 8, 60, 18, v => v);
    const fadeRow = makeSlider('Fade Factor', 0, 60, 12, v => (v / 100).toFixed(2));

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button'; closeBtn.textContent = './stop  (Close)';
    closeBtn.style.cssText = btnStyle;

    ctrl.append(fsBtn, tileRow.root, fadeRow.root, closeBtn);
    root.appendChild(ctrl);

    function makeSlider(label, min, max, val, fmt) {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:0.4rem;';
      const lab = document.createElement('span'); lab.textContent = label + ':';
      const input = document.createElement('input');
      input.type = 'range'; input.min = String(min); input.max = String(max); input.value = String(val);
      input.style.cssText = 'flex:1;accent-color:#0f0;min-width:60px;';
      const out = document.createElement('span'); out.style.minWidth = '2.4em'; out.style.textAlign = 'right';
      out.textContent = fmt(val);
      input.addEventListener('input', () => { out.textContent = fmt(Number(input.value)); });
      row.append(lab, input, out);
      return { root: row, input };
    }

    // ── 状態 ────────────────────────────────────────
    let tileSize = Number(tileRow.input.value);
    let fade     = Number(fadeRow.input.value) / 100;
    let rafId    = 0;
    let stream   = null;
    let running  = false;
    let mirror   = true;
    let cellChars = [], cellAge = [];

    tileRow.input.addEventListener('input', () => {
      tileSize = Number(tileRow.input.value);
      cellChars = []; cellAge = [];
    });
    fadeRow.input.addEventListener('input', () => {
      fade = Number(fadeRow.input.value) / 100;
    });
    fsBtn.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else root.requestFullscreen?.().catch(() => {});
    });
    closeBtn.addEventListener('click', () => opts.onClose?.());

    function resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      const rect = root.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      canvas.width  = Math.floor(rect.width  * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cellChars = []; cellAge = [];
    }

    function draw() {
      if (!running) return;
      rafId = requestAnimationFrame(draw);
      if (video.readyState < 2 || !video.videoWidth) return;

      const w = canvas.clientWidth, h = canvas.clientHeight;
      // 残像（fade=0 でリアルタイム / 大きいと残像が長く残る）
      ctx.fillStyle = `rgba(0,0,0,${1 - fade})`;
      ctx.fillRect(0, 0, w, h);

      const cols = Math.max(1, Math.floor(w / tileSize));
      const rows = Math.max(1, Math.floor(h / tileSize));
      if (off.width !== cols || off.height !== rows) {
        off.width = cols; off.height = rows;
      }

      // カメラを偏らず収めるためアスペクトに合わせて中央クロップ
      const vw = video.videoWidth, vh = video.videoHeight;
      const tAspect = cols / rows, vAspect = vw / vh;
      let sx = 0, sy = 0, sw = vw, sh = vh;
      if (vAspect > tAspect) { sw = vh * tAspect; sx = (vw - sw) / 2; }
      else                   { sh = vw / tAspect; sy = (vh - sh) / 2; }

      offCtx.save();
      if (mirror) { offCtx.translate(cols, 0); offCtx.scale(-1, 1); }
      offCtx.drawImage(video, sx, sy, sw, sh, 0, 0, cols, rows);
      offCtx.restore();

      const px = offCtx.getImageData(0, 0, cols, rows).data;

      if (cellChars.length !== rows || (cellChars[0] && cellChars[0].length !== cols)) {
        cellChars = Array.from({length: rows}, () => Array.from({length: cols}, pickChar));
        cellAge   = Array.from({length: rows}, () => Array.from({length: cols}, () => (Math.random() * 20) | 0));
      }

      ctx.font = `${Math.max(8, tileSize * 0.95)}px Monocraft, ui-monospace, monospace`;
      ctx.textBaseline = 'top';

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = (r * cols + c) * 4;
          const lum = (px[i] * 0.299 + px[i+1] * 0.587 + px[i+2] * 0.114) / 255;
          if (lum < 0.06) continue;

          if (++cellAge[r][c] > 5 + Math.random() * 16) {
            cellChars[r][c] = pickChar();
            cellAge[r][c] = 0;
          }
          const g = (80 + lum * 200) | 0;
          ctx.fillStyle = `rgb(0,${g},0)`;
          ctx.fillText(cellChars[r][c], c * tileSize, r * tileSize);
        }
      }
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        status.textContent = 'このブラウザは getUserMedia に未対応です';
        return;
      }
      let chosen;
      // 背面カメラ優先（モバイル想定）。ダメなら任意。
      try {
        chosen = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
        const t = chosen.getVideoTracks()[0];
        mirror = (t?.getSettings?.().facingMode ?? 'user') !== 'environment';
      } catch (_) {
        try {
          chosen = await navigator.mediaDevices.getUserMedia({ video: true });
          mirror = true;
        } catch (err) {
          status.textContent = 'カメラを開けませんでした: ' + (err?.message ?? err);
          return;
        }
      }
      stream = chosen;
      video.srcObject = stream;
      try { await video.play(); } catch {}
      status.textContent = '';
      resizeCanvas();
      running = true;
      draw();
    }

    const onResize = () => resizeCanvas();
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onResize);

    start();

    return function cleanup() {
      running = false;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach(t => t.stop());
      stream = null;
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onResize);
      if (document.fullscreenElement === root) document.exitFullscreen?.();
    };
  }

  window.MATRIX_CAM = { mount };
})();
