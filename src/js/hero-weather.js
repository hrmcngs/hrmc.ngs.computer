(() => {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // canvasのインラインスタイルのz-indexを確実に上書き
  canvas.style.zIndex = '10';

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

  // ── 桜の花びら（デジタルノイズ版） ─────────────────
  class Petal {
    constructor(initial) { this.init(initial); }
    init(initial = false) {
      this.x      = Math.random() * canvas.width;
      this.y      = initial ? Math.random() * canvas.height : -20;
      this.s      = 9 + Math.random() * 10;
      this.vx     = (Math.random() - 0.5) * 1.0;
      this.vy     = 3.0 + Math.random() * 3.5;
      this.rot    = Math.random() * Math.PI * 2;
      this.drot   = (Math.random() - 0.5) * 0.04;
      this.swing  = Math.random() * Math.PI * 2;
      this.dswing = 0.016 + Math.random() * 0.016;
      this.alpha  = 0.80 + Math.random() * 0.18;
      // ピクセルグリッドを事前生成（花びら形の中にランダム輝度で散らす）
      this._buildPixels();
    }
    _buildPixels() {
      const s   = this.s;
      const px  = 2; // ピクセルサイズ
      this.dots = [];
      for (let y = -s * 1.4; y < s * 1.4; y += px) {
        for (let x = -s * 1.1; x < s * 1.1; x += px) {
          if (this._inPetal(x + px/2, y + px/2)) {
            // ピクセルごとにランダム輝度・色
            const v = Math.random();
            const bright = 0.3 + Math.random() * 0.7;
            // ピンク〜白〜暗ピンクのノイズ
            const r = Math.round(180 + bright * 75);
            const g = Math.round(80  + bright * 80);
            const b = Math.round(100 + bright * 80);
            this.dots.push({ x, y, w: px - 0.3, a: v < 0.08 ? 0 : 0.4 + bright * 0.55 });
            this.dots[this.dots.length - 1].r = r;
            this.dots[this.dots.length - 1].g = g;
            this.dots[this.dots.length - 1].b = b;
          }
        }
      }
    }
    // 花びら形の内外判定
    _inPetal(px, py) {
      const s = this.s;
      // 楕円近似で上下非対称
      const nx = px / (s * 0.85);
      const ny = (py - s * 0.1) / (s * 1.25);
      if (nx*nx + ny*ny > 1) return false;
      // 上部の切れ込み
      if (py < -s * 0.45 && Math.abs(px) < s * 0.2) return false;
      return true;
    }
    update() {
      this.swing += this.dswing;
      this.x += this.vx + Math.sin(this.swing) * 0.8;
      this.y += this.vy;
      this.rot += this.drot;
      if (this.y > canvas.height + 20) this.init();
    }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      // ドットを描画（毎フレーム輝度をランダムに揺らす）
      for (const d of this.dots) {
        // ちらつき：一部のピクセルがランダムに明滅
        const flicker = Math.random() < 0.15 ? Math.random() * 0.8 : 1;
        ctx.globalAlpha = d.a * this.alpha * flicker;
        ctx.fillStyle = `rgb(${d.r},${d.g},${d.b})`;
        ctx.fillRect(d.x, d.y, d.w, d.w);
      }
      ctx.restore();
    }
  }

  // ── 夏：サイバー蛍 ────────────────────────────────
  class Firefly {
    constructor(initial) { this.init(initial); }
    init(initial=false) {
      this.x=Math.random()*canvas.width; this.y=initial?Math.random()*canvas.height:canvas.height+10;
      this.r=1.5+Math.random()*2; this.vx=(Math.random()-0.5)*0.6; this.vy=-(0.2+Math.random()*0.4);
      this.phase=Math.random()*Math.PI*2; this.dphase=0.02+Math.random()*0.02; this.max=0.6+Math.random()*0.3;
      this.hue=Math.random()<0.5?185:300; // シアンかマゼンタ
    }
    update(){this.phase+=this.dphase;this.x+=this.vx;this.y+=this.vy;if(this.y<-10)this.init();}
    draw(){
      const a=this.max*(0.5+0.5*Math.sin(this.phase));
      ctx.save();ctx.globalAlpha=a;
      const g=ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,this.r*6);
      g.addColorStop(0,`hsl(${this.hue},100%,90%)`);
      g.addColorStop(0.3,`hsl(${this.hue},100%,60%)`);
      g.addColorStop(1,'transparent');
      ctx.shadowColor=`hsl(${this.hue},100%,70%)`;ctx.shadowBlur=8;
      ctx.beginPath();ctx.arc(this.x,this.y,this.r*6,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
      ctx.restore();
    }
  }

  // ── 秋：サイバー落ち葉 ────────────────────────────
  class Leaf {
    constructor(initial){this.init(initial);}
    init(initial=false){
      this.x=Math.random()*canvas.width;this.y=initial?Math.random()*canvas.height:-20;
      this.sz=5+Math.random()*8;this.vx=(Math.random()-0.5)*1.2;this.vy=0.5+Math.random()*0.9;
      this.rot=Math.random()*Math.PI*2;this.drot=(Math.random()-0.5)*0.04;
      this.swing=Math.random()*Math.PI*2;this.dswing=0.015+Math.random()*0.015;
      this.alpha=0.7+Math.random()*0.25;
      // オレンジ〜赤をサイバー化（彩度高め）
      const hues=[20,0,35,15];
      this.hue=hues[Math.floor(Math.random()*hues.length)];
    }
    update(){this.swing+=this.dswing;this.x+=this.vx+Math.sin(this.swing)*0.7;this.y+=this.vy;this.rot+=this.drot;if(this.y>canvas.height+20)this.init();}
    draw(){
      ctx.save();ctx.translate(this.x,this.y);ctx.rotate(this.rot);
      // 暗い塗り
      ctx.globalAlpha=this.alpha*0.3;
      ctx.beginPath();ctx.ellipse(0,0,this.sz*0.45,this.sz,0,0,Math.PI*2);
      ctx.fillStyle=`hsl(${this.hue},100%,10%)`;ctx.fill();
      // 輝線
      ctx.globalAlpha=this.alpha*0.9;
      ctx.beginPath();ctx.ellipse(0,0,this.sz*0.45,this.sz,0,0,Math.PI*2);
      ctx.strokeStyle=`hsl(${this.hue},100%,65%)`;ctx.lineWidth=0.8;
      ctx.shadowColor=`hsl(${this.hue},100%,55%)`;ctx.shadowBlur=5;
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── 冬：サイバー雪 ───────────────────────────────
  class Snow {
    constructor(initial){this.init(initial);}
    init(initial=false){
      this.x=Math.random()*canvas.width;this.y=initial?Math.random()*canvas.height:-10;
      this.r=1+Math.random()*2;this.vx=(Math.random()-0.5)*0.4;this.vy=0.4+Math.random()*0.8;
      this.swing=Math.random()*Math.PI*2;this.alpha=0.6+Math.random()*0.35;
      this.hue=Math.random()<0.5?200:270; // 青系かバイオレット
    }
    update(){this.swing+=0.018;this.x+=this.vx+Math.sin(this.swing)*0.3;this.y+=this.vy;if(this.y>canvas.height+10)this.init();}
    draw(){
      ctx.save();ctx.globalAlpha=this.alpha;
      ctx.shadowColor=`hsl(${this.hue},100%,80%)`;ctx.shadowBlur=6;
      ctx.beginPath();ctx.arc(this.x,this.y,this.r,0,Math.PI*2);
      ctx.fillStyle=`hsl(${this.hue},80%,85%)`;ctx.fill();
      // 外リング
      ctx.globalAlpha=this.alpha*0.4;
      ctx.beginPath();ctx.arc(this.x,this.y,this.r*2.5,0,Math.PI*2);
      ctx.strokeStyle=`hsl(${this.hue},100%,70%)`;ctx.lineWidth=0.5;ctx.stroke();
      ctx.restore();
    }
  }

  // ── 雨（ホログラム） ─────────────────────────────
  class Rain {
    constructor(initial){this.init(initial);}
    init(initial=false){
      this.x=Math.random()*canvas.width;this.y=initial?Math.random()*canvas.height:-30;
      this.len=10+Math.random()*18;this.speed=9+Math.random()*7;
      this.alpha=0.15+Math.random()*0.15;this.hue=Math.random()*360;
    }
    update(){this.x+=0.8;this.y+=this.speed;this.hue=(this.hue+3)%360;if(this.y>canvas.height+30)this.init();}
    draw(){
      ctx.save();
      const g=ctx.createLinearGradient(this.x,this.y,this.x+this.len*0.08,this.y+this.len);
      g.addColorStop(0,`hsla(${this.hue},100%,80%,0)`);
      g.addColorStop(0.4,`hsla(${this.hue},100%,80%,${this.alpha})`);
      g.addColorStop(1,`hsla(${(this.hue+80)%360},100%,90%,0)`);
      ctx.strokeStyle=g;ctx.lineWidth=0.9;
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
  function start(){
    resize();
    rebuildAll();
    animate();
    fetchWeather();
    console.log(`%c[heroWeather] started — ${particles.length} particles`,'color:#3ecfcf');
  }

  window.addEventListener('resize',()=>{resize();rebuildAll();});

  if(document.readyState==='complete'){
    start();
  }else{
    window.addEventListener('load',start);
  }
})();
