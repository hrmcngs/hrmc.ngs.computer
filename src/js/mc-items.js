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
