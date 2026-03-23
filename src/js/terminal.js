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

  './build.sh': () => [
    '<span class="success">▶ Building projects...</span>',
    '',
    '<span class="term-cmd">[1] RPGish-HPDisplay</span>',
    '    RPG風HP表示、ダメージ表示データパック',
    '    → https://github.com/hrmcngs/RPGish-HPDisplay',
    '',
    '<span class="term-cmd">[2] Drowse-Lab</span>',
    '    なんとなく作っているweb',
    '    → https://github.com/Drowse-Lab/Drowse-Lab',
    '',
    '<span class="term-cmd">[3] The-four-primitives-and-Weapons</span>',
    '    Minecraft mod / Drowse-Lab',
    '    → https://github.com/Drowse-Lab/The-four-primitives-and-Weapons',
    '',
    '<span class="success">Done.</span>',
  ],

  './about.sh': () => {
    window.location.href = '/about';
    return ['<span class="success">Redirecting to /about ...</span>'];
  },

  'cat links.txt': () => [
    'Twitter (main) : https://x.com/reisame256',
    'Twitter (sub)  : https://x.com/hrmcngs',
    'GitHub         : https://github.com/hrmcngs',
    'Instagram      : https://instagram.com/reisame.256',
    'Drowse Lab     : https://x.com/Drowse_Lab',
  ],

  clear: () => '__clear__',
};

(() => {
  const body  = document.getElementById('term-body');
  const input = document.getElementById('term-input');
  if (!body || !input) return;

  const PROMPT = 'reisame256@ngs:~$';
  const history = [];
  let histIdx = -1;

  function print(lines, typed) {
    // echo typed command
    const echo = document.createElement('div');
    echo.className = 'term-line';
    echo.innerHTML = `<span class="term-prompt-echo">${PROMPT}</span><span class="term-typed">${typed}</span>`;
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
      out.innerHTML = line;
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
      print([`<span class="error">command not found: ${cmd}</span>`], cmd);
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
})();
