// Run with: node scripts/test-theme-links.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

async function openPage(search = '', stored = {}, unavailable = false) {
  const location = new URL(`https://hrmc.ngs.computer/photos/?keep=1&${search}#album`);
  const data = { 'hrmc-seasonal-default-v1': '1', ...stored };
  const writes = [];
  const events = {};
  const root = { dataset: {}, style: { setProperty() {}, removeProperty() {} } };
  const window = {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener: (name, fn) => { events[name] = fn; },
  };
  const context = vm.createContext({
    URL, URLSearchParams, location, window, console,
    Date: class { getMonth() { return 8; } },
    document: {
      documentElement: root, getElementById: () => null,
      querySelectorAll: () => [], addEventListener() {},
    },
    localStorage: {
      getItem(key) { if (unavailable) throw Error('Unavailable'); return data[key] ?? null; },
      setItem(key, value) { if (unavailable) throw Error('Unavailable'); writes.push(key); data[key] = value; },
    },
    fetch: async () => ({ ok: true, text: async () => read('theme.jsonc') }),
  });
  vm.runInContext(read('src/js/appearance.js'), context);
  vm.runInContext(read('src/js/theme.js'), context);
  await window.theme.ready;
  return { window, root, writes, events };
}

(async () => {
  const linked = await openPage('theme=macos&palette=engraving&appearance=dark', {
    'hrmc-macos-palette': 'rose', 'hrmc-macos-appearance': 'light',
  });
  assert.equal(linked.root.dataset.macPalette, 'engraving');
  assert.equal(linked.root.dataset.appearance, 'dark');
  assert.equal(linked.root.dataset.siteTheme, 'macos');
  assert.deepEqual(linked.writes, []);
  linked.events.storage({ key: 'hrmc-macos-palette', newValue: 'ghost' });
  assert.equal(linked.root.dataset.macPalette, 'engraving');
  linked.events.storage({ key: 'hrmc-macos-appearance', newValue: 'light' });
  assert.equal(linked.root.dataset.appearance, 'dark');

  const url = new URL(linked.window.appearance.getShareURL());
  assert.equal(url.pathname, '/photos/');
  assert.equal(url.hash, '#album');
  assert.equal(url.searchParams.get('keep'), '1');
  assert.equal(url.searchParams.get('palette'), 'engraving');
  assert.equal(url.searchParams.get('appearance'), 'dark');
  const recipient = await openPage(url.search.slice(1), {}, true);
  for (const name of ['siteTheme', 'cardTheme', 'macPalette', 'appearance']) {
    assert.equal(recipient.root.dataset[name], linked.root.dataset[name]);
  }

  const seasonal = await openPage('palette=seasonal&season=spring&appearance=system');
  assert.equal(seasonal.root.dataset.season, 'spring');
  const seasonalURL = new URL(seasonal.window.appearance.getShareURL());
  assert.equal(seasonalURL.searchParams.get('season'), 'spring');
  assert.equal(seasonalURL.searchParams.get('appearance'), 'light');
  assert.equal((await openPage()).root.dataset.season, 'autumn');

  const mixed = await openPage('theme=macos&site=midnight&card=wood');
  assert.equal(mixed.root.dataset.siteTheme, 'midnight');
  assert.equal(mixed.root.dataset.cardTheme, 'wood');
  const mixedURL = new URL(mixed.window.appearance.getShareURL());
  assert.equal(mixedURL.searchParams.has('theme'), false);
  const mixedRecipient = await openPage(mixedURL.search.slice(1));
  assert.equal(mixedRecipient.root.dataset.siteTheme, 'midnight');
  assert.equal(mixedRecipient.root.dataset.cardTheme, 'wood');

  const invalid = await openPage('theme=__proto__&site=constructor&card=missing&palette=bad&appearance=bad&season=constructor', {
    'hrmc-macos-palette': 'ghost', 'hrmc-macos-appearance': 'dark',
  });
  assert.equal(invalid.root.dataset.siteTheme, 'macos');
  assert.equal(invalid.root.dataset.macPalette, 'ghost');
  assert.equal(invalid.root.dataset.appearance, 'dark');
  assert.equal(invalid.root.dataset.season, 'autumn');
  console.log('Theme links passed: precedence, round trip, storage isolation, seasonal snapshot, mixed themes, invalid values.');
})().catch(error => { console.error(error); process.exitCode = 1; });
