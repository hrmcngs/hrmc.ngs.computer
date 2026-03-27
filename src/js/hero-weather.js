(() => {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.style.zIndex = '10';

  // ── 設定（hero-weather.json から読み込み） ──────────
  let cfg = {};

  function resize() {
    const hero = document.querySelector('.hero');
    canvas.width  = hero ? hero.offsetWidth  : window.innerWidth;
    canvas.height = hero ? hero.offsetHeight : window.innerHeight;
  }

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

  function getBright() {
    if (state.brightness !== 'auto') return Math.max(0, Math.min(1, Number(state.brightness)));
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h >= 8  && h < 17) return 1.0;
    if (h >= 5  && h < 8 ) return 0.4 + (h-5)/3*0.6;
    if (h >= 17 && h < 20) return 1.0 - (h-17)/3*0.7;
    if (h >= 20 && h < 23) return 0.3 - (h-20)/3*0.1;
    return 0.2;
  }

  // ── 桜の花びら ─────────────────────────────────────
  class Petal {
    constructor(initial) { this.init(initial); }
    init(initial = false) {
      // z: 0=奥(小・遅・薄) 〜 1=手前(大・速・濃)
      this.z      = Math.random();
      this.x      = Math.random() * canvas.width;
      this.y      = initial ? Math.random() * canvas.height : -20;
      const baseS = cfg.petal.sizeMin + Math.random() * (cfg.petal.sizeMax - cfg.petal.sizeMin);
      this.s      = baseS * (0.4 + this.z * 0.8);   // 奥:小さい 手前:大きい
      this.vx     = (Math.random() - 0.5) * (0.3 + this.z * 1.2);
      const sMin = Array.isArray(cfg.petal.speedMin) ? cfg.petal.speedMin[0]+Math.random()*(cfg.petal.speedMin[1]-cfg.petal.speedMin[0]) : cfg.petal.speedMin;
      const sMax = Array.isArray(cfg.petal.speedMax) ? cfg.petal.speedMax[0]+Math.random()*(cfg.petal.speedMax[1]-cfg.petal.speedMax[0]) : cfg.petal.speedMax;
      const base  = sMin + Math.random() * (sMax - sMin);
      this.vy     = base * (0.3 + this.z * 0.9);    // 奥:遅い 手前:速い
      this.rot    = Math.random() * Math.PI * 2;
      this.drot   = (Math.random() - 0.5) * 0.04;
      this.swing  = Math.random() * Math.PI * 2;
      this.dswing = 0.016 + Math.random() * 0.016;
      this.alpha  = 0.2 + this.z * 0.75;            // 奥:薄い 手前:濃い
      this.glitchT = 0;
    }
    update() {
      this.swing += this.dswing;
      this.x += this.vx + Math.sin(this.swing) * 0.8;
      this.y += this.vy;
      this.rot += this.drot;
      // ランダムにグリッチ発動（頻度高め）
      if (Math.random() < cfg.petal.glitchRate) { const [d0,d1]=cfg.petal.glitchDuration; this.glitchT = d0 + Math.floor(Math.random()*(d1-d0)); }
      if (this.glitchT > 0) this.glitchT--;
      if (this.y > canvas.height + 20) this.init();
    }
    draw() {
      const s = this.s;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);

      // グリッチ：RGBずれ + 水平スライス
      if (this.glitchT > 0) {
        ctx.save(); // グリッチの状態変化を閉じ込める
        const range = cfg.petal.glitchRange ?? 0.3;
        const angle = Math.random() * Math.PI * 2;
        const shift = Array.isArray(cfg.petal.glitchShift)
          ? cfg.petal.glitchShift[0] + Math.random() * (cfg.petal.glitchShift[1] - cfg.petal.glitchShift[0])
          : cfg.petal.glitchShift;
        const dist  = s * shift * range;
        const dx    = Math.cos(angle) * dist * (0.5 + Math.random() * 0.5);
        const dy    = Math.sin(angle) * dist * (0.5 + Math.random() * 0.5);

        ctx.globalAlpha = cfg.petal.glitchOpacity;
        ctx.translate(dx, dy);
        ctx.beginPath(); this._path(s * 1.1);
        ctx.fillStyle = 'rgba(0,255,220,0.80)'; ctx.fill();
        ctx.translate(-dx * 2, -dy * 2);
        ctx.beginPath(); this._path(s * 1.1);
        ctx.fillStyle = 'rgba(255,0,100,0.80)'; ctx.fill();
        ctx.translate(dx, dy);

        const spread = s * range;
        const [sMin,sMax]=cfg.petal.sliceCount; const slices=sMin+Math.floor(Math.random()*(sMax-sMin));
        for (let i = 0; i < slices; i++) {
          const sa = Math.random() * Math.PI * 2;
          const sl = spread * (1.0 + Math.random() * 1.0);
          const sx = (Math.random() - 0.5) * spread;
          const sy = (Math.random() - 0.5) * spread * 1.5;
          ctx.globalAlpha = 0.5 + Math.random() * 0.5;
          ctx.fillStyle = Math.random() < 0.5 ? '#fff' : '#f0a0c0';
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(sa);
          ctx.fillRect(-sl / 2, 0, sl, 1.2 + Math.random() * 1.8);
          ctx.restore();
        }
        ctx.restore(); // グリッチ終わり
      }

      // 本体
      ctx.globalAlpha = this.alpha;
      ctx.beginPath(); this._path(s);
      const g = ctx.createRadialGradient(0,-s*0.2,0, 0,s*0.4,s*1.3);
      g.addColorStop(0,   '#ffe8f0');
      g.addColorStop(0.5, '#f8a0b8');
      g.addColorStop(1,   '#d05070');
      ctx.fillStyle = g; ctx.fill();

      // スペックル
      for (let i = 0; i < 6; i++) {
        ctx.globalAlpha = (0.08 + Math.random() * 0.12) * this.alpha;
        ctx.fillStyle = Math.random() < 0.6 ? '#fff' : '#ffb0c8';
        ctx.fillRect((Math.random()-0.5)*s*1.3, (Math.random()-0.5)*s*2.2, 1, 1);
      }

      ctx.restore();
    }
    _path(s) {
      ctx.moveTo(0, s * 1.2);
      ctx.bezierCurveTo(-s*0.6,  s*0.7, -s*0.9, -s*0.1, -s*0.65, -s*0.7);
      ctx.bezierCurveTo(-s*0.45,-s*1.1, -s*0.12,-s*0.95,  0,      -s*0.6);
      ctx.bezierCurveTo( s*0.12,-s*0.95,  s*0.45,-s*1.1,  s*0.65, -s*0.7);
      ctx.bezierCurveTo( s*0.9, -s*0.1,   s*0.6,  s*0.7,  0,       s*1.2);
      ctx.closePath();
    }
  }

  // ── 夏：蛍 ────────────────────────────────────────
  class Firefly {
    constructor(initial) { this.init(initial); }
    init(initial=false) {
      // z: 0=奥(小・遅・薄) 〜 1=手前(大・速・濃)
      this.z     = Math.random();
      this.x     = Math.random()*canvas.width;
      this.y     = initial?Math.random()*canvas.height:canvas.height+10;
      this.r     = (0.8 + this.z * 2.5);
      this.vx    = (Math.random()-0.5)*(0.2 + this.z*0.7);
      this.vy    = -(0.1 + this.z*0.5);
      this.phase = Math.random()*Math.PI*2;
      this.dphase= 0.015 + this.z*0.02;
      this.max   = 0.2 + this.z * 0.7;
    }
    update(){this.phase+=this.dphase;this.x+=this.vx;this.y+=this.vy;if(this.y<-10)this.init();}
    draw(){
      const a=this.max*(0.5+0.5*Math.sin(this.phase));
      const glow=this.r*(3+this.z*3);
      ctx.save();ctx.globalAlpha=a;
      const g=ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,glow);
      g.addColorStop(0,'#ffffcc');g.addColorStop(0.4,'#aaffaa');g.addColorStop(1,'transparent');
      ctx.beginPath();ctx.arc(this.x,this.y,glow,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();ctx.restore();
    }
  }

  // ── 秋：落ち葉 ────────────────────────────────────
  class Leaf {
    constructor(initial){this.init(initial);}
    init(initial=false){
      // z: 0=奥(小・遅・薄) 〜 1=手前(大・速・濃)
      this.z    = Math.random();
      this.x    = Math.random()*canvas.width;
      this.y    = initial?Math.random()*canvas.height:-20;
      this.sz   = (3 + Math.random()*6) * (0.4 + this.z * 0.8);
      this.vx   = (Math.random()-0.5)*(0.4 + this.z*1.2);
      this.vy   = (0.3 + Math.random()*0.5) * (0.3 + this.z*0.9);
      this.rot  = Math.random()*Math.PI*2;
      this.drot = (Math.random()-0.5)*(0.02 + this.z*0.04);
      this.swing= Math.random()*Math.PI*2;
      this.dswing=0.015+Math.random()*0.015;
      this.alpha= 0.2 + this.z * 0.7;
      const cs=['#c8501a','#e07830','#b83010','#f09040','#a02808'];
      this.color=cs[Math.floor(Math.random()*cs.length)];
    }
    update(){this.swing+=this.dswing;this.x+=this.vx+Math.sin(this.swing)*(0.3+this.z*0.6);this.y+=this.vy;this.rot+=this.drot;if(this.y>canvas.height+20)this.init();}
    draw(){ctx.save();ctx.translate(this.x,this.y);ctx.rotate(this.rot);ctx.globalAlpha=this.alpha;ctx.beginPath();ctx.ellipse(0,0,this.sz*0.45,this.sz,0,0,Math.PI*2);ctx.fillStyle=this.color;ctx.fill();ctx.restore();}
  }

  // ── 冬：雪 ───────────────────────────────────────
  class Snow {
    constructor(initial){this.init(initial);}
    init(initial=false){
      // z: 0=奥(小・遅・薄) 〜 1=手前(大・速・濃)
      this.z    = Math.random();
      this.x    = Math.random()*canvas.width;
      this.y    = initial?Math.random()*canvas.height:-10;
      this.r    = 0.8 + this.z * 3.5;           // 奥:0.8px 〜 手前:4.3px
      this.vx   = (Math.random()-0.5)*0.3*this.z;
      this.vy   = 0.3 + this.z * 1.2;           // 奥:遅い 〜 手前:速い
      this.swing= Math.random()*Math.PI*2;
      this.alpha= 0.2 + this.z * 0.65;          // 奥:薄い 〜 手前:濃い
    }
    update(){this.swing+=0.015+this.z*0.01;this.x+=this.vx+Math.sin(this.swing)*(0.15+this.z*0.2);this.y+=this.vy;if(this.y>canvas.height+10)this.init();}
    draw(){
      ctx.save();ctx.globalAlpha=this.alpha;
      ctx.beginPath();ctx.arc(this.x,this.y,this.r,0,Math.PI*2);
      // 手前は白く、奥は青みがかる
      const l=Math.round(80+this.z*15);
      ctx.fillStyle=`hsl(210,60%,${l}%)`;ctx.fill();
      ctx.restore();
    }
  }

  // ── 雨（ホログラム） ─────────────────────────────
  class Rain {
    constructor(initial){this.init(initial);}
    init(initial=false){
      // z: 0=奥(短・遅・細・薄) 〜 1=手前(長・速・太・濃)
      this.z    = Math.random();
      this.x    = Math.random()*canvas.width;
      this.y    = initial?Math.random()*canvas.height:-30;
      this.len  = 5 + this.z * 22;              // 奥:5px 〜 手前:27px
      this.speed= 4 + this.z * 14;              // 奥:遅 〜 手前:速
      this.lw   = 0.4 + this.z * 1.2;           // 奥:細 〜 手前:太
      this.alpha= 0.06 + this.z * 0.22;         // 奥:薄 〜 手前:濃
      this.hue  = Math.random()*360;
    }
    update(){this.x+=0.5*this.z;this.y+=this.speed;this.hue=(this.hue+2)%360;if(this.y>canvas.height+30)this.init();}
    draw(){
      ctx.save();
      const g=ctx.createLinearGradient(this.x,this.y,this.x+this.len*0.08,this.y+this.len);
      g.addColorStop(0,`hsla(${this.hue},100%,80%,0)`);
      g.addColorStop(0.4,`hsla(${this.hue},100%,80%,${this.alpha})`);
      g.addColorStop(1,`hsla(${(this.hue+80)%360},100%,90%,0)`);
      ctx.strokeStyle=g;ctx.lineWidth=this.lw;
      ctx.beginPath();ctx.moveTo(this.x,this.y);ctx.lineTo(this.x+this.len*0.08,this.y+this.len);
      ctx.stroke();ctx.restore();
    }
  }

  function count(d){return Math.min(Math.floor(canvas.width*canvas.height/d),80);}

  function buildParticles(){
    const s=state.season;
    if      (s==='spring'){const n=count(8000); particles=Array.from({length:n},(_,i)=>new Petal(i<n*0.7));}
    else if (s==='summer'){const n=count(12000);particles=Array.from({length:n},(_,i)=>new Firefly(i<n*0.7));}
    else if (s==='autumn'){const n=count(9000); particles=Array.from({length:n},(_,i)=>new Leaf(i<n*0.7));}
    else                  {const n=count(6000); particles=Array.from({length:n},(_,i)=>new Snow(i<n*0.7));}
  }

  function buildRain(){
    const n=Math.min(Math.floor(canvas.width/6),160);
    rainDrops=Array.from({length:n},(_,i)=>new Rain(i<n*0.6));
  }

  function rebuildAll(){buildParticles();if(state.isRaining)buildRain();else rainDrops=[];}

  // ── グリッチ ────────────────────────────────────────
  let glitchLines=[];let glitchActive=false;
  function triggerGlitch(){
    glitchActive=true;
    const count=2+Math.floor(Math.random()*4);
    glitchLines=Array.from({length:count},()=>{
      const partial=Math.random()<0.80;
      const startX=partial?Math.random()*canvas.width*0.6:0;
      const w=partial?canvas.width*(0.1+Math.random()*0.5):canvas.width;
      return{y:Math.random()*canvas.height,h:0.5+Math.random()*4,dx:(Math.random()-0.5)*30,life:2+Math.floor(Math.random()*4),f:0,type:Math.floor(Math.random()*4),startX,w};
    });
    setTimeout(()=>{glitchActive=false;glitchLines=[];},60+Math.random()*140);
    if(Math.random()<0.25)setTimeout(triggerGlitch,80+Math.random()*120);
  }
  function drawGlitch(){
    if(!glitchActive)return;
    ctx.save();
    glitchLines.forEach(g=>{
      g.f++;const a=Math.max(0,1-g.f/g.life);
      switch(g.type){
        case 0:ctx.globalAlpha=a*0.30;ctx.fillStyle='rgba(255,255,255,0.8)';ctx.fillRect(g.startX+g.dx,g.y,g.w,g.h);break;
        case 1:ctx.globalAlpha=a*0.22;ctx.fillStyle='rgba(180,0,0,0.6)';ctx.fillRect(g.startX+g.dx,g.y,g.w,g.h);break;
        case 2:ctx.globalAlpha=a*0.85;ctx.fillStyle='#000';ctx.fillRect(g.startX,g.y,g.w,g.h*2);break;
        case 3:ctx.globalAlpha=a*0.18;ctx.fillStyle='rgba(120,0,180,0.5)';ctx.fillRect(g.startX+g.dx+4,g.y,g.w,g.h);ctx.fillStyle='rgba(0,180,80,0.4)';ctx.fillRect(g.startX+g.dx-4,g.y,g.w,g.h);break;
      }
    });
    ctx.restore();
  }

  // ── 天気取得 ──────────────────────────────────────
  async function fetchWeather(){
    if(state.weather!=='auto'){
      state.isRaining=state.weather==='rain'||state.weather==='snow';
      state.isClear=state.weather==='clear';
      if(state.isRaining)buildRain();else rainDrops=[];return;
    }
    try{
      const res=await fetch('https://weathernews.jp/onebox/35.6418/139.6975/pa=0');
      const data=await res.json();
      const ptype=data?.ptype??0,wxid=data?.wxid??1;
      state.isRaining=ptype===1||ptype===3;state.isClear=ptype===0&&wxid<=3;
      if(state.isRaining)buildRain();else rainDrops=[];
      console.log(`%c[heroWeather] 目黒区 ptype=${ptype}`,'color:#3ecfcf');
    }catch{
      try{
        const res=await fetch('https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json');
        const data=await res.json();
        const areas=data[0]?.timeSeries?.[0]?.areas??[];
        const area=areas.find(a=>a.area?.name==='東京地方')??areas[0];
        const code=area?.weatherCodes?.[0]??'100';
        state.isRaining=/^[34]/.test(code);state.isClear=/^1/.test(code);
        if(state.isRaining)buildRain();else rainDrops=[];
      }catch{}
    }
  }

  // ── アニメーション ─────────────────────────────────
  function animate(){
    frame++;
    const bright=getBright();
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // ビネット（canvasに直接描画）
    const vg=ctx.createRadialGradient(canvas.width/2,canvas.height/2,canvas.height*0.3,canvas.width/2,canvas.height/2,canvas.height*0.9);
    vg.addColorStop(0,'rgba(0,0,0,0)');
    vg.addColorStop(1,'rgba(0,0,0,0.7)');
    ctx.fillStyle=vg;
    ctx.fillRect(0,0,canvas.width,canvas.height);

    particles.forEach(p=>{p.update();p.draw();});
    if(state.isRaining)rainDrops.forEach(r=>{r.update();r.draw();});
    drawGlitch();
    if(Math.random()<1/180)triggerGlitch();

    requestAnimationFrame(animate);
  }

  // ── コンソールAPI ──────────────────────────────────
  window.heroWeather={
    setSeason(s){if(!['spring','summer','autumn','winter'].includes(s)){console.warn('spring/summer/autumn/winter');return;}state.season=s;resize();rebuildAll();console.log(`%c[heroWeather] season→${s}`,'color:#3ecfcf');},
    setWeather(w){if(!['auto','clear','rain','snow'].includes(w)){console.warn('auto/clear/rain/snow');return;}state.weather=w;fetchWeather();console.log(`%c[heroWeather] weather→${w}`,'color:#3ecfcf');},
    setBrightness(b){state.brightness=b;console.log(`%c[heroWeather] brightness→${b}`,'color:#3ecfcf');},
    glitch(){triggerGlitch();},
    reset(){const m=new Date().getMonth()+1;state.season=m>=3&&m<=5?'spring':m>=6&&m<=8?'summer':m>=9&&m<=11?'autumn':'winter';state.weather='auto';state.brightness='auto';resize();rebuildAll();fetchWeather();console.log('%c[heroWeather] reset','color:#3ecfcf');},
    status(){console.table({season:state.season,weather:state.weather,isRaining:state.isRaining,particles:particles.length,brightness:getBright().toFixed(2)});},
    help(){console.log('%c[heroWeather]\n  setSeason("spring"|"summer"|"autumn"|"winter")\n  setWeather("auto"|"clear"|"rain"|"snow")\n  setBrightness("auto"|0~1)\n  glitch() / reset() / status()','color:#3ecfcf');},
  };

  // ── 起動 ──────────────────────────────────────────
  async function start(){
    // hero-weather.jsonc を読み込んでデフォルト設定を上書き
    try {
      const res  = await fetch('/hero-weather.jsonc');
      if (res.ok) {
        const text = await res.text();
        // // コメントと /* */ コメントを除去してからJSONパース
        const stripped = text
          .replace(/\/\/[^\n]*/g, '')      // //コメント除去
          .replace(/\/\*[\s\S]*?\*\//g, '') // /* */コメント除去
          .replace(/,(\s*[}\]])/g, '$1');   // 末尾カンマ除去
        const json = JSON.parse(stripped);
        // ディープマージ
        for (const key of Object.keys(json)) {
          if (typeof json[key] === 'object' && !Array.isArray(json[key]) && cfg[key]) {
            Object.assign(cfg[key], json[key]);
          } else {
            cfg[key] = json[key];
          }
        }
        console.log('%c[heroWeather] hero-weather.jsonc 読み込み完了', 'color:#3ecfcf');
      }
    } catch { /* JSONがなければデフォルト値を使う */ }

    if (cfg.brightness !== 'auto') state.brightness = cfg.brightness;

    resize();
    rebuildAll();
    animate();
    fetchWeather();
    console.log(`%c[heroWeather] started — ${particles.length} particles`, 'color:#3ecfcf');
  }

  window.addEventListener('resize',()=>{resize();rebuildAll();});

  if(document.readyState==='complete'){
    start();
  }else{
    window.addEventListener('load',start);
  }
})();
