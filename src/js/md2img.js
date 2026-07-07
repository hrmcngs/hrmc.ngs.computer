/* md2img.js — Markdown を GitHub 風カードの画像（PNG / JPG / SVG）に変換する
   Terminal セクションの ./md2img.sh コマンドから window.MD2IMG.mount() で起動される。
   外部ライブラリ不要。プレビュー用に組んだ HTML カードのレイアウト結果（要素の位置・
   テキストの行ボックス）を読み取り、Canvas 2D / ネイティブ SVG に描き直して書き出す。
   foreignObject を使わないため Safari を含む全ブラウザで PNG/JPG が生成できる。 */
(() => {
  'use strict';
  if (window.MD2IMG) return;

  // ── 共通ヘルパ ───────────────────────────────────────
  const esc = s => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const r2 = n => Math.round(n * 100) / 100;

  function safeUrl(u, allowData) {
    u = String(u || '').trim();
    if (/^(javascript|vbscript):/i.test(u)) return '#';
    if (!allowData && /^data:/i.test(u)) return '#';
    return u;
  }
  // GitHub の blob/raw URL を raw.githubusercontent.com に正規化（CORS で取得可能に）
  function rawUrl(u) {
    return String(u || '').replace(
      /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:raw|blob)\/(.+)$/,
      'https://raw.githubusercontent.com/$1/$2/$3');
  }

  // README でよく使われる HTML タグ（Markdown 化 or 除去の対象）
  const HTML_TAGS = 'p|div|span|br|hr|img|a|ul|ol|li|h[1-6]|pre|code|blockquote|' +
    'table|thead|tbody|tfoot|tr|td|th|sub|sup|kbd|samp|small|big|b|i|u|s|strong|' +
    'em|del|ins|mark|picture|source|center|font|details|summary|section|article|' +
    'nav|header|footer|figure|figcaption|abbr|cite|q|dl|dt|dd';
  const TAG_RE = new RegExp('<\\/?(?:' + HTML_TAGS + ')\\b[^>]*>', 'gi');

  // 生 HTML を Markdown 寄りに整える（<br>→改行, <img>/<a>→md記法, 他タグ除去）
  function htmlClean(s) {
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<a\b[^>]*?\bhref\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (m, h, inner) => /<img/i.test(inner) ? inner
        : '[' + inner.replace(/[\[\]]/g, '') + '](' + h + ')');
    s = s.replace(/<img\b[^>]*>/gi, m => {
      const sm = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(m);
      const am = /\balt\s*=\s*["']([^"']*)["']/i.exec(m);
      return sm ? '![' + (am ? am[1] : '') + '](' + sm[1] + ')' : '';
    });
    return s.replace(TAG_RE, '');
  }

  // ── インライン記法 ───────────────────────────────────
  function inline(src) {
    const tok = [];
    const stash = h => { tok.push(h); return '\u0000' + (tok.length - 1) + '\u0000'; };
    let s = String(src);
    // コードスパンを最初に退避（中身は一切加工しない）
    s = s.replace(/`([^`]+)`/g, (m, c) => stash('<code>' + esc(c) + '</code>'));
    // 生 HTML を整理
    s = htmlClean(s);
    // 画像
    s = s.replace(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g,
      (m, alt, u) => stash('<img class="md-img" src="' +
        esc(safeUrl(rawUrl(u), true)) + '" alt="' + esc(alt) + '"/>'));
    // リンク
    s = s.replace(/\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g,
      (m, txt, href) => stash('<a href="' + esc(safeUrl(href)) + '">' + inline(txt) + '</a>'));
    // 裸の URL
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<>)]+)/g,
      (m, pre, u) => pre + stash('<a href="' + esc(safeUrl(u)) + '">' + esc(u) + '</a>'));
    // 残りをエスケープ
    s = esc(s);
    // 強調
    s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+?)__/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
    s = s.replace(/(^|[^A-Za-z0-9_])_([^_\n]+?)_(?=[^A-Za-z0-9_]|$)/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+?)~~/g, '<del>$1</del>');
    // 退避を復元
    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => tok[i]);
  }

  // ── ブロック記法 ─────────────────────────────────────
  function splitRow(r) {
    return r.trim().replace(/^\|/, '').replace(/\|$/, '')
      .split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
  }
  function indentOf(l) {
    return (/^[ \t]*/.exec(l)[0]).replace(/\t/g, '    ').length;
  }
  function isBlockStart(l) {
    return /^\s{0,3}#{1,6}\s/.test(l) || /^\s*(```|~~~)/.test(l) || /^\s*>/.test(l)
      || /^\s*([-*+]|\d+[.)])\s+/.test(l) || /^\s{0,3}([-*_])\s*(\1\s*){2,}$/.test(l);
  }

  function parseList(lines, start) {
    const base = indentOf(lines[start]);
    const ordered = /^\s*\d+[.)]/.test(lines[start]);
    let i = start, items = '', n = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) {
        if (i + 1 < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i + 1])
          && indentOf(lines[i + 1]) >= base) { i++; continue; }
        break;
      }
      const m = /^(\s*)([-*+]|\d+[.)])\s+([\s\S]*)$/.exec(l);
      if (!m) break;
      const ind = indentOf(l);
      if (ind < base || ind >= base + 2) break;
      // 同階層でマーカー種別（順序付き/なし）が変わったら別リスト扱い
      if (/\d/.test(m[2]) !== ordered) break;
      let text = m[3], lead = '', task = '';
      const cb = /^\[([ xX])\]\s+([\s\S]*)$/.exec(text);
      if (cb) {
        lead = '<span class="md-check' + (cb[1].toLowerCase() === 'x' ? ' is-on' : '') + '"></span>';
        task = ' md-task'; text = cb[2];
      } else {
        n++;
        // リストマーカーを実要素として描く（canvas 描画では ::marker を読めないため）
        lead = '<span class="md-marker">' + (ordered ? n + '.' : '•') + '</span>';
      }
      i++;
      let inner = inline(text), nested = '';
      while (i < lines.length) {
        const nl = lines[i];
        if (!nl.trim()) {
          if (i + 1 < lines.length && indentOf(lines[i + 1]) >= base + 2) { i++; continue; }
          break;
        }
        if (/^\s*([-*+]|\d+[.)])\s+/.test(nl)) {
          if (indentOf(nl) >= base + 2) { const r = parseList(lines, i); nested += r[0]; i = r[1]; continue; }
          break;
        }
        if (indentOf(nl) >= base + 2) { inner += ' ' + inline(nl.trim()); i++; continue; }
        break;
      }
      items += '<li class="md-li' + task + '">' + lead + inner + nested + '</li>';
    }
    return [(ordered ? '<ol' : '<ul') + ' class="md-list">' + items + (ordered ? '</ol>' : '</ul>'), i];
  }

  function mdToHtml(md) {
    md = String(md).replace(/\r\n?/g, '\n');
    // HTML コメントの除去：入れ子 (例: <!<!---->-->) や閉じが無いコメントで
    // 1 回のパスでは取り切れないため、変化がなくなるまで繰り返す。
    // `-->` が無い場合は文字列末尾まで除去する（CodeQL js/incomplete-multi-character-sanitization）。
    let prev;
    do { prev = md; md = md.replace(/<!--[\s\S]*?(?:-->|$)/g, ''); } while (md !== prev);
    const lines = md.split('\n'), out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      // フェンスコードブロック
      const f = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(line);
      if (f) {
        const fch = f[2][0], buf = [];
        const close = new RegExp('^\\s*' + fch + '{' + f[2].length + ',}\\s*$');
        i++;
        while (i < lines.length && !close.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push('<pre class="md-pre"><code>' + esc(buf.join('\n')) + '</code></pre>');
        continue;
      }
      // 見出し
      const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (h) {
        const lv = h[1].length;
        out.push('<h' + lv + ' class="md-h md-h' + lv + '">' + inline(h[2]) + '</h' + lv + '>');
        i++; continue;
      }
      // 水平線
      if (/^\s{0,3}([-*_])\s*(\1\s*){2,}$/.test(line)) { out.push('<hr class="md-hr"/>'); i++; continue; }
      // 引用
      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        out.push('<blockquote class="md-quote">' + mdToHtml(buf.join('\n')) + '</blockquote>');
        continue;
      }
      // テーブル（GFM）
      if (line.indexOf('|') >= 0 && i + 1 < lines.length
        && /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
        const head = splitRow(line);
        const al = splitRow(lines[i + 1]).map(c => {
          const L = /^:/.test(c), R = /:$/.test(c);
          return L && R ? 'center' : R ? 'right' : L ? 'left' : '';
        });
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].indexOf('|') >= 0 && lines[i].trim()) {
          rows.push(splitRow(lines[i])); i++;
        }
        let t = '<table class="md-table"><thead><tr>';
        head.forEach((c, ci) => t += '<th' + (al[ci] ? ' style="text-align:' + al[ci] + '"' : '') + '>' + inline(c) + '</th>');
        t += '</tr></thead><tbody>';
        rows.forEach(r => {
          t += '<tr>';
          head.forEach((x, ci) => t += '<td' + (al[ci] ? ' style="text-align:' + al[ci] + '"' : '') + '>' + inline(r[ci] || '') + '</td>');
          t += '</tr>';
        });
        out.push(t + '</tbody></table>');
        continue;
      }
      // リスト
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        const r = parseList(lines, i); out.push(r[0]); i = r[1]; continue;
      }
      // 空行
      if (!line.trim()) { i++; continue; }
      // 段落
      const buf = [line]; i++;
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) { buf.push(lines[i]); i++; }
      const para = buf.map(l => l.replace(/[ \t]+$/, '')).join('\n');
      out.push('<p class="md-p">' + inline(para).replace(/\n/g, '<br/>') + '</p>');
    }
    return out.join('');
  }

  // ── カード本体の CSS ─────────────────────────────────
  const CARD_CSS = `
.md2img-card{box-sizing:border-box;width:680px;padding:42px 46px;margin:0;
 font-family:MisakiGothic,-apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",Meiryo,sans-serif;
 font-size:15px;line-height:1.72;font-weight:400;font-style:normal;
 letter-spacing:normal;word-spacing:normal;text-align:left;text-indent:0;text-transform:none;
 white-space:normal;word-wrap:break-word;overflow-wrap:break-word;
 color:#c9d1d9;background:#0d1117;overflow:hidden;-webkit-font-smoothing:antialiased;}
.md2img-card.is-light{color:#1f2328;background:#ffffff;}
.md2img-card *{box-sizing:border-box;}
.md2img-card .md-body{display:block;}
.md2img-card .md-body :first-child{margin-top:0;}
.md2img-card .md-body :last-child{margin-bottom:0;}
.md2img-card .md-h{margin:1.5em 0 .65em;line-height:1.3;font-weight:700;}
.md2img-card .md-h1{font-size:1.95em;padding-bottom:.3em;border-bottom:1px solid #21262d;}
.md2img-card .md-h2{font-size:1.5em;padding-bottom:.28em;border-bottom:1px solid #21262d;}
.md2img-card .md-h3{font-size:1.22em;}
.md2img-card .md-h4{font-size:1.02em;}
.md2img-card .md-h5{font-size:.92em;}
.md2img-card .md-h6{font-size:.86em;color:#8b949e;}
.md2img-card.is-light .md-h1,.md2img-card.is-light .md-h2{border-bottom-color:#d1d9e0;}
.md2img-card.is-light .md-h6{color:#59636e;}
.md2img-card .md-p{margin:.75em 0;}
.md2img-card a{color:#58a6ff;text-decoration:none;}
.md2img-card.is-light a{color:#0969da;}
.md2img-card strong{font-weight:700;}
.md2img-card em{font-style:italic;}
.md2img-card del{text-decoration:line-through;opacity:.7;}
.md2img-card code{font-family:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
 font-size:.86em;background:rgba(110,118,129,.4);padding:.16em .4em;border-radius:5px;}
.md2img-card.is-light code{background:rgba(175,184,193,.35);}
.md2img-card .md-pre{margin:.85em 0;padding:14px 16px;border:1px solid #30363d;border-radius:8px;
 background:#161b22;overflow:hidden;}
.md2img-card.is-light .md-pre{background:#f6f8fa;border-color:#d1d9e0;}
.md2img-card .md-pre code{display:block;padding:0;background:none;font-size:.84em;line-height:1.55;
 white-space:pre-wrap;word-break:break-word;}
.md2img-card .md-quote{margin:.85em 0;padding:.35em 1em;border-left:4px solid #30363d;color:#8b949e;}
.md2img-card.is-light .md-quote{border-left-color:#d1d9e0;color:#59636e;}
.md2img-card .md-list{margin:.6em 0;padding-left:1.7em;list-style:none;}
.md2img-card .md-li{margin:.3em 0;}
.md2img-card .md-marker{display:inline-block;width:1.7em;margin-left:-1.7em;
 padding-right:.55em;text-align:right;color:#8b949e;}
.md2img-card.is-light .md-marker{color:#59636e;}
.md2img-card .md-task .md-check{margin-left:-1.7em;}
.md2img-card .md-hr{height:0;border:none;border-top:1px solid #30363d;margin:1.5em 0;}
.md2img-card.is-light .md-hr{border-top-color:#d1d9e0;}
.md2img-card .md-img{max-width:100%;max-height:360px;height:auto;border-radius:6px;vertical-align:middle;}
.md2img-card .md-img-fallback{font-family:ui-monospace,monospace;font-size:.8em;color:#8b949e;
 padding:.05em .35em;border:1px dashed currentColor;border-radius:4px;}
.md2img-card .md-table{border-collapse:collapse;margin:.85em 0;max-width:100%;font-size:.93em;}
.md2img-card .md-table th,.md2img-card .md-table td{border:1px solid #30363d;padding:6px 13px;}
.md2img-card .md-table th{background:#161b22;font-weight:700;}
.md2img-card.is-light .md-table th,.md2img-card.is-light .md-table td{border-color:#d1d9e0;}
.md2img-card.is-light .md-table th{background:#f6f8fa;}
.md2img-card .md-check{display:inline-block;width:13px;height:13px;margin-right:7px;
 border:1px solid #6e7681;border-radius:3px;vertical-align:-1px;}
.md2img-card .md-check.is-on{background:#2f81f7;border-color:#2f81f7;}`;

  function buildCard(md, theme) {
    return '<div class="md2img-card' + (theme === 'light' ? ' is-light' : '') + '">' +
      '<style>' + CARD_CSS + '</style>' +
      '<div class="md-body">' + mdToHtml(md) + '</div></div>';
  }

  // ── ツール UI の CSS（ページ内のみ・1回だけ注入） ────
  const UI_CSS = `
.md2img{display:flex;flex-direction:column;gap:.7rem;animation:term-line-in .2s ease both;}
.md2img-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;}
.md2img-title{color:var(--term-success,#3ecfcf);font-weight:700;}
.md2img-x{background:none;border:1px solid var(--border,#2a2a38);color:var(--text-muted,#888);
 font:inherit;font-size:.78em;padding:.25em .8em;border-radius:6px;cursor:pointer;}
.md2img-x:hover{border-color:var(--term-error,#f87171);color:var(--term-error,#f87171);}
.md2img-sub{font-size:.78em;color:var(--text-muted,#888);opacity:.85;}
.md2img-drop{border:1px dashed var(--border,#2a2a38);border-radius:10px;padding:1.1rem 1rem;
 text-align:center;color:var(--text-muted,#888);cursor:pointer;
 transition:border-color .15s,background .15s,color .15s;}
.md2img-drop:hover,.md2img-drop.is-over{border-color:var(--term-success,#3ecfcf);
 background:rgba(62,207,207,.06);color:var(--term-text,#aaa);}
.md2img-drop b{color:var(--term-success,#3ecfcf);}
.md2img-row{display:flex;flex-wrap:wrap;gap:.45rem;align-items:center;font-size:.82em;}
.md2img-row .lbl{color:var(--text-muted,#888);}
.md2img-chip{background:none;border:1px solid var(--border,#2a2a38);color:var(--term-text,#aaa);
 font:inherit;font-size:.92em;padding:.24em .75em;border-radius:6px;cursor:pointer;
 transition:border-color .12s,color .12s,background .12s;}
.md2img-chip:hover{border-color:var(--accent,#7c6af7);color:var(--accent,#7c6af7);}
.md2img-chip.is-on{border-color:var(--term-success,#3ecfcf);color:var(--term-success,#3ecfcf);
 background:rgba(62,207,207,.08);}
.md2img-status{font-size:.8em;color:var(--text-muted,#888);min-height:1.2em;line-height:1.6;}
.md2img-status .ok{color:var(--term-success,#3ecfcf);}
.md2img-status .err{color:var(--term-error,#f87171);}
.md2img-preview{border:1px solid var(--border,#2a2a38);border-radius:10px;overflow:auto;
 max-height:340px;background:var(--term-bg,#0d0d10);}
.md2img-preview-inner{transform-origin:top left;}
.md2img-preview-inner .md2img-card{transform-origin:top left;}
.md2img-actions{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;}
.md2img-dl{background:var(--term-success,#3ecfcf);border:none;color:#06121a;font:inherit;
 font-weight:700;font-size:.86em;padding:.6em 1.2em;border-radius:7px;cursor:pointer;}
.md2img-dl:hover{filter:brightness(1.12);}
.md2img-dl:disabled{opacity:.4;cursor:default;filter:none;}
.md2img-link{font-size:.8em;color:var(--term-link,#7c6af7);}
.md2img-paste{width:100%;box-sizing:border-box;background:var(--term-bg,#0d0d10);
 color:var(--term-text,#aaa);border:1px solid var(--border,#2a2a38);border-radius:8px;
 font:inherit;font-size:.82em;padding:.6rem;min-height:84px;resize:vertical;margin-top:.5rem;}
.md2img details summary{cursor:pointer;font-size:.8em;color:var(--text-muted,#888);}
.md2img details summary:hover{color:var(--term-text,#aaa);}
.md2img details .md2img-chip{margin-top:.5rem;}
.md2img-hint{font-size:.76em;color:var(--text-muted,#888);opacity:.7;}`;

  function injectUiStyle() {
    if (document.getElementById('md2img-ui-style')) return;
    const st = document.createElement('style');
    st.id = 'md2img-ui-style';
    st.textContent = UI_CSS;
    document.head.appendChild(st);
  }

  // ── 画像ユーティリティ ──────────────────────────────
  function blobToDataUrl(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(new Error('read fail'));
      fr.readAsDataURL(blob);
    });
  }
  function baseName(fn) {
    let n = String(fn || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
    n = n.replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '');
    return n || 'markdown';
  }

  // ── レイアウト済みカードを描画オペレーション列に変換 ──
  // 返り値: { ops, W, H, bg }  ops = rect / text / image
  function paintCard(card) {
    const base = card.getBoundingClientRect();
    const W = base.width, H = base.height;
    const ops = [];
    const relX = v => v - base.left;
    const relY = v => v - base.top;

    function col(c) {
      if (!c) return null;
      c = String(c).trim();
      if (c === 'transparent' || c === 'none' || c === 'rgba(0, 0, 0, 0)') return null;
      const m = /^rgba?\(([^)]+)\)$/i.exec(c);
      if (m) { const p = m[1].split(','); if (p.length === 4 && parseFloat(p[3]) === 0) return null; }
      return c;
    }
    function rect(x, y, w, h, fill, radius) {
      if (!fill || w <= 0 || h <= 0) return;
      ops.push({ op: 'rect', x, y, w, h, fill, r: radius || 0 });
    }
    function paintBox(node, cs) {
      const radius = parseFloat(cs.borderTopLeftRadius) || 0;
      const bg = col(cs.backgroundColor);
      const bt = parseFloat(cs.borderTopWidth) || 0, ct = col(cs.borderTopColor);
      const bb = parseFloat(cs.borderBottomWidth) || 0, cb = col(cs.borderBottomColor);
      const bl = parseFloat(cs.borderLeftWidth) || 0, cl = col(cs.borderLeftColor);
      const brw = parseFloat(cs.borderRightWidth) || 0, crc = col(cs.borderRightColor);
      if (!bg && !(bt && ct) && !(bb && cb) && !(bl && cl) && !(brw && crc)) return;
      const rects = node.getClientRects();
      for (let k = 0; k < rects.length; k++) {
        const cr = rects[k];
        const x = relX(cr.left), y = relY(cr.top), w = cr.width, h = cr.height;
        if (w <= 0 || h <= 0) continue;
        if (bg) rect(x, y, w, h, bg, radius);
        if (bt && ct) rect(x, y, w, bt, ct, 0);
        if (bb && cb) rect(x, y + h - bb, w, bb, cb, 0);
        if (bl && cl) rect(x, y, bl, h, cl, 0);
        if (brw && crc) rect(x + w - brw, y, brw, h, crc, 0);
      }
    }
    function paintText(tn) {
      const txt = tn.nodeValue;
      if (!txt || !/\S/.test(txt)) return;
      const parent = tn.parentElement;
      if (!parent) return;
      const cs = getComputedStyle(parent);
      if (cs.visibility === 'hidden' || cs.display === 'none') return;
      const fill = cs.color;
      const size = parseFloat(cs.fontSize) || 15;
      const weight = cs.fontWeight || '400';
      const italic = /italic|oblique/.test(cs.fontStyle || '');
      const family = cs.fontFamily || 'sans-serif';
      const deco = cs.textDecorationLine || cs.textDecoration || '';
      const range = document.createRange();
      const len = txt.length;
      let i = 0;
      while (i < len) {
        range.setStart(tn, i); range.setEnd(tn, i + 1);
        const rc = range.getClientRects();
        if (!rc.length) { i++; continue; }
        const top0 = rc[0].top;
        let j = i + 1;
        // 同じ行（top が一致）の終わりまで進める
        while (j < len) {
          range.setStart(tn, j); range.setEnd(tn, j + 1);
          const rj = range.getClientRects();
          if (rj.length && Math.abs(rj[0].top - top0) > 1.5) break;
          j++;
        }
        range.setStart(tn, i); range.setEnd(tn, j);
        const lr = range.getBoundingClientRect();
        const seg = txt.slice(i, j);
        if (lr.width > 0 && /\S/.test(seg)) {
          const x = relX(lr.left), cy = relY(lr.top) + lr.height / 2;
          ops.push({ op: 'text', x, y: cy, text: seg, size, weight, italic, family, fill });
          if (/line-through/.test(deco)) rect(x, cy, lr.width, Math.max(1, size / 14), fill, 0);
          if (/underline/.test(deco)) rect(x, relY(lr.bottom) - Math.max(1, size / 12), lr.width, Math.max(1, size / 14), fill, 0);
        }
        i = j;
      }
    }
    function walk(node) {
      const nt = node.nodeType;
      if (nt === 3) { paintText(node); return; }
      if (nt !== 1) return;
      const tag = node.tagName.toLowerCase();
      if (tag === 'style' || tag === 'script') return;
      const cs = getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'collapse') return;
      paintBox(node, cs);
      if (tag === 'img') {
        const r = node.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && node.complete && node.naturalWidth > 0) {
          ops.push({ op: 'image', x: relX(r.left), y: relY(r.top), w: r.width, h: r.height, el: node });
        }
        return;
      }
      for (let ch = node.firstChild; ch; ch = ch.nextSibling) walk(ch);
    }
    walk(card);
    const bg = col(getComputedStyle(card).backgroundColor) || '#ffffff';
    return { ops, W, H, bg };
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ── Canvas へ描画 → <canvas> を返す ─────────────────
  function drawCanvas(painted, scale) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(painted.W * scale));
    cv.height = Math.max(1, Math.round(painted.H * scale));
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('canvas を初期化できません');
    ctx.scale(scale, scale);
    ctx.fillStyle = painted.bg;
    ctx.fillRect(0, 0, painted.W, painted.H);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const o of painted.ops) {
      if (o.op === 'rect') {
        ctx.fillStyle = o.fill;
        if (o.r > 0) { roundRectPath(ctx, o.x, o.y, o.w, o.h, o.r); ctx.fill(); }
        else ctx.fillRect(o.x, o.y, o.w, o.h);
      } else if (o.op === 'text') {
        ctx.font = (o.italic ? 'italic ' : '') + o.weight + ' ' + o.size + 'px ' + o.family;
        ctx.fillStyle = o.fill;
        ctx.fillText(o.text, o.x, o.y);
      } else if (o.op === 'image') {
        try { ctx.drawImage(o.el, o.x, o.y, o.w, o.h); } catch (e) {}
      }
    }
    return cv;
  }

  // ── ネイティブ SVG 文字列を生成 ─────────────────────
  function opsToSvg(painted) {
    const W = painted.W, H = painted.H;
    let s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + r2(W) + '" height="' + r2(H) +
      '" viewBox="0 0 ' + r2(W) + ' ' + r2(H) + '">';
    s += '<rect width="' + r2(W) + '" height="' + r2(H) + '" fill="' + esc(painted.bg) + '"/>';
    for (const o of painted.ops) {
      if (o.op === 'rect') {
        s += '<rect x="' + r2(o.x) + '" y="' + r2(o.y) + '" width="' + r2(o.w) +
          '" height="' + r2(o.h) + '"' + (o.r > 0 ? ' rx="' + r2(o.r) + '"' : '') +
          ' fill="' + esc(o.fill) + '"/>';
      } else if (o.op === 'text') {
        s += '<text x="' + r2(o.x) + '" y="' + r2(o.y) + '" font-family="' + esc(o.family) +
          '" font-size="' + r2(o.size) + '" font-weight="' + esc(o.weight) + '"' +
          (o.italic ? ' font-style="italic"' : '') + ' fill="' + esc(o.fill) +
          '" dominant-baseline="middle" xml:space="preserve">' + esc(o.text) + '</text>';
      } else if (o.op === 'image') {
        s += '<image x="' + r2(o.x) + '" y="' + r2(o.y) + '" width="' + r2(o.w) +
          '" height="' + r2(o.h) + '" preserveAspectRatio="none" href="' +
          esc(o.el.getAttribute('src') || '') + '"/>';
      }
    }
    return s + '</svg>';
  }

  // ── 起動 ─────────────────────────────────────────────
  function mount(container, opts) {
    opts = opts || {};
    injectUiStyle();

    let theme = 'dark', scale = 2, format = 'png';
    let currentMd = '', currentName = 'markdown', busy = false, lastUrl = null;
    const imgCache = new Map();

    const el = (tag, cls, html) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (html != null) e.innerHTML = html;
      return e;
    };

    const root = el('div', 'md2img');

    const head = el('div', 'md2img-head',
      '<span class="md2img-title">md &#8594; img  /  Markdown 画像化ツール</span>');
    const xBtn = el('button', 'md2img-x', '&#10005; 戻る');
    head.appendChild(xBtn);

    const sub = el('div', 'md2img-sub',
      '.md ファイルを読み込むと GitHub 風カードの画像をその場で生成・保存できます。');

    const drop = el('div', 'md2img-drop',
      '<b>.md ファイル</b> をここにドロップ、またはクリックして選択');
    const fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = '.md,.markdown,.mdown,.txt,text/markdown';
    fileInput.style.display = 'none';

    const samp = el('div', 'md2img-row', '<span class="lbl">サイト内:</span>');
    ['README.md', 'SAMPLE.md', 'GITHUB-STATS.md'].forEach(n => {
      const b = el('button', 'md2img-chip', n);
      b.dataset.file = '/' + n;
      samp.appendChild(b);
    });

    const pasteWrap = el('details');
    pasteWrap.appendChild(el('summary', null, 'または Markdown を直接貼り付け'));
    const ta = el('textarea', 'md2img-paste');
    ta.placeholder = '# 見出し\n\nここに Markdown を貼り付けて「変換」を押す…';
    const pasteBtn = el('button', 'md2img-chip', 'このテキストを変換');
    pasteWrap.appendChild(ta);
    pasteWrap.appendChild(pasteBtn);

    const ctrl = el('div', 'md2img-row');
    ctrl.style.display = 'none';

    const status = el('div', 'md2img-status');

    const preview = el('div', 'md2img-preview');
    preview.style.display = 'none';
    const previewInner = el('div', 'md2img-preview-inner');
    preview.appendChild(previewInner);

    const actions = el('div', 'md2img-actions');
    actions.style.display = 'none';
    const dl = el('button', 'md2img-dl', '&#11015;&#65039;  画像をダウンロード');
    const resultLink = el('a', 'md2img-link');
    resultLink.target = '_blank';
    resultLink.rel = 'noopener';
    resultLink.style.display = 'none';
    actions.append(dl, resultLink);

    const hint = el('div', 'md2img-hint',
      'PNG / JPG / SVG いずれもこの場で生成できます。 ./stop か「戻る」で Terminal に戻ります。');

    root.append(head, sub, drop, fileInput, samp, pasteWrap, ctrl, status, preview, actions, hint);

    // ── 状態表示 ───────────────────────────────────────
    function setStatus(html, cls) {
      status.innerHTML = cls ? '<span class="' + cls + '">' + html + '</span>' : html;
    }

    // ── テーマ/倍率/形式の選択 UI ──────────────────────
    function chipGroup(label, options, getCur, onPick) {
      const wrap = el('span');
      wrap.style.cssText = 'display:inline-flex;gap:.35rem;align-items:center;margin-right:.7rem';
      wrap.appendChild(el('span', 'lbl', label));
      const btns = [];
      options.forEach(o => {
        const b = el('button', 'md2img-chip' + (o.value === getCur() ? ' is-on' : ''), o.label);
        b.addEventListener('click', () => {
          btns.forEach(x => x.classList.remove('is-on'));
          b.classList.add('is-on');
          onPick(o.value);
        });
        btns.push(b);
        wrap.appendChild(b);
      });
      return wrap;
    }
    ctrl.appendChild(chipGroup('テーマ',
      [{ label: 'Dark', value: 'dark' }, { label: 'Light', value: 'light' }],
      () => theme, v => { theme = v; render(); }));
    ctrl.appendChild(chipGroup('倍率',
      [{ label: '1x', value: 1 }, { label: '2x', value: 2 }, { label: '3x', value: 3 }],
      () => scale, v => {
        scale = v;
        const c = previewInner.querySelector('.md2img-card');
        if (c) updateDims(c.offsetWidth, c.offsetHeight);
      }));
    ctrl.appendChild(chipGroup('形式',
      [{ label: 'PNG', value: 'png' }, { label: 'JPG', value: 'jpg' }, { label: 'SVG', value: 'svg' }],
      () => format, v => {
        format = v;
        const c = previewInner.querySelector('.md2img-card');
        if (c) updateDims(c.offsetWidth, c.offsetHeight);
      }));

    // ── 出力上限を考慮した実効倍率 ─────────────────────
    function effScale(w, h) {
      let sc = scale;
      while (sc > 1 && (w * sc > 8000 || h * sc > 8000)) sc--;
      return sc;
    }
    function updateDims(w, h) {
      if (format === 'svg') {
        setStatus('読み込み: <span class="ok">' + esc(currentName) + '.md</span>' +
          '  /  出力: <span class="ok">SVG ' + Math.round(w) + ' &#215; ' + Math.round(h) + ' px</span>');
        return;
      }
      const sc = effScale(w, h);
      let msg = '読み込み: <span class="ok">' + esc(currentName) + '.md</span>' +
        '  /  出力: <span class="ok">' + format.toUpperCase() + ' ' + Math.round(w * sc) + ' &#215; ' +
        Math.round(h * sc) + ' px</span> (' + sc + 'x)';
      if (sc < scale) msg += ' <span class="err">※サイズ上限のため倍率を縮小</span>';
      setStatus(msg);
    }

    // ── 画像のインライン化（canvas 汚染回避のため data URL に） ──
    function fallbackImg(im) {
      const s = el('span', 'md-img-fallback', '[' + esc(im.getAttribute('alt') || 'image') + ']');
      if (im.parentNode) im.parentNode.replaceChild(s, im);
    }
    async function inlineImg(im) {
      const src = im.getAttribute('src');
      if (!src || /^data:/i.test(src)) return;
      if (src === '#') { fallbackImg(im); return; }
      if (imgCache.has(src)) {
        const v = imgCache.get(src);
        if (v) im.setAttribute('src', v); else fallbackImg(im);
        return;
      }
      try {
        const res = await fetch(src, { mode: 'cors' });
        if (!res.ok) throw 0;
        const blob = await res.blob();
        // README 画像は数 MB あるのが普通なので 15 MB まで許容
        if (blob.size > 15 * 1024 * 1024) throw 0;
        const data = await blobToDataUrl(blob);
        imgCache.set(src, data);
        im.setAttribute('src', data);
      } catch (e) {
        imgCache.set(src, null);
        fallbackImg(im);
      }
    }

    // ── プレビューを横幅に合わせて縮小表示 ─────────────
    function fitPreview(card) {
      card.style.transform = 'none';
      const natW = card.offsetWidth;
      const avail = (preview.clientWidth || root.clientWidth || 600) - 2;
      const k = Math.min(1, avail / natW);
      card.style.transform = 'scale(' + k + ')';
      previewInner.style.width = (natW * k) + 'px';
      previewInner.style.height = (card.offsetHeight * k) + 'px';
    }

    // ── レンダリング ───────────────────────────────────
    async function render() {
      if (!currentMd.trim()) { setStatus('内容が空です。', 'err'); return; }
      busy = true;
      dl.disabled = true;
      resultLink.style.display = 'none';
      setStatus('レンダリング中…');
      previewInner.innerHTML = buildCard(currentMd, theme);
      preview.style.display = '';
      const card = previewInner.querySelector('.md2img-card');

      const imgs = [...card.querySelectorAll('img.md-img')];
      if (imgs.length) {
        let done = 0;
        setStatus('画像を埋め込み中… (0/' + imgs.length + ')');
        await Promise.all(imgs.map(async im => {
          await inlineImg(im);
          done++;
          setStatus('画像を埋め込み中… (' + done + '/' + imgs.length + ')');
        }));
      }
      await Promise.all([...card.querySelectorAll('img')].map(
        im => im.decode ? im.decode().catch(() => {}) : null));

      fitPreview(card);
      ctrl.style.display = '';
      actions.style.display = '';
      dl.disabled = false;
      busy = false;
      updateDims(card.offsetWidth, card.offsetHeight);
    }

    // ── ファイル配信（自動ダウンロード＋別タブリンク） ──
    function deliver(blob, filename) {
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = lastUrl;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      resultLink.href = lastUrl;
      resultLink.textContent = '↗ ' + filename + ' を別タブで開く（保存できない場合）';
      resultLink.style.display = '';
    }

    // ── ダウンロード ───────────────────────────────────
    async function doDownload() {
      if (busy) return;
      const card = previewInner.querySelector('.md2img-card');
      if (!card) { setStatus('先に Markdown を読み込んでください。', 'err'); return; }
      busy = true;
      dl.disabled = true;
      const prevTransform = card.style.transform;
      try {
        setStatus(format.toUpperCase() + ' を生成中…');
        // 縮小表示用の transform を一旦解除して実寸でレイアウトを読み取る
        card.style.transform = 'none';
        let painted;
        try { painted = paintCard(card); }
        finally { card.style.transform = prevTransform; }

        const fname = currentName || 'markdown';
        if (format === 'svg') {
          const svg = opsToSvg(painted);
          deliver(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), fname + '.svg');
          setStatus('&#10003; 保存しました: <span class="ok">' + esc(fname) + '.svg</span>');
        } else {
          const isJpg = format === 'jpg';
          const sc = effScale(painted.W, painted.H);
          const cv = drawCanvas(painted, sc);
          const blob = await new Promise(res => {
            try { cv.toBlob(res, isJpg ? 'image/jpeg' : 'image/png', isJpg ? 0.92 : undefined); }
            catch (e) { res(null); }
          });
          if (!blob) throw new Error('画像の生成に失敗しました');
          const ext = isJpg ? '.jpg' : '.png';
          deliver(blob, fname + ext);
          setStatus('&#10003; 保存しました: <span class="ok">' + esc(fname) + ext + '</span>');
        }
      } catch (e) {
        setStatus('&#10007; ' + esc(e && e.message || '生成に失敗しました'), 'err');
      }
      busy = false;
      dl.disabled = false;
    }

    // ── 入力の取り込み ─────────────────────────────────
    function load(md, name) {
      currentMd = String(md || '');
      currentName = baseName(name);
      render();
    }
    function readFile(file) {
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { setStatus('ファイルが大きすぎます（2MB 以下）。', 'err'); return; }
      const fr = new FileReader();
      fr.onload = () => load(String(fr.result || ''), file.name);
      fr.onerror = () => setStatus('ファイルの読み込みに失敗しました。', 'err');
      fr.readAsText(file);
    }

    // ── イベント配線 ───────────────────────────────────
    // 端末本体のクリックハンドラ（入力欄へ強制 focus）への伝播を遮断
    root.addEventListener('click', e => e.stopPropagation());

    drop.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => readFile(fileInput.files && fileInput.files[0]));

    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => {
      e.preventDefault(); drop.classList.add('is-over');
    }));
    ['dragleave', 'dragend'].forEach(ev => drop.addEventListener(ev, () => {
      drop.classList.remove('is-over');
    }));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('is-over');
      readFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    });

    samp.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', async () => {
        setStatus('取得中… ' + b.dataset.file);
        try {
          const r = await fetch(b.dataset.file);
          if (!r.ok) throw new Error(String(r.status));
          load(await r.text(), b.dataset.file);
        } catch (e) {
          setStatus('取得に失敗しました（' + esc(b.dataset.file) + '）。', 'err');
        }
      });
    });

    pasteBtn.addEventListener('click', () => {
      if (!ta.value.trim()) { setStatus('テキストが空です。', 'err'); return; }
      load(ta.value, 'markdown');
    });

    dl.addEventListener('click', doDownload);
    xBtn.addEventListener('click', () => { if (typeof opts.onClose === 'function') opts.onClose(); });

    const onResize = () => {
      const c = previewInner.querySelector('.md2img-card');
      if (c) fitPreview(c);
    };
    window.addEventListener('resize', onResize);

    container.appendChild(root);
    container.scrollTop = 0;

    // クリーンアップ関数を返す（terminal 側の closeViewer から呼ばれる）
    return () => {
      window.removeEventListener('resize', onResize);
      if (lastUrl) { URL.revokeObjectURL(lastUrl); lastUrl = null; }
    };
  }

  window.MD2IMG = { mount };
})();
