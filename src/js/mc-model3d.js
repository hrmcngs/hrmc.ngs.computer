/*!
 * mc-model3d.js — Minecraft のアイテム/ブロックモデル (elements + textures + display.gui)
 *                 を three.js でインベントリ風に 3D 描画する。
 *
 *  依存: グローバル THREE（three.min.js を先に読み込む）
 *
 *  McModel3D.render(targetCanvas, render3d) -> Promise<boolean>
 *    render3d = { elements, textures: {var:url}, textureSize:[w,h], gui:{rotation,translation,scale}|null }
 *    戻り値 false のときは描画不可（呼び出し側で平面テクスチャにフォールバック）。
 *
 *  1 つの WebGL コンテキストを使い回し、各モデルを描いて対象 canvas に転写する
 *  （カードごとに WebGL コンテキストを作るとブラウザの上限に達するため）。
 */
(function (root) {
  'use strict';
  // THREE は後から（CDN で）読み込まれることがあるので遅延参照する。
  let THREE = root.THREE;
  const api = { render };
  Object.defineProperty(api, 'available', { get: () => { THREE = root.THREE; return !!THREE; } });
  root.McModel3D = api;

  const SIZE = 320;                 // オフスクリーン描画解像度（高めにして縮小表示で綺麗に）
  const FALLBACK_ROT = [30, 225, 0]; // display.gui 未定義モデル用（ブロック既定のアイソメ）
  const TEX = new Map();            // url -> Promise<THREE.Texture|null>
  let R = null, scene = null, camera = null;
  const d2r = (d) => (d * Math.PI) / 180;

  function init() {
    if (R) return;
    R = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    R.setSize(SIZE, SIZE);
    R.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
    // gui_light: front 相当のフラットな照明（明るさ優先）
    scene.add(new THREE.AmbientLight(0xffffff, 0.92));
    const dir = new THREE.DirectionalLight(0xffffff, 0.35);
    dir.position.set(0.4, 0.8, 1);
    scene.add(dir);
  }

  function loadTexture(url) {
    if (TEX.has(url)) return TEX.get(url);
    const p = new Promise((resolve) => {
      new THREE.TextureLoader().load(
        url,
        (t) => {
          t.magFilter = THREE.NearestFilter;
          t.minFilter = THREE.NearestFilter;
          t.generateMipmaps = false;
          if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
          else t.encoding = 3001; // sRGBEncoding (旧API)
          // アニメーションテクスチャ（縦にフレームが連なる: 高さ = 幅 × フレーム数）を検出し、
          // 先頭フレーム(画像上端)だけを表示する（全フレームを 1 タイルに潰さない）。
          const im = t.image;
          if (im && im.width > 0 && im.height > im.width && im.height % im.width === 0) {
            const n = im.height / im.width;
            t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
            t.repeat.set(1, 1 / n);
            t.offset.set(0, 1 - 1 / n); // frame 0（flipY 前提で画像上端）
            t.userData.frames = n;
          }
          resolve(t);
        },
        undefined,
        () => resolve(null)
      );
    });
    TEX.set(url, p);
    return p;
  }

  // Minecraft の各面 → テクスチャ左上/右上/右下/左下 に対応する 3D コーナー
  // 座標は 0..16 モデル空間（呼び出し側で /16 する）
  function faceCorners(f, t, dir) {
    const x0 = f[0], y0 = f[1], z0 = f[2], x1 = t[0], y1 = t[1], z1 = t[2];
    switch (dir) {
      case 'up':    return [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
      case 'down':  return [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]];
      case 'north': return [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]];
      case 'south': return [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]];
      case 'west':  return [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]];
      case 'east':  return [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]];
      default:      return null;
    }
  }

  // face.uv=[u1,v1,u2,v2] → 左上/右上/右下/左下 の UV（three は V が上向きなので反転）
  function faceUVs(uv, tw, th, rot) {
    const u1 = uv[0] / tw, v1 = uv[1] / th, u2 = uv[2] / tw, v2 = uv[3] / th;
    let c = [
      [u1, 1 - v1], // TL
      [u2, 1 - v1], // TR
      [u2, 1 - v2], // BR
      [u1, 1 - v2], // BL
    ];
    const steps = ((rot || 0) / 90) & 3;
    for (let i = 0; i < steps; i++) c = [c[3], c[0], c[1], c[2]];
    return c;
  }

  function quadGeometry(corners, uvs, s) {
    const p = corners.map((c) => [c[0] / s, c[1] / s, c[2] / s]);
    const pos = new Float32Array([
      ...p[0], ...p[1], ...p[2],
      ...p[0], ...p[2], ...p[3],
    ]);
    const uv = new Float32Array([
      ...uvs[0], ...uvs[1], ...uvs[2],
      ...uvs[0], ...uvs[2], ...uvs[3],
    ]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }

  async function buildGroup(r3d) {
    // UV の正規化基準（texture_size）を決める。
    // このゲームのモデルはバニラ挙動＝UV は 16 基準で、モデルの texture_size 宣言は
    // Blockbench 固有のヒントに過ぎず実態と合っていない（[8,8] や [32,32] でも実 UV は 0..16）。
    // 宣言値を信用せず、実際の UV から求める: 基本 16、16 を超えるモデルだけ収まる 2 冪へ拡張。
    let maxU = 0, maxV = 0;
    for (const el of r3d.elements || []) {
      for (const dir in (el.faces || {})) {
        const uv = el.faces[dir].uv;
        if (uv) { maxU = Math.max(maxU, uv[0], uv[2]); maxV = Math.max(maxV, uv[1], uv[3]); }
      }
    }
    const pow2 = (n) => { let p = 16; while (p < n) p *= 2; return p; };
    const tw = pow2(maxU);
    const th = pow2(maxV);

    // 使用テクスチャを先読み → Material 化（読み込めた面だけ描く。null は面ごとスキップ）
    const mats = {};
    await Promise.all(Object.keys(r3d.textures).map(async (k) => {
      const tex = await loadTexture(r3d.textures[k]);
      // Minecraft の cutout 相当: transparent は使わず alphaTest で切り抜き。
      // （transparent:true だと密なモデルで奥の面が透けて描画順が壊れ、UV が壊れて見える）
      mats[k] = tex
        ? new THREE.MeshBasicMaterial({ map: tex, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide })
        : null; // 読めなかったテクスチャは白面にせずスキップ
    }));

    // アニメーションテクスチャ（フレーム連結）を収集（フレーム送りに使う）
    const animTex = [];
    for (const k in mats) {
      const tx = mats[k] && mats[k].map;
      if (tx && tx.userData && tx.userData.frames > 1) animTex.push({ texture: tx, frames: tx.userData.frames });
    }

    const model = new THREE.Group();
    const disposables = [];

    for (const el of r3d.elements || []) {
      if (!el || !el.from || !el.to || !el.faces) continue;
      const elGroup = new THREE.Group();

      for (const dir in el.faces) {
        const face = el.faces[dir];
        const corners = faceCorners(el.from, el.to, dir);
        if (!corners || !face) continue;
        let key = face.texture;
        if (typeof key === 'string' && key[0] === '#') key = key.slice(1);
        // 面が参照するテクスチャが読めていなければ、その面は描かない（白面防止）
        const mat = (key in mats) ? mats[key] : mats[Object.keys(mats)[0]];
        if (!mat) continue;
        // uv 未指定なら from/to から自動生成（MC 準拠の簡易版）
        const uv = face.uv || autoUV(el.from, el.to, dir);
        const geo = quadGeometry(corners, faceUVs(uv, tw, th, face.rotation), 16);
        disposables.push(geo);
        elGroup.add(new THREE.Mesh(geo, mat));
      }

      // element の回転（origin 周り）
      const rot = el.rotation;
      if (rot && rot.angle) {
        const o = rot.origin || [8, 8, 8];
        const pivot = new THREE.Group();
        pivot.position.set(o[0] / 16, o[1] / 16, o[2] / 16);
        elGroup.position.set(-o[0] / 16, -o[1] / 16, -o[2] / 16);
        const a = d2r(rot.angle);
        if (rot.axis === 'x') pivot.rotation.x = a;
        else if (rot.axis === 'y') pivot.rotation.y = a;
        else pivot.rotation.z = a;
        pivot.add(elGroup);
        model.add(pivot);
      } else {
        model.add(elGroup);
      }
    }

    // モデル自身の中心を原点へ（回転で遠心的に飛ぶのを防ぐ）。
    const bb = new THREE.Box3().setFromObject(model);
    model.position.sub(bb.getCenter(new THREE.Vector3()));

    // display.gui の「向き(rotation)」と「比率(scale)」を適用（＝インベントリ GUI 表示の姿勢）。
    // MC の順序に合わせ Scale → Rotate。translation は使わず、見切れ防止でカメラ中央寄せ。
    const gui = r3d.gui || {};
    const s = gui.scale || [1, 1, 1];
    const rr = gui.rotation || FALLBACK_ROT;
    const gScale = new THREE.Group(); gScale.add(model);
    gScale.scale.set(s[0], s[1], s[2]);
    const posed = new THREE.Group(); posed.add(gScale);
    posed.rotation.set(d2r(rr[0]), d2r(rr[1]), d2r(rr[2]), 'XYZ');

    return { posed, disposables, animTex };
  }

  // uv 未指定面の自動 UV（面に垂直な軸を無視して from/to をそのまま使う）
  function autoUV(f, t, dir) {
    switch (dir) {
      case 'up':
      case 'down':   return [f[0], f[2], t[0], t[2]];
      case 'north':
      case 'south':  return [f[0], f[1], t[0], t[1]];
      case 'west':
      case 'east':   return [f[2], f[1], t[2], t[1]];
      default:       return [0, 0, 16, 16];
    }
  }

  // --- アニメーション再生（事前レンダした全フレームを軽量にループ描画）---
  const FRAME_CAP = 200;            // 事前レンダ画像の保存解像度（メモリ節約・64px 表示には十分）
  const FRAME_MS = 120;             // 1 フレームの表示時間
  const animating = [];             // { canvas, frames: [canvas...] }
  let animTimer = null, animTick = 0;
  function ensureAnimTimer() {
    if (animTimer) return;
    animTimer = setInterval(() => {
      animTick++;
      for (let i = animating.length - 1; i >= 0; i--) {
        const a = animating[i];
        if (!a.canvas.isConnected) { animating.splice(i, 1); continue; } // DOM から消えたら停止
        const img = a.frames[animTick % a.frames.length];
        const cx = a.canvas.getContext('2d');
        cx.clearRect(0, 0, a.canvas.width, a.canvas.height);
        cx.drawImage(img, 0, 0, a.canvas.width, a.canvas.height);
      }
    }, FRAME_MS);
  }
  function stopAnim(canvas) {
    const i = animating.findIndex((a) => a.canvas === canvas);
    if (i >= 0) animating.splice(i, 1);
  }

  async function render(targetCanvas, r3d) {
    THREE = root.THREE; // 遅延ロードされた THREE を反映
    if (!THREE || !r3d || !r3d.elements || !r3d.elements.length) return false;
    try {
      init();
      stopAnim(targetCanvas); // 再描画時は既存アニメを止める
      const { posed, disposables, animTex } = await buildGroup(r3d);
      scene.add(posed);
      posed.updateMatrixWorld(true);

      // gui 姿勢のモデルをバウンディングにフィットさせて中央に収める（見切れ防止）
      const box = new THREE.Box3().setFromObject(posed);
      if (box.isEmpty()) { scene.remove(posed); disposables.forEach((g) => g.dispose()); return false; }
      const c = box.getCenter(new THREE.Vector3());
      const sz = box.getSize(new THREE.Vector3());
      const half = (Math.max(sz.x, sz.y) / 2) * 1.1 || 0.5;
      camera.left = -half; camera.right = half; camera.top = half; camera.bottom = -half;
      camera.position.set(c.x, c.y, c.z + Math.max(sz.z, 1) + 5);
      camera.near = 0.01; camera.far = 1000;
      camera.lookAt(c);
      camera.updateProjectionMatrix();

      // アニメの総フレーム数（各テクスチャのフレーム数の最小公倍数までは要らないので最大値で回す）
      const nFrames = animTex.reduce((m, a) => Math.max(m, a.frames), 1);
      const drawFrame = (f) => {
        for (const a of animTex) a.texture.offset.y = 1 - ((f % a.frames) + 1) / a.frames;
        R.render(scene, camera);
      };

      targetCanvas.width = SIZE; targetCanvas.height = SIZE;
      const ctx = targetCanvas.getContext('2d');

      if (nFrames <= 1) {
        drawFrame(0);
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.drawImage(R.domElement, 0, 0, SIZE, SIZE);
      } else {
        // 全フレームを事前レンダして小さめの canvas に保存 → 軽量ループ再生
        const frames = [];
        for (let f = 0; f < nFrames; f++) {
          drawFrame(f);
          const fc = document.createElement('canvas');
          fc.width = fc.height = FRAME_CAP;
          fc.getContext('2d').drawImage(R.domElement, 0, 0, FRAME_CAP, FRAME_CAP);
          frames.push(fc);
        }
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.drawImage(frames[0], 0, 0, SIZE, SIZE);
        animating.push({ canvas: targetCanvas, frames });
        ensureAnimTimer();
      }

      scene.remove(posed);
      disposables.forEach((g) => g.dispose());
      return true;
    } catch (e) {
      return false;
    }
  }

  api.stopAnim = stopAnim;
})(typeof self !== 'undefined' ? self : this);
