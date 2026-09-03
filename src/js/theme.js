// --------------------------------------------------------------------------
// theme.js — theme.jsonc を読み込んで、サイトと作品カードの見た目を切り替える。
//
//   theme.jsonc の "site" / "card" にテーマ名を書くだけで切り替わる。
//   各テーマの中身は CSS カスタムプロパティの一覧で、:root に流し込む。
//   JSON が読めなかった場合は style.css の :root に書いてある既定値になる。
//
//   コンソールから試すこともできる:
//     theme.setCard('wood')   theme.setSite('carbon')   theme.reset()
// --------------------------------------------------------------------------
(() => {
  const root = document.documentElement;
  let cfg = null;
  const applied = { site: null, card: null };

  // JSONC（// と /* */ のコメント付きJSON）を読む。
  // 文字列リテラルの中の // は消さないよう、素朴なスキャナで処理する。
  function stripComments(src) {
    let out = '', i = 0, inStr = false, esc = false;
    while (i < src.length) {
      const c = src[i], n = src[i + 1];
      if (inStr) {
        out += c;
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        i++;
        continue;
      }
      if (c === '"') { inStr = true; out += c; i++; continue; }
      if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
      out += c; i++;
    }
    // 末尾カンマを許す
    return out.replace(/,(\s*[}\]])/g, '$1');
  }

  // url() に安全に入れられる形にする（" と ) と改行を落とす）
  function cssUrl(path) {
    return `url("${String(path).replace(/["'()\s]/g, encodeURIComponent)}")`;
  }

  // 写真を1枚指定するだけで質感になるよう、専用キーを CSS 変数へ変換する。
  //   caseImage  … 筐体の表面に敷く写真   caseImageDim  … その上に重ねる黒の濃さ
  //   siteImage  … サイト背景に敷く写真   siteImageDim  … 同上
  function expandImageKeys(theme) {
    const vars = {};
    for (const [k, v] of Object.entries(theme)) if (k.startsWith('--')) vars[k] = v;

    if (theme.caseImage) {
      const dim = theme.caseImageDim ?? 0.45;
      vars['--case-texture'] =
        `linear-gradient(rgba(0,0,0,${dim}),rgba(0,0,0,${dim})), ${cssUrl(theme.caseImage)} center/cover`;
    }
    if (theme.siteImage) {
      const dim = theme.siteImageDim ?? 0.72;
      vars['--site-image'] =
        `linear-gradient(rgba(0,0,0,${dim}),rgba(0,0,0,${dim})), ${cssUrl(theme.siteImage)}`;
    }
    return vars;
  }

  function applyVars(vars) {
    if (!vars) return;
    for (const [k, v] of Object.entries(vars)) {
      if (k.startsWith('--')) root.style.setProperty(k, String(v));
    }
  }

  function clearVars(theme) {
    if (!theme) return;
    for (const k of Object.keys(expandImageKeys(theme))) root.style.removeProperty(k);
  }

  function setSite(name) {
    const next = cfg?.siteThemes?.[name];
    if (name && !next) { console.warn(`[theme] siteThemes に "${name}" がありません`); return; }
    clearVars(cfg?.siteThemes?.[applied.site]);
    applied.site = name || null;
    applyVars(expandImageKeys(next ?? {}));
    root.dataset.siteTheme = name || '';
  }

  function setCard(name) {
    const next = cfg?.cardThemes?.[name];
    if (name && !next) { console.warn(`[theme] cardThemes に "${name}" がありません`); return; }
    clearVars(cfg?.cardThemes?.[applied.card]);
    applied.card = name || null;
    applyVars(expandImageKeys(next ?? {}));
    // 構造も変える必要があるテーマ（plain など）は CSS 側でこの属性を見る
    root.dataset.cardTheme = name || '';
  }

  // サイトとカードの組み合わせに名前を付けたもの。1つ選ぶと両方が切り替わる。
  function setPreset(name) {
    const p = cfg?.presets?.[name];
    if (!p) { console.warn(`[theme] presets に "${name}" がありません`); return; }
    setSite(p.site);
    setCard(p.card);
    root.dataset.preset = name;
  }

  window.theme = {
    setSite, setCard, setPreset,
    reset() {
      if (cfg?.preset) setPreset(cfg.preset);
      else { setSite(cfg?.site); setCard(cfg?.card); }
    },
    list() {
      console.table({
        preset: Object.keys(cfg?.presets ?? {}).join(', '),
        site: Object.keys(cfg?.siteThemes ?? {}).join(', '),
        card: Object.keys(cfg?.cardThemes ?? {}).join(', '),
      });
    },
  };

  fetch('/theme.jsonc', { cache: 'no-store' })
    .then(r => (r.ok ? r.text() : null))
    .then(text => {
      if (!text) return;
      cfg = JSON.parse(stripComments(text));
      // preset があればそれで両方決める。無ければ site / card を個別に見る。
      if (cfg.preset) setPreset(cfg.preset);
      else {
        if (cfg.site) setSite(cfg.site);
        if (cfg.card) setCard(cfg.card);
      }
    })
    .catch(e => console.warn('[theme] theme.jsonc を読めませんでした（既定の見た目を使用）', e));
})();
