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
    const PROMPT      = cfg.prompt      ?? 'reisame256@ngs:~$';

    // State
    let buildActive = false;
    let activeViewer = null;

    const COMMANDS = {
      help: () => [
        '使えるコマンド:',
        '  <span class="term-cmd">help</span>          このヘルプを表示',
        '  <span class="term-cmd">whoami</span>        自己紹介',
        '  <span class="term-cmd">ls</span>            作ったものを一覧表示',
        '  <span class="term-cmd">./build.sh</span>    プロジェクト詳細を表示',
        '  <span class="term-cmd">./about.sh</span>    プロフィールを表示',
        '  <span class="term-cmd">cat links.txt</span> リンク一覧',
        '  <span class="term-cmd">clear</span>         ターミナルをクリア',
      ],

      whoami: () => {
        const lines = [];
        if (profile.name) lines.push(`${profile.name} / ${(profile.handle ?? '').replace(/^@/, '')}`);
        (profile.bio ?? []).forEach(b => lines.push(b));
        const accounts = socialLinks.filter(l => l.url.includes('x.com'));
        if (accounts.length) {
          lines.push(accounts.map(l => `<a href="${l.url}" target="_blank" rel="noopener">@${l.url.split('/').pop()}</a>`).join(' · '));
        }
        return lines;
      },

      ls: () => build.map(p => `${p.title}/`),

      './build.sh': () => {
        buildActive = true;
        const lines = ['<span class="success">▶ Building projects...</span>', ''];
        build.forEach((p, i) => {
          const colorStyle = p.color ? ` style="color:${p.color}"` : '';
          const hasReadme = p.readme ? ' ◆' : '';
          lines.push(`<span class="term-cmd"${colorStyle}>[${i + 1}] ${p.title}${hasReadme}</span>`);
          lines.push(`    ${p.desc}`);
          (p.links ?? []).forEach(url => {
            lines.push(`    → <a href="${url}" target="_blank" rel="noopener">${url}</a>`);
          });
          lines.push('');
        });
        lines.push('<span class="success">Done.</span>');
        lines.push('');
        lines.push('<span style="opacity:0.45">◆ のある番号を入力 → README を表示 &nbsp;|&nbsp; 0 → リセット</span>');
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

      clear: () => '__clear__',
    };

    const wrap  = document.getElementById('term-wrap');
    const body  = document.getElementById('term-body');
    const input = document.getElementById('term-input');
    const inputRow = document.querySelector('.term-input-row');
    if (!body || !input || !wrap) return;

    const history = [];
    let histIdx = -1;

    // Output lines
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

    // --- Markdown parser ---

    function escHtml(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function inlineMd(s) {
      s = escHtml(s);
      s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
      s = s.replace(/`([^`]+)`/g,
        '<code style="background:rgba(255,255,255,0.08);padding:0.1em 0.3em;border-radius:3px;font-family:monospace">$1</code>');
      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>');
      return s;
    }

    function parseMarkdown(md) {
      const rawLines = md.split('\n');
      const out = [];
      let inCode = false;

      for (const line of rawLines) {
        if (line.startsWith('```')) {
          inCode = !inCode;
          out.push('<span style="opacity:0.3">' + (inCode ? '┌─────' : '└─────') + '</span>');
          continue;
        }
        if (inCode) {
          out.push(`<span style="font-family:monospace;opacity:0.75">${escHtml(line)}</span>`);
          continue;
        }

        const h1 = line.match(/^# (.+)/);
        if (h1) { out.push(`<span class="success" style="font-weight:700">${escHtml(h1[1])}</span>`); continue; }
        const h2 = line.match(/^## (.+)/);
        if (h2) { out.push(`<span style="color:var(--term-link)">${escHtml(h2[1])}</span>`); continue; }
        const h3 = line.match(/^### (.+)/);
        if (h3) { out.push(`<span style="opacity:0.8">${escHtml(h3[1])}</span>`); continue; }

        if (/^[-*_]{3,}$/.test(line.trim())) { out.push('<span style="opacity:0.2">──────────────────────</span>'); continue; }

        const li = line.match(/^[ \t]*[-*+] (.+)/);
        if (li) { out.push(`  • ${inlineMd(li[1])}`); continue; }

        const ol = line.match(/^[ \t]*\d+\. (.+)/);
        if (ol) { out.push(`  ${inlineMd(ol[0])}`); continue; }

        if (!line.trim()) { out.push(''); continue; }

        out.push(inlineMd(line));
      }

      return out;
    }

    // --- README Viewer (app-like overlay) ---

    function closeViewer() {
      if (!activeViewer) return;
      activeViewer.classList.add('readme-viewer--closing');
      activeViewer.addEventListener('animationend', () => {
        activeViewer.remove();
        activeViewer = null;
        body.style.display = '';
        if (inputRow) inputRow.style.display = '';
        input.focus();
      });
    }

    async function showReadme(project, cmd) {
      // Echo the command in terminal
      const echo = document.createElement('div');
      echo.className = 'term-line';
      const promptSpan = document.createElement('span');
      promptSpan.className = 'term-prompt-echo';
      promptSpan.textContent = PROMPT;
      const typedSpan = document.createElement('span');
      typedSpan.className = 'term-typed';
      typedSpan.textContent = cmd;
      echo.appendChild(promptSpan);
      echo.appendChild(typedSpan);
      body.appendChild(echo);

      if (!project.readme) {
        appendLines([{ type: 'error', message: 'README URL が設定されていません。' }], body);
        return;
      }

      // Hide terminal body & input, show viewer
      body.style.display = 'none';
      if (inputRow) inputRow.style.display = 'none';

      const viewer = document.createElement('div');
      viewer.className = 'readme-viewer';

      // Viewer bar
      const bar = document.createElement('div');
      bar.className = 'readme-viewer-bar';

      const titleEl = document.createElement('span');
      titleEl.className = 'readme-viewer-title';
      if (project.color) titleEl.style.color = project.color;
      titleEl.textContent = `${project.title} / README.md`;

      const closeBtn = document.createElement('button');
      closeBtn.className = 'readme-viewer-close';
      closeBtn.textContent = '✕ 閉じる';
      closeBtn.addEventListener('click', closeViewer);

      bar.appendChild(titleEl);
      bar.appendChild(closeBtn);

      // Content area
      const content = document.createElement('div');
      content.className = 'readme-viewer-content';

      // Loading indicator
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'term-line';
      loadingDiv.innerHTML = '<span class="term-out" style="opacity:0.45">Loading README...</span>';
      content.appendChild(loadingDiv);

      viewer.appendChild(bar);
      viewer.appendChild(content);

      // Insert viewer into term-wrap (between term-bar and the hidden body)
      wrap.appendChild(viewer);
      activeViewer = viewer;

      // Fetch and render
      try {
        const res = await fetch(project.readme);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        content.innerHTML = '';
        const lines = parseMarkdown(text);
        appendLines(lines, content, 0.08);
      } catch (e) {
        content.innerHTML = '';
        appendLines([{ type: 'error', message: `README の取得に失敗しました。(${e.message})` }], content);
      }
    }

    // --- Command runner ---

    function run(raw) {
      const cmd = raw.trim();
      if (!cmd) return;
      history.unshift(cmd);
      histIdx = -1;

      // Close viewer with 0
      if (activeViewer && cmd === '0') {
        closeViewer();
        return;
      }

      // Numbered project selection (active after ./build.sh)
      if (buildActive && /^\d+$/.test(cmd)) {
        const n = parseInt(cmd, 10);
        if (n === 0) {
          buildActive = false;
          print(['<span style="opacity:0.45">リセットしました。</span>'], cmd);
          return;
        }
        const project = build[n - 1];
        if (project) {
          if (project.readme) {
            showReadme(project, cmd);
          } else {
            print([{ type: 'error', message: `${project.title}: README が設定されていません。` }], cmd);
          }
          return;
        }
        print([{ type: 'error', message: `${n}: 存在しないプロジェクト番号です。` }], cmd);
        return;
      }

      const fn = COMMANDS[cmd];
      if (fn) {
        print(fn(), cmd);
      } else {
        print([{ type: 'error', message: `command not found: ${cmd}` }], cmd);
      }
    }

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        run(input.value);
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
      } else if (e.key === 'Escape' && activeViewer) {
        closeViewer();
      }
    });

    // 起動時に help を表示
    print(COMMANDS.help(), 'help');

    // term-cmd クリックでコマンドを入力欄に貼り付け
    // [N] title 形式の場合は番号だけ抽出
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

    wrap.addEventListener('click', e => {
      if (!activeViewer) input.focus();
    });
  }

  fetch('/content.json')
    .then(r => r.json())
    .then(data => init(data.terminal ?? {}, data.profile ?? {}))
    .catch(() => init({}, {}));
})();
