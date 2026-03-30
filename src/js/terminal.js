(() => {
  function init(cfg, profile, data_works) {
    if (cfg.colors) {
      const r = document.documentElement;
      const c = cfg.colors;
      if (c.bg)         r.style.setProperty('--term-bg',         c.bg);
      if (c.bar)        r.style.setProperty('--term-bar',        c.bar);
      if (c.text)       r.style.setProperty('--term-text',       c.text);
      if (c.typed)      r.style.setProperty('--term-typed',      c.typed);
      if (c.success)    r.style.setProperty('--term-success',    c.success);
      if (c.error)      r.style.setProperty('--term-error',      c.error);
      if (c.link)       r.style.setProperty('--term-link',       c.link);
      if (c.dotRed)     r.style.setProperty('--term-dot-red',    c.dotRed);
      if (c.dotYellow)  r.style.setProperty('--term-dot-yellow', c.dotYellow);
      if (c.dotGreen)   r.style.setProperty('--term-dot-green',  c.dotGreen);
    }

    const build       = cfg.build       ?? [];
    const socialLinks = cfg.socialLinks ?? [];
    const PROMPT      = cfg.prompt      ?? 'hrmc@ngs:~$';
    const works       = data_works      ?? [];

    let buildActive    = false;
    let activeViewer   = null;
    let userCountState = null;

    // ── Search API 2回で完結（レート制限を回避） ─────────
    // PR:     /search/issues?q=type:pr+author:USERNAME
    // Commit: /search/commits?q=author:USERNAME
    // どちらも total_count を返すので repos ループ不要
    async function runUserCount(username, year, month, opt = '') {
      let since = '', until = '', createdQ = '';
      let periodLabel = '全期間';

      if (year && month) {
        since    = `${year}-${month}-01T00:00:00Z`;
        const em = month === '12' ? '01' : String(Number(month) + 1).padStart(2, '0');
        const ey = month === '12' ? String(Number(year) + 1) : year;
        until    = `${ey}-${em}-01T00:00:00Z`;
        createdQ = `+created:${since}..${until}`;
        periodLabel = `${year}年${Number(month)}月`;
      } else {
        // アカウント作成日を取得して全期間の範囲を表示
        try {
          const res  = await fetch(`https://api.github.com/users/${username}`, { headers });
          const data = await res.json();
          if (res.ok && data.created_at) periodLabel = `全期間（${data.created_at.slice(0, 10)} 〜）`;
        } catch {}
      }

      // opt: '' = publicのみ / 'org' = org含む / 'private' = private含む / 'org.private' = 全て
      const includeOrg     = opt === 'org'     || opt === 'org.private';
      const includePrivate = opt === 'private' || opt === 'org.private';
      const headers = {};
      // リポジトリ取得タイプ
      const repoType = includePrivate ? 'all' : (includeOrg ? 'public' : 'public');

      appendLines([
        '',
        `<span class="success">▶ 集計開始</span>  <span style="opacity:0.6">${escHtml(username)} / ${escHtml(periodLabel)}</span>`,
        '<span style="opacity:0.3">────────────────────────────────────</span>',
      ], body);

      const ld = makeLoadingLine('取得中...');
      body.appendChild(ld); body.scrollTop = body.scrollHeight;

      // PR 数（user_count.js と同じ）
      setLoading(ld, 'Pull Requests を取得中...');
      let prCount = 0;
      try {
        const res  = await fetch(
          `https://api.github.com/search/issues?q=type:pr+author:${username}${createdQ}`,
          { headers }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(`${res.status}: ${data?.message ?? ''}`);
        prCount = data.total_count ?? 0;
      } catch (err) {
        setLoading(ld, `<span class="error">PR取得エラー: ${escHtml(err.message)}</span>`);
        return;
      }

      // コミット数（user_count.js と同じ：全リポジトリをループ）
      let commitCount = 0;
      try {
        let page = 1, hasNext = true;
        while (hasNext) {
          setLoading(ld, `コミット集計中... (page ${page} / ${commitCount} commits)`);
          const repoRes = await fetch(
            `https://api.github.com/users/${username}/repos?per_page=100&page=${page}&type=${repoType}`,
            { headers }
          );
          const repos = await repoRes.json();
          if (!Array.isArray(repos) || !repos.length) break;
          for (const repo of repos) {
            let cPage = 1, cHasNext = true;
            while (cHasNext) {
              let url = `https://api.github.com/repos/${repo.owner.login}/${repo.name}/commits?author=${username}&per_page=100&page=${cPage}`;
              if (since) url += `&since=${since}`;
              if (until) url += `&until=${until}`;
              const commitRes = await fetch(url, { headers });
              const commits   = await commitRes.json();
              if (!Array.isArray(commits) || !commits.length) break;
              commitCount += commits.length;
              cHasNext     = commits.length === 100;
              cPage++;
            }
          }
          hasNext = repos.length === 100;
          page++;
        }
        // org含む場合：参加組織のリポジトリも取得
        if (includeOrg) {
          const orgRes  = await fetch(`https://api.github.com/users/${username}/orgs?per_page=100`, { headers });
          const orgs    = await orgRes.json();
          if (Array.isArray(orgs)) {
            for (const org of orgs) {
              let oPage = 1, oNext = true;
              while (oNext) {
                const or = await fetch(`https://api.github.com/orgs/${org.login}/repos?per_page=100&page=${oPage}&type=${repoType}`, { headers });
                const orepos = await or.json();
                if (!Array.isArray(orepos) || !orepos.length) break;
                for (const repo of orepos) {
                  let cPage = 1, cHasNext = true;
                  while (cHasNext) {
                    let url = `https://api.github.com/repos/${repo.owner.login}/${repo.name}/commits?author=${username}&per_page=100&page=${cPage}`;
                    if (since) url += `&since=${since}`;
                    if (until) url += `&until=${until}`;
                    const cr = await fetch(url, { headers });
                    const cs = await cr.json();
                    if (!Array.isArray(cs) || !cs.length) break;
                    commitCount += cs.length;
                    cHasNext = cs.length === 100;
                    cPage++;
                  }
                }
                oNext = orepos.length === 100;
                oPage++;
              }
            }
          }
        }
      } catch (err) {
        setLoading(ld, `<span class="error">コミット取得エラー: ${escHtml(err.message)}</span>`);
        return;
      }

      ld.remove();
      appendLines([
        `  Pull Request数: <span class="success" style="font-weight:700">${prCount}</span>`,
        `  コミット数:     <span class="success" style="font-weight:700">${commitCount}</span>  <span style="opacity:0.4">${opt === 'org.private' ? '(org・private含む)' : opt === 'org' ? '(org含む)' : opt === 'private' ? '(private含む)' : '(publicのみ)'}</span>`,
        '',
      ], body);
    }

    function makeLoadingLine(text) {
      const div = document.createElement('div'); div.className = 'term-line';
      const out = document.createElement('span'); out.className = 'term-out';
      out.innerHTML = `<span style="opacity:0.5">${text}</span>`;
      div.appendChild(out); return div;
    }

    function setLoading(div, html) {
      const out = div.querySelector('.term-out');
      if (out) out.innerHTML = `<span style="opacity:0.6">${html}</span>`;
      body.scrollTop = body.scrollHeight;
    }

    // ── Commands ───────────────────────────────────────
    const COMMANDS = {
      help: () => [
        '使えるコマンド:',
        '  <span class="term-cmd">help</span>               このヘルプを表示',
        '  <span class="term-cmd">whoami</span>             自己紹介',
        '  <span class="term-cmd">ls</span>                 作ったものを一覧表示',
        '  <span class="term-cmd">./build.sh</span>         プロジェクト詳細を表示',
        '  <span class="term-cmd">./about.sh</span>         プロフィールを表示',
        '  <span class="term-cmd">./user-count.sh</span>    GitHub PR・コミット数を集計',
        '  <span class="term-cmd">cat links.txt</span>      リンク一覧',
        '  <span class="term-cmd">clear</span>              ターミナルをクリア',
      ],

      whoami: () => {
        const lines = [];
        if (profile.name) lines.push(`${escHtml(profile.name)} / ${escHtml((profile.handle ?? '').replace(/^@/, ''))}`);
        (profile.bio ?? []).forEach(b => lines.push(escHtml(b)));
        const xHosts = new Set(['x.com','www.x.com','twitter.com','www.twitter.com','mobile.twitter.com']);
        const accs = socialLinks.filter(l => {
          try { return xHosts.has(new URL(l.url, location.origin).hostname); } catch { return false; }
        });
        if (accs.length) lines.push(accs.map(l => `<a href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer">@${l.url.split('/').pop()}</a>`).join(' · '));
        return lines;
      },

      ls: () => (works ?? []).map(p => `${escHtml(p.title)}/`),

      './build.sh': () => {
        buildActive = true;
        const lines = ['<span class="success">▶ Building projects...</span>', ''];
        build.forEach((p, i) => {
          const cs = p.color && /^[#a-zA-Z0-9(),%. ]+$/.test(p.color) ? ` style="color:${p.color}"` : '';
          lines.push(`<span class="term-cmd"${cs}>[${i+1}] ${escHtml(p.title)}</span>`);
          lines.push(`    ${escHtml(p.desc)}`);
          if (p.tags?.length) lines.push(`    <span style="opacity:0.5">${p.tags.map(t=>`[${escHtml(t)}]`).join(' ')}</span>`);
          (p.links ?? []).forEach(url => lines.push(`    → <a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${url}</a>`));
          lines.push('');
        });
        lines.push('<span class="success">Done.</span>');
        return lines;
      },

      './about.sh': () => {
        const lines = [];
        if (profile.name)   lines.push(`<span class="success">${escHtml(profile.name)}</span>`);
        if (profile.handle) lines.push(`<span style="opacity:0.6">${escHtml(profile.handle)}</span>`);
        if (lines.length)   lines.push('');
        (profile.bio ?? []).forEach(b => lines.push(escHtml(b)));
        if (profile.chips?.length) {
          lines.push('');
          lines.push(profile.chips.map(c => `<span style="color:var(--text-muted)">${escHtml(c)}</span>`).join('  '));
        }
        lines.push('');
        lines.push(`→ <a href="#about" rel="noopener noreferrer">/about</a>`);
        return lines;
      },

      './user-count.sh': () => {
        userCountState = { step: 'input' };
        return [
          '<span class="success">▶ GitHub Contribution Counter</span>',
          '',
          '  書式: <span class="term-cmd">ユーザーID [オプション] [年 月]</span>',
          '',
          '  <span style="opacity:0.6">オプションなし</span>  → publicのみ',
          '  <span class="term-cmd">org</span>         → org（組織）含む',
          '  <span class="term-cmd">private</span>     → private含む',
          '  <span class="term-cmd">org.private</span> → org・private全て含む',
          '',
          '  例: <span style="opacity:0.7">hrmcngs</span>',
          '  例: <span style="opacity:0.7">hrmcngs org</span>',
          '  例: <span style="opacity:0.7">hrmcngs org.private 2024 05</span>',
          '',
          '<span style="opacity:0.45">キャンセル: ./stop</span>',
          '',
          'ユーザーID [オプション] [年 月] を入力してください:',
        ];
      },

      'cat links.txt': () => {
        const max = Math.max(...socialLinks.map(l => l.label.length), 0);
        return socialLinks.map(l => `${escHtml(l.label).padEnd(max)} : <a href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer">${escHtml(l.url)}</a>`);
      },

      clear: () => '__clear__',
    };

    (profile.chips ?? []).forEach(chip => {
      COMMANDS[chip] = () => {
        const matched = build.filter(p => (p.tags ?? []).some(t => chip.toLowerCase().includes(t.toLowerCase())));
        if (!matched.length) return [{ type: 'error', message: `${chip}: 関連プロジェクトが見つかりません。` }];
        const lines = [`<span class="success">${chip} に関連するプロジェクト:</span>`, ''];
        matched.forEach(p => {
          const cs = p.color && /^[#a-zA-Z0-9(),%. ]+$/.test(p.color) ? ` style="color:${p.color}"` : '';
          lines.push(`<span class="term-cmd"${cs}>${escHtml(p.title)}</span>  ${(p.tags??[]).map(t=>`<span style="opacity:0.5">[${escHtml(t)}]</span>`).join(' ')}`);
          lines.push(`    ${escHtml(p.desc)}`);
          (p.links ?? []).forEach(url => lines.push(`    → <a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${url}</a>`));
          lines.push('');
        });
        return lines;
      };
    });

    // ── DOM refs ───────────────────────────────────────
    const wrap  = document.getElementById('term-wrap');
    const body  = document.getElementById('term-body');
    const input = document.getElementById('term-input');
    if (!body || !input || !wrap) return;

    const history = []; let histIdx = -1;

    function appendLines(lines, container, baseDelay = 0) {
      lines.forEach((line, i) => {
        const div = document.createElement('div'); div.className = 'term-line';
        div.style.animationDelay = `${baseDelay + Math.min(i * 0.03, 0.45)}s`;
        const out = document.createElement('span'); out.className = 'term-out';
        if (typeof line === 'string') { out.innerHTML = line; }
        else if (line?.type === 'error') { const s=document.createElement('span');s.className='error';s.textContent=line.message;out.appendChild(s); }
        div.appendChild(out); container.appendChild(div);
      });
      container.scrollTop = container.scrollHeight;
    }

    function print(lines, typed) {
      const echo = document.createElement('div'); echo.className = 'term-line';
      const ps = document.createElement('span'); ps.className = 'term-prompt-echo'; ps.textContent = PROMPT;
      const ts = document.createElement('span'); ts.className = 'term-typed'; ts.textContent = typed;
      echo.appendChild(ps); echo.appendChild(ts); body.appendChild(echo);
      if (lines === '__clear__') { body.innerHTML = ''; return; }
      appendLines(lines, body, 0.06);
    }

    function handleUserCountInput(raw) {
      const parts = raw.trim().split(/\s+/).filter(Boolean);
      if (!parts.length) { print(['ユーザーID を入力してください:'], raw); return; }
      const username = parts[0];
      const OPTS = ['org', 'private', 'org.private'];
      let opt='', year='', month='';
      let rest = parts.slice(1);
      // オプション判定
      if(rest.length && OPTS.includes(rest[0])){ opt=rest[0]; rest=rest.slice(1); }
      if(rest.length) year=rest[0];
      if(rest.length>1) month=rest[1].padStart(2,'0');
      if (year && !month) {
        print(['<span class="error">月も指定してください (例: 2024 05)</span>', 'ユーザーID [オプション] [年 月] を入力してください:'], raw);
        return;
      }
      userCountState = null;
      print([], raw);
      runUserCount(username, year, month, opt);
    }

    // ── Markdown ───────────────────────────────────────
    function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
    // javascript:/data:/vbscript: を除去して XSS を防ぐ
    function safeUrl(u){const t=u.trim();return/^(javascript|data|vbscript):/i.test(t)?'#':t;}
    function cleanUrl(url){url=url.replace(/\\([&()[\]#*_!])/g,'$1');url=url.replace(/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)/,'raw.githubusercontent.com/$1/$2/$3');return safeUrl(url);}
    function stripHtml(md){
      md=md.replace(/\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)/g,(_,a,i,h)=>`<a href="${safeUrl(h)}" target="_blank" rel="noopener noreferrer"><img src="${cleanUrl(i)}" alt="${escHtml(a)}" class="readme-img"></a>`);
      md=md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,(_,a,s)=>`<img src="${cleanUrl(s)}" alt="${a}" class="readme-img">`);
      md=md.replace(/<a\s+href="([^"]*)"[^>]*>[\s\S]*?<img\s[^>]*src="([^"]*)"[^>]*\/?>[\s\S]*?<\/a>/gi,(_,h,s)=>`<a href="${safeUrl(h)}" target="_blank" rel="noopener noreferrer"><img src="${cleanUrl(s)}" class="readme-img"></a>`);
      md=md.replace(/<img\s[^>]*src="([^"]*)"[^>]*\/?>/gi,(m,s)=>{if(m.includes('readme-img'))return m;const a=m.match(/alt="([^"]*)"/i);return`<img src="${cleanUrl(s)}" alt="${a?a[1]:''}" class="readme-img">`;});
      md=md.replace(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,(m,h,inner)=>{if(inner.includes('<img'))return m;return`[${inner.trim()}](${safeUrl(h)})`;});
      md=md.replace(/<br\s*\/?>/gi,'\n');
      md=md.replace(/<(?!img\s|a\s[^>]*><img|\/a>)[^>]+(>|$)/gi,'');
      return md;
    }
    function inlineMd(s){
      const p=[];
      s=s.replace(/<a\s[^>]*>\s*<img\s[^>]+>\s*<\/a>/gi,m=>{p.push(m);return`\x00P${p.length-1}\x00`;});
      s=s.replace(/<img\s[^>]+>/gi,m=>{p.push(m);return`\x00P${p.length-1}\x00`;});
      s=escHtml(s);
      s=s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
      s=s.replace(/\*(.+?)\*/g,'<em>$1</em>');
      s=s.replace(/`([^`]+)`/g,'<code style="background:rgba(255,255,255,0.08);padding:0.1em 0.3em;border-radius:3px">$1</code>');
      s=s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,text,href)=>`<a href="${safeUrl(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`);
      s=s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g,'$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
      s=s.replace(/\x00P(\d+)\x00/g,(_,i)=>p[i]);
      return s;
    }
    function parseMarkdown(md){
      md=stripHtml(md);const out=[];let inCode=false;
      for(const line of md.split('\n')){
        if(line.startsWith('```')){inCode=!inCode;out.push('<span style="opacity:0.3">'+(inCode?'┌─────':'└─────')+'</span>');continue;}
        if(inCode){out.push(`<span style="font-family:monospace;opacity:0.75">${escHtml(line)}</span>`);continue;}
        const h1=line.match(/^# (.+)/);if(h1){out.push('');out.push(`<span class="success" style="font-weight:700;font-size:1.1em">${inlineMd(h1[1])}</span>`);out.push('<span style="opacity:0.15">════════════════════════════</span>');continue;}
        const h2=line.match(/^## (.+)/);if(h2){out.push('');out.push(`<span style="color:var(--term-link);font-weight:600">${inlineMd(h2[1])}</span>`);out.push('<span style="opacity:0.12">────────────────────────</span>');continue;}
        const h3=line.match(/^### (.+)/);if(h3){out.push('');out.push(`<span style="color:var(--accent);opacity:0.9">${inlineMd(h3[1])}</span>`);continue;}
        if(/^[-*_]{3,}$/.test(line.trim())){out.push('<span style="opacity:0.15">──────────────────────</span>');continue;}
        const li=line.match(/^[ \t]*[-*+] (.+)/);if(li){out.push(`  • ${inlineMd(li[1])}`);continue;}
        const ol=line.match(/^[ \t]*(\d+)\. (.+)/);if(ol){out.push(`  ${ol[1]}. ${inlineMd(ol[2])}`);continue;}
        if(!line.trim()){out.push('');continue;}
        out.push(inlineMd(line));
      }
      return out;
    }

    let savedBodyContent=null;
    function closeViewer(){if(!activeViewer)return;body.innerHTML=savedBodyContent;savedBodyContent=null;activeViewer=null;body.scrollTop=body.scrollHeight;input.focus({ preventScroll: true });}
    function parseGithubUrl(links){for(const url of(links??[])){const m=url.match(/github\.com\/([^/]+)\/([^/]+)/);if(m)return{owner:m[1],repo:m[2]};}return null;}
    function hasGithubLink(p){return!!parseGithubUrl(p.links);}
    async function fetchReadme(project){
      if(project.readme){const r=await fetch(project.readme);if(r.ok)return r.text();}
      const gh=parseGithubUrl(project.links);if(!gh)throw new Error('GitHub リポジトリが見つかりません');
      // API を使わず raw.githubusercontent.com から直接取得（レート制限なし）
      for(const branch of ['main','master','1.20.1','1.21']){
        try{
          const r=await fetch(`https://raw.githubusercontent.com/${gh.owner}/${gh.repo}/${branch}/README.md`);
          if(r.ok)return r.text();
        }catch{}
      }
      throw new Error('README が見つかりませんでした');
    }
    async function showReadme(project,cmd){
      if(!hasGithubLink(project)&&!project.readme){print([{type:'error',message:`${project.title}: README が見つかりません。`}],cmd);return;}
      savedBodyContent=body.innerHTML;body.innerHTML='';
      const pc=project.color||'var(--accent)';
      appendLines([`<span class="success">cat</span> <span style="color:${pc}">${project.title}</span>/<span style="color:var(--term-link)">README.md</span>`,'','<span style="opacity:0.3">════════════════════════════════════════</span>',''],body);
      const ld=document.createElement('div');ld.className='term-line';ld.innerHTML='<span class="term-out" style="opacity:0.35">fetching...</span>';body.appendChild(ld);
      activeViewer=true;
      try{const text=await fetchReadme(project);ld.remove();appendLines([...parseMarkdown(text),'','<span style="opacity:0.3">════════════════════════════════════════</span>','<span style="opacity:0.35">./stop → 戻る</span>'],body,0.03);}
      catch(e){ld.remove();appendLines([{type:'error',message:`README の取得に失敗しました。(${e.message})`}],body);}
    }

    // ── Command runner ─────────────────────────────────
    function run(raw) {
      const cmd = raw.trim(); if (!cmd) return;
      history.unshift(cmd); histIdx = -1;

      if (cmd === './stop' || cmd === '0') {
        if (activeViewer)   { closeViewer(); return; }
        if (userCountState) { userCountState = null; print(['<span style="opacity:0.45">キャンセルしました。</span>'], cmd); return; }
      }
      if (userCountState?.step === 'input') {
        // 既知のコマンドは通常通り実行（userCountStateをキャンセルせず）
        if (COMMANDS[cmd]) { print(COMMANDS[cmd](), cmd); return; }
        handleUserCountInput(cmd);
        return;
      }
      if (activeViewer) { print([{ type: 'error', message: `command not found: ${cmd}  (./stop で戻る)` }], cmd); return; }
      if (buildActive && /^\d+$/.test(cmd)) {
        const n = parseInt(cmd, 10);
        if (n === 0) { buildActive = false; print(['<span style="opacity:0.45">リセットしました。</span>'], cmd); return; }
        const p = build[n - 1];
        if (p) { showReadme(p, cmd); return; }
        print([{ type: 'error', message: `${n}: 存在しないプロジェクト番号です。` }], cmd); return;
      }
      const fn = COMMANDS[cmd];
      if (fn) { print(fn(), cmd); }
      else    { print([{ type: 'error', message: `command not found: ${cmd}` }], cmd); }
    }

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { run(input.value); input.value = ''; }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (histIdx < history.length - 1) histIdx++; input.value = history[histIdx] ?? ''; }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (histIdx > 0) histIdx--; else { histIdx = -1; input.value = ''; return; } input.value = history[histIdx] ?? ''; }
      else if (e.key === 'Escape') {
        if (activeViewer) closeViewer();
        else if (userCountState) { userCountState = null; appendLines(['<span style="opacity:0.45">キャンセルしました。</span>'], body); }
      }
    });

    body.addEventListener('click', e => {
      const c = e.target.closest('.term-cmd');
      if (c) { const m=c.textContent.match(/^\[(\d+)\]/); input.value=m?m[1]:c.textContent; input.focus({ preventScroll: true }); return; }
      input.focus({ preventScroll: true });
    });

    wrap.addEventListener('click', () => input.focus({ preventScroll: true }));
    print(COMMANDS.help(), 'help');
  }

  fetch('/content.json')
    .then(r => r.json())
    .then(data => init(data.terminal ?? {}, data.profile ?? {}, data.works ?? []))
    .catch(() => init({}, {}));
})();
