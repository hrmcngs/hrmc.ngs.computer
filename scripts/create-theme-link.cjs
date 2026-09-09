#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

// Read JSONC without treating comment markers or commas inside strings as syntax.
function parseJSONC(source) {
  let clean = '', quoted = false, escaped = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (quoted) {
      clean += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') { quoted = true; clean += c; }
    else if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      clean += '\n';
    } else if (c === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i++;
      clean += ' ';
    } else clean += c;
  }
  // Match whole quoted strings first so only structural trailing commas disappear.
  return JSON.parse(clean.replace(/"(?:\\.|[^"\\])*"|,(\s*[}\]])/g, (match, end) => end ?? match));
}

const help = `使い方:
  sh share-link.sh                         対話形式で選ぶ（端末から実行）
  sh share-link.sh --palette engraving --appearance dark
  sh share-link.sh --theme macos --palette seasonal --season autumn --appearance light

オプション:
  --theme NAME       Webテーマのプリセット（既定: macos）
  --site NAME        背景テーマを個別指定
  --card NAME        カードテーマを個別指定
  --palette NAME     seasonal / classic / ghost / mono / ocean / rose / engraving
  --appearance MODE  system / light / dark（既定: system）
  --season NAME      auto / spring / summer / autumn / winter（既定: auto）
  --url URL          共有先URL（既定: https://hrmc.ngs.computer/）
  --interactive     引数の値を初期値にして対話形式で選ぶ
  --help             この説明を表示

テーマ名は theme.jsonc から読み込みます。URLだけを標準出力に表示します。
引数を渡した場合は質問なしで生成します。コピーするには末尾に | pbcopy を付けられます。
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { process.stdout.write(help); return; }
  const config = parseJSONC(fs.readFileSync(path.join(__dirname, '..', 'theme.jsonc'), 'utf8'));
  const choices = {
    theme: Object.keys(config.presets), site: Object.keys(config.siteThemes), card: Object.keys(config.cardThemes),
    palette: ['seasonal', 'classic', 'ghost', 'mono', 'ocean', 'rose', 'engraving'],
    appearance: ['system', 'light', 'dark'], season: ['auto', 'spring', 'summer', 'autumn', 'winter'],
  };
  const values = { theme: 'macos', palette: 'seasonal', appearance: 'system', season: 'auto', url: 'https://hrmc.ngs.computer/' };
  let interactive = args.length === 0 && Boolean(process.stdin.isTTY);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--interactive') { interactive = true; continue; }
    const key = args[i].startsWith('--') ? args[i].slice(2) : '';
    if (!(Object.hasOwn(choices, key) || key === 'url')) throw Error(`不明なオプション: ${args[i]}（--help で確認）`);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw Error(`--${key} の値を指定してください`);
    if (choices[key] && !choices[key].includes(value)) throw Error(`${key}: ${choices[key].join(' / ')} から選んでください`);
    values[key] = value;
  }

  if (interactive) {
    const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    const lines = input[Symbol.asyncIterator]();
    async function ask(label, list, initial) {
      for (;;) {
        process.stderr.write(`\n${label}\n`);
        if (list) process.stderr.write(list.map((value, index) => `  ${index + 1}. ${value}`).join('\n') + '\n');
        process.stderr.write(`選択 [${initial}]: `);
        const line = await lines.next();
        const answer = line.done ? '' : line.value.trim();
        const value = answer === '' ? initial : (list && /^\d+$/.test(answer) ? list[Number(answer) - 1] : answer);
        if (!list || list.includes(value)) return value;
        process.stderr.write('一覧の番号か名前を入力してください。\n');
      }
    }
    try {
      values.theme = await ask('Webテーマ', choices.theme, values.theme);
      values.site = await ask('背景（プリセットに合わせる場合はEnter）', choices.site, values.site ?? config.presets[values.theme].site);
      values.card = await ask('カード（プリセットに合わせる場合はEnter）', choices.card, values.card ?? config.presets[values.theme].card);
      values.palette = await ask('カラーテーマ（seasonal＝季節、engraving＝線画）', choices.palette, values.palette);
      values.appearance = await ask('表示モード（system＝受け取る人の端末に合わせる）', choices.appearance, values.appearance);
      if (values.palette === 'seasonal') values.season = await ask('季節（auto＝開いた時期に合わせる）', choices.season, values.season);
      values.url = await ask('共有先URL', null, values.url);
    } finally { input.close(); }
  }

  const url = new URL(values.url);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error('共有先はユーザー情報を含まない http(s) のURLを指定してください');
  for (const key of Object.keys(choices)) url.searchParams.delete(key);
  for (const key of ['theme', 'site', 'card', 'palette', 'appearance']) {
    if (values[key]) url.searchParams.set(key, values[key]);
  }
  if (values.palette === 'seasonal' && values.season !== 'auto') url.searchParams.set('season', values.season);
  if (interactive) process.stderr.write('\n共有リンク:\n');
  process.stdout.write(url.toString() + '\n');
}

main().catch(error => { process.stderr.write(`エラー: ${error.message}\n`); process.exitCode = 1; });
