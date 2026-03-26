(() => {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const overlay = canvas.closest('.hero-bg')?.querySelector('.hero-overlay');

  const PETAL_SIZES = [8, 11, 14, 17];
  let petalCache = null;

  function resize() {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    petalCache = null;
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
    else if (h >= 17 && h < 20) { phase='dusk';     bright = 0.9-(h-17)/3*0.6; }
    else if (h >= 20 && h < 23) { phase='night';    bright = 0.3-(h-20)/3*0.15; }
    else                         { phase='midnight'; bright = 0.15; }
    if (state.brightness !== 'auto') bright = Math.max(0, Math.min(1, Number(state.brightness)));
    return { phase, bright };
  }

  // ── 背景（ホラゲー風） ──────────────────────────────
  function updateBackground() {
    if (!overlay) return;
    const { phase } = getTimeInfo();
    const isDayClear = phase === 'day' && state.isClear;
    const configs = {
      midnight: { grad: 'linear-gradient(180deg,#000000 0%,#020008 60%,#050005 100%)', opacity: 0.96 },
      dawn    : { grad: 'linear-gradient(180deg,#0a0005 0%,#1a0510 50%,#0d0008 100%)', opacity: 0.92 },
      day     : isDayClear
                ? { grad: 'linear-gradient(180deg,#060a14 0%,#0a1020 100%)', opacity: 0.62 }
                : { grad: 'linear-gradient(180deg,#020205 0%,#05050a 100%)', opacity: 0.90 },
      dusk    : { grad: 'linear-gradient(180deg,#0a0005 0%,#1a0208 60%,#050010 100%)', opacity: 0.92 },
      night   : { grad: 'linear-gradient(180deg,#000000 0%,#030008 50%,#020005 100%)', opacity: 0.94 },
    };
    const cfg = configs[phase] ?? configs.night;
    overlay.style.transition = 'background 6s ease, opacity 6s ease';
    overlay.style.background = cfg.grad;
    overlay.style.opacity    = cfg.opacity;
  }
  setInterval(updateBackground, 60000);

  // ── ホラゲー風CSS（フィルム粒子+歪みスキャンライン） ─
  function injectHorrorStyle() {
    if (document.getElementById('horror-style')) return;
    const style = document.createElement('style');
    style.id = 'horror-style';
    style.textContent = `
      .hero {
        filter: contrast(1.08) brightness(0.92) saturate(0.85);
      }
      .hero-bg {
        position: relative;
      }
      /* 荒れたスキャンライン：不均一な間隔 */
      .hero-bg::before {
        content: '';
        position: absolute; inset: 0; z-index: 2; pointer-events: none;
        background:
          repeating-linear-gradient(
            0deg,
            transparent 0px,
            transparent 2px,
            rgba(0,0,0,0.10) 2px,
            rgba(0,0,0,0.10) 3px,
            transparent 3px,
            transparent 7px,
            rgba(0,0,0,0.06) 7px,
            rgba(0,0,0,0.06) 8px
          );
        mix-blend-mode: multiply;
      }
      /* ビネット（四隅を暗く） */
      .hero-bg::after {
        content: '';
        position: absolute; inset: 0; z-index: 2; pointer-events: none;
        background: radial-gradient(
          ellipse at 50% 50%,
          transparent 40%,
          rgba(0,0,0,0.55) 80%,
          rgba(0,0,0,0.85) 100%
        );
      }
      /* テキストをわずかに滲ませる */
      .hero-content {
        filter: drop-shadow(0 0 8px rgba(200,180,255,0.12));
      }
    `;
    document.head.appendChild(style);
  }
  injectHorrorStyle();

  function buildPetalCache() {
    petalCache = PETAL_SIZES.map(s => {
      const pad = 6;
      const oc  = document.createElement('canvas');
      oc.width  = (s + pad) * 2;
      oc.height = (s * 1.3 + pad) * 2;
      const oc_ctx = oc.getContext('2d');
      oc_ctx.translate(oc.width / 2, oc.height / 2);

      // ベース花びら
      oc_ctx.beginPath();
      petalPath(oc_ctx, s);
      const g = oc_ctx.createRadialGradient(0, -s*0.2, 0, 0, s*0.4, s*1.3);
      g.addColorStop(0,   '#ffe0ea');
      g.addColorStop(0.5, '#f8a0b8');
      g.addColorStop(1,   '#e06080');
      oc_ctx.fillStyle = g;
      oc_ctx.fill();

      // ノイズ粒をキャッシュに焼き込む（静的）
      oc_ctx.beginPath(); petalPath(oc_ctx, s); oc_ctx.clip();
      for (let i = 0; i < 18; i++) {
        const px = (Math.random() - 0.5) * s * 1.8;
        const py = (Math.random() - 0.8) * s * 2.4;
        const pw = 0.8 + Math.random() * 1.4;
        const v  = Math.random();
        oc_ctx.globalAlpha = 0.35 + Math.random() * 0.45;
        oc_ctx.fillStyle   = v < 0.33 ? 'rgba(255,255,255,0.9)'
                           : v < 0.66 ? 'rgba(255,180,200,0.9)'
                           :             'rgba(180,60,90,0.8)';
        oc_ctx.fillRect(px, py, pw, pw);
      }
      // スキャンライン
      oc_ctx.globalAlpha = 0.12;
      oc_ctx.fillStyle   = '#000';
      for (let ly = -s*1.4; ly < s*1.4; ly += 3) {
        oc_ctx.fillRect(-s, ly, s*2, 0.7);
      }
      return { canvas: oc, s };
    });
  }

  function getNearestCache(s) {
    if (!petalCache) buildPetalCache();
    return petalCache.reduce((a, b) => Math.abs(a.s - s) < Math.abs(b.s - s) ? a : b);
  }

  function petalPath(c, s) {
    c.moveTo(0, s * 1.2);
    c.bezierCurveTo(-s*0.6,  s*0.7,  -s*0.9, -s*0.1, -s*0.65, -s*0.7);
    c.bezierCurveTo(-s*0.45,-s*1.1, -s*0.12, -s*0.95,  0,      -s*0.6);
    c.bezierCurveTo( s*0.12,-s*0.95,  s*0.45, -s*1.1,  s*0.65, -s*0.7);
    c.bezierCurveTo( s*0.9, -s*0.1,   s*0.6,   s*0.7,  0,       s*1.2);
    c.closePath();
  }

  // ── ノイズオーバーレイ（背景のみ・低頻度更新） ──────
  const noiseC   = document.createElement('canvas');
  noiseC.width   = 128; noiseC.height = 128; // 小さくする
  const nctx     = noiseC.getContext('2d');
  let noisePat   = null;

  function updateNoise() {
    const img = nctx.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = img.data[i+1] = img.data[i+2] = Math.random() * 255;
      img.data[i+3] = Math.random() < 0.02 ? 35 + Math.random()*30 : 0;
    }
    nctx.putImageData(img, 0, 0);
    noisePat = ctx.createPattern(noiseC, 'repeat');
  }
  updateNoise();

  // ── グリッチ（ホラゲー風） ────────────────────────────
  let glitchLines  = [];
  let glitchActive = false;

  function triggerGlitch() {
    glitchActive = true;
    const count = 3 + Math.floor(Math.random() * 5);
    glitchLines = Array.from({ length: count }, () => ({
      y   : Math.random() * canvas.height,
      h   : 0.5 + Math.random() * 5,
      dx  : (Math.random() - 0.5) * 40,
      life: 2 + Math.floor(Math.random() * 5),
      f   : 0,
      // 色：白いノイズ・赤・紫・黒帯をランダムに
      type: Math.floor(Math.random() * 4),
    }));
    const dur = 80 + Math.random() * 180;
    setTimeout(() => { glitchActive = false; glitchLines = []; }, dur);
    // 連続グリッチ（たまに）
    if (Math.random() < 0.3) {
      setTimeout(triggerGlitch, dur + 30 + Math.random() * 100);
    }
  }

  function drawGlitch(bright) {
    if (!glitchActive) return;
    ctx.save();
    glitchLines.forEach(g => {
      g.f++;
      const a = Math.max(0, 1 - g.f / g.life);
      switch (g.type) {
        case 0: // 白ノイズ帯
          ctx.globalAlpha = a * 0.35 * bright;
          ctx.fillStyle = `rgba(255,255,255,0.8)`;
          ctx.fillRect(0, g.y, canvas.width, g.h);
          break;
        case 1: // 赤ずれ
          ctx.globalAlpha = a * 0.25 * bright;
          ctx.fillStyle = 'rgba(180,0,0,0.6)';
          ctx.fillRect(g.dx, g.y, canvas.width, g.h);
          ctx.fillStyle = 'rgba(0,0,0,0.8)';
          ctx.fillRect(-g.dx, g.y + g.h, canvas.width, g.h * 0.5);
          break;
        case 2: // 黒帯（信号切れ）
          ctx.globalAlpha = a * 0.9;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, g.y, canvas.width, g.h * 2);
          break;
        case 3: // 紫・緑ずれ
          ctx.globalAlpha = a * 0.20 * bright;
          ctx.fillStyle = 'rgba(120,0,180,0.5)';
          ctx.fillRect(g.dx + 5, g.y, canvas.width, g.h);
          ctx.fillStyle = 'rgba(0,180,80,0.4)';
          ctx.fillRect(g.dx - 5, g.y, canvas.width, g.h);
          break;
      }
    });
    ctx.restore();
  }

  // ── 桜の花びら ─────────────────────────────────────
  class Petal {
    constructor(initial) { this.init(initial); }
    init(initial = false) {
      this.x      = Math.random() * canvas.width;
      this.y      = initial ? Math.random() * canvas.height : -20;
      this.s      = PETAL_SIZES[Math.floor(Math.random() * PETAL_SIZES.length)];
      this.vx     = (Math.random() - 0.5) * 1.0;
      this.vy     = 3.5 + Math.random() * 4.0;
      this.rot    = Math.random() * Math.PI * 2;
      this.drot   = (Math.random() - 0.5) * 0.04;
      this.swing  = Math.random() * Math.PI * 2;
      this.dswing = 0.016 + Math.random() * 0.016;
      this.alpha  = 0.55 + Math.random() * 0.35;
      // VHSラインは確率で持つ（毎フレーム判定不要）
      this.vhsLine = Math.random() < 0.12;
    }
    update() {
      this.swing += this.dswing;
      this.x += this.vx + Math.sin(this.swing) * 0.8;
      this.y += this.vy;
      this.rot += this.drot;
      if (this.y > canvas.height + 20) this.init();
    }
    draw(bright) {
      const cached = getNearestCache(this.s);
      const cw = cached.canvas.width;
      const ch = cached.canvas.height;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.globalAlpha = this.alpha * bright;
      // オフスクリーンキャッシュをそのままdrawImage
      ctx.drawImage(cached.canvas, -cw/2, -ch/2);
      // VHSライン（持っている花びらだけ描画）
      if (this.vhsLine) {
        ctx.globalAlpha = 0.25 * bright;
        ctx.fillStyle   = 'rgba(255,210,225,0.8)';
        ctx.fillRect(-this.s, 0, this.s*2, 1);
      }
      ctx.restore();
    }
  }

  // ── 夏：蛍 ────────────────────────────────────────
  class Firefly {
    constructor(initial) { this.init(initial); }
    init(initial = false) {
      this.x=Math.random()*canvas.width; this.y=initial?Math.random()*canvas.height:canvas.height+10;
      this.r=2+Math.random()*2; this.vx=(Math.random()-0.5)*0.6; this.vy=-(0.2+Math.random()*0.4);
      this.phase=Math.random()*Math.PI*2; this.dphase=0.02+Math.random()*0.02; this.max=0.5+Math.random()*0.4;
    }
    update(){this.phase+=this.dphase;this.x+=this.vx;this.y+=this.vy;if(this.y<-10)this.init();}
    draw(bright){
      const a=this.max*(0.5+0.5*Math.sin(this.phase))*bright;
      ctx.save();ctx.globalAlpha=a;
      const g=ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,this.r*5);
      g.addColorStop(0,'#ffffcc');g.addColorStop(0.4,'#aaffaa');g.addColorStop(1,'transparent');
      ctx.beginPath();ctx.arc(this.x,this.y,this.r*5,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();ctx.restore();
    }
  }

  // ── 秋：落ち葉 ────────────────────────────────────
  class Leaf {
    constructor(initial) { this.init(initial); }
    init(initial=false){
      this.x=Math.random()*canvas.width;this.y=initial?Math.random()*canvas.height:-20;
      this.sz=5+Math.random()*8;this.vx=(Math.random()-0.5)*1.2;this.vy=0.5+Math.random()*0.9;
      this.rot=Math.random()*Math.PI*2;this.drot=(Math.random()-0.5)*0.04;
      this.swing=Math.random()*Math.PI*2;this.dswing=0.015+Math.random()*0.015;
      this.alpha=0.55+Math.random()*0.35;
      const cs=['#c8501a','#e07830','#b83010','#f09040','#a02808'];
      this.color=cs[Math.floor(Math.random()*cs.length)];
    }
    update(){this.swing+=this.dswing;this.x+=this.vx+Math.sin(this.swing)*0.7;this.y+=this.vy;this.rot+=this.drot;if(this.y>canvas.height+20)this.init();}
    draw(bright){ctx.save();ctx.translate(this.x,this.y);ctx.rotate(this.rot);ctx.globalAlpha=this.alpha*bright;ctx.beginPath();ctx.ellipse(0,0,this.sz*0.45,this.sz,0,0,Math.PI*2);ctx.fillStyle=this.color;ctx.fill();ctx.restore();}
  }

  // ── 冬：雪 ───────────────────────────────────────
  class Snow {
    constructor(initial){this.init(initial);}
    init(initial=false){
      this.x=Math.random()*canvas.width;this.y=initial?Math.random()*canvas.height:-10;
      this.r=1.5+Math.random()*2.5;this.vx=(Math.random()-0.5)*0.4;this.vy=0.4+Math.random()*0.8;
      this.swing=Math.random()*Math.PI*2;this.alpha=0.45+Math.random()*0.4;
    }
    update(){this.swing+=0.018;this.x+=this.vx+Math.sin(this.swing)*0.3;this.y+=this.vy;if(this.y>canvas.height+10)this.init();}
    draw(bright){ctx.save();ctx.globalAlpha=this.alpha*bright;ctx.beginPath();ctx.arc(this.x,this.y,this.r,0,Math.PI*2);ctx.fillStyle='#e8f2ff';ctx.fill();ctx.restore();}
  }

  // ── 雨（ホログラム） ─────────────────────────────
  class Rain {
    constructor(initial){this.init(initial);}
    init(initial=false){
      this.x=Math.random()*canvas.width;this.y=initial?Math.random()*canvas.height:-30;
      this.len=10+Math.random()*18;this.speed=9+Math.random()*7;
      this.alpha=0.12+Math.random()*0.15;this.hue=Math.random()*360;
    }
    update(){this.x+=0.8;this.y+=this.speed;this.hue=(this.hue+3)%360;if(this.y>canvas.height+30)this.init();}
    draw(bright){
      ctx.save();
      const grad=ctx.createLinearGradient(this.x,this.y,this.x+this.len*0.08,this.y+this.len);
      grad.addColorStop(0,  `hsla(${this.hue},100%,80%,0)`);
      grad.addColorStop(0.3,`hsla(${this.hue},100%,80%,${this.alpha*bright})`);
      grad.addColorStop(0.7,`hsla(${(this.hue+60)%360},100%,85%,${this.alpha*bright})`);
      grad.addColorStop(1,  `hsla(${(this.hue+120)%360},100%,90%,0)`);
      ctx.strokeStyle=grad;ctx.lineWidth=0.9;
      ctx.shadowColor=`hsl(${this.hue},100%,70%)`;ctx.shadowBlur=3;
      ctx.beginPath();ctx.moveTo(this.x,this.y);ctx.lineTo(this.x+this.len*0.08,this.y+this.len);
      ctx.stroke();ctx.restore();
    }
  }

  // ── 初期化 ─────────────────────────────────────────
  function count(d) { return Math.min(Math.floor(canvas.width * canvas.height / d), 80); }

  function buildParticles() {
    petalCache = null; // 季節変更時にキャッシュ再生成
    const s = state.season;
    if      (s==='spring'){const n=count(9000); particles=Array.from({length:n},(_,i)=>new Petal(i<n*0.6));}
    else if (s==='summer'){const n=count(12000);particles=Array.from({length:n},(_,i)=>new Firefly(i<n*0.6));}
    else if (s==='autumn'){const n=count(10000);particles=Array.from({length:n},(_,i)=>new Leaf(i<n*0.6));}
    else                  {const n=count(7000); particles=Array.from({length:n},(_,i)=>new Snow(i<n*0.6));}
  }

  function buildRain(){
    const n=Math.min(Math.floor(canvas.width/6),150);
    rainDrops=Array.from({length:n},(_,i)=>new Rain(i<n*0.6));
  }

  function rebuildAll(){buildParticles();if(state.isRaining)buildRain();else rainDrops=[];}

  // ── 気象庁API（目黒区） ────────────────────────────
  async function fetchWeather() {
    if (state.weather !== 'auto') {
      state.isRaining = state.weather==='rain'||state.weather==='snow';
      state.isClear   = state.weather==='clear';
      if(state.isRaining)buildRain();else rainDrops=[];
      updateBackground();return;
    }
    try {
      const res  = await fetch('https://weathernews.jp/onebox/35.6418/139.6975/pa=0');
      const data = await res.json();
      const ptype = data?.ptype ?? 0;
      const wxid  = data?.wxid  ?? 1;
      state.isRaining = ptype===1||ptype===3;
      state.isClear   = ptype===0&&wxid<=3;
      if(state.isRaining)buildRain();else rainDrops=[];
      console.log(`%c[heroWeather] 目黒区: ptype=${ptype} wxid=${wxid}`,'color:#3ecfcf');
    } catch {
      try {
        const res  = await fetch('https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json');
        const data = await res.json();
        const areas=data[0]?.timeSeries?.[0]?.areas??[];
        const area =areas.find(a=>a.area?.name==='東京地方')??areas[0];
        const code =area?.weatherCodes?.[0]??'100';
        state.isRaining=/^[34]/.test(code);state.isClear=/^1/.test(code);
        if(state.isRaining)buildRain();else rainDrops=[];
      } catch {}
    }
    updateBackground();
  }

  // ── アニメーション ─────────────────────────────────
  function animate(now = 0) {
    requestAnimationFrame(animate);
    frame++;
    const { bright } = getTimeInfo();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => { p.update(); p.draw(bright); });
    if (state.isRaining) rainDrops.forEach(r => { r.update(); r.draw(bright); });

    if (frame % 24 === 0) updateNoise();
    if (noisePat) {
      ctx.save();
      ctx.globalAlpha = 0.02 * bright;
      ctx.fillStyle   = noisePat;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    drawGlitch(bright);
    if (Math.random() < 1/72) triggerGlitch();
  }

  // ── コンソールAPI ──────────────────────────────────
  window.heroWeather = {
    setSeason(s)    { if(!['spring','summer','autumn','winter'].includes(s)){console.warn('spring/summer/autumn/winter');return;} state.season=s;rebuildAll();console.log(`%c[heroWeather] season→${s}`,'color:#3ecfcf'); },
    setWeather(w)   { if(!['auto','clear','rain','snow'].includes(w)){console.warn('auto/clear/rain/snow');return;} state.weather=w;fetchWeather();console.log(`%c[heroWeather] weather→${w}`,'color:#3ecfcf'); },
    setBrightness(b){ state.brightness=b;updateBackground();console.log(`%c[heroWeather] brightness→${b}`,'color:#3ecfcf'); },
    glitch()        { triggerGlitch(); },
    reset()         { const m=new Date().getMonth()+1;state.season=m>=3&&m<=5?'spring':m>=6&&m<=8?'summer':m>=9&&m<=11?'autumn':'winter';state.weather='auto';state.brightness='auto';rebuildAll();fetchWeather();console.log('%c[heroWeather] reset','color:#3ecfcf'); },
    status()        { const {phase,bright}=getTimeInfo();console.table({season:state.season,weather:state.weather,isRaining:state.isRaining,isClear:state.isClear,timePhase:phase,brightness:bright.toFixed(2)}); },
    help()          { console.log('%c[heroWeather]\n  setSeason("spring"|"summer"|"autumn"|"winter")\n  setWeather("auto"|"clear"|"rain"|"snow")\n  setBrightness("auto"|0~1)\n  glitch() / reset() / status()','color:#3ecfcf'); },
  };

  rebuildAll();
  updateBackground();
  animate();
  fetchWeather();
  console.log('%c[heroWeather] ready — heroWeather.help()','color:#3ecfcf');
})();
