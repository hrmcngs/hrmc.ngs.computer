/**
 * github-stats.js  —  GitHub 活動統計ウィジェット（自己完結・依存なし）
 * --------------------------------------------------------------------------
 * GitHub API（CORS対応・未認証）からユーザーの活動を取得し、
 * 統計カード＋使用言語グラフを描画する。CSSも自身で注入する。
 *
 * ◆ 他のサイト/repo での使い方（このファイルをコピーするだけ） ◆
 *   1. charts.js と github-stats.js をコピーして読み込む（charts.js が先）:
 *        <script src="charts.js"></script>
 *        <script src="github-stats.js"></script>
 *   2. 表示したい場所に div を置く:
 *        <div data-github-user="ユーザー名"></div>
 *   （任意）アクセントカラー : data-accent="#3ecfcf"
 *   （任意）organization追加 : data-github-orgs="Org1,Org2"
 *           ※公開メンバーシップの org は自動で含まれる。
 *             非公開メンバーシップの org だけ手動で指定する。
 *   （任意）集計期間（日数）  : data-period-days="365"（既定 365 = 過去1年）
 *   （任意）草グラフの色      : data-grass-color="#39d353"（既定: GitHub緑）
 *   （任意）Contrib図の種類   : data-contrib-chart="default|grid|bars3d"（既定: default）
 *           default は季節で自動配色（ハロウィン=かぼちゃ / クリスマス=赤 / 通常=緑）
 *   （任意）季節色の上書き    : data-contrib-halloween="#fa7a18" / data-contrib-xmas="#e5484d"
 *   （任意）Activity図の種類  : data-activity-chart="radar|pie|bar|hbar|area"（既定: radar）
 *   （任意）Activity図の色    : data-activity-color="#f0b429"（既定: アクセント色）
 *   （任意）言語図の種類      : data-lang-chart="hbar|pie|bar|area"（既定: hbar）
 *   （任意）言語図の色        : data-lang-color="#3ecfcf"（既定: 言語ごとの色）
 *   （任意）Otherまとめ閾値%  : data-lang-other="1"（既定 1・0 でまとめない）
 *   （任意）Other除外(常時表示): data-lang-pin="Java,Lua"（%が低くても個別表示）
 *   （任意）Otherへ強制       : data-lang-merge="JSON"（%に関わらず Other へ）
 *   （任意）グラフから除外    : data-lang-exclude="JSON,Markdown"（集計に含めない）
 *
 * 取得する指標: コミット / プルリク / Issue / レビュー / リポジトリ / 関わったPR
 * （コミット等の活動は org での活動も含む。リポジトリ数と使用言語は org のリポジトリも合算）
 * 集計期間: 既定で「過去1年間」。リポジトリ数・使用言語は期間内に更新されたものが対象。
 * 使用言語は各リポジトリの言語別バイト数（/languages）を合算した詳細な内訳。
 * 結果は localStorage に6時間キャッシュ（APIレート制限・表示速度対策）。
 * 取得に失敗した場合は charts/data.json（GitHub Action が生成）へフォールバックする。
 * --------------------------------------------------------------------------
 */
(() => {
  'use strict';

  const API = 'https://api.github.com';
  const CACHE_TTL = 6 * 60 * 60 * 1000; // 6時間
  const CACHE_VERSION = 'v2';           // データ構造を変えたら上げる（古いキャッシュを無効化）
  const DEFAULT_PERIOD_DAYS = 365;      // 集計期間の既定値（過去1年・data-period-days で変更可）

  // GitHub Linguist の主要言語カラー
  const LANG_COLORS = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', HTML: '#e34c26', CSS: '#563d7c',
    Java: '#b07219', Python: '#3572A5', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600',
    Shell: '#89e051', Ruby: '#701516', Go: '#00ADD8', Rust: '#dea584', PHP: '#4F5D95',
    Kotlin: '#A97BFF', Swift: '#F05138', Dart: '#00B4AB', Vue: '#41b883', Lua: '#000080',
    GLSL: '#5686a5', Batchfile: '#C1F12E', Makefile: '#427819', Dockerfile: '#384d54',
    'Jupyter Notebook': '#DA5B0B', SCSS: '#c6538c', MDX: '#fcb32c', Markdown: '#083fa1',
    mcfunction: '#E22837', 'Common Lisp': '#3fb68b', NewLisp: '#87AED7', Lisp: '#3fb68b',
    YAML: '#cb171e', JSON: '#292929', TOML: '#9c4221', Vim_Script: '#199f4b',
  };
  const langColor = (name) => LANG_COLORS[name] || '#8b949e';

  // ── スタイル注入（1回だけ） ───────────────────────────
  function injectStyles() {
    if (document.getElementById('ghs-style')) return;
    const s = document.createElement('style');
    s.id = 'ghs-style';
    s.textContent = `
.ghs{--ghs-accent:#2f81f7;--ghs-bg:#161b22;--ghs-border:#30363d;
 --ghs-text:#e6edf3;--ghs-muted:#7d8590;--ghs-grass:#39d353;
 font-family:var(--font-jp);
 color:var(--ghs-text)}
.ghs-head{display:flex;align-items:center;gap:.85rem;margin-bottom:1.8rem}
.ghs-avatar{width:46px;height:46px;border-radius:50%;border:1px solid var(--ghs-border);flex-shrink:0}
.ghs-htext{display:flex;flex-direction:column;gap:.1rem;min-width:0}
.ghs-title{font-size:1.3rem;font-weight:600;letter-spacing:-.01em;line-height:1.2}
.ghs-period{display:inline-block;margin-left:.5rem;padding:.15em .6em;border:1px solid var(--ghs-accent);
 border-radius:100px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:.6rem;font-weight:700;
 color:var(--ghs-accent);letter-spacing:.04em;vertical-align:middle}
.ghs-user{font-size:.78rem;color:var(--ghs-muted);text-decoration:none;width:fit-content}
.ghs-user:hover{color:var(--ghs-accent)}
.ghs-chart{margin-bottom:2.4rem}
.ghs-chart svg{display:block;width:100%;max-width:480px;height:auto;margin:0 auto}
.ghs-chart-anim{opacity:0;transform:translateY(8px);transition:opacity .7s ease,transform .7s ease}
.ghs-chart-anim.ghs-in{opacity:1;transform:translateY(0)}
.ghs-sub{font-size:.78rem;font-weight:600;
 color:var(--ghs-muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:1rem}
.ghs-cal{margin-bottom:2.4rem}
.ghs-cal-scroll{overflow-x:auto;padding-bottom:.2rem}
.ghs-cal-svg{display:block;width:100%;height:auto}
.ghs-cal-mlabel,.ghs-cal-dlabel{fill:var(--ghs-muted);font-size:9px;font-family:'Space Grotesk',sans-serif}
.ghs-cal-legend{display:flex;align-items:center;gap:.28rem;margin-top:.7rem;font-size:.66rem;color:var(--ghs-muted)}
.ghs-cal-ltext{margin:0 .2rem}
.ghs-cal-lcell{width:11px;height:11px;border-radius:2.2px;display:inline-block}
.ghs-lv0{background:rgba(255,255,255,.045);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}
.ghs-lv1{background:var(--ghs-grass);opacity:.32}
.ghs-lv2{background:var(--ghs-grass);opacity:.55}
.ghs-lv3{background:var(--ghs-grass);opacity:.78}
.ghs-lv4{background:var(--ghs-grass)}
.ghs-foot{margin-top:1.7rem;font-size:.7rem;color:var(--ghs-muted);opacity:.6}
.ghs-msg{color:var(--ghs-muted);font-size:.85rem;padding:1.2rem 0}
`;
    document.head.appendChild(s);
  }

  // ── GitHub API ───────────────────────────────────────
  async function ghJson(path) {
    const res = await fetch(API + path, { headers: { Accept: 'application/vnd.github+json' } });
    if (res.status === 403 || res.status === 429) throw new Error('rate-limit');
    if (!res.ok) throw new Error('http-' + res.status);
    return res.json();
  }

  // 検索APIの total_count を返す（commits / issues）
  async function searchCount(kind, query) {
    const d = await ghJson(`/search/${kind}?q=${encodeURIComponent(query)}&per_page=1`);
    return typeof d.total_count === 'number' ? d.total_count : 0;
  }

  // 公開リポジトリを全件取得（ownerPath は /users/NAME または /orgs/NAME・最大300件）
  async function fetchRepoList(ownerPath) {
    let repos = [];
    for (let page = 1; page <= 3; page++) {
      const list = await ghJson(`${ownerPath}/repos?per_page=100&page=${page}&sort=pushed`);
      if (!Array.isArray(list) || !list.length) break;
      repos = repos.concat(list);
      if (list.length < 100) break;
    }
    return repos;
  }

  // 所属 organization 名を取得（公開メンバーシップ＋手動指定をマージ・重複除去）
  async function fetchOrgNames(user, manualOrgs) {
    let names = [];
    try {
      const list = await ghJson(`/users/${user}/orgs?per_page=100`);
      if (Array.isArray(list)) names = list.map((o) => o.login);
    } catch (e) { /* 取得失敗でも継続 */ }
    names = names.concat(manualOrgs);
    const seen = new Set();
    return names.filter((n) => {
      const k = String(n).toLowerCase();
      if (!n || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  // GitHub の contribution（草）データを取得（jogruber の公開API・CORS対応・未認証）
  async function fetchContributions(user) {
    try {
      const res = await fetch(
        `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(user)}?y=last`);
      if (!res.ok) return null;
      const d = await res.json();
      if (!d || !Array.isArray(d.contributions)) return null;
      return { days: d.contributions, total: (d.total && d.total.lastYear) || 0 };
    } catch (e) {
      return null;
    }
  }

  async function fetchStats(user, manualOrgs, since) {
    const safe = (p) => p.catch(() => null); // 1指標が失敗しても全体は続行
    const sinceMs = Date.parse(since);

    // ユーザー情報・本人リポジトリ・所属org・contribution（草）を並行取得
    const [info, userRepos, orgNames, contrib] = await Promise.all([
      ghJson(`/users/${user}`),
      fetchRepoList(`/users/${user}`),
      fetchOrgNames(user, manualOrgs),
      fetchContributions(user),
    ]);

    // org のリポジトリを取得（取得できない org はスキップ）
    let orgRepos = [];
    for (const org of orgNames) {
      try { orgRepos = orgRepos.concat(await fetchRepoList(`/orgs/${org}`)); }
      catch (e) { /* この org はスキップ */ }
    }

    // search API: 集計期間内の活動件数（commits は author-date、その他は created で絞る）
    const [commits, prs, issues, reviews, involved] = await Promise.all([
      safe(searchCount('commits', `author:${user} author-date:>=${since}`)),
      safe(searchCount('issues', `type:pr author:${user} created:>=${since}`)),
      safe(searchCount('issues', `type:issue author:${user} created:>=${since}`)),
      safe(searchCount('issues', `type:pr reviewed-by:${user} created:>=${since}`)),
      safe(searchCount('issues', `type:pr involves:${user} created:>=${since}`)),
    ]);

    // 本人＋org のリポジトリを集約（fork除外・重複除去・集計期間内に更新されたもの）
    const seen = new Set();
    const repos = [...userRepos, ...orgRepos].filter((r) => {
      if (r.fork || seen.has(r.full_name)) return false;
      seen.add(r.full_name);
      return r.pushed_at && Date.parse(r.pushed_at) >= sinceMs;
    });

    // 使用言語の集計（各リポジトリの言語別バイト数を /languages から取得して合算）
    const LANG_REPO_CAP = 30; // レート制限対策: 言語解析するリポジトリ数の上限
    const targetRepos = repos
      .slice()
      .sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at))
      .slice(0, LANG_REPO_CAP);
    const byteResults = await Promise.all(
      targetRepos.map((r) => ghJson(`/repos/${r.full_name}/languages`).catch(() => ({}))),
    );
    const langBytes = {};
    byteResults.forEach((obj) => {
      for (const [lang, bytes] of Object.entries(obj || {})) {
        langBytes[lang] = (langBytes[lang] || 0) + bytes;
      }
    });
    const langs = Object.entries(langBytes).sort((a, b) => b[1] - a[1]);

    return {
      name: info.name || user,
      login: info.login || user,
      avatar: info.avatar_url || '',
      htmlUrl: info.html_url || `https://github.com/${user}`,
      metrics: { commits, prs, issues, reviews, repos: repos.length, involved },
      langs,
      orgs: orgNames,
      contrib,
    };
  }

  // ── 描画 ─────────────────────────────────────────────
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : '—');
  function fmtBytes(n) {
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }

  // contribution（草）グラフを SVG で描画する
  const CAL_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function renderCalendar(contrib) {
    const days = (contrib && contrib.days) || [];
    if (!days.length) return '';
    const CELL = 11, STEP = 14, LEFT = 30, TOP = 15;
    const FILL_OP = [0, 0.32, 0.55, 0.78, 1];

    // 先頭を日曜に合わせてパディングし、7日ごとの週（列）に並べる
    const firstDow = new Date(days[0].date + 'T00:00:00Z').getUTCDay();
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    days.forEach((d) => cells.push(d));
    while (cells.length % 7) cells.push(null);
    const weeks = cells.length / 7;
    const W = LEFT + weeks * STEP;
    const H = TOP + 7 * STEP;

    // 各日のセル
    let rects = '';
    cells.forEach((c, i) => {
      if (!c) return;
      const x = LEFT + Math.floor(i / 7) * STEP;
      const y = TOP + (i % 7) * STEP;
      const lv = c.level || 0;
      const attr = lv === 0
        ? 'fill="rgba(255,255,255,0.045)" stroke="rgba(255,255,255,0.14)"'
        : `style="fill:var(--ghs-grass);fill-opacity:${FILL_OP[lv]}"`;
      rects += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2.2" ${attr}>`
        + `<title>${esc(c.date)} ・ ${c.count} contributions</title></rect>`;
    });

    // 月ラベル（各列の最初の日が属する月が変わったら表示）
    let months = '';
    let lastMonth = -1;
    for (let col = 0; col < weeks; col++) {
      let cell = null;
      for (let row = 0; row < 7; row++) {
        const c = cells[col * 7 + row];
        if (c) { cell = c; break; }
      }
      if (!cell) continue;
      const mo = new Date(cell.date + 'T00:00:00Z').getUTCMonth();
      if (mo !== lastMonth) {
        if (col < weeks - 2) {
          months += `<text x="${LEFT + col * STEP}" y="10" class="ghs-cal-mlabel">${CAL_MONTHS[mo]}</text>`;
        }
        lastMonth = mo;
      }
    }

    // 曜日ラベル（Mon / Wed / Fri）
    let dayLabels = '';
    [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']].forEach(([row, label]) => {
      dayLabels += `<text x="0" y="${TOP + row * STEP + 9}" class="ghs-cal-dlabel">${label}</text>`;
    });

    return `<svg class="ghs-cal-svg" viewBox="0 0 ${W} ${H}" style="max-width:${W}px" `
      + `xmlns="http://www.w3.org/2000/svg" role="img" aria-label="contribution graph">`
      + `${months}${dayLabels}${rects}</svg>`;
  }

  // Contributions「default」用の季節カラー
  // GitHub と同様ハロウィン期間はかぼちゃ色。クリスマスは GitHub に無いので独自に赤系。
  function seasonalGrass(root) {
    const now = new Date();
    const m = now.getMonth() + 1, day = now.getDate();
    if (m === 10 && day >= 24) return root.dataset.contribHalloween || '#fa7a18'; // ハロウィン
    if (m === 12 && day >= 20 && day <= 28) return root.dataset.contribXmas || '#e5484d'; // クリスマス
    return '#39d353'; // 通常（GitHub緑）
  }

  // 現在の季節（立体棒グラフの装飾用）
  function currentSeason() {
    const m = new Date().getMonth() + 1;
    if (m >= 3 && m <= 5) return 'spring';
    if (m >= 6 && m <= 8) return 'summer';
    if (m >= 9 && m <= 11) return 'autumn';
    return 'winter';
  }

  function render(root, data) {
    const m = data.metrics;

    // Activity チャート（種類: data-activity-chart / 色: data-activity-color）
    const actType = (root.dataset.activityChart || 'radar').toLowerCase();
    const actColor = root.dataset.activityColor || root.dataset.accent || '#7c6af7';
    const actItems = [
      { label: 'Commit', value: m.commits || 0 },
      { label: 'PullReq', value: m.prs || 0 },
      { label: 'Issue', value: m.issues || 0 },
      { label: 'Involved', value: m.involved || 0 },
      { label: 'Review', value: m.reviews || 0 },
      { label: 'Repo', value: m.repos || 0 },
    ];
    const charts = (typeof window !== 'undefined' && window.GHSCharts) || {};
    const actFn = charts[actType] || charts.radar;
    const activityHtml = actFn ? actFn(actItems, { scale: 'log', accent: actColor }) : '';

    // 使用言語チャート
    //   data-lang-chart   : 種類（hbar|pie|bar|area）
    //   data-lang-color   : 単色指定（未指定なら言語ごとの色）
    //   data-lang-exclude : グラフに含めない言語（カンマ区切り・集計対象外）
    //   data-lang-pin     : %が低くても Other にまとめず個別表示する言語
    //   data-lang-merge   : %に関わらず Other にまとめる言語
    //   data-lang-other   : Other にまとめる閾値%（既定 1・0 でまとめない）
    const langType = (root.dataset.langChart || 'hbar').toLowerCase();
    const langOverride = root.dataset.langColor || '';
    const csv = (s) => (s || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    const langExclude = csv(root.dataset.langExclude);
    const langPin = csv(root.dataset.langPin);
    const langMerge = csv(root.dataset.langMerge);
    const otherTh = root.dataset.langOther != null ? (parseFloat(root.dataset.langOther) || 0) : 1;

    // 除外言語を抜いてから合計を取り直す
    const usableLangs = data.langs.filter(([n]) => langExclude.indexOf(n.toLowerCase()) < 0);
    const langTotal = usableLangs.reduce((a, [, b]) => a + b, 0) || 1;

    // 個別表示 / Other 振り分け（pin=常に個別 / merge=常にOther / それ以外は閾値）
    const langShown = [];
    let otherBytes = 0;
    usableLangs.forEach(([n, b]) => {
      const key = n.toLowerCase();
      if (langPin.indexOf(key) >= 0) { langShown.push([n, b]); return; }
      if (langMerge.indexOf(key) >= 0) { otherBytes += b; return; }
      if ((b / langTotal) * 100 >= otherTh) langShown.push([n, b]);
      else otherBytes += b;
    });

    const toLangItem = (name, bytes, color) => {
      const pct = (bytes / langTotal) * 100;
      return { label: name, value: bytes, color,
        display: (pct < 0.1 ? '<0.1' : pct.toFixed(1)) + '%' };
    };
    const langItems = langShown.slice(0, 14)
      .map(([n, b]) => toLangItem(n, b, langOverride || langColor(n)));
    if (otherBytes > 0) langItems.push(toLangItem('Other', otherBytes, langOverride || '#8b949e'));

    const langFn = charts[langType] || charts.hbar;
    const langsHtml = langItems.length
      ? langFn(langItems, { scale: 'linear', accent: langOverride || '#7c6af7' })
      : '<p class="ghs-msg">言語データがありません。</p>';

    // Contributions（種類: data-contrib-chart = default | grid | bars3d）
    //   default … 草グラフ。色は季節で自動（ハロウィン=かぼちゃ / クリスマス=赤 / 通常=緑）
    const contribType = (root.dataset.contribChart || 'default').toLowerCase();
    let grassColor = root.dataset.grassColor || '#39d353';
    if (contribType === 'default') {
      grassColor = seasonalGrass(root);
      root.style.setProperty('--ghs-grass', grassColor); // 草グラフ(CSS)にも反映
    }
    let contribInner = '';
    if (data.contrib && contribType === 'bars3d' && charts.bars3d) {
      contribInner = `<div class="ghs-chart ghs-chart-anim">${charts.bars3d(data.contrib.days, { accent: grassColor, season: currentSeason() })}</div>`;
    } else if (data.contrib) {
      contribInner = `<div class="ghs-cal-scroll">${renderCalendar(data.contrib)}</div>`
        + '<div class="ghs-cal-legend"><span class="ghs-cal-ltext">Less</span>'
        + '<span class="ghs-cal-lcell ghs-lv0"></span><span class="ghs-cal-lcell ghs-lv1"></span>'
        + '<span class="ghs-cal-lcell ghs-lv2"></span><span class="ghs-cal-lcell ghs-lv3"></span>'
        + '<span class="ghs-cal-lcell ghs-lv4"></span><span class="ghs-cal-ltext">More</span></div>';
    }
    const calHtml = data.contrib ? `
      <div class="ghs-cal">
        <p class="ghs-sub">Contributions ・ 過去1年 ${fmt(data.contrib.total)}</p>
        ${contribInner}
      </div>` : '';

    root.className = 'ghs';
    root.innerHTML = `
      <div class="ghs-head">
        ${data.avatar ? `<img class="ghs-avatar" src="${esc(data.avatar)}" alt="${esc(data.name)}">` : ''}
        <span class="ghs-htext">
          <span class="ghs-title">GitHub Activity<span class="ghs-period">${esc(data.period || '')}</span></span>
          <a class="ghs-user" href="${esc(data.htmlUrl)}" target="_blank" rel="noopener noreferrer">@${esc(data.login)}</a>
        </span>
      </div>
      <div class="ghs-chart ghs-chart-anim">${activityHtml}</div>
      ${calHtml}
      <div class="ghs-langs">
        <p class="ghs-sub">使用言語</p>
        <div class="ghs-chart ghs-chart-anim">${langsHtml}</div>
      </div>
      <p class="ghs-foot">${esc(data.period || '')} · GitHub API${data.orgs && data.orgs.length ? ' · ' + esc(data.orgs.join(', ')) + ' 含む' : ''} · 6時間ごとに更新</p>
    `;

    animate(root);
  }

  // レーダー・言語バーを、画面に入ったタイミングでアニメーションさせる
  function animate(root) {
    const play = () => {
      root.querySelectorAll('.ghs-chart-anim').forEach((el) => el.classList.add('ghs-in'));
    };
    if ('IntersectionObserver' in window) {
      const ob = new IntersectionObserver((ents) => {
        ents.forEach((e) => { if (e.isIntersecting) { play(); ob.disconnect(); } });
      }, { threshold: 0.25 });
      ob.observe(root);
    } else {
      play();
    }
  }

  // ── キャッシュ ───────────────────────────────────────
  function cacheGet(key) {
    try {
      const v = JSON.parse(localStorage.getItem('ghs:' + key));
      if (v && v.data && typeof v.t === 'number') return v;
    } catch (e) { /* 無効でも継続 */ }
    return null;
  }
  function cacheSet(key, data) {
    try { localStorage.setItem('ghs:' + key, JSON.stringify({ t: Date.now(), data })); }
    catch (e) { /* 無効でも継続 */ }
  }

  // ── 1つのウィジェットを起動 ──────────────────────────
  async function load(root) {
    const user = root.dataset.githubUser;
    if (!user) return;
    if (root.dataset.accent) root.style.setProperty('--ghs-accent', root.dataset.accent);
    if (root.dataset.grassColor) root.style.setProperty('--ghs-grass', root.dataset.grassColor);

    // data-github-orgs="Org1,Org2"（任意）— 非公開メンバーシップの org を明示指定
    const manualOrgs = (root.dataset.githubOrgs || '')
      .split(',').map((s) => s.trim()).filter(Boolean);

    // data-period-days（任意）— 集計期間。既定 365日（過去1年）
    const periodDays = Math.max(1, parseInt(root.dataset.periodDays, 10) || DEFAULT_PERIOD_DAYS);
    const since = new Date(Date.now() - periodDays * 86400000).toISOString().slice(0, 10);
    const periodText = periodDays % 365 === 0 ? `過去${periodDays / 365}年`
      : periodDays % 30 === 0 ? `過去${periodDays / 30}ヶ月` : `過去${periodDays}日`;

    const cacheKey = user
      + (manualOrgs.length ? ':' + manualOrgs.join(',') : '')
      + ':' + periodDays + 'd:' + CACHE_VERSION;

    const cached = cacheGet(cacheKey);
    if (cached && Date.now() - cached.t < CACHE_TTL) {
      render(root, cached.data);
      return;
    }
    if (cached) render(root, cached.data);                       // 古い値を先に表示
    else { root.className = 'ghs'; root.innerHTML = '<p class="ghs-msg">GitHub の活動を読み込み中…</p>'; }

    try {
      const data = await fetchStats(user, manualOrgs, since);
      data.period = periodText;
      cacheSet(cacheKey, data);
      render(root, data);
    } catch (err) {
      // live 取得に失敗（レート制限など）→ GitHub Action が生成した保存データへフォールバック
      try {
        const res = await fetch('/charts/data.json', { cache: 'no-cache' });
        if (res.ok) {
          const fb = await res.json();
          fb.period = periodText;
          render(root, fb);
          return;
        }
      } catch (e2) { /* フォールバックも不可 */ }
      if (!cached) {
        root.className = 'ghs';
        root.innerHTML = `<p class="ghs-msg">GitHub の統計を取得できませんでした${
          err.message === 'rate-limit' ? '（APIレート制限中・しばらく後に再表示されます）' : ''}。</p>`;
      }
      console.warn('[github-stats]', err.message);
    }
  }

  function init() {
    injectStyles();
    document.querySelectorAll('[data-github-user]').forEach(load);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
