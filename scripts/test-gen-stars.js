'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { githubStarsFromHtml, fetchStars } = require('./gen-stars');

test('embedded repository counts include zero and exact large values', () => {
  for (const n of [0, 7, 12345]) {
    const data = { payload: { sidebarAbout: { stargazerCount: n } } };
    assert.equal(githubStarsFromHtml(`<script type="application/json" data-target="react-app.embeddedData">${JSON.stringify(data)}</script>`), n);
  }
  assert.equal(githubStarsFromHtml('<script data-target="react-app.embeddedData">{"payload":{"codeViewRepoRoute":{"overview":{"sidebarAboutData":{"stargazerCount":4}}}}}</script>'), 4);
});
test('legacy counters use exact titles and reject rounded or missing counts', () => {
  assert.equal(githubStarsFromHtml('<span id="repo-stars-counter-star" title="12,345">12.3k</span>'), 12345);
  assert.equal(githubStarsFromHtml('<span id="repo-stars-counter-star">0</span>'), 0);
  assert.equal(githubStarsFromHtml('<span id="repo-stars-counter-star">1.2k</span>'), null);
  assert.equal(githubStarsFromHtml('<h1>Sign in</h1><p>123 stars</p>'), null);
});
test('GitHub fetch uses the public page without authorization or API', async () => {
  const original = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://github.com/a/b');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers.Accept, 'text/html');
    return { ok: true, text: async () => '<span id="repo-stars-counter-star">2</span>' };
  };
  try { assert.deepEqual(await fetchStars('https://github.com/a/b'), { count: 2, platform: 'GitHub' }); }
  finally { global.fetch = original; }
});
