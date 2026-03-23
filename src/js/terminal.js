(() => {
  function init(cfg) {
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

    const COMMANDS = {
      help: () => [
        '使えるコマンド:',
        '  <span class="term-cmd">help</span>          このヘルプを表示',
        '  <span class="term-cmd">whoami</span>        自己紹介',
        '  <span class="term-cmd">ls</span>            作ったものを一覧表示',
        '  <span class="term-cmd">./build.sh</span>    プロジェクト詳細を表示',
        '  <span class="term-cmd">./about.sh</span>    aboutページへ移動',
        '  <span class="term-cmd">cat links.txt</span> リンク一覧',
        '  <span class="term-cmd">clear</span>         ターミナルをクリア',
      ],

      whoami: () => [
        '零鮫 / reisame256',
        'Minecraft 1.20.1 の mod と web を作っています。',
        '絡んでくる時はラフな感じでいいですよ。',
        '元 @0526ngs',
      ],

      ls: () => [
        'RPGish-HPDisplay/',
        'Drowse-Lab/',
        'The-four-primitives-and-Weapons/',
      ],

      './build.sh': () => {
        const lines = ['<span class="success">▶ Building projects...</span>', ''];
        build.forEach((p, i) => {
          lines.push(`<span class="term-cmd">[${i + 1}] ${p.title}</span>`);
          lines.push(`    ${p.desc}`);
          (p.links ?? []).forEach(url => {
            lines.push(`    → <a href="${url}" target="_blank" rel="noopener">${url}</a>`);
          });
          lines.push('');
        });
        lines.push('<span class="success">Done.</span>');
        return lines;
      },

      './about.sh': () => {
        window.location.href = '/about';
        return ['<span class="success">Redirecting to /about ...</span>'];
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

    const body  = document.getElementById('term-body');
    const input = document.getElementById('term-input');
    if (!body || !input) return;

    const history = [];
    let histIdx = -1;

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

      lines.forEach(line => {
        const div = document.createElement('div');
        div.className = 'term-line';
        const out = document.createElement('span');
        out.className = 'term-out';
        if (typeof line === 'string') {
          // Static lines may contain trusted HTML markup.
          out.innerHTML = line;
        } else if (line && line.type === 'error') {
          // Render error message safely without interpreting user input as HTML.
          const errSpan = document.createElement('span');
          errSpan.className = 'error';
          errSpan.textContent = line.message;
          out.appendChild(errSpan);
        }
        div.appendChild(out);
        body.appendChild(div);
      });

      body.scrollTop = body.scrollHeight;
    }

    function run(raw) {
      const cmd = raw.trim();
      if (!cmd) return;
      history.unshift(cmd);
      histIdx = -1;
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
      }
    });

    // 起動時に help を表示
    print(COMMANDS.help(), 'help');

    // term-cmd クリックでコマンドを入力欄に貼り付け
    body.addEventListener('click', e => {
      const cmd = e.target.closest('.term-cmd');
      if (cmd) {
        input.value = cmd.textContent;
        input.focus();
        return;
      }
      input.focus();
    });

    document.getElementById('term-wrap')?.addEventListener('click', () => input.focus());
  }

  fetch('/content.json')
    .then(r => r.json())
    .then(data => init(data.terminal ?? {}))
    .catch(() => init({}));
})();
