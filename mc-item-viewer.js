/*! mc-item-viewer.js — bundled Item Viewer (McItems + McModel3D + embed UI).
 *  Build: cat mc-items.js mc-model3d.js viewer-embed.js. Do not edit directly.
 *  Usage: <script src=".../mc-item-viewer.js" data-repos="owner/repo,..."></script> */

/*!
 * mc-items.js — Minecraft Mod / Datapack / Resourcepack の Item を
 *               GitHub リポジトリから取得するための小さな API。
 *
 * 静的サイト (GitHub Pages) 上で完結するようにブラウザのみで動作する。
 * <script src> でも ES Module (import) でも使える。
 *
 * ------------------------------------------------------------------
 *  使い方 (ブラウザ):
 *
 *    <script src="src/js/mc-items.js"></script>
 *    <script>
 *      const items = await McItems.fetchItems(
 *        'https://github.com/Drowse-Lab/The-four-primitives-and-Weapons'
 *      );
 *      // items = [{ id, namespace, ref, name, nameEn, nameJa,
 *      //            texture, model, sourcePath }, ...]
 *    </script>
 *
 *  使い方 (module):
 *
 *    import { fetchItems } from './src/js/mc-items.js';
 *
 * ------------------------------------------------------------------
 *  低レベル API:
 *    McItems.parseRepoUrl(url)      -> { owner, repo, branch?, subPath? }
 *    McItems.resolveBranch(repo)    -> Promise<string>   (default branch)
 *    McItems.fetchTree(repo)        -> Promise<TreeEntry[]>
 *    McItems.extractItems(tree,repo)-> Promise<Item[]>
 *    McItems.fetchItems(url, opts)  -> Promise<Item[]>   (高レベル: 上を全部やる)
 *
 *  opts:
 *    { token?: string,          // GitHub PAT (rate limit 対策・任意)
 *      onProgress?: (msg)=>void, // 進捗コールバック
 *      signal?: AbortSignal }
 * ------------------------------------------------------------------
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; // Node/CJS
  root.McItems = api;                                                     // browser global
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const API = 'https://api.github.com';
  const CDN = 'https://cdn.jsdelivr.net/gh';


  function stripFormatting(s) {
    return String(s == null ? '' : s)
      .replace(/§./g, '')   
      .replace(/&[0-9a-fk-or]/gi, '') 
      .trim();
  }

  function prettify(id) {
    return String(id)
      .split('/').pop()
      .replace(/[_.-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  /**
   * GitHub の様々な URL 形式を owner/repo/branch/subPath へ分解する。
   *   https://github.com/owner/repo
   *   https://github.com/owner/repo/tree/branch/some/dir
   *   owner/repo
   *   git@github.com:owner/repo.git
   */
  function parseRepoUrl(url) {
    if (!url || typeof url !== 'string') throw new Error('URL が空です');
    let s = url.trim();

    const ssh = s.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
    if (ssh) return { owner: ssh[1], repo: ssh[2] };

    if (/^[\w.-]+\/[\w.-]+$/.test(s)) {
      const [owner, repo] = s.split('/');
      return { owner, repo: repo.replace(/\.git$/i, '') };
    }

    let u;
    try {
      u = new URL(s.startsWith('http') ? s : 'https://' + s);
    } catch (_) {
      throw new Error('GitHub の URL として認識できませんでした: ' + url);
    }
    if (!/github\.com$/i.test(u.hostname) && !/githubusercontent\.com$/i.test(u.hostname)) {
      throw new Error('github.com の URL を貼り付けてください');
    }
    const parts = u.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length < 2) throw new Error('owner/repo が読み取れません');

    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');
    let branch, subPath;
    if ((parts[2] === 'tree' || parts[2] === 'blob') && parts[3]) {
      branch = parts[3];
      subPath = parts.slice(4).join('/') || undefined;
    }
    return { owner, repo, branch, subPath };
  }

  function ghHeaders(token) {
    const h = { Accept: 'application/vnd.github+json' };
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }

  async function ghJson(url, opts) {
    const res = await fetch(url, {
      headers: ghHeaders(opts && opts.token),
      signal: opts && opts.signal,
    });
    if (res.status === 403 || res.status === 429) {
      const remain = res.headers.get('x-ratelimit-remaining');
      if (remain === '0') {
        throw new Error(
          'GitHub API のレート制限に達しました (未認証は 60回/時)。' +
          ' 少し待つか、Personal Access Token を入力してください。'
        );
      }
      throw new Error('GitHub API へのアクセスが拒否されました (403)');
    }
    if (res.status === 404) throw new Error('リポジトリが見つかりません (404)');
    if (!res.ok) throw new Error('GitHub API エラー: ' + res.status);
    return res.json();
  }

  async function resolveBranch(repo, opts) {
    if (repo.branch) return repo.branch;
    const meta = await ghJson(`${API}/repos/${repo.owner}/${repo.repo}`, opts);
    return meta.default_branch || 'main';
  }

  async function fetchTree(repo, opts) {
    opts = opts || {};
    const branch = await resolveBranch(repo, opts);
    if (opts.onProgress) opts.onProgress(`ファイル一覧を取得中… (${branch})`);
    const data = await ghJson(
      `${API}/repos/${repo.owner}/${repo.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      opts
    );
    if (data.truncated && opts.onProgress) {
      opts.onProgress('ツリーが大きすぎて一部のみ取得しました');
    }
    return { branch, entries: (data.tree || []).filter((e) => e.type === 'blob') };
  }

  function contentUrl(repo, branch, path) {
    const p = path.split('/').map(encodeURIComponent).join('/');
    return `${CDN}/${repo.owner}/${repo.repo}@${encodeURIComponent(branch)}/${p}`;
  }
  const rawUrl = contentUrl; 

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function fetchRetry(url, opts, tries) {
    tries = tries || 6;
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetch(url, { signal: opts && opts.signal });
        if (res.ok || res.status === 404) return res; 
        if (res.status !== 429 && res.status < 500) return res; 
        const ra = parseFloat(res.headers.get('retry-after'));
        if (ra > 0) { await sleep(Math.min(ra * 1000, 5000)); continue; }
        lastErr = new Error('HTTP ' + res.status);
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        lastErr = e;
      }

      await sleep(Math.min(500 * Math.pow(2, i), 5000) + Math.floor(Math.random() * 250));
    }
    throw lastErr || new Error('fetch failed: ' + url);
  }

  async function mapLimit(arr, limit, fn) {
    const out = new Array(arr.length);
    let i = 0;
    async function worker() {
      while (i < arr.length) {
        const idx = i++;
        out[idx] = await fn(arr[idx], idx);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, arr.length) }, worker));
    return out;
  }
  function texRefToKey(ref) {
    let ns = 'minecraft', rel = ref;
    const i = ref.indexOf(':');
    if (i >= 0) { ns = ref.slice(0, i); rel = ref.slice(i + 1); }
    return `${ns.toLowerCase()}:textures/${rel.toLowerCase()}`;
  }

  function modelRefToKey(ref) {
    let ns = 'minecraft', rel = ref;
    const i = ref.indexOf(':');
    if (i >= 0) { ns = ref.slice(0, i); rel = ref.slice(i + 1); }
    return `${ns.toLowerCase()}:${rel.toLowerCase()}`;
  }

  function refFromItemDef(def) {
    const root = (def && def.model) || def;
    let first = null, preferred = null;
    (function walk(node, key) {
      if (!node || typeof node !== 'object') return;
      if (typeof node.model === 'string') {
        if (!first) first = node.model;
        if (/false|fallback|default/i.test(key)) preferred = preferred || node.model;
      }
      for (const k in node) {
        const v = node[k];
        if (v && typeof v === 'object') {
          if (Array.isArray(v)) v.forEach((x) => walk(x, k));
          else walk(v, k);
        }
      }
    })(root, '');
    return preferred || first;
  }

  async function extractCreativeTabs(entries, repo, branch, groupNames, opts) {
    const javaByName = new Map();
    for (const e of entries) {
      const m = e.path.match(/([^/]+)\.java$/);
      if (m && /\/java\//.test(e.path)) javaByName.set(m[1], e.path);
    }
    if (!javaByName.size) return null;

    const fetchText = async (path) => {
      try {
        const r = await fetchRetry(contentUrl(repo, branch, path), opts);
        return r.ok ? await r.text() : null;
      } catch (_) { return null; }
    };

    const cands = [...javaByName.entries()]
      .filter(([n]) => /populat|creativetab|modtabs|tabs/i.test(n))
      .slice(0, 8);
    let popText = null;
    for (const [, p] of cands) {
      const t = await fetchText(p);
      if (t && /BuildCreativeModeTabContentsEvent/.test(t) && /event\.getTab\(\)/.test(t) && /\.accept\(/.test(t)) {
        popText = t; break;
      }
    }
    if (!popText) return null;

    const secRe = /getTab\(\)\s*==\s*([\w.]+)\.([A-Z_0-9]+)\.get\(\)/g;
    const marks = [];
    let mm;
    while ((mm = secRe.exec(popText))) {
      marks.push({ idx: mm.index, tabsClass: mm[1].split('.').pop(), tabConst: mm[2] });
    }
    if (!marks.length) return null;
    const sections = [];
    for (let i = 0; i < marks.length; i++) {
      const body = popText.slice(marks[i].idx, i + 1 < marks.length ? marks[i + 1].idx : popText.length);
      const refs = [];
      const accRe = /\.accept\(\s*([A-Za-z_]\w*)\.([A-Z_0-9]+)/g;
      let am;
      while ((am = accRe.exec(body))) refs.push({ cls: am[1], cst: am[2] });
      sections.push({ tabsClass: marks[i].tabsClass, tabConst: marks[i].tabConst, refs });
    }

    // 2) 参照される registrar クラスを読み CONST -> registry id
    const constToId = new Map(); // "Class.CONST" -> id
    const classes = new Set(sections.flatMap((s) => s.refs.map((r) => r.cls)));
    await Promise.all([...classes].map(async (cls) => {
      const p = javaByName.get(cls);
      if (!p) return;
      const t = await fetchText(p);
      if (!t) return;
      const rr = /\b([A-Z_0-9]{2,})\s*=\s*[\w.]*REGISTRY\.register\(\s*"([\w./]+)"/g;
      let r;
      while ((r = rr.exec(t))) constToId.set(cls + '.' + r[1], r[2]);
    }));

    // 3) タブ定義クラスを読み tabConst -> { id, titleKey }
    const tabsClasses = new Set(sections.map((s) => s.tabsClass));
    const tabDef = new Map(); // tabConst -> { id, titleKey }
    await Promise.all([...tabsClasses].map(async (cls) => {
      const p = javaByName.get(cls);
      if (!p) return;
      const t = await fetchText(p);
      if (!t) return;
      const tr = /\b([A-Z_0-9]{2,})\s*=\s*[\w.]*REGISTRY\.register\(\s*"([\w]+)"\s*,[\s\S]{0,400}?translatable\(\s*"([^"]+)"/g;
      let r;
      while ((r = tr.exec(t))) tabDef.set(r[1], { id: r[2], titleKey: r[3] });
    }));

    // 4) 組み立て
    const itemTab = new Map();
    const tabTitle = new Map();
    const order = [];
    for (const s of sections) {
      const def = tabDef.get(s.tabConst) || { id: s.tabConst.toLowerCase(), titleKey: null };
      const title = (def.titleKey && groupNames.get(def.titleKey)) || prettify(def.id);
      if (!tabTitle.has(def.id)) { tabTitle.set(def.id, title); order.push(def.id); }
      for (const ref of s.refs) {
        const id = constToId.get(ref.cls + '.' + ref.cst);
        if (!id) continue;
        const iid = id.split(':').pop();
        if (!itemTab.has(iid)) itemTab.set(iid, def.id);
      }
    }
    return itemTab.size ? { itemTab, tabTitle, order } : null;
  }

  /**
   * ツリーから Item を抽出する。
   *  - まず items/*.json (1.21+) と models/item/*.json (トップレベル) を「登録アイテム」として列挙
   *  - 各アイテムのモデル JSON を読み、GUI 表示テクスチャを解決
   *      2D  : textures.layer0
   *      3D  : textures.particle / "0" / 最初のテクスチャ（＝GUIで見えるテクスチャ）
   *      parent のみのモデルは親を辿って解決
   *  - overrides の差し替え先など「単体では登録アイテムでない」モデルは除外
   *  - lang/(ja_jp|en_us).json から表示名を解決
   */
  async function extractItems(tree, repo, opts) {
    opts = opts || {};
    const { branch, entries } = tree;
    const sub = opts.subPath ? opts.subPath.replace(/\/+$/, '') + '/' : '';
    const inScope = (path) => !sub || path.startsWith(sub);

    // --- インデックス構築（ツリーは取得済みなので追加リクエスト不要）---
    const pngIndex = new Map();     // "ns:textures/rel" -> path
    const modelIndex = new Map();   // "ns:relUnderModels" -> path
    const itemDefs = [];            // { ns, id, path }   (items/*.json, 1.21+)
    const topItemModels = [];       // { ns, id, path, ref } (models/item/<id>.json)
    const langFiles = [];

    for (const e of entries) {
      if (e.type && e.type !== 'blob') continue;
      const p = e.path;
      if (!inScope(p)) continue;
      let m;
      if ((m = p.match(/assets\/([^/]+)\/(textures\/.+)\.png$/i))) {
        pngIndex.set(`${m[1].toLowerCase()}:${m[2].toLowerCase()}`, p);
      } else if ((m = p.match(/assets\/([^/]+)\/models\/(.+)\.json$/i))) {
        modelIndex.set(`${m[1].toLowerCase()}:${m[2].toLowerCase()}`, p);
        const im = m[2].match(/^item\/([^/]+)$/i); // トップレベルの item モデルのみ
        if (im) topItemModels.push({ ns: m[1], id: im[1], path: p, ref: `${m[1]}:item/${im[1]}` });
      } else if ((m = p.match(/assets\/([^/]+)\/items\/(.+)\.json$/i))) {
        // id はサブフォルダ込みのフルパス（basename だけだと別フォルダの同名が衝突して消える）
        itemDefs.push({ ns: m[1], id: m[2], path: p });
      } else if (/(^|\/)lang\/[a-z]{2}_[a-z]{2}\.json$/i.test(p)) {
        langFiles.push(e);
      }
    }

    // --- lang → 名前マップ ---
    if (opts.onProgress) opts.onProgress(`言語ファイル ${langFiles.length} 件を読み込み中…`);
    const names = new Map();       // item./block. key -> { en, ja }
    const groupNames = new Map();  // itemGroup.* key -> 表示名（creative タブ名）
    await Promise.all(
      langFiles.map(async (e) => {
        const locale = e.path.match(/([a-z]{2}_[a-z]{2})\.json$/i)[1].toLowerCase();
        const which = locale === 'ja_jp' ? 'ja' : locale === 'en_us' ? 'en' : null;
        if (!which) return;
        try {
          const res = await fetchRetry(rawUrl(repo, branch, e.path), opts);
          if (!res.ok) return;
          const json = await res.json();
          for (const k in json) {
            if (/^itemGroup\./.test(k)) {
              // ja を優先。未設定のときだけ en で埋める
              if (which === 'ja' || !groupNames.has(k)) groupNames.set(k, stripFormatting(json[k]));
              continue;
            }
            if (!/^(item|block)\./.test(k)) continue;
            const cur = names.get(k) || {};
            cur[which] = stripFormatting(json[k]);
            names.set(k, cur);
          }
        } catch (_) { /* 壊れた lang は無視 */ }
      })
    );

    // --- モデル JSON ローダ（パス単位でキャッシュ）---
    const modelCache = new Map();
    async function loadModelPath(path) {
      if (!path) return null;
      if (modelCache.has(path)) return modelCache.get(path);
      let json = null;
      try {
        const res = await fetchRetry(rawUrl(repo, branch, path), opts);
        if (res.ok) json = await res.json();
      } catch (_) { /* リトライしても取れないモデルは諦める */ }
      modelCache.set(path, json);
      return json;
    }
    const modelPathByRef = (ref) => modelIndex.get(modelRefToKey(ref)) || null;

    const isBuiltinParent = (ref) =>
      /(^|:|\/)(item\/generated|item\/handheld|item\/generated|builtin\/)/i.test(ref);

    // 親チェーンをたどってモデルをマージ（elements / textures / display.gui / texture_size）
    async function resolveFullModel(model, depth) {
      if (!model || depth > 6) return { textures: {}, elements: null, textureSize: null, gui: null };
      let base = { textures: {}, elements: null, textureSize: null, gui: null };
      const parent = typeof model.parent === 'string' ? model.parent : null;
      if (parent && !isBuiltinParent(parent)) {
        const pp = modelPathByRef(parent);
        if (pp) base = await resolveFullModel(await loadModelPath(pp), depth + 1);
      }
      return {
        textures: Object.assign({}, base.textures, model.textures || {}),
        elements: Array.isArray(model.elements) ? model.elements : base.elements,
        textureSize: model.texture_size || base.textureSize,
        gui: (model.display && model.display.gui) || base.gui,
      };
    }

    // テクスチャ変数の値（#ref も解決）を返す
    function resolveVar(tex, key) {
      let v = tex[key], guard = 0;
      while (typeof v === 'string' && v[0] === '#' && guard++ < 8) v = tex[v.slice(1)];
      return typeof v === 'string' && v[0] !== '#' ? v : null;
    }

    // 3D 描画用データを組み立てる（elements + 変数→テクスチャURL + gui 変換）
    function buildRender3d(full) {
      if (!Array.isArray(full.elements) || !full.elements.length) return null;
      const textures = {};
      for (const k in full.textures) {
        const val = resolveVar(full.textures, k);
        if (!val) continue;
        const pp = pngIndex.get(texRefToKey(val));
        if (pp) textures[k] = contentUrl(repo, branch, pp);
      }
      if (!Object.keys(textures).length) return null; // 貼るテクスチャが無ければ 3D 描画不可
      return {
        elements: full.elements,
        textures,
        textureSize: full.textureSize || [16, 16],
        gui: full.gui || null,
      };
    }

    // モデルから GUI 表示テクスチャ参照・3D 情報を解決する
    async function resolveModelInfo(model) {
      const full = await resolveFullModel(model, 0);
      const tex = full.textures;
      const hasElements = Array.isArray(full.elements) && full.elements.length > 0;
      // フォールバック用の平面テクスチャ: layer0 → particle → "0" → 最初
      let texRef = resolveVar(tex, 'layer0') || resolveVar(tex, 'layer1') ||
        resolveVar(tex, 'particle') || resolveVar(tex, '0');
      if (!texRef) for (const k in tex) { const v = resolveVar(tex, k); if (v) { texRef = v; break; } }
      return { texRef, is3d: hasElements, full };
    }

    // --- 1.21+ の item def を先読みして、代表モデルと「差し替え用バリアント」を把握 ---
    const variantTargets = new Set(); // on_true 等で参照されるだけのモデル（単体では非アイテム）
    await mapLimit(itemDefs, 20, async (d) => {
      const def = await loadModelPath(d.path);
      if (!def) return;
      (function walk(n) {
        if (!n || typeof n !== 'object') return;
        if (typeof n.model === 'string') variantTargets.add(modelRefToKey(n.model));
        for (const k in n) { const v = n[k]; if (v && typeof v === 'object') (Array.isArray(v) ? v.forEach(walk) : walk(v)); }
      })(def.model || def);
      d.chosenRef = refFromItemDef(def);
    });
    for (const d of itemDefs) if (d.chosenRef) variantTargets.delete(modelRefToKey(d.chosenRef)); // 代表は除く

    // --- 候補（登録アイテム）を組み立て。items/ 優先、無ければ models/item/ ---
    const candMap = new Map(); // "ns:id" -> candidate
    for (const d of itemDefs) {
      const key = `${d.ns.toLowerCase()}:${d.id.toLowerCase()}`;
      if (!candMap.has(key)) candMap.set(key, { ns: d.ns, id: d.id, defPath: d.path, modelRef: d.chosenRef || null });
    }
    for (const t of topItemModels) {
      const key = `${t.ns.toLowerCase()}:${t.id.toLowerCase()}`;
      if (!candMap.has(key)) candMap.set(key, { ns: t.ns, id: t.id, defPath: null, modelRef: t.ref });
    }
    const cands = [...candMap.values()];

    // 候補が皆無なら旧方式（テクスチャ列挙）へフォールバック
    if (!cands.length) return legacyTextureItems(entries, repo, branch, names, inScope);

    // --- 各候補のモデルを必ず読み、3D 判定とテクスチャ解決を行う（同時実行制限）---
    // ※ 以前は item/<id>.png があると 2D 確定していたが、3D モデルでも
    //   インベントリ用の平面テクスチャを併せ持つことが多く、3D を取りこぼしていた。
    if (opts.onProgress) opts.onProgress(`アイテムを解析中… (0/${cands.length})`);
    const overrideTargets = new Set();
    const cmdItemRefs = new Set(); // custom_model_data で差し替える独自アイテム（pre-1.21 datapack）
    // 1 候補のモデルを読み、テクスチャ・3D・override を解決する（cmd アイテムにも再利用）
    async function resolveOne(c) {
      let texturePath = null, texRef = null, is3d = false, render3d = null;
      const model = c.modelRef ? await loadModelPath(modelPathByRef(c.modelRef)) : null;
      let iconModel = model; // アイコンに使うモデル（通常は本体）
      if (model && Array.isArray(model.overrides)) {
        for (const o of model.overrides) {
          if (o && typeof o.model === 'string') {
            overrideTargets.add(modelRefToKey(o.model));
            // custom_model_data 予測子で差し替える先＝バニラに追加された独自アイテム
            if (o.predicate && o.predicate.custom_model_data != null) cmdItemRefs.add(o.model);
          }
        }
        // 「cmd=0 が本体(parent)＝空/デフォルト」で cmd>0 の実バリアントがある場合、
        // アイコンは最小 cmd のバリアントで表示する（鞘の空っぽ白プレースホルダを避ける）。
        const parent = typeof model.parent === 'string' ? model.parent : null;
        const cmd0 = model.overrides.find((o) => o && o.predicate && o.predicate.custom_model_data === 0 && typeof o.model === 'string');
        if (cmd0 && parent && modelRefToKey(cmd0.model) === modelRefToKey(parent)) {
          const variant = model.overrides
            .filter((o) => o && o.predicate && o.predicate.custom_model_data > 0 && typeof o.model === 'string')
            .sort((a, b) => a.predicate.custom_model_data - b.predicate.custom_model_data)[0];
          if (variant) { const vm = await loadModelPath(modelPathByRef(variant.model)); if (vm) iconModel = vm; }
        }
      }
      const info = iconModel ? await resolveModelInfo(iconModel) : { texRef: null, is3d: false, full: null };
      texRef = info.texRef;
      is3d = info.is3d;
      if (is3d && info.full) render3d = buildRender3d(info.full); // 3D 描画データ
      // 平面テクスチャ（フォールバック用アイコン）: モデルの texRef → 慣習 item/<id> の順
      if (texRef) texturePath = pngIndex.get(texRefToKey(texRef)) || null;
      if (!texturePath) texturePath = pngIndex.get(`${c.ns.toLowerCase()}:textures/item/${c.id.toLowerCase()}`) || null;
      return { c, texRef, is3d, texturePath, render3d };
    }

    let done = 0;
    const tick = () => {
      done++;
      if (opts.onProgress && (done % 20 === 0)) opts.onProgress(`アイテムを解析中… (${done})`);
    };
    const resolved = await mapLimit(cands, 20, async (c) => { const r = await resolveOne(c); tick(); return r; });

    // custom_model_data で追加された独自アイテムを候補化して解決（既存候補でないもの）
    const cmdCands = [];
    for (const ref of cmdItemRefs) {
      const ns = ref.includes(':') ? ref.split(':')[0] : 'minecraft';
      const id = (ref.includes(':') ? ref.split(':')[1] : ref).replace(/^item\//, '');
      const key = `${ns.toLowerCase()}:${id.toLowerCase()}`;
      if (candMap.has(key)) continue;
      candMap.set(key, true);
      cmdCands.push({ ns, id, defPath: null, modelRef: ref, cmd: true });
    }
    const cmdResolved = cmdCands.length
      ? await mapLimit(cmdCands, 20, async (c) => { const r = await resolveOne(c); tick(); return r; })
      : [];

    // --- Item を組み立て ---
    const items = [];
    for (const { c, texRef, is3d, texturePath, render3d } of resolved.concat(cmdResolved)) {
      const itemNm = names.get(`item.${c.ns}.${c.id}`);
      const blockNm = names.get(`block.${c.ns}.${c.id}`);
      // ブロックは表示しない（lang が block.* のみで item.* が無い＝ブロックのアイテム形）
      if (!itemNm && blockNm) continue;
      const nm = itemNm || blockNm || {};
      const hasName = !!(nm.ja || nm.en);
      const selfKey = `${c.ns.toLowerCase()}:item/${c.id.toLowerCase()}`;
      // overrides / item def の差し替え先で、名前を持たないもの＝実アイテムでないので除外
      // （ただし custom_model_data 由来の独自アイテムは意図的に追加なので除外しない）
      if (!c.cmd && !c.defPath && (overrideTargets.has(selfKey) || variantTargets.has(selfKey)) && !hasName) continue;
      // アイコン（平面テクスチャ）も 3D モデルも無いものは表示しない
      if (!texturePath && !render3d) continue;
      // テスト/ゴミアイテムを除外（id が同一文字の繰り返し: a, aa, aaa, xx … など）
      if (/^([a-z0-9])\1*$/i.test(c.id)) continue;

      items.push({
        id: c.id,
        namespace: c.ns,
        ref: `${c.ns}:${c.id}`,
        name: nm.ja || nm.en || prettify(c.id),
        nameEn: nm.en || '',
        nameJa: nm.ja || '',
        texture: texturePath ? contentUrl(repo, branch, texturePath) : '',
        textureRef: texRef || '',
        is3d: !!is3d,
        render3d: render3d || null,
        model: c.modelRef || `${c.ns}:item/${c.id}`,
        sourcePath: texturePath || '',
        tab: null,
        tabTitle: '',
      });
    }

    // --- カテゴリ（タブ）を紐づけ ---
    if (opts.onProgress) opts.onProgress('タブを解析中…');
    let tabs = null;
    try { tabs = await extractCreativeTabs(entries, repo, tree.branch, groupNames, opts); } catch (_) {}
    if (tabs) {
      // mod (Forge/MCreator): creative タブ
      for (const it of items) {
        const t = tabs.itemTab.get(it.id);
        if (t) { it.tab = t; it.tabTitle = tabs.tabTitle.get(t) || t; }
      }
    } else {
      // datapack 等: creative タブが無いので id のサブフォルダをカテゴリにする
      for (const it of items) {
        const i = it.id.indexOf('/');
        if (i > 0) { it.tab = it.id.slice(0, i).toLowerCase(); it.tabTitle = prettify(it.id.slice(0, i)); }
      }
    }

    items.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    return items;
  }

  /** フォールバック: モデルが無いパック向けに textures/item/*.png をそのまま列挙 */
  function legacyTextureItems(entries, repo, branch, names, inScope) {
    const items = [];
    const seen = new Set();
    for (const e of entries) {
      if (!inScope(e.path)) continue;
      const m = e.path.match(/assets\/([^/]+)\/textures\/item\/(.+)\.png$/i);
      if (!m || /_overlay|_layer\d|\/gui\//i.test(e.path)) continue;
      const namespace = m[1];
      const flatId = m[2].split('/').pop();
      const ref = `${namespace}:${m[2]}`;
      if (seen.has(ref)) continue;
      seen.add(ref);
      const nm = names.get(`item.${namespace}.${flatId}`) || names.get(`block.${namespace}.${flatId}`) || {};
      items.push({
        id: flatId, namespace, ref,
        name: nm.ja || nm.en || prettify(flatId),
        nameEn: nm.en || '', nameJa: nm.ja || '',
        texture: rawUrl(repo, branch, e.path),
        textureRef: `${namespace}:${m[2]}`, is3d: false,
        model: `${namespace}:item/${flatId}`, sourcePath: e.path,
      });
    }
    items.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    return items;
  }

  /** 高レベル: GitHub URL → Item[] */
  async function fetchItems(url, opts) {
    opts = opts || {};
    const repo = parseRepoUrl(url);
    if (repo.subPath && !opts.subPath) opts = Object.assign({}, opts, { subPath: repo.subPath });
    const tree = await fetchTree(repo, opts);
    return extractItems(tree, repo, opts);
  }

  return {
    parseRepoUrl,
    resolveBranch,
    fetchTree,
    extractItems,
    fetchItems,
    stripFormatting,
    prettify,
    rawUrl,
    contentUrl,
  };
});

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

/*!
 * viewer-embed.js — Item Viewer を外部ページに 1 行で埋め込むためのセルフマウント UI。
 * 依存する McItems / McModel3D は同じバンドル(mc-item-viewer.js)に同梱される。
 * three.js は CDN から自動ロードする。
 *
 * 使い方（どの Web ページでも）:
 *   <script src="https://hrmc.ngs.computer/mc-item-viewer.js"
 *           data-repos="owner/repo, https://github.com/owner2/repo2"></script>
 * または:
 *   <div data-mc-item-viewer data-repos="owner/repo"></div>
 *   <script src="https://hrmc.ngs.computer/mc-item-viewer.js"></script>
 * プログラムから:
 *   McItemViewer.mount(el, { repos: ['owner/repo', ...] });
 */
(function (root) {
  'use strict';
  const McItems = root.McItems;
  if (!McItems) return;

  // ---- three.js を CDN から自動ロード ----
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.min.js';
  let threePromise = null;
  function loadThree() {
    if (root.THREE) return Promise.resolve();
    if (threePromise) return threePromise;
    threePromise = new Promise((res) => {
      const s = document.createElement('script');
      s.src = THREE_URL;
      s.onload = res; s.onerror = res;
      document.head.appendChild(s);
    });
    return threePromise;
  }

  // ---- 自己完結 CSS（.mciv 配下にスコープ、ホストページと干渉しない）----
  const CSS = `
.mciv { --bg2:#111115; --surface:#1a1a22; --border:rgba(255,255,255,0.09); --accent:#7c6af7;
  --accent2:#3ecfcf; --text:#e8e8f0; --muted:#888896;
  --font:ui-monospace,Menlo,Consolas,"Noto Sans JP",monospace;
  color:var(--text); font-family:var(--font); font-size:14px; line-height:1.5; }
.mciv * { box-sizing:border-box; }
.mciv-toolbar { display:flex; align-items:center; gap:.8rem; margin:0 0 1.2rem; flex-wrap:wrap; }
.mciv-filter { flex:1 1 auto; max-width:280px; padding:.55rem .8rem; background:var(--bg2);
  border:1px solid var(--border); border-radius:6px; color:var(--text); font-family:var(--font); font-size:.85rem; }
.mciv-total { font-size:.78rem; color:var(--muted); }
.mciv-exsummary { cursor:pointer; font-size:.76rem; color:var(--muted); margin-bottom:.4rem; }
.mciv-exclude { width:100%; margin-bottom:1.2rem; padding:.55rem .75rem; background:var(--bg2);
  border:1px solid var(--border); border-radius:6px; color:var(--text); font-family:var(--font);
  font-size:.8rem; resize:vertical; min-height:2.4rem; }
.mciv-section { margin:0 0 2.5rem; }
.mciv-head { display:flex; align-items:baseline; gap:.7rem; padding-bottom:.7rem; margin-bottom:1rem;
  border-bottom:1px solid var(--border); }
.mciv-name { font-size:.95rem; font-weight:700; }
.mciv-name a { color:var(--accent2); text-decoration:none; }
.mciv-count { font-size:.78rem; color:var(--muted); }
.mciv-status { font-size:.82rem; color:var(--muted); margin-bottom:1rem; }
.mciv-status.err { color:#ff6b6b; }
.mciv-tabs { display:flex; flex-wrap:wrap; gap:.4rem; margin-bottom:1.1rem; }
.mciv-tabs:empty { display:none; }
.mciv-chip { padding:.35rem .7rem; background:transparent; border:1px solid var(--border);
  border-radius:999px; color:var(--muted); font-family:var(--font); font-size:.78rem; cursor:pointer; }
.mciv-chip:hover { border-color:var(--accent); color:var(--text); }
.mciv-chip.on { background:var(--accent); border-color:var(--accent); color:#fff; }
.mciv-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:.7rem; }
.mciv-card { background:var(--bg2); border:1px solid var(--border); border-radius:6px;
  padding:.9rem .7rem; text-align:center; }
.mciv-card:hover { border-color:var(--accent); }
.mciv-iw { position:relative; width:64px; height:64px; margin:0 auto .6rem; }
.mciv-icon { width:100%; height:100%; image-rendering:pixelated; object-fit:contain; display:block; }
.mciv-canvas { image-rendering:auto; }
.mciv-3d { position:absolute; top:-4px; right:-6px; padding:0 3px; font-size:.55rem; line-height:1.4;
  color:var(--muted); border:1px solid var(--border); border-radius:3px; background:var(--surface); }
.mciv-nm { font-size:.82rem; font-weight:700; line-height:1.3; word-break:break-word; }
.mciv-ref { margin-top:.3rem; font-size:.66rem; color:var(--muted); word-break:break-all; }
.mciv-en { margin-top:.2rem; font-size:.66rem; color:var(--muted); }
.mciv-empty { color:var(--muted); font-size:.86rem; margin:1.5rem 0; }
.mciv-spin { display:inline-block; width:.85em; height:.85em; margin-right:.4em; border:2px solid var(--border);
  border-top-color:var(--accent); border-radius:50%; animation:mciv-spin .7s linear infinite; vertical-align:-.1em; }
@keyframes mciv-spin { to { transform:rotate(360deg); } }`;

  let cssDone = false;
  function injectCSS() {
    if (cssDone) return; cssDone = true;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // 3D 描画を遅延実行する共有 Observer
  const observer = 'IntersectionObserver' in window
    ? new IntersectionObserver((ents, obs) => {
        for (const e of ents) {
          if (!e.isIntersecting) continue;
          const cv = e.target; obs.unobserve(cv);
          root.McModel3D.render(cv, cv._r3d).then((ok) => {
            if (!ok && cv._fallback) cv.replaceWith(cv._fallback);
          });
        }
      }, { rootMargin: '200px' })
    : null;

  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };

  // URL / owner/repo のリストを spec 配列へ
  function parseSpecs(str) {
    if (Array.isArray(str)) str = str.join(',');
    return String(str || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
      .map((s) => (typeof s === 'string' ? { url: s } : s));
  }

  // ---- 1 つのビューアを rootEl 内に構築 ----
  function createViewer(rootEl, specs) {
    rootEl.classList.add('mciv');
    rootEl.innerHTML = '';
    const has3D = () => root.McModel3D && root.McModel3D.available;

    const toolbar = el('div', 'mciv-toolbar');
    const filter = el('input', 'mciv-filter'); filter.type = 'search'; filter.placeholder = '絞り込み';
    const total = el('span', 'mciv-total');
    toolbar.append(filter, total);

    const exWrap = el('details', 'mciv-ex');
    const exSum = el('summary', 'mciv-exsummary'); exSum.textContent = '非表示にするアイテム（id / キーワード）';
    const exArea = el('textarea', 'mciv-exclude'); exArea.rows = 2;
    exArea.placeholder = 'id やキーワードを改行・カンマ区切りで。部分一致で非表示。例: blueprint, bone';
    exWrap.append(exSum, exArea);

    const sections = el('div', 'mciv-sections');
    rootEl.append(toolbar, exWrap, sections);

    let excludeTerms = [];
    const EX_KEY = 'mc-items:exclude';
    try { const s = localStorage.getItem(EX_KEY); if (s) exArea.value = s; } catch (_) {}
    const parseEx = () => { excludeTerms = exArea.value.split(/[\n,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean); };
    parseEx();
    exArea.addEventListener('input', () => {
      parseEx();
      try { localStorage.setItem(EX_KEY, exArea.value); } catch (_) {}
      applyFilter();
    });
    filter.addEventListener('input', applyFilter);

    function spriteIcon(url, w, frames) {
      const cv = el('canvas', 'mciv-icon'); cv.width = cv.height = 64;
      const im = new Image();
      im.onload = () => {
        const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
        let f = 0;
        const draw = () => { ctx.clearRect(0, 0, 64, 64); ctx.drawImage(im, 0, f * w, w, w, 0, 0, 64, 64); };
        draw();
        const t = setInterval(() => { if (!cv.isConnected) return clearInterval(t); f = (f + 1) % frames; draw(); }, 120);
      };
      im.src = url;
      return cv;
    }
    function flatIcon(it) {
      const img = el('img', 'mciv-icon'); img.loading = 'lazy'; img.alt = it.name;
      img.onerror = () => { img.style.visibility = 'hidden'; };
      const check = () => { const w = img.naturalWidth, h = img.naturalHeight;
        if (w > 0 && h > w && h % w === 0) img.replaceWith(spriteIcon(it.texture, w, h / w)); };
      img.addEventListener('load', check);
      if (it.texture) img.src = it.texture;
      if (img.complete && img.naturalWidth) check();
      return img;
    }
    function itemCard(it) {
      const card = el('div', 'mciv-card'); card.title = it.ref;
      card.dataset.search = `${it.name} ${it.ref} ${it.nameEn}`.toLowerCase();
      card.dataset.tab = it.tab || '';
      const iw = el('div', 'mciv-iw');
      if (it.render3d && has3D() && observer) {
        const cv = el('canvas', 'mciv-icon mciv-canvas');
        cv._r3d = it.render3d; cv._fallback = flatIcon(it);
        iw.append(cv); observer.observe(cv);
      } else iw.append(flatIcon(it));
      if (it.is3d) { const b = el('span', 'mciv-3d'); b.textContent = '3D'; iw.append(b); }
      const nm = el('div', 'mciv-nm'); nm.textContent = it.name;
      const rf = el('div', 'mciv-ref'); rf.textContent = it.ref;
      card.append(iw, nm, rf);
      if (it.nameEn && it.nameEn !== it.name) { const en = el('div', 'mciv-en'); en.textContent = it.nameEn; card.append(en); }
      return card;
    }
    function buildChips(section, bar, items) {
      const seen = new Map(); let none = false;
      for (const it of items) { if (it.tab) { if (!seen.has(it.tab)) seen.set(it.tab, it.tabTitle || it.tab); } else none = true; }
      if (!seen.size) return;
      bar.innerHTML = ''; section._tab = '';
      const mk = (id, label) => { const b = el('button', 'mciv-chip' + (id === '' ? ' on' : '')); b.textContent = label;
        b.onclick = () => { section._tab = id; bar.querySelectorAll('.mciv-chip').forEach((c) => c.classList.toggle('on', c === b)); applyFilter(); };
        return b; };
      bar.append(mk('', 'すべて'));
      for (const [id, t] of seen) bar.append(mk(id, t));
      if (none) bar.append(mk('__none__', 'その他'));
    }
    function applyFilter() {
      const q = filter.value.trim().toLowerCase();
      let shown = 0, tot = 0;
      sections.querySelectorAll('.mciv-section').forEach((sec) => {
        const at = sec._tab || ''; let ss = 0;
        sec.querySelectorAll('.mciv-card').forEach((card) => {
          tot++;
          const s = card.dataset.search;
          const ex = excludeTerms.some((t) => s.includes(t));
          const tabHit = !at || (at === '__none__' ? !card.dataset.tab : card.dataset.tab === at);
          const hit = !ex && tabHit && (!q || s.includes(q));
          card.style.display = hit ? '' : 'none';
          if (hit) { shown++; ss++; }
        });
        sec.style.display = q && ss === 0 ? 'none' : '';
      });
      total.textContent = shown < tot ? `${shown} / ${tot} 件` : `計 ${tot} 件`;
    }

    function loadRepo(spec) {
      const section = el('section', 'mciv-section');
      const head = el('div', 'mciv-head');
      const name = el('span', 'mciv-name'); const count = el('span', 'mciv-count');
      head.append(name, count);
      const tabsBar = el('div', 'mciv-tabs');
      const status = el('p', 'mciv-status'); status.innerHTML = '<span class="mciv-spin"></span>読み込み中…';
      const grid = el('div', 'mciv-grid');
      section.append(head, tabsBar, status, grid);
      sections.append(section);

      let repo = null; try { repo = McItems.parseRepoUrl(spec.url); } catch (_) {}
      if (repo) { const a = el('a'); a.href = `https://github.com/${repo.owner}/${repo.repo}`; a.target = '_blank';
        a.rel = 'noopener'; a.textContent = spec.title || `${repo.owner}/${repo.repo}`; name.append(a); }
      else name.textContent = spec.title || spec.url;

      McItems.fetchItems(spec.url, {
        token: spec.token, subPath: spec.subPath,
        onProgress: (m) => { status.innerHTML = '<span class="mciv-spin"></span>' + m; },
      }).then((items) => {
        count.textContent = `${items.length} 件`;
        if (!items.length) { status.textContent = 'Item が見つかりませんでした'; return; }
        status.remove();
        const frag = document.createDocumentFragment();
        for (const it of items) frag.append(itemCard(it));
        grid.append(frag);
        buildChips(section, tabsBar, items);
        applyFilter();
      }).catch((e) => { status.className = 'mciv-status err'; status.textContent = e.message || String(e); });
    }

    if (!specs.length) { const p = el('p', 'mciv-empty'); p.textContent = 'data-repos に GitHub の URL を指定してください。'; sections.append(p); return; }
    specs.forEach(loadRepo);
  }

  // repos.json の各要素を { url, title?, subPath? } に正規化
  function normalizeRepos(list) {
    return (Array.isArray(list) ? list : []).map((s) =>
      typeof s === 'string' ? { url: s } : (s && s.url ? s : null)).filter(Boolean);
  }

  function mount(target, opts) {
    injectCSS();
    loadThree();
    const token = opts && opts.token;
    const withTok = (specs) => { if (token) specs.forEach((s) => { s.token = s.token || token; }); return specs; };
    const specs = parseSpecs((opts && opts.repos) || []);
    if (specs.length) { createViewer(target, withTok(specs)); return; }
    // data-repos が無ければ同ディレクトリの repos.json を読む
    fetch('repos.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : { repos: [] }))
      .catch(() => ({ repos: [] }))
      .then((cfg) => createViewer(target, withTok(normalizeRepos(cfg && cfg.repos))));
  }

  // ---- 自動起動 ----
  function boot() {
    injectCSS();
    let mounted = 0;
    document.querySelectorAll('[data-mc-item-viewer]').forEach((elm) => {
      mount(elm, { repos: elm.getAttribute('data-repos'), token: elm.getAttribute('data-token') }); mounted++;
    });
    // script タグ自身に data-repos があれば、その直後にビューアを作る
    const sc = document.currentScript ||
      [].slice.call(document.scripts).reverse().find((s) => /mc-item-viewer|viewer-embed/.test(s.src || ''));
    if (sc && sc.getAttribute('data-repos') && !mounted) {
      const div = el('div'); sc.parentNode.insertBefore(div, sc.nextSibling);
      mount(div, { repos: sc.getAttribute('data-repos'), token: sc.getAttribute('data-token') });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  root.McItemViewer = { mount };
})(typeof self !== 'undefined' ? self : this);
