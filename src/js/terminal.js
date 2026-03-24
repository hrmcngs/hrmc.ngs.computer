(() => {
  function init(cfg, profile) {
    // Apply terminal colors as CSS custom properties
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

    // ── State ──────────────────────────────────────────
    let buildActive    = false;
    let activeViewer   = null;
    let userCountState = null;
    // userCountState: null
    //   | { step: 'input' }
    //   | { step: 'token', username, year, month }

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
        if (profile.name) lines.push(`${profile.name} / ${(profile.handle ?? '').replace(/^@/, '')}`);
        (profile.bio ?? []).forEach(b => lines.push(b));
        const allowedXHosts = new Set([
          'x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'
        ]);
        const accounts = socialLinks.filter(l => {
          if (!l || !l.url) return false;
          try {
            const u = new URL(l.url, window.location.origin);
            return allowedXHosts.has(u.hostname);
          } catch { return false; }
        });
        if (accounts.length) {
          lines.push(accounts.map(l =>
            `<a href="${l.url}" target="_blank" rel="noopener">@${l.url.split('/').pop()}</a>`
          ).join(' · '));
        }
        return lines;
      },

      ls: () => build.map(p => `${p.title}/`),

      './build.sh': () => {
        buildActive = true;
        const lines = ['<span class="success">▶ Building projects...</span>', ''];
        build.forEach((p, i) => {
          const colorStyle = p.color ? ` style="color:${p.color}"` : '';
          const hasGh = hasGithubLink(p);
          lines.push(`<span class="term-cmd"${colorStyle}>[${i + 1}] ${p.title}${hasGh ? ' ◆' : ''}</span>`);
          lines.push(`    ${p.desc}`);
          if (p.tags?.length) {
            lines.push(`    <span style="opacity:0.5">${p.tags.map(t => `[${t}]`).join(' ')}</span>`);
          }
          (p.links ?? []).forEach(url => {
            lines.push(`    → <a href="${url}" target="_blank" rel="noopener">${url}</a>`);
          });
          lines.push('');
        });
        lines.push('<span class="success">Done.</span>');
        return lines;
      },

      './about.sh': () => {
        const lines = [];
        if (profile.name)   lines.push(`<span class="success">${profile.name}</span>`);
        if (profile.handle) lines.push(`<span style="opacity:0.6">${profile.handle}</span>`);
        if (lines.length)   lines.push('');
        (profile.bio ?? []).forEach(b => lines.push(b));
        if (profile.chips?.length) {
          lines.push('');
          lines.push(profile.chips.map(c => `<span class="term-cmd">${c}</span>`).join('  '));
        }
        lines.push('');
        lines.push(`→ <a href="/about" target="_blank" rel="noopener">/about</a>`);
        return lines;
      },

      'cat links.txt': () => {
        const maxLen = Math.max(...socialLinks.map(l => l.label.length), 0);
        return socialLinks.map(l => {
          const label = l.label.padEnd(maxLen);
          return `${label} : <a href="${l.url}" target="_blank" rel="noopener">${l.url}</a>`;
        });
      },

      // ── ./user-count.sh ─────────────────────────────
      './user-count.sh': () => {
        userCountState = { step: 'input' };
        return [
          '<span class="success">▶ GitHub Contribution Counter</span>',
          '',
          '  書式: <span class="term-cmd">ユーザーID [年 月]</span>',
          '  例:   <span style="opacity:0.7">hrmcngs</span>',
          '  例:   <span style="opacity:0.7">hrmcngs 2024 05</span>',
          '',
          '<span style="opacity:0.45">キャンセル: ./stop</span>',
          '',
          'ユーザーID を入力してください:',
        ];
      },

      clear: () => '__clear__',
    };

    // chip → build tags から自動マッチング
    (profile.chips ?? []).forEach(chip => {
      COMMANDS[chip] = () => {
        const chipLower = chip.toLowerCase();
        const matched = build.filter(p =>
          (p.tags ?? []).some(tag => chipLower.includes(tag.toLowerCase()))
        );
        if (!matched.length) return [{ type: 'error', message: `${chip}: 関連プロジェクトが見つかりません。` }];
        const lines = [`<span class="success">${chip} に関連するプロジェクト:</span>`, ''];
        matched.forEach(p => {
          const colorStyle = p.color ? ` style="color:${p.color}"` : '';
          const tags = (p.tags ?? []).map(t => `<span style="opacity:0.5">[${t}]</span>`).join(' ');
          lines.push(`<span class="term-cmd"${colorStyle}>${p.title}</span>  ${tags}`);
          lines.push(`    ${p.desc}`);
          (p.links ?? []).forEach(url => {
            lines.push(`    → <a href="${url}" target="_blank" rel="noopener">${url}</a>`);
          });
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

    const history = [];
    let histIdx = -1;

    // ── Output helpers ─────────────────────────────────
    function appendLines(lines, container, baseDelay = 0) {
      lines.forEach((line, i) => {
        const div = document.createElement('div');
        div.className = 'term-line';
        div.style.animationDelay = `${baseDelay + Math.min(i * 0.03, 0.45)}s`;
        const out = document.createElement('span');
        out.className = 'term-out';
        if (typeof line === 'string') {
          out.innerHTML = line;
        } else if (line && line.type === 'error') {
          const errSpan = document.createElement('span');
          errSpan.className = 'error';
          errSpan.textContent = line.message;
          out.appendChild(errSpan);
        }
        div.appendChild(out);
        container.appendChild(div);
      });
      container.scrollTop = container.scrollHeight;
    }

    function appendLine(html) {
      appendLines([html], body, 0);
    }

    function print(lines, typed) {
      const echo = document.createElement('div');
      echo.className = 'term-line';
      const promptSpan = document.createElement('span');
      promptSpan.className = 'term-prompt-echo';
      promptSpan.textContent = PROMPT;
      const typedSpan = document.createElement('span');
      typedSpan.className = 'term-typed';
      typedSpan.textContent = typed;
      echo.appendChild(promptSpan);
      echo.appendChild(typedSpan);
      body.appendChild(echo);

      if (lines === '__clear__') {
        body.innerHTML = '';
        return;
      }
      appendLines(lines, body, 0.06);
    }

    // ── user-count ─────────────────────────────────────
    function handleUserCountInput(raw) {
      const parts = raw.trim().split(/\s+/).filter(Boolean);
      if (!parts.length) {
        print(['<span class="error">ユーザーID を入力してください。</span>', 'ユーザーID を入力してください:'], raw);
        return;
      }

      const username = parts[0];
      const year     = parts[1] ?? '';
      const month    = parts[2] ? parts[2].padStart(2, '0') : '';

      if (year && !month) {
        print([
          '<span class="error">月も指定してください (例: 2024 05)</span>',
          'ユーザーID [年 月] を入力してください:',
        ], raw);
        return;
      }

      userCountState = { step: 'token', username, year, month };
      print([
        `対象: <strong>${username}</strong> / ${year && month ? `${year}年${month}月` : '全期間'}`,
        '',
        'GitHub Token を入力してください (Enterでスキップ / API制限を避けるため推奨):',
      ], raw);
    }

    async function runUserCount(username, year, month, token) {
      const headers = token ? { Authorization: `token ${token}` } : {};

      let since = '', until = '', createdQ = '';
      if (year && month) {
        since    = `${year}-${month}-01T00:00:00Z`;
        const em = month === '12' ? '01' : String(Number(month) + 1).padStart(2, '0');
        const ey = month === '12' ? String(Number(year) + 1) : year;
        until    = `${ey}-${em}-01T00:00:00Z`;
        createdQ = `+created:${since.slice(0, 10)}..${until.slice(0, 10)}`;
      }

      const periodLabel = year && month ? `${year}年${month}月` : '全期間';

      appendLines([
        '',
        `<span class="success">▶ 集計開始</span>  <span style="opacity:0.6">${username} / ${periodLabel}</span>`,
        '<span style="opacity:0.3">────────────────────────────────────</span>',
      ], body);

      // ── PR 数 ──────────────────────────────────────
      appendLine('<span style="opacity:0.4">Pull Requests を取得中...</span>');
      let prCount = 0;
      try {
        const res  = await fetch(
          `https://api.github.com/search/issues?q=type:pr+author:${encodeURIComponent(username)}${createdQ}`,
          { headers }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        prCount    = data.total_count ?? 0;
        body.lastChild?.remove(); // remove "取得中..." line
        appendLine(`  Pull Requests : <span class="success" style="font-weight:700">${prCount}</span>`);
      } catch (e) {
        body.lastChild?.remove();
        appendLine(`<span class="error">  PR取得エラー: ${e.message}</span>`);
      }

      // ── コミット数 ─────────────────────────────────
      appendLine('<span style="opacity:0.4">コミット数を集計中 (リポジトリ数によっては少し時間がかかります)...</span>');
      let commitCount = 0;
      let repoCount   = 0;
      let rateLimited = false;

      try {
        let page = 1, hasNext = true;

        while (hasNext) {
          const repoRes = await fetch(
            `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&page=${page}`,
            { headers }
          );
          if (!repoRes.ok) throw new Error(`HTTP ${repoRes.status}`);
          const repos = await repoRes.json();
          if (!Array.isArray(repos) || !repos.length) break;

          for (const repo of repos) {
            repoCount++;
            // progress update (every 5 repos)
            if (repoCount % 5 === 0) {
              const last = body.lastChild;
              if (last?.textContent?.includes('集計中')) {
                last.querySelector('.term-out').innerHTML =
                  `<span style="opacity:0.4">コミット数を集計中... (${repoCount} repos / ${commitCount} commits)</span>`;
              }
            }

            let cPage = 1, cHasNext = true;
            while (cHasNext) {
              let url = `https://api.github.com/repos/${repo.owner.login}/${repo.name}/commits`
                + `?author=${encodeURIComponent(username)}&per_page=100&page=${cPage}`;
              if (since) url += `&since=${since}`;
              if (until) url += `&until=${until}`;
              const cRes = await fetch(url, { headers });
              if (cRes.status === 409) break; // empty repo
              if (cRes.status === 403) { rateLimited = true; break; }
              if (!cRes.ok) break;
              const commits = await cRes.json();
              if (!Array.isArray(commits) || !commits.length) break;
              commitCount += commits.length;
              cHasNext     = commits.length === 100;
              cPage++;
            }
            if (rateLimited) break;
          }

          hasNext = repos.length === 100;
          page++;
          if (rateLimited) break;
        }

        body.lastChild?.remove();
        appendLine(`  Commits       : <span class="success" style="font-weight:700">${commitCount}</span>`
          + `  <span style="opacity:0.4">(${repoCount} repos checked)</span>`);
        if (rateLimited) {
          appendLine('<span class="error">  ⚠ API レート制限に達しました。Token を指定すると制限が緩和されます。</span>');
        }
      } catch (e) {
        body.lastChild?.remove();
        appendLine(`<span class="error">  コミット取得エラー: ${e.message}</span>`);
      }

      // ── 結果サマリ ─────────────────────────────────
      appendLines([
        '',
        '<span style="opacity:0.3">────────────────────────────────────</span>',
        `<span class="success">完了!</span>  `
          + `<strong>${username}</strong> / ${periodLabel}  `
          + `PR: <span class="success">${prCount}</span>  `
          + `Commits: <span class="success">${commitCount}</span>`,
        '',
      ], body);
    }

    // ── Markdown parser ────────────────────────────────
    function escHtml(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function cleanUrl(url) {
      url = url.replace(/\\([&()[\]#*_!])/g, '$1');
      url = url.replace(
        /github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)/,
        'raw.githubusercontent.com/$1/$2/$3'
      );
      return url;
    }

    function stripHtml(md) {
      md = md.replace(/\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)/g,
        (_, alt, img, href) => `<a href="${href}" target="_blank" rel="noopener"><img src="${cleanUrl(img)}" alt="${alt}" class="readme-img"></a>`);
      md = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
        (_, alt, src) => `<img src="${cleanUrl(src)}" alt="${alt}" class="readme-img">`);
      md = md.replace(/<a\s+href="([^"]*)"[^>]*>[\s\S]*?<img\s[^>]*src="([^"]*)"[^>]*\/?>[\s\S]*?<\/a>/gi,
        (_, href, src) => `<a href="${href}" target="_blank" rel="noopener"><img src="${cleanUrl(src)}" class="readme-img"></a>`);
      md = md.replace(/<img\s[^>]*src="([^"]*)"[^>]*\/?>/gi, (match, src) => {
        if (match.includes('readme-img')) return match;
        const altMatch = match.match(/alt="([^"]*)"/i);
        const alt = altMatch ? altMatch[1] : '';
        return `<img src="${cleanUrl(src)}" alt="${alt}" class="readme-img">`;
      });
      md = md.replace(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (match, href, inner) => {
        if (inner.includes('<img')) return match;
        return `[${inner.trim()}](${href})`;
      });
      md = md.replace(/<br\s*\/?>/gi, '\n');
      md = md.replace(/<(?!img\s|a\s[^>]*><img|\/a>)[^>]+(>|$)/gi, '');
      return md;
    }

    function inlineMd(s) {
      const preserved = [];
      s = s.replace(/<a\s[^>]*>\s*<img\s[^>]+>\s*<\/a>/gi, m => { preserved.push(m); return `\x00P${preserved.length - 1}\x00`; });
      s = s.replace(/<img\s[^>]+>/gi, m => { preserved.push(m); return `\x00P${preserved.length - 1}\x00`; });
      s = escHtml(s);
      s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
      s = s.replace(/`([^`]+)`/g,
        '<code style="background:rgba(255,255,255,0.08);padding:0.1em 0.3em;border-radius:3px">$1</code>');
      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>');
      s = s.replace(/(^|[\s(])((https?:\/\/)[^\s<)]+)/g,
        '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
      s = s.replace(/\x00P(\d+)\x00/g, (_, i) => preserved[i]);
      return s;
    }

    function parseMarkdown(md) {
      md = stripHtml(md);
      const rawLines = md.split('\n');
      const out = [];
      let inCode = false;
      for (const line of rawLines) {
        if (line.startsWith('```')) {
          inCode = !inCode;
          out.push('<span style="opacity:0.3">' + (inCode ? '┌─────' : '└─────') + '</span>');
          continue;
        }
        if (inCode) { out.push(`<span style="font-family:monospace;opacity:0.75">${escHtml(line)}</span>`); continue; }
        const h1 = line.match(/^# (.+)/);
        if (h1) { out.push(''); out.push(`<span class="success" style="font-weight:700;font-size:1.1em">${inlineMd(h1[1])}</span>`); out.push('<span style="opacity:0.15">════════════════════════════</span>'); continue; }
        const h2 = line.match(/^## (.+)/);
        if (h2) { out.push(''); out.push(`<span style="color:var(--term-link);font-weight:600">${inlineMd(h2[1])}</span>`); out.push('<span style="opacity:0.12">────────────────────────</span>'); continue; }
        const h3 = line.match(/^### (.+)/);
        if (h3) { out.push(''); out.push(`<span style="color:var(--accent);opacity:0.9">${inlineMd(h3[1])}</span>`); continue; }
        if (/^[-*_]{3,}$/.test(line.trim())) { out.push('<span style="opacity:0.15">──────────────────────</span>'); continue; }
        const li = line.match(/^[ \t]*[-*+] (.+)/);
        if (li) { out.push(`  • ${inlineMd(li[1])}`); continue; }
        const ol = line.match(/^[ \t]*(\d+)\. (.+)/);
        if (ol) { out.push(`  ${ol[1]}. ${inlineMd(ol[2])}`); continue; }
        if (!line.trim()) { out.push(''); continue; }
        out.push(inlineMd(line));
      }
      return out;
    }

    // ── README Viewer ──────────────────────────────────
    let savedBodyContent = null;

    function closeViewer() {
      if (!activeViewer) return;
      body.innerHTML = savedBodyContent;
      savedBodyContent = null;
      activeViewer = null;
      body.scrollTop = body.scrollHeight;
      input.focus();
    }

    function parseGithubUrl(links) {
      for (const url of (links ?? [])) {
        const m = url.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (m) return { owner: m[1], repo: m[2] };
      }
      return null;
    }

    function hasGithubLink(project) {
      return !!parseGithubUrl(project.links);
    }

    async function fetchReadme(project) {
      if (project.readme) {
        const res = await fetch(project.readme);
        if (res.ok) return res.text();
      }
      const gh = parseGithubUrl(project.links);
      if (!gh) throw new Error('GitHub リポジトリが見つかりません');
      const res = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}/readme`, {
        headers: { Accept: 'application/vnd.github.raw' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    }

    async function showReadme(project, cmd) {
      if (!hasGithubLink(project) && !project.readme) {
        print([{ type: 'error', message: `${project.title}: README が見つかりません。` }], cmd);
        return;
      }
      savedBodyContent = body.innerHTML;
      body.innerHTML = '';
      const pColor = project.color || 'var(--accent)';
      appendLines([
        `<span class="success">cat</span> <span style="color:${pColor}">${project.title}</span>/<span style="color:var(--term-link)">README.md</span>`,
        '',
        '<span style="opacity:0.3">════════════════════════════════════════</span>',
        '',
      ], body);
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'term-line';
      loadingDiv.innerHTML = '<span class="term-out" style="opacity:0.35">fetching...</span>';
      body.appendChild(loadingDiv);
      activeViewer = true;
      try {
        const text  = await fetchReadme(project);
        loadingDiv.remove();
        const lines = parseMarkdown(text);
        appendLines([
          ...lines,
          '',
          '<span style="opacity:0.3">════════════════════════════════════════</span>',
          '<span style="opacity:0.35">./stop → 戻る</span>',
        ], body, 0.03);
      } catch (e) {
        loadingDiv.remove();
        appendLines([{ type: 'error', message: `README の取得に失敗しました。(${e.message})` }], body);
      }
    }

    // ── Command runner ─────────────────────────────────
    function run(raw) {
      const cmd = raw.trim();
      if (!cmd) return;
      history.unshift(cmd);
      histIdx = -1;

      // ─ キャンセル共通 ─
      if (cmd === './stop' || cmd === '0') {
        if (activeViewer) { closeViewer(); return; }
        if (userCountState) {
          userCountState = null;
          print(['<span style="opacity:0.45">キャンセルしました。</span>'], cmd);
          return;
        }
      }

      // ─ userCount ウィザード ─
      if (userCountState) {
        if (userCountState.step === 'input') {
          handleUserCountInput(cmd);
          return;
        }
        if (userCountState.step === 'token') {
          const { username, year, month } = userCountState;
          const token = cmd === '' ? '' : cmd;
          userCountState = null;
          print(['<span style="opacity:0.35">集計を開始します...</span>'], cmd);
          runUserCount(username, year, month, token);
          return;
        }
      }

      // ─ README ビューア内 ─
      if (activeViewer) {
        print([{ type: 'error', message: `command not found: ${cmd}  (./stop で戻る)` }], cmd);
        return;
      }

      // ─ ./build.sh 番号選択 ─
      if (buildActive && /^\d+$/.test(cmd)) {
        const n = parseInt(cmd, 10);
        if (n === 0) { buildActive = false; print(['<span style="opacity:0.45">リセットしました。</span>'], cmd); return; }
        const project = build[n - 1];
        if (project) { showReadme(project, cmd); return; }
        print([{ type: 'error', message: `${n}: 存在しないプロジェクト番号です。` }], cmd);
        return;
      }

      // ─ 通常コマンド ─
      const fn = COMMANDS[cmd];
      if (fn) {
        print(fn(), cmd);
      } else {
        print([{ type: 'error', message: `command not found: ${cmd}` }], cmd);
      }
    }

    // ── Input events ───────────────────────────────────
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        // token ステップは空文字 Enter も有効
        const val = (userCountState?.step === 'token') ? input.value : input.value;
        run(val);
        input.value = '';
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (histIdx < history.length - 1) histIdx++;
        input.value = history[histIdx] ?? '';
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (histIdx > 0) histIdx--;
        else { histIdx = -1; input.value = ''; return; }
        input.value = history[histIdx] ?? '';
      } else if (e.key === 'Escape') {
        if (activeViewer) closeViewer();
        else if (userCountState) {
          userCountState = null;
          appendLine('<span style="opacity:0.45">キャンセルしました。</span>');
        }
      }
    });

    // term-cmd クリックでコマンドを入力欄に貼り付け
    body.addEventListener('click', e => {
      const cmd = e.target.closest('.term-cmd');
      if (cmd) {
        const bracketNum = cmd.textContent.match(/^\[(\d+)\]/);
        input.value = bracketNum ? bracketNum[1] : cmd.textContent;
        input.focus();
        return;
      }
      input.focus();
    });

    wrap.addEventListener('click', () => input.focus());

    // 起動時に help を表示
    print(COMMANDS.help(), 'help');
  }

  fetch('/content.json')
    .then(r => r.json())
    .then(data => init(data.terminal ?? {}, data.profile ?? {}))
    .catch(() => init({}, {}));
})();
