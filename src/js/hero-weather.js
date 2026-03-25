(() => {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const overlay = canvas.closest('.hero-bg')?.querySelector('.hero-overlay');

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
  let frame     = 0;

  // ── 時間帯 ──────────────────────────────────────────
  function getTimeInfo() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    let phase, bright;
    if      (h >= 5  && h < 8 ) { phase='dawn';     bright = 0.4 + (h-5)/3*0.5; }
    else if (h >= 8  && h < 17) { phase='day';      bright = 1.0; }
    else if (h >= 17 && h < 20) { phase='dusk';     bright = 0.9 - (h-17)/3*0.6; }
    else if (h >= 20 && h < 23) { phase='night';    bright = 0.3 - (h-20)/3*0.15; }
    else                         { phase='midnight'; bright = 0.15; }
    if (state.brightness !== 'auto') bright = Math.max(0, Math.min(1, Number(state.brightness)));
    return { phase, bright };
  }

  // ── 背景オーバーレイ ────────────────────────────────
  function updateBackground() {
    if (!overlay) return;
    const { phase } = getTimeInfo();
    const isDayClear = phase === 'day' && state.isClear;

    const configs = {
      midnight : { grad: 'linear-gradient(160deg,#000010 0%,#050518 100%)', opacity: 0.92 },
      dawn     : { grad: 'linear-gradient(160deg,#1a0828 0%,#3a1228 100%)', opacity: 0.85 },
      day      : isDayClear
                 ? { grad: 'linear-gradient(160deg,#0a1830 0%,#0d2448 100%)', opacity: 0.50 }
                 : { grad: 'linear-gradient(160deg,#080d18 0%,#0d1222 100%)', opacity: 0.82 },
      dusk     : { grad: 'linear-gradient(160deg,#180818 0%,#2a0c14 100%)', opacity: 0.85 },
      night    : { grad: 'linear-gradient(160deg,#020210 0%,#060818 100%)', opacity: 0.90 },
    };
    const cfg = configs[phase] ?? configs.night;
    overlay.style.transition  = 'background 4s ease, opacity 4s ease';
    overlay.style.background  = cfg.grad;
    overlay.style.opacity     = cfg.opacity;
  }
  setInterval(updateBackground, 60000);

  // ── デジタルノイズ（背景のみ） ──────────────────────
  const noiseC = document.createElement('canvas');
  noiseC.width = noiseC.height = 256;
  const nctx = noiseC.getContext('2d');
  let noisePat = null;

  function updateNoise() {
    const img = nctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i+1] = img.data[i+2] = v;
      // 疎らに光る点だけ不透明に
      img.data[i+3] = Math.random() < 0.025 ? 40 + Math.random()*40 : 0;
    }
    nctx.putImageData(img, 0, 0);
    noisePat = ctx.createPattern(noiseC, 'repeat');
  }
  updateNoise();

  // ── スキャンライン ──────────────────────────────────
  function drawScanlines(bright) {
    ctx.save();
    ctx.globalAlpha = 0.04 * bright;
    ctx.fillStyle = '#000';
    for (let y = 0; y < canvas.height; y += 3) {
      ctx.fillRect(0, y, canvas.width, 1);
    }
    ctx.restore();
  }

  // ── グリッチ ────────────────────────────────────────
  let glitchLines = [];
  let glitchActive = false;

  function triggerGlitch() {
    glitchActive = true;
    glitchLines = Array.from({ length: 2 + Math.floor(Math.random()*3) }, () => ({
      y    : Math.random() * canvas.height,
      h    : 1 + Math.random() * 3,
      dx   : (Math.random() - 0.5) * 18,
      life : 4 + Math.floor(Math.random() * 5),
      f    : 0,
    }));
    setTimeout(() => { glitchActive = false; glitchLines = []; }, 150 + Math.random()*200);
  }

  function drawGlitch(bright) {
    if (!glitchActive || !glitchLines.length) return;
    ctx.save();
    glitchLines.forEach(g => {
      g.f++;
      if (g.f > g.life) return;
      const a = (1 - g.f / g.life) * 0.6 * bright;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,255,200,0.2)';
      ctx.fillRect(g.dx + 3, g.y, canvas.width, g.h);
      ctx.fillStyle = 'rgba(255,0,80,0.2)';
      ctx.fillRect(g.dx - 3, g.y, canvas.width, g.h);
    });
    ctx.restore();
  }

  // ── 桜の花びら（綺麗な形のみ） ─────────────────────
  class Petal {
    constructor(initial) {
      this.init(initial);
      this.glitchTimer = 0;
    }
    init(initial = false) {
      this.x      = Math.random() * canvas.width;
      this.y      = initial ? Math.random() * canvas.height : -20;
      this.s      = 6 + Math.random() * 8;
      this.vx     = (Math.random() - 0.5) * 1.0;
      this.vy     = 0.6 + Math.random() * 1.0;
      this.rot    = Math.random() * Math.PI * 2;
      this.drot   = (Math.random() - 0.5) * 0.04;
      this.swing  = Math.random() * Math.PI * 2;
      this.dswing = 0.016 + Math.random() * 0.016;
      this.alpha  = 0.55 + Math.random() * 0.35;
    }
    update() {
      this.swing += this.dswing;
      this.x += this.vx + Math.sin(this.swing) * 0.8;
      this.y += this.vy;
      this.rot += this.drot;
      // ごくたまにグリッチでテレポート
      if (Math.random() < 0.0008) {
        this.glitchTimer = 3;
        this.x += (Math.random() - 0.5) * 30;
      }
      if (this.glitchTimer > 0) this.glitchTimer--;
      if (this.y > canvas.height + 20) this.init();
    }
    draw(bright) {
      const s = this.s;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);

      // グリッチ中はRGBずれ
      if (this.glitchTimer > 0) {
        ctx.globalAlpha = 0.25 * bright;
        ctx.translate(4, 0);
        ctx.beginPath(); this._path(s);
        ctx.fillStyle = 'rgba(0,255,200,0.7)'; ctx.fill();
        ctx.translate(-8, 0);
        ctx.beginPath(); this._path(s);
        ctx.fillStyle = 'rgba(255,0,80,0.7)'; ctx.fill();
        ctx.translate(4, 0);
      }

      // ── ベース花びら ──
      ctx.globalAlpha = this.alpha * bright;
      ctx.beginPath(); this._path(s);
      const g = ctx.createRadialGradient(0, -s*0.3, 0, 0, s*0.3, s*1.3);
      g.addColorStop(0, '#fff8fa');
      g.addColorStop(0.45, '#ffccd8');
      g.addColorStop(1, '#f08098');
      ctx.fillStyle = g;
      ctx.fill();

      // ── デジタルノイズ（花びら内部） ──
      ctx.beginPath(); this._path(s);
      ctx.clip(); // 花びら形でクリップ

      // 走査線（横に細いライン）
      const lineStep = 2 + Math.floor(Math.random() * 2);
      ctx.globalAlpha = (0.06 + Math.random() * 0.06) * bright;
      ctx.fillStyle = '#000';
      for (let ly = -s * 1.3; ly < s * 1.3; ly += lineStep) {
        if (Math.random() < 0.5) ctx.fillRect(-s, ly, s * 2, 0.8);
      }

      // チラつくピクセル粒
      const dotCount = 4 + Math.floor(Math.random() * 6);
      for (let d = 0; d < dotCount; d++) {
        const px = (Math.random() - 0.5) * s * 1.6;
        const py = (Math.random() - 0.9) * s * 2.2;
        const pw = 1 + Math.random() * 2;
        ctx.globalAlpha = (0.3 + Math.random() * 0.5) * bright;
        ctx.fillStyle = Math.random() < 0.5 ? '#fff' : `hsl(${320+Math.random()*40},80%,85%)`;
        ctx.fillRect(px, py, pw, pw);
      }

      // カラーチャンネルずれライン（まれに）
      if (Math.random() < 0.08) {
        const ly = (Math.random() - 0.5) * s * 2;
        ctx.globalAlpha = 0.15 * bright;
        ctx.fillStyle = 'rgba(0,255,200,0.6)';
        ctx.fillRect(-s, ly, s * 2, 1);
        ctx.fillStyle = 'rgba(255,0,80,0.6)';
        ctx.fillRect(-s + 2, ly + 1, s * 2, 1);
      }

      ctx.restore();
    }
    // 上部に切れ込みのある桜の花びら（縦長）
    _path(s) {
      ctx.moveTo(0, s * 1.2);
      ctx.bezierCurveTo(-s*0.6,  s*0.7,  -s*0.9, -s*0.1, -s*0.65, -s*0.7);
      ctx.bezierCurveTo(-s*0.45, -s*1.1, -s*0.12, -s*0.95, 0, -s*0.6);
      ctx.bezierCurveTo( s*0.12, -s*0.95,  s*0.45, -s*1.1,  s*0.65, -s*0.7);
      ctx.bezierCurveTo( s*0.9,  -s*0.1,   s*0.6,   s*0.7,  0,       s*1.2);
      ctx.closePath();
    }
  }

  // ── 夏：蛍 ────────────────────────────────────────
  class Firefly {
    constructor(initial) { this.init(initial); }
    init(initial = false) {
      this.x = Math.random() * canvas.width;
      this.y = initial ? Math.random() * canvas.height : canvas.height + 10;
      this.r = 2 + Math.random() * 2;
      this.vx = (Math.random() - 0.5) * 0.6;
      this.vy = -(0.2 + Math.random() * 0.4);
      this.phase  = Math.random() * Math.PI * 2;
      this.dphase = 0.02 + Math.random() * 0.02;
      this.max    = 0.5 + Math.random() * 0.4;
    }
    update() {
      this.phase += this.dphase; this.x += this.vx; this.y += this.vy;
      if (this.y < -10) this.init();
    }
    draw(bright) {
      const a = this.max * (0.5 + 0.5 * Math.sin(this.phase)) * bright;
      ctx.save(); ctx.globalAlpha = a;
      const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 5);
      g.addColorStop(0, '#ffffcc'); g.addColorStop(0.4, '#aaffaa'); g.addColorStop(1, 'transparent');
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 5, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill(); ctx.restore();
    }
  }

  // ── 秋：落ち葉 ────────────────────────────────────
  class Leaf {
    constructor(initial) { this.init(initial); }
    init(initial = false) {
      this.x = Math.random() * canvas.width;
      this.y = initial ? Math.random() * canvas.height : -20;
      this.sz = 5 + Math.random() * 8;
      this.vx = (Math.random() - 0.5) * 1.2; this.vy = 0.5 + Math.random() * 0.9;
      this.rot = Math.random() * Math.PI * 2; this.drot = (Math.random() - 0.5) * 0.04;
      this.swing = Math.random() * Math.PI * 2; this.dswing = 0.015 + Math.random() * 0.015;
      this.alpha = 0.55 + Math.random() * 0.35;
      const cs = ['#c8501a','#e07830','#b83010','#f09040','#a02808'];
      this.color = cs[Math.floor(Math.random() * cs.length)];
    }
    update() {
      this.swing += this.dswing;
      this.x += this.vx + Math.sin(this.swing) * 0.7; this.y += this.vy; this.rot += this.drot;
      if (this.y > canvas.height + 20) this.init();
    }
    draw(bright) {
      ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rot);
      ctx.globalAlpha = this.alpha * bright;
      ctx.beginPath(); ctx.ellipse(0, 0, this.sz * 0.45, this.sz, 0, 0, Math.PI * 2);
      ctx.fillStyle = this.color; ctx.fill(); ctx.restore();
    }
  }

  // ── 冬：雪 ───────────────────────────────────────
  class Snow {
    constructor(initial) { this.init(initial); }
    init(initial = false) {
      this.x = Math.random() * canvas.width; this.y = initial ? Math.random() * canvas.height : -10;
      this.r = 1.5 + Math.random() * 2.5;
      this.vx = (Math.random() - 0.5) * 0.4; this.vy = 0.4 + Math.random() * 0.8;
      this.swing = Math.random() * Math.PI * 2; this.alpha = 0.45 + Math.random() * 0.4;
    }
    update() {
      this.swing += 0.018;
      this.x += this.vx + Math.sin(this.swing) * 0.3; this.y += this.vy;
      if (this.y > canvas.height + 10) this.init();
    }
    draw(bright) {
      ctx.save(); ctx.globalAlpha = this.alpha * bright;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = '#e8f2ff'; ctx.fill(); ctx.restore();
    }
  }

  // ── 雨 ───────────────────────────────────────────
  class Rain {
    constructor(initial) { this.init(initial); }
    init(initial = false) {
      this.x = Math.random() * canvas.width; this.y = initial ? Math.random() * canvas.height : -30;
      this.len = 10 + Math.random() * 15; this.speed = 10 + Math.random() * 7;
      this.alpha = 0.08 + Math.random() * 0.1;
    }
    update() { this.x += 0.8; this.y += this.speed; if (this.y > canvas.height + 30) this.init(); }
    draw(bright) {
      ctx.save(); ctx.globalAlpha = this.alpha * bright;
      ctx.strokeStyle = '#90beff'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + this.len*0.08, this.y + this.len);
      ctx.stroke(); ctx.restore();
    }
  }

  // ── 初期化 ─────────────────────────────────────────
  function count(d) { return Math.min(Math.floor(canvas.width * canvas.height / d), 100); }

  function buildParticles() {
    const s = state.season;
    if      (s==='spring') { const n=count(7000);  particles=Array.from({length:n},(_,i)=>new Petal(i<n*0.6)); }
    else if (s==='summer') { const n=count(10000); particles=Array.from({length:n},(_,i)=>new Firefly(i<n*0.6)); }
    else if (s==='autumn') { const n=count(8000);  particles=Array.from({length:n},(_,i)=>new Leaf(i<n*0.6)); }
    else                   { const n=count(5000);  particles=Array.from({length:n},(_,i)=>new Snow(i<n*0.6)); }
  }

  function buildRain() {
    const n = Math.min(Math.floor(canvas.width/5), 180);
    rainDrops = Array.from({length:n},(_,i)=>new Rain(i<n*0.6));
  }

  function rebuildAll() { buildParticles(); if (state.isRaining) buildRain(); else rainDrops=[]; }

  // ── WeatherNews API（目黒区: 35.6418, 139.6975） ────
  async function fetchWeather() {
    if (state.weather !== 'auto') {
      state.isRaining = state.weather==='rain'||state.weather==='snow';
      state.isClear   = state.weather==='clear';
      if (state.isRaining) buildRain(); else rainDrops=[];
      updateBackground(); return;
    }
    try {
      const res  = await fetch(
        'https://weathernews.jp/onebox/35.6418/139.6975/pa=0'
      );
      const data = await res.json();
      // WeatherNews: data.ptype 0=なし 1=雨 2=雪 3=みぞれ
      const ptype = data?.ptype ?? 0;
      const wxid  = data?.wxid  ?? 1; // 1=晴れ系
      state.isRaining = ptype === 1 || ptype === 3;
      state.isClear   = ptype === 0 && wxid <= 3;
      if (state.isRaining) buildRain(); else rainDrops=[];
      console.log(`%c[heroWeather] WeatherNews 目黒区: ptype=${ptype} wxid=${wxid}`, 'color:#3ecfcf');
    } catch (e) {
      console.warn('[heroWeather] WeatherNews取得失敗、気象庁にフォールバック', e);
      // フォールバック: 気象庁API
      try {
        const res  = await fetch('https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json');
        const data = await res.json();
        const areas = data[0]?.timeSeries?.[0]?.areas ?? [];
        const area  = areas.find(a => a.area?.name === '東京地方') ?? areas[0];
        const code  = area?.weatherCodes?.[0] ?? '100';
        state.isRaining = /^[34]/.test(code);
        state.isClear   = /^1/.test(code);
        if (state.isRaining) buildRain(); else rainDrops=[];
      } catch {}
    }
    updateBackground();
  }

  // ── アニメーション ─────────────────────────────────
  function animate() {
    frame++;
    const { bright } = getTimeInfo();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => { p.update(); p.draw(bright); });
    if (state.isRaining) rainDrops.forEach(r => { r.update(); r.draw(bright); });

    // ノイズ（6フレームに1回更新）
    if (frame % 6 === 0) updateNoise();
    if (noisePat) {
      ctx.save();
      ctx.globalAlpha = 0.025 * bright;
      ctx.fillStyle = noisePat;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    drawScanlines(bright);
    drawGlitch(bright);
    if (Math.random() < 1/360) triggerGlitch();

    requestAnimationFrame(animate);
  }

  // ── コンソールAPI ──────────────────────────────────
  window.heroWeather = {
    setSeason(s)    { if(!['spring','summer','autumn','winter'].includes(s)){console.warn('spring/summer/autumn/winter');return;} state.season=s;rebuildAll();console.log(`%c[heroWeather] season→${s}`,'color:#3ecfcf'); },
    setWeather(w)   { if(!['auto','clear','rain','snow'].includes(w)){console.warn('auto/clear/rain/snow');return;} state.weather=w;fetchWeather();console.log(`%c[heroWeather] weather→${w}`,'color:#3ecfcf'); },
    setBrightness(b){ state.brightness=b;updateBackground();console.log(`%c[heroWeather] brightness→${b}`,'color:#3ecfcf'); },
    glitch()        { triggerGlitch(); },
    reset()         { const m=new Date().getMonth()+1; state.season=m>=3&&m<=5?'spring':m>=6&&m<=8?'summer':m>=9&&m<=11?'autumn':'winter'; state.weather='auto';state.brightness='auto';rebuildAll();fetchWeather();console.log('%c[heroWeather] reset','color:#3ecfcf'); },
    status()        { const {phase,bright}=getTimeInfo();console.table({season:state.season,weather:state.weather,isRaining:state.isRaining,isClear:state.isClear,timePhase:phase,brightness:bright.toFixed(2)}); },
    help()          { console.log('%c[heroWeather]\n  setSeason("spring"|"summer"|"autumn"|"winter")\n  setWeather("auto"|"clear"|"rain"|"snow")\n  setBrightness("auto"|0~1)\n  glitch() / reset() / status()','color:#3ecfcf'); },
  };

  rebuildAll();
  updateBackground();
  animate();
  fetchWeather();
  console.log('%c[heroWeather] ready — heroWeather.help()','color:#3ecfcf');
})();
