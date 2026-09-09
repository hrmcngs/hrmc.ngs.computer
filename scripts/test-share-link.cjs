const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const script = path.join(__dirname, '..', 'share-link.sh');
const run = (args = [], input = '') => spawnSync('sh', [script, ...args], {
  cwd: os.tmpdir(), input, encoding: 'utf8', timeout: 10000,
});
function success(args, input) {
  const result = run(args, input);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim().split('\n').length, 1);
  return new URL(result.stdout.trim());
}

const defaults = success([]);
assert.equal(defaults.searchParams.get('palette'), 'seasonal');
assert.equal(defaults.searchParams.get('appearance'), 'system');
assert.equal(defaults.searchParams.has('season'), false);

const explicit = success(['--palette', 'engraving', '--appearance', 'dark', '--site', 'midnight', '--card', 'wood']);
assert.equal(explicit.searchParams.get('palette'), 'engraving');
assert.equal(explicit.searchParams.get('appearance'), 'dark');
assert.equal(explicit.searchParams.get('site'), 'midnight');
assert.equal(explicit.searchParams.get('card'), 'wood');

const seasonal = success(['--season', 'winter']);
assert.equal(seasonal.searchParams.get('season'), 'winter');
const clean = success(['--url', 'https://hrmc.ngs.computer/photos/?q=a%20b&site=rust&season=winter#album']);
assert.equal(clean.pathname, '/photos/');
assert.equal(clean.hash, '#album');
assert.equal(clean.searchParams.get('q'), 'a b');
assert.equal(clean.searchParams.has('site'), false);
assert.equal(clean.searchParams.has('season'), false);

const interactive = success(['--interactive'], 'bad\nmacos\nmidnight\nwood\n7\n3\nhttps://hrmc.ngs.computer/photos/#album\n');
assert.equal(interactive.searchParams.get('site'), 'midnight');
assert.equal(interactive.searchParams.get('palette'), 'engraving');
assert.equal(interactive.searchParams.get('appearance'), 'dark');
assert.equal(interactive.pathname, '/photos/');
assert.equal(success(['--interactive']).searchParams.get('palette'), 'seasonal');

for (const args of [['--palette', 'bad'], ['--card', '__proto__'], ['--appearance'], ['--unknown'], ['--url', 'javascript:alert(1)']]) {
  const result = run(args);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /エラー/);
}
assert.equal(run(['--help']).status, 0);
console.log('Share-link CLI passed: arguments, defaults, interactive input, URL preservation, invalid inputs, and other working directories.');
