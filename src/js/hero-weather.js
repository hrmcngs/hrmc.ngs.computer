(() => {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // ── リサイズ ────────────────────────────────────────
  function resize() {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }
  resize();
  window.addEventListener('resize', () => { resize(); rebuildAll(); });

  // ── 状態（コンソールから上書き可能） ────────────────
  const month  = new Date().getMonth() + 1;
  const state  = {
    season   : month >= 3 && month <= 5 ? 'spring'
             : month >= 6 && month <= 8 ? 'summer'
             : month >= 9 && month <= 11 ? 'autumn'
             : 'winter',
    weather  : 'auto',   // 'auto' | 'clear' | 'rain' | 'snow'
    isRaining: false,
    brightness: 'auto',  // 'auto' | 0.0 ~ 1.0
  };

  let particles = [];
  let rainDrops = [];
  let raf       = null;

  // ── 時間帯ブライトネス（0=深夜暗い / 1=昼明るい） ──
  function getTimeBrightness() {
    if (state.brightness !== 'auto') return Math.max(0, Math.min(1, Number(state.brightness)));
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h >= 6 && h < 9)   return 0.35 + (h - 6) / 3 * 0.45;  // 夜明け→朝
    if (h >= 9 && h < 17)  return 0.80;                          // 昼
    if (h >= 17 && h < 20) return 0.80 - (h - 17) / 3 * 0.45; // 夕方
    if (h >= 20 && h < 24) return 0.35 - (h - 20) / 4 * 0.20; // 夜
    return 0.15;                                                  // 深夜
  }

  // ── 桜の花びら ─────────────────────────────────────
  class Petal {
    constructor(initial) { this.init(initial); }
    init(initial = false) {
      this.x = Math.random() * canvas.width;
      this.y = initial ? Math.random() * canvas.height : -20;
      this.w = 5 + Math.random() * 7; this.h = this.w * 0.55;
      this.vx = (Math.random() - 0.5) * 1.2;
      this.vy = 0.7 + Math.random() * 1.1;
      this.rot = Math.random() * Math.PI * 2;
      this.drot = (Math.random() - 0.5) * 0.045;
      this.swing = Math.random() * Math.PI * 2;
      this.dswing = 0.018 + Math.random() * 0.018;
      this.alpha = 0.45 + Math.random() * 0.4;
    }
    update() {
      this.swing += this.dswing;
      this.x += this.vx + Math.sin(this.swing) * 0.9;
      this.y += this.vy; this.rot += this.drot;
      if (this.y > canvas.height + 20) this.init();
    }
    draw(bright) {
      ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rot);
      ctx.globalAlpha = this.alpha * bright;
      const s = this.w;
      // 桜の花びら形（先端が尖りぎみで根元がくびれた丸み）
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo( s * 0.9, -s * 0.6,  s * 0.7,  s * 0.5,  0,  s * 0.9);
      ctx.bezierCurveTo(-s * 0.7,  s * 0.5, -s * 0.9, -s * 0.6,  0, -s);
      ctx.closePath();
      const g = ctx.createRadialGradient(0, -s * 0.2, 0, 0, 0, s);
      g.addColorStop(0, '#fff0f5');
      g.addColorStop(0.5, '#ffb8cc');
      g.addColorStop(1, '#f07090');
      ctx.fillStyle = g;
      ctx.fill();
      // 中央の薄い筋
      ctx.globalAlpha = this.alpha * bright * 0.25;
      ctx.strokeStyle = '#e060a0';
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.9);
      ctx.lineTo(0, s * 0.7);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── 夏：蛍 ────────────────────────────────────────
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
    }
    update() {
      this.phase += this.dphase; this.x += this.vx; this.y += this.vy;
      if (this.y < -10) this.init();
    }
    draw(bright) {
      const a = this.max * (0.5 + 0.5 * Math.sin(this.phase)) * bright;
      ctx.save(); ctx.globalAlpha = a;
      const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 4);
      g.addColorStop(0, '#ffffaa'); g.addColorStop(0.4, '#aaffaa'); g.addColorStop(1, 'transparent');
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 4, 0, Math.PI * 2);
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
      this.vx = (Math.random() - 0.5) * 1.4; this.vy = 0.5 + Math.random() * 1;
      this.rot = Math.random() * Math.PI * 2; this.drot = (Math.random() - 0.5) * 0.04;
      this.swing = Math.random() * Math.PI * 2; this.dswing = 0.015 + Math.random() * 0.015;
      this.alpha = 0.5 + Math.random() * 0.4;
      const cs = ['#c8501a','#e07830','#b83010','#f09040','#a02808'];
      this.color = cs[Math.floor(Math.random() * cs.length)];
    }
    update() {
      this.swing += this.dswing;
      this.x += this.vx + Math.sin(this.swing) * 0.8; this.y += this.vy; this.rot += this.drot;
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
      this.x = Math.random() * canvas.width;
      this.y = initial ? Math.random() * canvas.height : -10;
      this.r = 1.5 + Math.random() * 3;
      this.vx = (Math.random() - 0.5) * 0.5; this.vy = 0.4 + Math.random() * 0.9;
      this.swing = Math.random() * Math.PI * 2; this.alpha = 0.4 + Math.random() * 0.45;
    }
    update() {
      this.swing += 0.018;
      this.x += this.vx + Math.sin(this.swing) * 0.3; this.y += this.vy;
      if (this.y > canvas.height + 10) this.init();
    }
    draw(bright) {
      ctx.save(); ctx.globalAlpha = this.alpha * bright;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = '#e8f0ff'; ctx.fill(); ctx.restore();
    }
  }

  // ── 雨粒 ──────────────────────────────────────────
  class Rain {
    constructor(initial) { this.init(initial); }
    init(initial = false) {
      this.x = Math.random() * canvas.width; this.y = initial ? Math.random() * canvas.height : -30;
      this.len = 12 + Math.random() * 18; this.speed = 10 + Math.random() * 7;
      this.alpha = 0.1 + Math.random() * 0.15;
    }
    update() { this.x += 0.8; this.y += this.speed; if (this.y > canvas.height + 30) this.init(); }
    draw(bright) {
      ctx.save(); ctx.globalAlpha = this.alpha * bright;
      ctx.strokeStyle = '#90beff'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + this.len * 0.08, this.y + this.len);
      ctx.stroke(); ctx.restore();
    }
  }

  // ── ノイズパターン（春用） ─────────────────────────
  let noisePat = null;
  function buildNoise() {
    const nc = document.createElement('canvas'); nc.width = 256; nc.height = 256;
    const nctx = nc.getContext('2d'); const img = nctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i+1] = img.data[i+2] = v; img.data[i+3] = Math.random() * 15;
    }
    nctx.putImageData(img, 0, 0);
    noisePat = ctx.createPattern(nc, 'repeat');
  }

  // ── 初期化 ─────────────────────────────────────────
  function count(density) { return Math.min(Math.floor(canvas.width * canvas.height / density), 120); }

  function buildParticles() {
    const s = state.season;
    if      (s === 'spring') { const n = count(7000);  particles = Array.from({length:n}, (_,i)=>new Petal(i<n*0.6));   buildNoise(); }
    else if (s === 'summer') { const n = count(10000); particles = Array.from({length:n}, (_,i)=>new Firefly(i<n*0.6)); noisePat=null; }
    else if (s === 'autumn') { const n = count(8000);  particles = Array.from({length:n}, (_,i)=>new Leaf(i<n*0.6));    noisePat=null; }
    else                     { const n = count(5000);  particles = Array.from({length:n}, (_,i)=>new Snow(i<n*0.6));    noisePat=null; }
  }

  function buildRain() {
    const n = Math.min(Math.floor(canvas.width / 5), 200);
    rainDrops = Array.from({length:n}, (_,i)=>new Rain(i<n*0.6));
  }

  function rebuildAll() { buildParticles(); if (state.isRaining) buildRain(); else rainDrops=[]; }

  // ── 気象庁API ──────────────────────────────────────
  async function fetchWeather() {
    if (state.weather !== 'auto') {
      state.isRaining = state.weather === 'rain' || state.weather === 'snow';
      if (state.isRaining) buildRain(); else rainDrops = [];
      return;
    }
    try {
      const res  = await fetch('https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json');
      const data = await res.json();
      const code = data[0]?.timeSeries?.[0]?.areas?.[0]?.weatherCodes?.[0] ?? '100';
      state.isRaining = /^[34]/.test(code);
      if (state.isRaining) buildRain(); else rainDrops = [];
    } catch { /* 取得失敗は無視 */ }
  }

  // ── アニメーション ─────────────────────────────────
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bright = getTimeBrightness();
    particles.forEach(p => { p.update(); p.draw(bright); });
    if (state.isRaining) rainDrops.forEach(r => { r.update(); r.draw(bright); });
    if (noisePat) {
      ctx.save(); ctx.globalAlpha = 0.035 * bright;
      ctx.fillStyle = noisePat; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    raf = requestAnimationFrame(animate);
  }

  // ── コンソールAPI ──────────────────────────────────
  window.heroWeather = {
    /**
     * 季節を変更: 'spring' | 'summer' | 'autumn' | 'winter'
     * heroWeather.setSeason('spring')
     */
    setSeason(s) {
      const valid = ['spring','summer','autumn','winter'];
      if (!valid.includes(s)) { console.warn(`有効な値: ${valid.join(' / ')}`); return; }
      state.season = s; rebuildAll();
      console.log(`%c[heroWeather] season → ${s}`, 'color:#3ecfcf');
    },

    /**
     * 天気を変更: 'auto' | 'clear' | 'rain' | 'snow'
     * heroWeather.setWeather('rain')
     */
    setWeather(w) {
      const valid = ['auto','clear','rain','snow'];
      if (!valid.includes(w)) { console.warn(`有効な値: ${valid.join(' / ')}`); return; }
      state.weather = w;
      fetchWeather();
      console.log(`%c[heroWeather] weather → ${w}`, 'color:#3ecfcf');
    },

    /**
     * 明るさを変更: 'auto' | 0.0 ~ 1.0
     * heroWeather.setBrightness(0.2)   // 夜っぽく
     * heroWeather.setBrightness('auto') // 時間帯自動
     */
    setBrightness(b) {
      state.brightness = b;
      console.log(`%c[heroWeather] brightness → ${b}`, 'color:#3ecfcf');
    },

    /**
     * すべてリセット（自動判定に戻す）
     * heroWeather.reset()
     */
    reset() {
      const m = new Date().getMonth() + 1;
      state.season      = m>=3&&m<=5?'spring':m>=6&&m<=8?'summer':m>=9&&m<=11?'autumn':'winter';
      state.weather     = 'auto';
      state.brightness  = 'auto';
      rebuildAll();
      fetchWeather();
      console.log('%c[heroWeather] reset → auto', 'color:#3ecfcf');
    },

    /** 現在の状態を表示 */
    status() {
      console.log('%c[heroWeather] status', 'color:#3ecfcf; font-weight:bold');
      console.table({ season: state.season, weather: state.weather, isRaining: state.isRaining, brightness: state.brightness, computedBrightness: getTimeBrightness().toFixed(2) });
    },

    /** ヘルプ */
    help() {
      console.log([
        '%c[heroWeather] コマンド一覧',
        '  heroWeather.setSeason("spring"|"summer"|"autumn"|"winter")',
        '  heroWeather.setWeather("auto"|"clear"|"rain"|"snow")',
        '  heroWeather.setBrightness("auto" | 0.0~1.0)',
        '  heroWeather.reset()   // 全部リセット',
        '  heroWeather.status()  // 現在の状態確認',
      ].join('\n'), 'color:#3ecfcf');
    },
  };

  // ── 起動 ──────────────────────────────────────────
  rebuildAll();
  animate();
  fetchWeather();

  // ヘルプをコンソールに表示
  console.log('%c[heroWeather] loaded — heroWeather.help() でコマンド一覧', 'color:#3ecfcf');
})();
