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
    // ターミナルの max-height 制約を一時解除して、カメラに十分な高さを与える
    const savedContainerStyle = container.getAttribute('style') || '';
    container.style.maxHeight = 'none';
    container.style.padding = '0';
    container.style.overflow = 'hidden';

    // ── レイアウト ───────────────────────────────────
    const root = document.createElement('div');
    root.style.cssText = [
      'position:relative',
      'width:100%',
      'height:min(70vh, 560px)',
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
    status.style.cssText = 'position:absolute;top:0.6rem;left:0.8rem;color:#0f0;font-family:monospace;font-size:0.78rem;opacity:0.75;text-shadow:0 0 4px #000;pointer-events:none;';
    status.textContent = 'カメラを起動中...';
    root.appendChild(status);

    // ── 右上アイコンバー（常時表示）─────────────────
    const topBar = document.createElement('div');
    topBar.style.cssText = 'position:absolute;top:0.5rem;right:0.5rem;display:flex;gap:0.4rem;';
    root.appendChild(topBar);

    const iconBtnCss = [
      'width:36px', 'height:36px', 'display:grid', 'place-items:center',
      'background:rgba(0,0,0,0.55)', 'border:1px solid rgba(0,255,0,0.3)',
      'color:#0f0', 'font:600 18px/1 ui-monospace,monospace',
      'border-radius:8px', 'cursor:pointer', 'padding:0',
    ].join(';');

    const shotBtn = document.createElement('button');
    shotBtn.type = 'button';
    shotBtn.style.cssText = iconBtnCss + ';color:#f55;border-color:rgba(255,80,80,0.5);font-size:20px;';
    shotBtn.title = '撮影 (PNG 保存)'; shotBtn.textContent = '●';

    const gearBtn = document.createElement('button');
    gearBtn.type = 'button'; gearBtn.style.cssText = iconBtnCss;
    gearBtn.title = '設定'; gearBtn.textContent = '⚙';

    const xBtn = document.createElement('button');
    xBtn.type = 'button'; xBtn.style.cssText = iconBtnCss;
    xBtn.title = '閉じる'; xBtn.textContent = '✕';

    topBar.append(shotBtn, gearBtn, xBtn);

    // ── 撮影フラッシュ用オーバーレイ ─────────────────
    const flash = document.createElement('div');
    flash.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity 0.18s ease;';
    root.appendChild(flash);

    // ── 設定パネル（下部にスライドアップ）─────────────
    const panel = document.createElement('div');
    panel.style.cssText = [
      'position:absolute', 'left:0.5rem', 'right:0.5rem', 'bottom:0.5rem',
      'background:rgba(0,0,0,0.7)', 'border:1px solid rgba(0,255,0,0.3)',
      'border-radius:10px', 'padding:0.7rem 0.85rem',
      'font-family:ui-monospace,monospace', 'font-size:0.78rem', 'color:#0f0',
      'display:flex', 'flex-direction:column', 'gap:0.55rem',
      'backdrop-filter:blur(4px)',
      'transform:translateY(120%)', 'transition:transform 0.22s ease',
    ].join(';');

    function makeSlider(label, min, max, val, fmt) {
      const row = document.createElement('label');
      row.style.cssText = 'display:grid;grid-template-columns:5.5em 1fr 3em;align-items:center;gap:0.5rem;';
      const lab = document.createElement('span'); lab.textContent = label;
      const input = document.createElement('input');
      input.type = 'range'; input.min = String(min); input.max = String(max); input.value = String(val);
      input.style.cssText = 'width:100%;accent-color:#0f0;height:24px;';
      const out = document.createElement('span'); out.style.textAlign = 'right';
      out.textContent = fmt(val);
      input.addEventListener('input', () => { out.textContent = fmt(Number(input.value)); });
      row.append(lab, input, out);
      return { root: row, input };
    }

    const tileRow = makeSlider('Tile Size', 8, 60, 18, v => v);
    const fadeRow = makeSlider('Fade Factor', 0, 60, 12, v => (v / 100).toFixed(2));

    const fsBtn = document.createElement('button');
    fsBtn.type = 'button';
    fsBtn.textContent = '⛶  Toggle Fullscreen';
    fsBtn.style.cssText = 'background:transparent;color:#0f0;border:1px solid rgba(0,255,0,0.35);padding:0.45rem 0.6rem;font:inherit;cursor:pointer;border-radius:6px;text-align:center;';

    panel.append(tileRow.root, fadeRow.root, fsBtn);
    root.appendChild(panel);

    let panelOpen = false;
    const togglePanel = (show) => {
      panelOpen = (show === undefined) ? !panelOpen : show;
      panel.style.transform = panelOpen ? 'translateY(0)' : 'translateY(120%)';
      gearBtn.style.color = panelOpen ? '#000' : '#0f0';
      gearBtn.style.background = panelOpen ? '#0f0' : 'rgba(0,0,0,0.55)';
    };

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
    // ── フルスクリーン（iOS Safari は要素 requestFullscreen 非対応なので CSS で疑似化）
    let fakeFull = false;
    const savedRootStyle = root.getAttribute('style') || '';
    const enterFakeFull = () => {
      fakeFull = true;
      root.style.cssText = savedRootStyle +
        ';position:fixed;top:0;left:0;right:0;bottom:0;width:100vw;height:100vh;z-index:99999;border-radius:0;';
      document.documentElement.style.overflow = 'hidden';
      requestAnimationFrame(resizeCanvas);
    };
    const exitFakeFull = () => {
      fakeFull = false;
      root.setAttribute('style', savedRootStyle);
      document.documentElement.style.overflow = '';
      requestAnimationFrame(resizeCanvas);
    };
    const toggleFullscreen = async () => {
      if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch {} return; }
      if (fakeFull) { exitFakeFull(); return; }
      if (root.requestFullscreen) {
        try { await root.requestFullscreen(); return; } catch {}
      }
      enterFakeFull();
    };

    fsBtn.addEventListener('click', toggleFullscreen);
    gearBtn.addEventListener('click', () => togglePanel());
    xBtn.addEventListener('click', () => opts.onClose?.());

    // ── 撮影 (PNG ダウンロード + フラッシュ) ─────────
    function capture() {
      flash.style.opacity = '0.85';
      setTimeout(() => { flash.style.opacity = '0'; }, 90);
      canvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.href = url; a.download = `matrix-cam-${ts}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }, 'image/png');
    }
    shotBtn.addEventListener('click', capture);

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
      ctx.fillStyle = `rgba(0,0,0,${1 - fade})`;
      ctx.fillRect(0, 0, w, h);

      const cols = Math.max(1, Math.floor(w / tileSize));
      const rows = Math.max(1, Math.floor(h / tileSize));
      if (off.width !== cols || off.height !== rows) {
        off.width = cols; off.height = rows;
      }

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
      if (fakeFull) document.documentElement.style.overflow = '';
      container.setAttribute('style', savedContainerStyle);
    };
  }

  window.MATRIX_CAM = { mount };
})();
