/**
 * charts.js — SVG チャート描画ライブラリ（依存なし・自己完結）
 * --------------------------------------------------------------------------
 * ブラウザ（window.GHSCharts）と Node（require）の両方で使える。
 * 各関数は items と options を受け取り、自己完結した <svg> 文字列を返す。
 * 返り値の SVG は色を直接埋め込むため、単体の .svg ファイルとしても成立する
 * （Markdown への画像埋め込みに利用できる）。
 *
 *   items  : [{ label, value, color?, display? }]
 *   options: { accent, scale:'linear'|'log', max?, title? }
 *
 * 提供する関数: bar / hbar / area / pie / radar
 * --------------------------------------------------------------------------
 */
(function (root, factory) {
  const lib = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  if (root) root.GHSCharts = lib;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');

  // テーマ色（SVG に直接埋め込む。単体 .svg でも成立させるため）
  const COL = { bg: '#161b22', grid: '#30363d', text: '#e6edf3', muted: '#7d8590' };

  // GitHub Linguist の言語カラー（未知の言語は灰色）
  const LANG_COLORS = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', HTML: '#e34c26', CSS: '#563d7c',
    Java: '#b07219', Python: '#3572A5', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600',
    Shell: '#89e051', Ruby: '#701516', Go: '#00ADD8', Rust: '#dea584', PHP: '#4F5D95',
    Kotlin: '#A97BFF', Swift: '#F05138', Dart: '#00B4AB', Vue: '#41b883', Lua: '#000080',
    GLSL: '#5686a5', Batchfile: '#C1F12E', Makefile: '#427819', Dockerfile: '#384d54',
    'Jupyter Notebook': '#DA5B0B', SCSS: '#c6538c', MDX: '#fcb32c', Markdown: '#083fa1',
    mcfunction: '#E22837', 'Common Lisp': '#3fb68b', NewLisp: '#87AED7', Lisp: '#3fb68b',
    YAML: '#cb171e', JSON: '#292929', TOML: '#9c4221',
  };
  const langColor = (name) => LANG_COLORS[name] || '#8b949e';

  // 値を 0..1 に正規化（linear / log）
  function norm(v, max, scale) {
    v = Math.max(v || 0, 0);
    if (scale === 'log') {
      const lm = Math.log10(max + 1) || 1;
      return Math.min(Math.log10(v + 1) / lm, 1);
    }
    return max > 0 ? Math.min(v / max, 1) : 0;
  }

  // hex 色 → rgba（透明度つき。濃淡表現に使う）
  function rgba(hex, alpha) {
    let h = String(hex || '#7c6af7').replace('#', '');
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const r = parseInt(h.slice(0, 2), 16) || 0;
    const g = parseInt(h.slice(2, 4), 16) || 0;
    const b = parseInt(h.slice(4, 6), 16) || 0;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // hex → [r,g,b]
  function hexRGB(hex) {
    let h = String(hex || '#7c6af7').replace('#', '');
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
  }
  // 2色（[r,g,b]）を t(0..1) で混ぜる
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  const rgbOf = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

  // 表示値（display 指定があればそれを、なければ value をカンマ区切りで）
  const disp = (d) => (d.display != null ? String(d.display) : fmt(d.value));

  // SVG 外枠（背景つき。どんなページ/READMEでも成立するように）
  function svg(w, h, body) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" `
      + `font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">`
      + `<rect width="${w}" height="${h}" rx="14" fill="${COL.bg}"/>${body}</svg>`;
  }

  // ── 横棒グラフ ───────────────────────────────────────
  function hbar(items, o) {
    o = o || {};
    const accent = o.accent || '#7c6af7';
    const scale = o.scale || 'linear';
    const max = o.max || Math.max.apply(null, items.map((d) => d.value).concat(1));
    const W = 460, rowH = 30, padY = 14, labelW = 124, valW = 74;
    const H = padY * 2 + items.length * rowH;
    const trackX = labelW, trackW = W - labelW - valW;
    let body = '';
    items.forEach((d, i) => {
      const cy = padY + i * rowH + rowH / 2;
      const c = d.color || accent;
      const w = Math.max(norm(d.value, max, scale) * trackW, 3);
      body += `<text x="${labelW - 12}" y="${cy + 4}" text-anchor="end" font-size="12" fill="${COL.text}">${esc(d.label)}</text>`
        + `<rect x="${trackX}" y="${cy - 6}" width="${trackW}" height="12" rx="6" fill="rgba(255,255,255,0.06)"/>`
        + `<rect x="${trackX}" y="${cy - 6}" width="${w.toFixed(1)}" height="12" rx="6" fill="${c}"><title>${esc(d.label)}: ${esc(disp(d))}</title></rect>`
        + `<text x="${W - valW + 10}" y="${cy + 4}" font-size="11" font-family="monospace" fill="${COL.muted}">${esc(disp(d))}</text>`;
    });
    return svg(W, H, body);
  }

  // ── 縦棒グラフ ───────────────────────────────────────
  function bar(items, o) {
    o = o || {};
    const accent = o.accent || '#7c6af7';
    const scale = o.scale || 'linear';
    const max = o.max || Math.max.apply(null, items.map((d) => d.value).concat(1));
    const W = 460, H = 290, padT = 34, padB = 48, padX = 18;
    const plotH = H - padT - padB;
    const slot = (W - padX * 2) / items.length;
    const bw = Math.min(slot * 0.62, 56);
    let body = `<line x1="${padX}" y1="${padT + plotH}" x2="${W - padX}" y2="${padT + plotH}" stroke="${COL.grid}"/>`;
    items.forEach((d, i) => {
      const cx = padX + slot * i + slot / 2;
      const bh = Math.max(norm(d.value, max, scale) * plotH, 3);
      const y = padT + plotH - bh;
      body += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${d.color || accent}"><title>${esc(d.label)}: ${esc(disp(d))}</title></rect>`
        + `<text x="${cx.toFixed(1)}" y="${(y - 7).toFixed(1)}" text-anchor="middle" font-size="11" font-family="monospace" fill="${COL.text}">${esc(disp(d))}</text>`
        + `<text x="${cx.toFixed(1)}" y="${H - padB + 19}" text-anchor="middle" font-size="11" fill="${COL.muted}">${esc(d.label)}</text>`;
    });
    return svg(W, H, body);
  }

  // ── 面グラフ ─────────────────────────────────────────
  function area(items, o) {
    o = o || {};
    const accent = o.accent || '#7c6af7';
    const scale = o.scale || 'linear';
    const max = o.max || Math.max.apply(null, items.map((d) => d.value).concat(1));
    const W = 460, H = 290, padT = 26, padB = 44, padX = 34;
    const plotH = H - padT - padB, plotW = W - padX * 2, n = items.length;
    const xAt = (i) => padX + (n === 1 ? plotW / 2 : plotW * i / (n - 1));
    const yAt = (v) => padT + plotH - norm(v, max, scale) * plotH;
    const baseY = padT + plotH;
    let line = '', dots = '', labels = '';
    items.forEach((d, i) => {
      const x = xAt(i), y = yAt(d.value);
      line += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.6" fill="${accent}" stroke="${COL.bg}" stroke-width="1.5"><title>${esc(d.label)}: ${esc(disp(d))}</title></circle>`;
      labels += `<text x="${x.toFixed(1)}" y="${H - padB + 19}" text-anchor="middle" font-size="11" fill="${COL.muted}">${esc(d.label)}</text>`;
    });
    const fill = `M${xAt(0).toFixed(1)} ${baseY} ${line.replace(/^M/, 'L')} L${xAt(n - 1).toFixed(1)} ${baseY} Z`;
    return svg(W, H,
      `<line x1="${padX}" y1="${baseY}" x2="${W - padX}" y2="${baseY}" stroke="${COL.grid}"/>`
      + `<path d="${fill}" fill="${rgba(accent, 0.3)}"/>`
      + `<path d="${line}" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linejoin="round"/>`
      + dots + labels);
  }

  // ── 円（ドーナツ）グラフ ─────────────────────────────
  function pie(items, o) {
    o = o || {};
    const accent = o.accent || '#7c6af7';
    const total = items.reduce((a, d) => a + Math.max(d.value || 0, 0), 0) || 1;
    const W = 460, H = 290, cx = 132, cy = H / 2, rOut = 104, rIn = 56;
    const sliceColor = (d, i) => d.color
      || rgba(accent, 0.95 - 0.62 * (i / Math.max(items.length - 1, 1)));
    const arcP = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
    let ang = -Math.PI / 2, slices = '';
    items.forEach((d, i) => {
      const frac = Math.max(d.value || 0, 0) / total;
      if (frac <= 0) return;
      const a2 = ang + frac * Math.PI * 2;
      const big = frac > 0.5 ? 1 : 0;
      slices += `<path d="M${arcP(rOut, ang)} A${rOut} ${rOut} 0 ${big} 1 ${arcP(rOut, a2)} `
        + `L${arcP(rIn, a2)} A${rIn} ${rIn} 0 ${big} 0 ${arcP(rIn, ang)} Z" fill="${sliceColor(d, i)}">`
        + `<title>${esc(d.label)}: ${esc(disp(d))} (${Math.round(frac * 100)}%)</title></path>`;
      ang = a2;
    });
    // 凡例
    const lx = 272, lh = Math.min(28, (H - 40) / items.length);
    let legend = '';
    items.forEach((d, i) => {
      const ly = 30 + i * lh;
      const pct = Math.round(Math.max(d.value || 0, 0) / total * 100);
      legend += `<rect x="${lx}" y="${ly - 9}" width="11" height="11" rx="2.5" fill="${sliceColor(d, i)}"/>`
        + `<text x="${lx + 18}" y="${ly}" font-size="12" fill="${COL.text}">${esc(d.label)}</text>`
        + `<text x="${W - 16}" y="${ly}" text-anchor="end" font-size="11" font-family="monospace" fill="${COL.muted}">${pct}%</text>`;
    });
    return svg(W, H, slices + legend);
  }

  // ── レーダーチャート（多軸） ─────────────────────────
  function radar(items, o) {
    o = o || {};
    const accent = o.accent || '#7c6af7';
    const scale = o.scale || 'log';
    const N = items.length;
    const W = 460, H = 420, CX = 230, CY = 215, R = 130, RINGS = 5;
    const angle = (i) => (-90 + i * (360 / N)) * Math.PI / 180;
    const pt = (i, r) => [
      +(CX + r * Math.cos(angle(i))).toFixed(1),
      +(CY + r * Math.sin(angle(i))).toFixed(1),
    ];
    let toR, ringLabels;
    if (scale === 'log') {
      toR = (v) => (!v || v < 1) ? 0 : Math.min(R * (Math.log10(v) + 1) / RINGS, R);
      ringLabels = ['1', '10', '100', '1K', '10K'];
    } else {
      const max = o.max || Math.max.apply(null, items.map((d) => d.value).concat(1));
      toR = (v) => Math.min((Math.max(v || 0, 0) / max) * R, R);
      ringLabels = [];
      for (let k = 1; k <= RINGS; k++) ringLabels.push(fmt(Math.round(max * k / RINGS)));
    }
    let rings = '', axes = '', scaleLabels = '', labels = '';
    for (let k = 1; k <= RINGS; k++) {
      const pts = [];
      for (let i = 0; i < N; i++) pts.push(pt(i, R * k / RINGS).join(','));
      rings += `<polygon points="${pts.join(' ')}" fill="none" stroke="${COL.grid}" stroke-width="1" stroke-dasharray="3 3"/>`;
      scaleLabels += `<text x="${CX + 6}" y="${(CY - R * k / RINGS + 3).toFixed(1)}" font-size="9" font-family="monospace" fill="${COL.muted}">${ringLabels[k - 1]}</text>`;
    }
    for (let i = 0; i < N; i++) {
      const [x, y] = pt(i, R);
      axes += `<line x1="${CX}" y1="${CY}" x2="${x}" y2="${y}" stroke="${COL.grid}" stroke-width="1" stroke-dasharray="3 3"/>`;
      const a = angle(i), c = Math.cos(a);
      const lx = CX + (R + 22) * c, ly = CY + (R + 22) * Math.sin(a);
      const anchor = Math.abs(c) < 0.35 ? 'middle' : (c > 0 ? 'start' : 'end');
      labels += `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}" font-size="13" fill="${COL.text}">${esc(items[i].label)}</text>`;
    }
    const dpts = [];
    let dots = '';
    items.forEach((d, i) => {
      const [x, y] = pt(i, toR(d.value || 0));
      dpts.push(`${x},${y}`);
      dots += `<circle cx="${x}" cy="${y}" r="3.4" fill="${accent}" stroke="${COL.bg}" stroke-width="1.5"><title>${esc(d.label)}: ${esc(disp(d))}</title></circle>`;
    });
    const data = `<polygon points="${dpts.join(' ')}" fill="${rgba(accent, 0.38)}" stroke="${accent}" stroke-width="2.5" stroke-linejoin="round"/>${dots}`;
    return svg(W, H, rings + axes + scaleLabels + labels + data);
  }

  // ── 季節・天気で bars3d の色を決める（色だけ・粒子アニメは無し） ──
  // season: spring|summer|autumn|winter / weather: rain|snow|clear
  function seasonWeatherColor(season, weather) {
    if (weather === 'rain') return '#5a9bd4';   // 雨 — 青
    if (weather === 'snow') return '#9fc6e8';   // 雪 — 氷青
    if (season === 'spring') return '#ec9bb5';  // 春 — 桜ピンク
    if (season === 'summer') return '#3fb950';  // 夏 — 緑
    if (season === 'autumn') return '#e0813a';  // 秋 — 紅葉オレンジ
    if (season === 'winter') return '#6f9fd8';  // 冬 — 冬空の青
    return null;
  }

  // ── Contributions 立体棒グラフ（アイソメトリック） ───
  // days: [{ date, count, level }] / 棒の高さ＝コミット数・色の濃淡＝level
  function bars3d(days, o) {
    o = o || {};
    // 季節・天気が指定されていればその色を、なければ accent を使う
    const accent = seasonWeatherColor(o.season, o.weather) || o.accent || '#39d353';
    if (!days || !days.length) return svg(240, 90, '');

    // 先頭を日曜に合わせてパディングし、7日ごとの週（列）に並べる
    const firstDow = new Date(days[0].date + 'T00:00:00Z').getUTCDay();
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    days.forEach((d) => cells.push(d));
    while (cells.length % 7) cells.push(null);
    const weeks = cells.length / 7;

    const HW = 6.5, HH = 3.3, MAXBAR = 62;       // タイル半幅・半高・最大棒高
    const ox = 7 * HW + 14, oy = MAXBAR + 16;
    const W = Math.ceil(ox + weeks * HW + 16);
    const H = Math.ceil(oy + (weeks + 6) * HH + 18);
    const iso = (c, r) => ({ x: ox + (c - r) * HW, y: oy + (c + r) * HH });

    const maxCount = Math.max.apply(null, days.map((d) => d.count || 0).concat(1));
    const barH = (c) => 3 + (Math.log10((c || 0) + 1) / (Math.log10(maxCount + 1) || 1)) * MAXBAR;

    // level（0-4）で色の濃淡を、面ごとに明るさを変えて立体感を出す
    const accRGB = hexRGB(accent);
    const DARK = [30, 30, 38];
    const LV_F = [0.12, 0.45, 0.66, 0.85, 1];
    const faces = (lv) => {
      const lit = mix(DARK, accRGB, LV_F[lv] != null ? LV_F[lv] : 1);
      return {
        top: rgbOf(lit),
        right: rgbOf(mix([0, 0, 0], lit, 0.7)),
        left: rgbOf(mix([0, 0, 0], lit, 0.48)),
      };
    };

    let body = '';
    // 奥→手前（depth = c + r 昇順）の順に描画して前後関係を正しく
    const maxDepth = (weeks - 1) + 6;
    for (let depth = 0; depth <= maxDepth; depth++) {
      for (let c = 0; c < weeks; c++) {
        const r = depth - c;
        if (r < 0 || r > 6) continue;
        const cell = cells[c * 7 + r];
        const h = cell ? barH(cell.count) : 3;
        const f = faces(cell ? (cell.level || 0) : 0);
        const A = iso(c, r), B = iso(c + 1, r), Cc = iso(c + 1, r + 1), D = iso(c, r + 1);
        const g = (p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        const u = (p) => `${p.x.toFixed(1)},${(p.y - h).toFixed(1)}`;
        body += `<polygon points="${u(D)} ${u(Cc)} ${g(Cc)} ${g(D)}" fill="${f.left}"/>`
          + `<polygon points="${u(B)} ${u(Cc)} ${g(Cc)} ${g(B)}" fill="${f.right}"/>`
          + `<polygon points="${u(A)} ${u(B)} ${u(Cc)} ${u(D)}" fill="${f.top}">`
          + `<title>${cell ? esc(cell.date) + ' ・ ' + cell.count + ' contributions' : ''}</title></polygon>`;
      }
    }
    return svg(W, H, body);
  }

  return { bar, hbar, area, pie, radar, bars3d, langColor };
});
