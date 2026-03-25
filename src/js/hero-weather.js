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
  window.addEventListener('resize', () => { resize(); initParticles(); });

  // ── 季節判定 ────────────────────────────────────────
  const month  = new Date().getMonth() + 1; // 1-12
  const season = month >= 3 && month <= 5 ? 'spring'
               : month >= 6 && month <= 8 ? 'summer'
               : month >= 9 && month <= 11 ? 'autumn'
               : 'winter';

  let isRaining  = false;
  let particles  = [];
  let rainDrops  = [];

  // ── 気象庁API（東京）で雨判定 ──────────────────────
  async function fetchWeather() {
    try {
      const res  = await fetch('https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json');
      const data = await res.json();
      const code = (data[0]?.timeSeries?.[0]?.areas?.[0]?.weatherCodes?.[0]) ?? '100';
      isRaining  = /^[34]/.test(code); // 3xx=雨 4xx=雪
      if (isRaining) initRain();
    } catch { /* 取得失敗時は何もしない */ }
  }

  // ── 桜の花びら ─────────────────────────────────────
  class Petal {
    constructor(initial = false) { this.init(initial); }
    init(initial = false) {
      this.x        = Math.random() * canvas.width;
      this.y        = initial ? Math.random() * canvas.height : -20;
      this.w        = 5 + Math.random() * 7;
      this.h        = this.w * 0.55;
      this.vx       = (Math.random() - 0.5) * 1.2;
      this.vy       = 0.7 + Math.random() * 1.1;
      this.rot      = Math.random() * Math.PI * 2;
      this.drot     = (Math.random() - 0.5) * 0.045;
      this.swing    = Math.random() * Math.PI * 2;
      this.dswing   = 0.018 + Math.random() * 0.018;
      this.alpha    = 0.45 + Math.random() * 0.4;
    }
    update() {
      this.swing += this.dswing;
      this.x     += this.vx + Math.sin(this.swing) * 0.9;
      this.y     += this.vy;
      this.rot   += this.drot;
      if (this.y > canvas.height + 20) this.init();
    }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.globalAlpha = this.alpha;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, this.w);
      g.addColorStop(0, '#ffe0ea');
      g.addColorStop(1, '#f9a8c4');
      ctx.beginPath();
      ctx.ellipse(0, 0, this.w, this.h, 0, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    }
  }

  // ── 夏：蛍 ────────────────────────────────────────
  class Firefly {
    constructor(initial = false) { this.init(initial); }
    init(initial = false) {
      this.x      = Math.random() * canvas.width;
      this.y      = initial ? Math.random() * canvas.height : canvas.height + 10;
      this.r      = 2 + Math.random() * 2.5;
      this.vx     = (Math.random() - 0.5) * 0.7;
      this.vy     = -(0.25 + Math.random() * 0.5);
      this.phase  = Math.random() * Math.PI * 2;
      this.dphase = 0.018 + Math.random() * 0.025;
      this.max    = 0.5 + Math.random() * 0.45;
    }
    update() {
      this.phase += this.dphase;
      this.x     += this.vx;
      this.y     += this.vy;
      if (this.y < -10) this.init();
    }
    draw() {
      const a = this.max * (0.5 + 0.5 * Math.sin(this.phase));
      ctx.save();
      ctx.globalAlpha = a;
      const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 4);
      g.addColorStop(0, '#ffffaa');
      g.addColorStop(0.4, '#aaffaa');
      g.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 4, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    }
  }

  // ── 秋：落ち葉 ────────────────────────────────────
  class Leaf {
    constructor(initial = false) { this.init(initial); }
    init(initial = false) {
      this.x      = Math.random() * canvas.width;
      this.y      = initial ? Math.random() * canvas.height : -20;
      this.sz     = 5 + Math.random() * 8;
      this.vx     = (Math.random() - 0.5) * 1.4;
      this.vy     = 0.5 + Math.random() * 1;
      this.rot    = Math.random() * Math.PI * 2;
      this.drot   = (Math.random() - 0.5) * 0.04;
      this.swing  = Math.random() * Math.PI * 2;
      this.dswing = 0.015 + Math.random() * 0.015;
      this.alpha  = 0.5 + Math.random() * 0.4;
      const cs    = ['#c8501a','#e07830','#b83010','#f09040','#a02808'];
      this.color  = cs[Math.floor(Math.random() * cs.length)];
    }
    update() {
      this.swing += this.dswing;
      this.x     += this.vx + Math.sin(this.swing) * 0.8;
      this.y     += this.vy;
      this.rot   += this.drot;
      if (this.y > canvas.height + 20) this.init();
    }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.globalAlpha = this.alpha;
      ctx.beginPath();
      ctx.ellipse(0, 0, this.sz * 0.45, this.sz, 0, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
      ctx.restore();
    }
  }

  // ── 冬：雪 ───────────────────────────────────────
  class Snow {
    constructor(initial = false) { this.init(initial); }
    init(initial = false) {
      this.x     = Math.random() * canvas.width;
      this.y     = initial ? Math.random() * canvas.height : -10;
      this.r     = 1.5 + Math.random() * 3;
      this.vx    = (Math.random() - 0.5) * 0.5;
      this.vy    = 0.4 + Math.random() * 0.9;
      this.swing = Math.random() * Math.PI * 2;
      this.alpha = 0.4 + Math.random() * 0.45;
    }
    update() {
      this.swing += 0.018;
      this.x     += this.vx + Math.sin(this.swing) * 0.3;
      this.y     += this.vy;
      if (this.y > canvas.height + 10) this.init();
    }
    draw() {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = '#e8f0ff';
      ctx.fill();
      ctx.restore();
    }
  }

  // ── 雨粒 ──────────────────────────────────────────
  class Rain {
    constructor(initial = false) { this.init(initial); }
    init(initial = false) {
      this.x     = Math.random() * canvas.width;
      this.y     = initial ? Math.random() * canvas.height : -30;
      this.len   = 12 + Math.random() * 18;
      this.speed = 10 + Math.random() * 7;
      this.alpha = 0.1 + Math.random() * 0.15;
    }
    update() {
      this.x += 0.8;
      this.y += this.speed;
      if (this.y > canvas.height + 30) this.init();
    }
    draw() {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.strokeStyle = '#90beff';
      ctx.lineWidth   = 0.8;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + this.len * 0.08, this.y + this.len);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── パーティクル初期化 ────────────────────────────
  function count(density) {
    return Math.min(Math.floor(canvas.width * canvas.height / density), 120);
  }

  function initParticles() {
    if      (season === 'spring') particles = Array.from({ length: count(7000)  }, (_, i) => new Petal(i < count(7000) * 0.6));
    else if (season === 'summer') particles = Array.from({ length: count(10000) }, (_, i) => new Firefly(i < count(10000) * 0.6));
    else if (season === 'autumn') particles = Array.from({ length: count(8000)  }, (_, i) => new Leaf(i < count(8000) * 0.6));
    else                          particles = Array.from({ length: count(5000)  }, (_, i) => new Snow(i < count(5000) * 0.6));
  }

  function initRain() {
    const n = Math.min(Math.floor(canvas.width / 5), 200);
    rainDrops = Array.from({ length: n }, (_, i) => new Rain(i < n * 0.6));
  }

  // ── ノイズオーバーレイ（春のみ） ──────────────────
  let noisePat = null;
  if (season === 'spring') {
    const nc  = document.createElement('canvas');
    nc.width  = 256; nc.height = 256;
    const nctx = nc.getContext('2d');
    const img  = nctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i+1] = img.data[i+2] = v;
      img.data[i+3] = Math.random() * 15;
    }
    nctx.putImageData(img, 0, 0);
    noisePat = ctx.createPattern(nc, 'repeat');
  }

  // ── アニメーションループ ──────────────────────────
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => { p.update(); p.draw(); });

    if (isRaining) rainDrops.forEach(r => { r.update(); r.draw(); });

    if (noisePat) {
      ctx.save();
      ctx.globalAlpha = 0.035;
      ctx.fillStyle   = noisePat;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    requestAnimationFrame(animate);
  }

  initParticles();
  animate();
  fetchWeather();
})();
