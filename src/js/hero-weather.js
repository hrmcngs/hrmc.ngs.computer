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
    isSnowing : false,
    isClear   : false,
    isCloudy  : false,
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
      this.alpha  = 0.45 + this.z * 0.5;            // 奥:0.45 手前:0.95
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

        ctx.globalAlpha = cfg.petal.glitchOpacity * this.z;
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
          ctx.globalAlpha = (0.5 + Math.random() * 0.5) * this.z;
          ctx.fillStyle = Math.random() < 0.5 ? '#fff' : '#f0a0c0';
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(sa);
          ctx.fillRect(-sl / 2, 0, sl, 1.2 + Math.random() * 1.8);
          ctx.restore();
        }
        ctx.restore(); // グリッチ終わり
      }

      // 本体（z値で明度・彩度・alphaを調整）
      ctx.globalAlpha = this.alpha;
      ctx.beginPath(); this._path(s);
      const sat   = Math.round(60 + this.z * 30);           // 奥:彩度低め 手前:高め
      const light = Math.round(30 + this.z * 45);           // 奥:暗め 手前:明るめ
      const g = ctx.createRadialGradient(0,-s*0.2,0, 0,s*0.4,s*1.3);
      g.addColorStop(0,   `hsl(340,${sat}%,${Math.min(light+15, 85)}%)`);
      g.addColorStop(0.5, `hsl(340,${sat}%,${light}%)`);
      g.addColorStop(1,   `hsl(340,${sat-10}%,${Math.max(light-15, 15)}%)`);
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
      ctx.save();
      // グリッチ（まれに色相がずれる）
      if(this.z>0.5&&Math.random()<0.006){
        ctx.globalAlpha=a*this.z*0.7;
        const g2=ctx.createRadialGradient(this.x+glow*0.4,this.y,0,this.x,this.y,glow);
        g2.addColorStop(0,'rgba(0,255,200,0.9)');g2.addColorStop(1,'transparent');
        ctx.beginPath();ctx.arc(this.x,this.y,glow,0,Math.PI*2);ctx.fillStyle=g2;ctx.fill();
      }
      ctx.globalAlpha=a;
      const g=ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,glow);
      g.addColorStop(0,'#ffffcc');g.addColorStop(0.4,'#aaffaa');g.addColorStop(1,'transparent');
      ctx.beginPath();ctx.arc(this.x,this.y,glow,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
      // ノイズスパーク
      const fRate=cfg.firefly?.noiseRate??0.12;
      if(Math.random()<fRate){
        ctx.globalAlpha=a*this.z*(0.3+Math.random()*0.5);
        ctx.fillStyle=Math.random()<0.5?'#ffffaa':'rgba(150,255,150,0.9)';
        ctx.fillRect(this.x+(Math.random()-0.5)*glow*1.5,this.y+(Math.random()-0.5)*glow*1.5,0.8,0.8);
      }
      ctx.restore();
    }
  }

  // ── 7〜8月：花火の火花 ────────────────────────────
  class FireworkBurst {
    constructor(initial, depth) { this.depth=depth; this.init(initial); }
    init(initial=false) {
      const colors = cfg.firework?.colors ?? ['#ffcb6b','#ff8f70','#8be9fd','#c7a0ff'];
      this.color = colors[Math.floor(Math.random() * colors.length)];
      this.secondColor = colors[Math.floor(Math.random() * colors.length)];
      this.z = this.depth ?? Math.random(); // 0=遠景、1=近景
      this.scale = 0.48 + this.z * 1.05;
      this.brightness = 0.55 + this.z * 0.55;
      const types = ['ring','chrysanthemum','double','willow','multicolor'];
      this.type = types[Math.floor(Math.random() * types.length)];
      this.x = canvas.width * (0.1 + Math.random() * 0.8);
      this.y = canvas.height * (0.06 + Math.random() * (0.5 - this.z * 0.12));
      this.rocketX = this.x + (Math.random() - 0.5) * 100;
      this.rocketY = canvas.height + 12;
      this.launchStartX = this.rocketX;
      this.launchStartY = this.rocketY;
      this.rocketPX = this.rocketX;
      this.rocketPY = this.rocketY;
      this.launchLife = 0;
      this.maxLaunchLife = 42 + Math.floor(Math.random() * 24);
      this.phase = 'launch';
      this.life = 0;
      this.maxLife = (this.type==='willow' ? 125 : 82) + Math.floor(Math.random() * 30);
      this.delay = initial ? Math.floor(Math.random() * 160) : 50 + Math.floor(Math.random() * 180);
      const count = 18 + Math.floor(this.z * 14) + Math.floor(Math.random() * 6);
      const offset = Math.random() * Math.PI * 2;
      const tilt = 0.3 + Math.random() * 0.75;
      const makeSpark = (i, ringScale=1) => {
        const angle = offset + (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.12;
        let speed = (this.type==='ring' ? 2.45+Math.random()*0.22 : 1.55+Math.random()*1.75) * this.scale * ringScale;
        if (this.type==='willow') speed=(1.7+Math.random()*1.05)*this.scale;
        let dx=Math.cos(angle), dy=Math.sin(angle), dz=0;
        if(this.type==='ring' || this.type==='double'){
          dz=dy*Math.sin(tilt);
          dy*=Math.cos(tilt);
        } else {
          dz=(Math.random()*2-1)*0.82;
          const flat=Math.sqrt(1-dz*dz);
          dx*=flat; dy*=flat;
        }
        return {
          x:0, y:0, z:0,
          vx:dx*speed, vy:dy*speed, vz:dz*speed,
          drag:this.type==='willow'?0.988:0.982,
          gravity:(this.type==='willow'?0.032:0.018)*this.scale,
          color:this.type==='multicolor' ? colors[i%colors.length] : (ringScale<1?this.secondColor:this.color),
          history:[], twinkle:Math.random()*Math.PI*2,
          twinkleSpeed:0.18+Math.random()*0.22
        };
      };
      this.sparks=Array.from({length:count},(_,i)=>makeSpark(i));
      if(this.type==='double') this.sparks.push(...Array.from({length:count},(_,i)=>makeSpark(i,0.56)));
    }
    update() {
      if (this.delay > 0) { this.delay--; return; }
      if (this.phase === 'launch') {
        this.rocketPX=this.rocketX; this.rocketPY=this.rocketY;
        this.launchLife++;
        const t=Math.min(1,this.launchLife/this.maxLaunchLife);
        const eased=1-Math.pow(1-t,2.4);
        this.rocketX=this.launchStartX+(this.x-this.launchStartX)*t;
        this.rocketY=this.launchStartY+(this.y-this.launchStartY)*eased;
        if (this.launchLife >= this.maxLaunchLife) {
          this.rocketX=this.x; this.rocketY=this.y;
          this.phase='burst';
        }
        return;
      }
      this.life++;
      this.sparks.forEach(s => {
        s.history.unshift({x:s.x,y:s.y,z:s.z});
        s.history.length=Math.min(s.history.length,this.type==='willow'?9:6);
        s.x+=s.vx; s.y+=s.vy; s.z+=s.vz;
        s.vx*=s.drag; s.vy=s.vy*s.drag+s.gravity; s.vz*=s.drag;
        s.twinkle+=s.twinkleSpeed;
      });
      if (this.life > this.maxLife) this.init();
    }
    draw() {
      if (this.delay > 0) return;
      if (this.phase === 'launch') {
        ctx.save();
        ctx.strokeStyle=this.color;
        ctx.fillStyle='#fff';
        ctx.shadowColor=this.color;
        ctx.shadowBlur=7+this.z*5;
        ctx.globalAlpha=Math.min(1,this.brightness);
        ctx.lineWidth=0.9+this.z*0.9;
        ctx.beginPath();
        ctx.moveTo(this.rocketX,this.rocketY);
        ctx.lineTo(this.rocketPX,this.rocketPY+10);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(this.rocketX,this.rocketY,1+this.z,0,Math.PI*2);
        ctx.fill();
        ctx.restore();
        return;
      }
      const progress = this.life / this.maxLife;
      const alpha = Math.min(1,Math.pow(1-progress, this.type==='willow'?0.85:1.25) * this.brightness);
      ctx.save();
      if (this.life < 7) {
        const flash = 1 - this.life / 7;
        const flashRadius=12+this.scale*15;
        const glow = ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,flashRadius);
        glow.addColorStop(0,`rgba(255,255,255,${flash * 0.9})`);
        glow.addColorStop(0.25,this.color);
        glow.addColorStop(1,'transparent');
        ctx.globalAlpha=flash;
        ctx.fillStyle=glow;
        ctx.beginPath();
        ctx.arc(this.x,this.y,flashRadius,0,Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = 0;
      ctx.lineWidth = 0.75+this.z*1.15;
      const project=p=>{
        const perspective=260/(260+p.z);
        return {x:this.x+p.x*perspective,y:this.y+p.y*perspective,k:perspective};
      };
      this.sparks.forEach(s => {
        const head=project(s);
        ctx.strokeStyle=s.color;
        const trail=[s,...s.history];
        if(trail.length>1){
          ctx.globalAlpha=alpha*0.62*Math.min(1.15,Math.max(0.35,head.k));
          ctx.lineWidth=(0.55+this.z)*Math.min(1.4,Math.max(0.55,head.k));
          ctx.beginPath(); ctx.moveTo(head.x,head.y);
          for(let i=1;i<trail.length;i++){
            const p=project(trail[i]);
            ctx.lineTo(p.x,p.y);
          }
          ctx.stroke();
        }
        ctx.globalAlpha=alpha*(0.72+Math.sin(s.twinkle)*0.28)*Math.min(1.2,Math.max(0.4,head.k));
        if(this.z>0.55 || this.type==='willow'){
          ctx.fillStyle=s.color;
          const dot=(1.1+this.z*0.8)*Math.min(1.5,Math.max(0.55,head.k));
          ctx.fillRect(head.x-dot/2,head.y-dot/2,dot,dot);
        }
      });
      ctx.restore();
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
      this.glitchT=0;
    }
    _path(sz){ctx.ellipse(0,0,sz*0.45,sz,0,0,Math.PI*2);}
    update(){
      this.swing+=this.dswing;
      this.x+=this.vx+Math.sin(this.swing)*(0.3+this.z*0.6);
      this.y+=this.vy;
      this.rot+=this.drot;
      // 花びらと同じく、発動したら数フレーム持続させる
      if(Math.random()<(cfg.leaf?.glitchRate??0.05)){
        const [d0,d1]=cfg.leaf?.glitchDuration??[2,5];
        this.glitchT=d0+Math.floor(Math.random()*(d1-d0));
      }
      if(this.glitchT>0)this.glitchT--;
      if(this.y>canvas.height+20)this.init();
    }
    draw(){
      ctx.save();ctx.translate(this.x,this.y);ctx.rotate(this.rot);
      // グリッチ：RGBずれ + 水平スライス（花びらと同じ）
      if(this.glitchT>0){
        ctx.save(); // グリッチの状態変化を閉じ込める
        const sz=this.sz;
        const range=cfg.leaf?.glitchRange??0.35;
        const gs=cfg.leaf?.glitchShift??[0.5,2.5];
        const shift=Array.isArray(gs)?gs[0]+Math.random()*(gs[1]-gs[0]):gs;
        const angle=Math.random()*Math.PI*2;
        const dist=sz*shift*range;
        const dx=Math.cos(angle)*dist*(0.5+Math.random()*0.5);
        const dy=Math.sin(angle)*dist*(0.5+Math.random()*0.5);

        ctx.globalAlpha=(cfg.leaf?.glitchOpacity??0.8)*this.z;
        ctx.translate(dx,dy);
        ctx.beginPath();this._path(sz*1.1);
        ctx.fillStyle='rgba(0,255,200,0.80)';ctx.fill();
        ctx.translate(-dx*2,-dy*2);
        ctx.beginPath();this._path(sz*1.1);
        ctx.fillStyle='rgba(255,0,80,0.80)';ctx.fill();
        ctx.translate(dx,dy);

        const spread=sz*range;
        const [slMin,slMax]=cfg.leaf?.sliceCount??[3,6];
        const slices=slMin+Math.floor(Math.random()*(slMax-slMin));
        for(let i=0;i<slices;i++){
          const sa=Math.random()*Math.PI*2;
          const sl=spread*(1.0+Math.random()*1.0);
          const sx=(Math.random()-0.5)*spread;
          const sy=(Math.random()-0.5)*spread*1.5;
          ctx.globalAlpha=(0.5+Math.random()*0.5)*this.z;
          ctx.fillStyle=Math.random()<0.5?'#fff':'#ffb050';
          ctx.save();
          ctx.translate(sx,sy);
          ctx.rotate(sa);
          ctx.fillRect(-sl/2,0,sl,1.2+Math.random()*1.8);
          ctx.restore();
        }
        ctx.restore(); // グリッチ終わり
      }
      ctx.globalAlpha=this.alpha;ctx.beginPath();this._path(this.sz);ctx.fillStyle=this.color;ctx.fill();
      // ノイズ粒
      const lCount=cfg.leaf?.noiseCount??3;
      for(let i=0;i<lCount;i++){
        ctx.globalAlpha=(0.15+Math.random()*0.4)*this.z;
        ctx.fillStyle=Math.random()<0.5?'#fff':'rgba(255,180,80,0.9)';
        ctx.fillRect((Math.random()-0.5)*this.sz,(Math.random()-0.5)*this.sz*1.8,0.8,0.8);
      }
      ctx.restore();}
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
      // グリッチ（z値が高い手前の雪だけ）
      if(this.z>0.6&&Math.random()<0.005){
        ctx.globalAlpha=this.alpha*this.z*0.8;
        ctx.beginPath();ctx.arc(this.x+this.r*2,this.y,this.r,0,Math.PI*2);
        ctx.fillStyle='rgba(0,220,255,0.8)';ctx.fill();
        ctx.beginPath();ctx.arc(this.x-this.r*2,this.y,this.r,0,Math.PI*2);
        ctx.fillStyle='rgba(255,100,200,0.8)';ctx.fill();
        ctx.globalAlpha=this.alpha;
      }
      ctx.beginPath();ctx.arc(this.x,this.y,this.r,0,Math.PI*2);
      const l=Math.round(80+this.z*15);
      ctx.fillStyle=`hsl(210,60%,${l}%)`;ctx.fill();
      // ノイズ粒
      if(this.r>1.0){
        const sCount=cfg.snow?.noiseCount??3;
        for(let i=0;i<sCount;i++){
          ctx.globalAlpha=(0.2+Math.random()*0.5)*this.z;
          ctx.fillStyle=Math.random()<0.5?'#fff':'rgba(100,200,255,0.9)';
          ctx.fillRect(this.x+(Math.random()-0.5)*this.r*3, this.y+(Math.random()-0.5)*this.r*3, 0.8, 0.8);
        }
      }
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
      ctx.stroke();
      // ノイズスパーク
      const rRate=cfg.rain?.noiseRate??0.15;
      const rCount=cfg.rain?.noiseCount??3;
      if(this.z>0.3&&Math.random()<rRate){
        for(let i=0;i<rCount;i++){
          ctx.globalAlpha=this.alpha*this.z*(0.5+Math.random()*0.5);
          ctx.fillStyle=`hsl(${this.hue},100%,90%)`;
          ctx.fillRect(this.x+(Math.random()-0.5)*5, this.y+this.len*Math.random(), 0.8+Math.random()*0.8, 0.8);
        }
      }
      ctx.restore();
    }
  }


  // ── 曇り：浮遊するダスト粒子 ────────────────────────
  class Cloud {
    constructor(initial){this.init(initial);}
    init(initial=false){
      this.z    = Math.random();
      this.x    = Math.random()*canvas.width;
      this.y    = initial?Math.random()*canvas.height:(Math.random()<0.5?-10:canvas.height+10);
      this.r    = 1.5 + this.z * 4;
      this.vx   = (Math.random()-0.5)*(0.1+this.z*0.4);
      this.vy   = (Math.random()-0.5)*(0.05+this.z*0.15);
      this.alpha= 0.04 + this.z * 0.1;
      this.swing= Math.random()*Math.PI*2;
    }
    update(){
      this.swing+=0.008;
      this.x+=this.vx+Math.sin(this.swing)*0.3;
      this.y+=this.vy;
      if(this.x<-10)this.x=canvas.width+10;
      if(this.x>canvas.width+10)this.x=-10;
      if(this.y<-10)this.y=canvas.height+10;
      if(this.y>canvas.height+10)this.y=-10;
      // ノイズ
      if(Math.random()<(cfg.cloud?.noiseRate??0.05)){
        this._noiseFlash=2;
      }
      if(this._noiseFlash>0)this._noiseFlash--;
    }
    draw(){
      ctx.save();
      ctx.globalAlpha=this.alpha;
      const g=ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,this.r*3);
      g.addColorStop(0,`rgba(180,190,210,${0.3+this.z*0.4})`);
      g.addColorStop(1,'rgba(100,110,130,0)');
      ctx.beginPath();ctx.arc(this.x,this.y,this.r*3,0,Math.PI*2);
      ctx.fillStyle=g;ctx.fill();
      // ノイズ粒
      if(this._noiseFlash>0){
        ctx.globalAlpha=this.alpha*2;
        ctx.fillStyle='rgba(200,210,230,0.9)';
        ctx.fillRect(this.x+(Math.random()-0.5)*this.r*2,this.y+(Math.random()-0.5)*this.r*2,0.8,0.8);
      }
      ctx.restore();
    }
  }
  function count(d){return Math.min(Math.floor(canvas.width*canvas.height/d),80);}

  function buildParticles(){
    const s=state.season;
    if      (s==='spring'){const n=count(8000); particles=Array.from({length:n},(_,i)=>new Petal(i<n*0.7));}
    else if (s==='summer'){
      const isFireworkSeason = new Date().getMonth() >= 6;
      const n=isFireworkSeason ? Math.max(3,Math.min(Math.floor(canvas.width*canvas.height/240000),5)) : count(12000);
      particles=Array.from({length:n},(_,i)=>isFireworkSeason ? new FireworkBurst(true,i/(n-1)) : new Firefly(i<n*0.7));
    }
    else if (s==='autumn'){const n=count(9000); particles=Array.from({length:n},(_,i)=>new Leaf(i<n*0.7));}
    else                  { particles=[]; } // 冬は天気=雪の時だけ降る
  }

  function buildRain(){
    const n=Math.min(Math.floor(canvas.width/6),160);
    rainDrops=Array.from({length:n},(_,i)=>new Rain(i<n*0.6));
  }

  let snowDrops = [];
  let cloudDrops = [];
  function buildCloud(){
    const n=Math.min(Math.floor(canvas.width*canvas.height/8000),60);
    cloudDrops=Array.from({length:n},(_,i)=>new Cloud(true));
  }
  function buildSnow(){
    const n=Math.min(Math.floor(canvas.width*canvas.height/5000),120);
    snowDrops=Array.from({length:n},(_,i)=>new Snow(i<n*0.7));
  }

  function rebuildAll(){buildParticles();if(state.isRaining)buildRain();else rainDrops=[];if(state.isSnowing)buildSnow();else snowDrops=[];if(state.isCloudy)buildCloud();else cloudDrops=[];}

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
      state.isRaining = state.weather==='rain';
      state.isSnowing = state.weather==='snow';
      state.isClear   = state.weather==='clear';
      state.isCloudy  = state.weather==='cloudy';
      if(state.isRaining)buildRain();else rainDrops=[];
      if(state.isSnowing)buildSnow();else snowDrops=[];
      return;
    }
    try{
      // Open-Meteo API（無料・登録不要・CORS対応）目黒区: 35.6418, 139.6975
      const res=await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=35.6418&longitude=139.6975&current=weathercode,precipitation&timezone=Asia%2FTokyo'
      );
      const data=await res.json();
      const code=data?.current?.weathercode??0;
      const precip=data?.current?.precipitation??0;
      // WMO天気コード: 0-1=晴れ, 2-3=曇り, 51-67=雨, 71-77=雪, 80-82=にわか雨, 85-86=にわか雪
      state.isRaining = (code>=51&&code<=67)||(code>=80&&code<=82);
      state.isSnowing = (code>=71&&code<=77)||(code>=85&&code<=86);
      state.isCloudy  = (code>=2&&code<=3)||code===45||code===48;
      state.isClear   = code<=1;
      if(state.isRaining)buildRain();else rainDrops=[];
      if(state.isSnowing)buildSnow();else snowDrops=[];
      if(state.isCloudy)buildCloud();else cloudDrops=[];
      console.log(`%c[heroWeather] Open-Meteo: code=${code} precip=${precip}mm`,'color:#3ecfcf');
    }catch(e){
      console.warn('[heroWeather] Open-Meteo失敗、気象庁にフォールバック',e);
      try{
        const res=await fetch('https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json');
        const data=await res.json();
        const areas=data[0]?.timeSeries?.[0]?.areas??[];
        const area=areas.find(a=>a.area?.name==='東京地方')??areas[0];
        const code=area?.weatherCodes?.[0]??'100';
        state.isRaining=/^3/.test(code);state.isSnowing=/^4/.test(code);state.isClear=/^1/.test(code);
        if(state.isRaining)buildRain();else rainDrops=[];
        if(state.isSnowing)buildSnow();else snowDrops=[];
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
    if(state.isSnowing)snowDrops.forEach(s=>{s.update();s.draw();});
    if(state.isCloudy)cloudDrops.forEach(c=>{c.update();c.draw();});
    drawGlitch();
    if(Math.random()<1/180)triggerGlitch();

    requestAnimationFrame(animate);
  }

  // ── コンソールAPI ──────────────────────────────────
  window.heroWeather={
    setSeason(s){if(!['spring','summer','autumn','winter'].includes(s)){console.warn('spring/summer/autumn/winter');return;}state.season=s;if(cfg.petal){resize();rebuildAll();}console.log(`%c[heroWeather] season→${s}`,'color:#3ecfcf');},
    setWeather(w){if(!['auto','clear','rain','snow','cloudy'].includes(w)){console.warn('auto/clear/rain/snow');return;}state.weather=w;fetchWeather();console.log(`%c[heroWeather] weather→${w}`,'color:#3ecfcf');},
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
        const stripped = text
          .replace(/\/\/[^\n]*/g, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/,(\s*[}\]])/g, '$1');
        const json = JSON.parse(stripped);
        for (const key of Object.keys(json)) {
          if (typeof json[key] === 'object' && !Array.isArray(json[key])) {
            cfg[key] = Object.assign(cfg[key] ?? {}, json[key]);
          } else {
            cfg[key] = json[key];
          }
        }
        console.log('%c[heroWeather] hero-weather.jsonc 読み込み完了', 'color:#3ecfcf');
      }
    } catch(e) { console.warn('[heroWeather] JSONC読み込み失敗、デフォルト値を使用', e); }

    // 必須キーのフォールバック（常に実行してcfg.petalが必ず存在するように）
    cfg.petal = Object.assign({
      count:80, speedMin:[2,4], speedMax:[5,9], sizeMin:9, sizeMax:19,
      glitchRate:0.08, glitchDuration:[2,5], glitchShift:[0.5,2.5],
      glitchRange:0.1, glitchOpacity:0.8, sliceCount:[3,6]
    }, cfg.petal ?? {});
    cfg.leaf   = Object.assign({
      noiseCount:3, glitchRate:0.05, glitchDuration:[2,5], glitchShift:[0.5,2.5],
      glitchRange:0.35, glitchOpacity:0.8, sliceCount:[3,6]
    }, cfg.leaf ?? {});
    cfg.rain   = Object.assign({ density:6 },   cfg.rain   ?? {});
    cfg.glitch = Object.assign({ rate:180 },     cfg.glitch ?? {});

    if (cfg.brightness !== 'auto') state.brightness = cfg.brightness;

    resize();
    rebuildAll();
    animate();
    fetchWeather();
    console.log(`%c[heroWeather] started — ${particles.length} particles`, 'color:#3ecfcf');
  }

  window.addEventListener('resize',()=>{resize();if(cfg.petal)rebuildAll();});

  if(document.readyState==='complete'){
    start();
  }else{
    window.addEventListener('load',start);
  }
})();
