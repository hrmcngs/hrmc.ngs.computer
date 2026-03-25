(() => {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // overlay div（背景色制御用）
  const overlay = canvas.closest('.hero-bg')?.querySelector('.hero-overlay');

  // ── リサイズ ────────────────────────────────────────
  function resize() {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }
  resize();
  window.addEventListener('resize', () => { resize(); rebuildAll(); });

  // ── 状態 ────────────────────────────────────────────
  const month = new Date().getMonth() + 1;
  const state = {
    season    : month>=3&&month<=5?'spring':month>=6&&month<=8?'summer':month>=9&&month<=11?'autumn':'winter',
    weather   : 'auto',
    isRaining : false,
    isClear   : false,
    brightness: 'auto',
  };

  let particles = [];
  let rainDrops = [];

  // ── 時間帯情報 ──────────────────────────────────────
  function getTimeInfo() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    let phase, bright;
    if      (h >= 5  && h < 8 ) { phase = 'dawn';    bright = 0.35 + (h-5)/3*0.45; }
    else if (h >= 8  && h < 17) { phase = 'day';     bright = 0.95; }
    else if (h >= 17 && h < 20) { phase = 'dusk';    bright = 0.80 - (h-17)/3*0.55; }
    else if (h >= 20 && h < 23) { phase = 'night';   bright = 0.25 - (h-20)/3*0.10; }
    else                         { phase = 'midnight';bright = 0.15; }
    if (state.brightness !== 'auto') bright = Math.max(0, Math.min(1, Number(state.brightness)));
    return { phase, bright };
  }

  // ── 背景グラデーション ──────────────────────────────
  const BG = {
    midnight : { top: '#000008', bot: '#050510' },
    dawn     : { top: '#1a0a2e', bot: '#4a1a3e' },
    day_clear: { top: '#0a1a3a', bot: '#0d2850' },  // 晴れ昼：少し明るい青系
    day_cloud: { top: '#0d0d18', bot: '#141420' },
    dusk     : { top: '#1a0a18', bot: '#2e0e1a' },
    night    : { top: '#020210', bot: '#080818' },
  };

  function updateBackground() {
    if (!overlay) return;
    const { phase, bright } = getTimeInfo();
    let key;
    if      (phase === 'dawn')     key = 'dawn';
    else if (phase === 'day')      key = state.isClear ? 'day_clear' : 'day_cloud';
    else if (phase === 'dusk')     key = 'dusk';
    else if (phase === 'night')    key = 'night';
    else                           key = 'midnight';

    const bg = BG[key];
    // 昼晴れは明るめ、それ以外は暗め
    const alpha = phase === 'day' && state.isClear ? 0.55 : 0.82;
    overlay.style.transition = 'background 3s ease';
    overlay.style.background = `linear-gradient(160deg, ${bg.top}${Math.round(alpha*255).toString(16).padStart(2,'0')} 0%, ${bg.bot}${Math.round(alpha*255).toString(16).padStart(2,'0')} 100%)`;
  }
  setInterval(updateBackground, 60000);

  // ── デジタルノイズレイヤー ──────────────────────────
  const noiseCanvas = document.createElement('canvas');
  noiseCanvas.width = 256; noiseCanvas.height = 256;
  const nctx = noiseCanvas.getContext('2d');
  let noisePat = null;
  let noiseFrame = 0;

  function updateNoise() {
    const img = nctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i+1] = img.data[i+2] = v;
      img.data[i+3] = Math.random() < 0.04 ? Math.random() * 60 : 0;
    }
    nctx.putImageData(img, 0, 0);
    noisePat = ctx.createPattern(noiseCanvas, 'repeat');
  }
  updateNoise();

  // ── グリッチエフェクト ──────────────────────────────
  let glitchTimer = 0;
  let glitchActive = false;
  let glitchLines = [];

  function triggerGlitch() {
    glitchActive = true;
    glitchLines = Array.from({ length: 3 + Math.floor(Math.random() * 4) }, () => ({
      y     : Math.random() * canvas.height,
      h     : 1 + Math.random() * 4,
      dx    : (Math.random() - 0.5) * 20,
      alpha : 0.3 + Math.random() * 0.5,
      life  : 3 + Math.floor(Math.random() * 6),
      frame : 0,
    }));
    setTimeout(() => { glitchActive = false; glitchLines = []; }, 200 + Math.random() * 300);
  }

  function drawGlitch(bright) {
    if (!glitchActive) return;
    glitchLines.forEach(g => {
      g.frame++;
      if (g.frame > g.life) return;
      ctx.save();
      ctx.globalAlpha = g.alpha * bright * (1 - g.frame / g.life);
      // スライスした画像をずらして描画（デジタルグリッチ）
      try {
        ctx.drawImage(canvas, 0, g.y, canvas.width, g.h, g.dx, g.y, canvas.width, g.h);
      } catch {}
      // RGBずれ
      ctx.globalAlpha = g.alpha * 0.3 * bright;
      ctx.fillStyle = `rgba(0,255,200,0.15)`;
      ctx.fillRect(g.dx + 2, g.y, canvas.width, g.h);
      ctx.fillStyle = `rgba(255,0,80,0.15)`;
      ctx.fillRect(g.dx - 2, g.y, canvas.width, g.h);
      ctx.restore();
    });
  }

  // ── 桜の花びら ─────────────────────────────────────
  class Petal {
    constructor(initial) { this.init(initial); this.glitch = 0; }
    init(initial = false) {
      this.x = Math.random() * canvas.width;
      this.y = initial ? Math.random() * canvas.height : -20;
      this.w = 5 + Math.random() * 8;
      this.vx = (Math.random() - 0.5) * 1.2;
      this.vy = 0.6 + Math.random() * 1.1;
      this.rot = Math.random() * Math.PI * 2;
      this.drot = (Math.random() - 0.5) * 0.045;
      this.swing = Math.random() * Math.PI * 2;
      this.dswing = 0.018 + Math.random() * 0.018;
      this.alpha = 0.45 + Math.random() * 0.4;
      // デジタルノイズ用
      this.pixelate = Math.random() < 0.12; // 12%の確率でピクセル化
      this.glitchAlpha = 0;
    }
    update() {
      this.swing += this.dswing;
      this.x += this.vx + Math.sin(this.swing) * 0.9;
      this.y += this.vy;
      this.rot += this.drot;
      // ランダムグリッチ
      if (Math.random() < 0.002) this.glitchAlpha = 0.6 + Math.random() * 0.4;
      else this.glitchAlpha *= 0.85;
      if (this.y > canvas.height + 20) this.init();
    }
    draw(bright) {
      const s = this.w;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);

      // グリッチ時：RGBずれ
      if (this.glitchAlpha > 0.05) {
        const dx = (Math.random() - 0.5) * 6;
        ctx.save();
        ctx.globalAlpha = this.glitchAlpha * bright * 0.5;
        ctx.translate(dx, 0);
        ctx.beginPath(); this._petalPath(s);
        ctx.fillStyle = 'rgba(0,255,200,0.6)'; ctx.fill();
        ctx.translate(-dx * 2, 0);
        ctx.beginPath(); this._petalPath(s);
        ctx.fillStyle = 'rgba(255,0,80,0.6)'; ctx.fill();
        ctx.restore();
      }

      ctx.globalAlpha = this.alpha * bright;

      if (this.pixelate) {
        // ピクセル化（デジタル感）
        const px = 3;
        for (let py = -s * 1.1; py < s * 1.1; py += px) {
          for (let px2 = -s; px2 < s; px2 += px) {
            if (this._inPetal(px2 + px/2, py + px/2, s)) {
              const a = 0.4 + Math.random() * 0.4;
              ctx.globalAlpha = this.alpha * bright * a;
              ctx.fillStyle = `hsl(${340 + Math.random()*20}, 80%, ${70 + Math.random()*20}%)`;
              ctx.fillRect(px2, py, px - 0.5, px - 0.5);
            }
          }
        }
      } else {
        ctx.beginPath(); this._petalPath(s);
        const g = ctx.createRadialGradient(0, -s * 0.1, 0, 0, s * 0.2, s * 1.1);
        g.addColorStop(0, '#fff5f8');
        g.addColorStop(0.5, '#ffc0d0');
        g.addColorStop(1, '#f08098');
        ctx.fillStyle = g; ctx.fill();
      }
      ctx.restore();
    }
    _petalPath(s) {
      ctx.moveTo(0, -s * 0.05);
      ctx.bezierCurveTo(-s*0.25, -s*0.6, -s*0.85, -s*0.75, -s*0.55, -s*1.05);
      ctx.bezierCurveTo(-s*0.3,  -s*1.3,  s*0.05, -s*0.85,  0, -s*0.55);
      ctx.bezierCurveTo(-s*0.05, -s*0.85,  s*0.3,  -s*1.3,   s*0.55, -s*1.05);
      ctx.bezierCurveTo( s*0.85, -s*0.75,  s*0.25, -s*0.6,   0, -s*0.05);
      ctx.bezierCurveTo( s*0.8,   s*0.2,   s*0.6,   s*0.95,  0,  s*1.0);
      ctx.bezierCurveTo(-s*0.6,   s*0.95, -s*0.8,   s*0.2,   0, -s*0.05);
      ctx.closePath();
    }
    _inPetal(px, py, s) {
      // 簡易当たり判定（楕円近似）
      const nx = px / (s * 0.75), ny = (py - s * 0.1) / (s * 1.1);
      return nx*nx + ny*ny < 1;
    }
  }

  // ── 夏：蛍（グリッチドット） ──────────────────────
  class Firefly {
    constructor(initial) { this.init(initial); }
    init(initial = false) {
      this.x = Math.random() * canvas.width;
      this.y = initial ? Math.random() * canvas.height : canvas.height + 10;
      this.r = 2 + Math.random() * 2.5;
      this.vx = (Math.random() - 0.5) * 0.7;
      this.vy = -(0.25 + Math.random() * 0.5);
      this.phase = Math.random() * Math.PI * 2;
      this.dphase = 0.018 + Math.random() * 0.025;
      this.max = 0.5 + Math.random() * 0.45;
      this.glitch = 0;
    }
    update() {
      this.phase += this.dphase; this.x += this.vx; this.y += this.vy;
      if (Math.random() < 0.005) this.glitch = 8;
      if (this.glitch > 0) this.glitch--;
      if (this.y < -10) this.init();
    }
    draw(bright) {
      const a = this.max * (0.5 + 0.5 * Math.sin(this.phase)) * bright;
      ctx.save();
      if (this.glitch > 0) {
        // グリッチ：ピクセルが飛ぶ
        ctx.globalAlpha = a * 0.8;
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = i%2===0 ? 'rgba(0,255,180,0.8)' : 'rgba(255,60,120,0.6)';
          ctx.fillRect(this.x + (Math.random()-0.5)*12, this.y + (Math.random()-0.5)*8, 2, 2);
        }
      }
      ctx.globalAlpha = a;
      const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 4);
      g.addColorStop(0, '#ffffaa'); g.addColorStop(0.4, '#aaffaa'); g.addColorStop(1, 'transparent');
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 4, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill(); ctx.restore();
    }
  }

  // ── 秋：落ち葉（ピクセル化） ──────────────────────
  class Leaf {
    constructor(initial) { this.init(initial); }
    init(initial = false) {
      this.x = Math.random() * canvas.width;
      this.y = initial ? Math.random() * canvas.height : -20;
      this.sz = 5 + Math.random() * 8;
      this.vx = (Math.random() - 0.5) * 1.4; this.vy = 0.5 + Math.random() * 1;
      this.rot = Math.random() * Math.PI * 2; this.drot = (Math.random() - 0.5) * 0.04;
      this.swing = Math.random() * Math.PI * 2; this.dswing = 0.015 + Math.random() * 0.015;
      this.alpha = 0.5 + Math.random() * 0.4;
      const cs = ['#c8501a','#e07830','#b83010','#f09040','#a02808'];
      this.color = cs[Math.floor(Math.random() * cs.length)];
      this.pixelate = Math.random() < 0.15;
    }
    update() {
      this.swing += this.dswing;
      this.x += this.vx + Math.sin(this.swing) * 0.8; this.y += this.vy; this.rot += this.drot;
      if (this.y > canvas.height + 20) this.init();
    }
    draw(bright) {
      ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rot);
      ctx.globalAlpha = this.alpha * bright;
      if (this.pixelate) {
        const px = 3;
        for (let py = -this.sz; py < this.sz; py += px) {
          for (let px2 = -this.sz * 0.5; px2 < this.sz * 0.5; px2 += px) {
            ctx.fillStyle = this.color;
            ctx.globalAlpha = this.alpha * bright * (0.5 + Math.random() * 0.5);
            ctx.fillRect(px2, py, px - 0.5, px - 0.5);
          }
        }
      } else {
        ctx.beginPath(); ctx.ellipse(0, 0, this.sz * 0.45, this.sz, 0, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.fill();
      }
      ctx.restore();
    }
  }

  // ── 冬：雪（結晶ピクセル） ────────────────────────
  class Snow {
    constructor(initial) { this.init(initial); }
    init(initial = false) {
      this.x = Math.random() * canvas.width;
      this.y = initial ? Math.random() * canvas.height : -10;
      this.r = 1.5 + Math.random() * 3;
      this.vx = (Math.random() - 0.5) * 0.5; this.vy = 0.4 + Math.random() * 0.9;
      this.swing = Math.random() * Math.PI * 2; this.alpha = 0.4 + Math.random() * 0.45;
      this.crystal = Math.random() < 0.2;
    }
    update() {
      this.swing += 0.018;
      this.x += this.vx + Math.sin(this.swing) * 0.3; this.y += this.vy;
      if (this.y > canvas.height + 10) this.init();
    }
    draw(bright) {
      ctx.save(); ctx.globalAlpha = this.alpha * bright;
      if (this.crystal) {
        // ピクセル結晶
        ctx.translate(this.x, this.y);
        ctx.fillStyle = '#e8f4ff';
        const p = Math.ceil(this.r);
        for (let i = -p; i <= p; i++) {
          for (let j = -p; j <= p; j++) {
            if (Math.abs(i) + Math.abs(j) <= p) {
              ctx.fillRect(i * 2, j * 2, 1.5, 1.5);
            }
          }
        }
      } else {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fillStyle = '#e8f0ff'; ctx.fill();
      }
      ctx.restore();
    }
  }

  // ── 雨 ───────────────────────────────────────────
  class Rain {
    constructor(initial) { this.init(initial); }
    init(initial = false) {
      this.x = Math.random() * canvas.width; this.y = initial ? Math.random() * canvas.height : -30;
      this.len = 10 + Math.random() * 15; this.speed = 10 + Math.random() * 7;
      this.alpha = 0.08 + Math.random() * 0.12;
    }
    update() { this.x += 0.8; this.y += this.speed; if (this.y > canvas.height + 30) this.init(); }
    draw(bright) {
      ctx.save(); ctx.globalAlpha = this.alpha * bright;
      ctx.strokeStyle = '#90beff'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + this.len * 0.08, this.y + this.len);
      ctx.stroke(); ctx.restore();
    }
  }

  // ── 初期化 ─────────────────────────────────────────
  function count(density) { return Math.min(Math.floor(canvas.width * canvas.height / density), 120); }

  function buildParticles() {
    const s = state.season;
    if      (s === 'spring') { const n=count(7000);  particles=Array.from({length:n},(_,i)=>new Petal(i<n*0.6)); }
    else if (s === 'summer') { const n=count(10000); particles=Array.from({length:n},(_,i)=>new Firefly(i<n*0.6)); }
    else if (s === 'autumn') { const n=count(8000);  particles=Array.from({length:n},(_,i)=>new Leaf(i<n*0.6)); }
    else                     { const n=count(5000);  particles=Array.from({length:n},(_,i)=>new Snow(i<n*0.6)); }
  }

  function buildRain() {
    const n = Math.min(Math.floor(canvas.width / 5), 200);
    rainDrops = Array.from({length:n},(_,i)=>new Rain(i<n*0.6));
  }

  function rebuildAll() { buildParticles(); if (state.isRaining) buildRain(); else rainDrops=[]; }

  // ── 気象庁API ──────────────────────────────────────
  async function fetchWeather() {
    if (state.weather !== 'auto') {
      state.isRaining = state.weather === 'rain' || state.weather === 'snow';
      state.isClear   = state.weather === 'clear';
      if (state.isRaining) buildRain(); else rainDrops=[];
      updateBackground(); return;
    }
    try {
      const res  = await fetch('https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json');
      const data = await res.json();
      const code = data[0]?.timeSeries?.[0]?.areas?.[0]?.weatherCodes?.[0] ?? '100';
      state.isRaining = /^[34]/.test(code);
      state.isClear   = /^1/.test(code);
      if (state.isRaining) buildRain(); else rainDrops=[];
    } catch {}
    updateBackground();
  }

  // ── アニメーション ─────────────────────────────────
  let frame = 0;
  function animate() {
    frame++;
    const { bright } = getTimeInfo();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => { p.update(); p.draw(bright); });
    if (state.isRaining) rainDrops.forEach(r => { r.update(); r.draw(bright); });

    // ノイズ更新（8フレームに1回）
    if (frame % 8 === 0) updateNoise();
    if (noisePat) {
      ctx.save();
      ctx.globalAlpha = 0.03 * bright;
      ctx.fillStyle = noisePat;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    // グリッチ描画
    drawGlitch(bright);

    // ランダムグリッチトリガー（平均5秒に1回）
    if (Math.random() < 1/300) triggerGlitch();

    requestAnimationFrame(animate);
  }

  // ── コンソールAPI ──────────────────────────────────
  window.heroWeather = {
    setSeason(s) {
      if (!['spring','summer','autumn','winter'].includes(s)) { console.warn('spring/summer/autumn/winter'); return; }
      state.season = s; rebuildAll(); console.log(`%c[heroWeather] season → ${s}`, 'color:#3ecfcf');
    },
    setWeather(w) {
      if (!['auto','clear','rain','snow'].includes(w)) { console.warn('auto/clear/rain/snow'); return; }
      state.weather = w; fetchWeather(); console.log(`%c[heroWeather] weather → ${w}`, 'color:#3ecfcf');
    },
    setBrightness(b) {
      state.brightness = b; updateBackground(); console.log(`%c[heroWeather] brightness → ${b}`, 'color:#3ecfcf');
    },
    reset() {
      const m = new Date().getMonth() + 1;
      state.season=''; state.weather='auto'; state.brightness='auto';
      state.season = m>=3&&m<=5?'spring':m>=6&&m<=8?'summer':m>=9&&m<=11?'autumn':'winter';
      rebuildAll(); fetchWeather(); console.log('%c[heroWeather] reset', 'color:#3ecfcf');
    },
    glitch() { triggerGlitch(); },
    status() {
      const {phase,bright} = getTimeInfo();
      console.table({ season:state.season, weather:state.weather, isRaining:state.isRaining, isClear:state.isClear, brightness:state.brightness, timePhase:phase, computedBrightness:bright.toFixed(2) });
    },
    help() {
      console.log('%c[heroWeather]\n  setSeason("spring"|"summer"|"autumn"|"winter")\n  setWeather("auto"|"clear"|"rain"|"snow")\n  setBrightness("auto"|0.0~1.0)\n  glitch()  // 強制グリッチ\n  reset()\n  status()', 'color:#3ecfcf');
    },
  };

  // ── 起動 ──────────────────────────────────────────
  rebuildAll();
  updateBackground();
  animate();
  fetchWeather();
  console.log('%c[heroWeather] loaded — heroWeather.help()', 'color:#3ecfcf');
})();
