const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer, normalizeTheme, resolveTheme, getThemePreference, isDarkModeEnabled, renderNotFoundHtml, notFoundHtml, prefersJson, THEME_PREFERENCE_KEY } = require('../server');

let server;
let baseUrl;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

async function getPage(path = '/', headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  return { res, body: await res.text() };
}

// --- Unit: theme resolution ---
test('normalizeTheme keeps valid values and defaults unknown to system', () => {
  assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(normalizeTheme('system'), 'system');
  assert.equal(normalizeTheme('bogus'), 'system');
  assert.equal(normalizeTheme(undefined), 'system');
});

test('resolveTheme returns correct resolved theme for each selector + OS combo', () => {
  assert.equal(resolveTheme('light', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('dark', true), 'dark');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('bogus', true), 'dark');
});

// --- Unit: cookie persistence ---
test('getThemePreference reads the theme-preference cookie', () => {
  assert.equal(getThemePreference({ headers: { cookie: 'theme-preference=dark' } }), 'dark');
  assert.equal(getThemePreference({ headers: { cookie: 'theme-preference=light; other=1' } }), 'light');
  assert.equal(getThemePreference({ headers: {} }), 'system');
  assert.equal(getThemePreference({ headers: { cookie: 'theme-preference=bogus' } }), 'system');
});

// --- Feature flag ---
test('dark-mode feature flag is off by default and opt-in only', () => {
  assert.equal(isDarkModeEnabled({ url: '/', headers: {} }), false);
  assert.equal(isDarkModeEnabled({ url: '/?dark-mode=1', headers: {} }), true);
  assert.equal(isDarkModeEnabled({ url: '/', headers: { 'x-feature-flag': 'dark-mode' } }), true);
  assert.equal(isDarkModeEnabled(null, { DARK_MODE: 'true' }), true);
});

test('exports the documented persistence key', () => {
  assert.equal(THEME_PREFERENCE_KEY, 'theme-preference');
});

// --- Integration: HTML ---
test('GET / returns 200 with HTML content type', async () => {
  const { res } = await getPage();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
});

test('theme selector exposes Light, Dark, and System', async () => {
  const { body } = await getPage();
  assert.match(body, /id="theme-select"/);
  assert.match(body, /data-testid="theme-selector"/);
  assert.match(body, /value="light">Light/);
  assert.match(body, /value="dark">Dark/);
  assert.match(body, /value="system">System/);
});

test('design tokens via CSS custom properties for light and dark', async () => {
  const { body } = await getPage();
  for (const token of ['--color-bg', '--color-text', '--color-border']) {
    assert.match(body, new RegExp(token.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')));
  }
  assert.match(body, /\[data-theme="dark"\]/);
  assert.match(body, /color-scheme:\s*dark/);
});

test('inline no-flash script runs in head before paint', async () => {
  const { body } = await getPage();
  // Script must appear before </head> and before <body> content.
  const headEnd = body.indexOf('</head>');
  const scriptIdx = body.indexOf('theme-preference');
  assert.ok(scriptIdx !== -1 && headEnd !== -1 && scriptIdx < headEnd);
  assert.match(body, /<script>/);
  assert.match(body, /prefers-color-scheme: dark/);
  assert.match(body, /localStorage/);
  assert.match(body, /ThemeProvider/);
  assert.match(body, /resolvedTheme/);
  assert.match(body, /setTheme/);
});

test('server renders dark class when cookie is dark and flag is on (no FOUC)', async () => {
  const { body } = await getPage('/?dark-mode=1', { cookie: 'theme-preference=dark' });
  assert.match(body, /data-theme="dark"/);
  assert.match(body, /class="dark"/);
});

test('cold visit without flag stays light on the server', async () => {
  const { body } = await getPage('/', { cookie: 'theme-preference=dark' });
  // Flag off by default: server must not force dark for a cold visit.
  assert.match(body, /data-theme="light"/);
  assert.match(body, /dark-mode-enabled" content="false"/);
});

test('page is responsive and self-contained', async () => {
  const { body } = await getPage();
  assert.match(body, /viewport/);
  assert.match(body, /<style>/);
  assert.doesNotMatch(body, /<script[^>]+src=/);
});

test('GET /healthz returns ok JSON', async () => {
  const res = await fetch(`${baseUrl}/healthz`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

// --- Custom not-found screen (KAN-8) ---
test('unknown route returns a friendly HTML 404 screen', async () => {
  const res = await fetch(`${baseUrl}/nope`);
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const body = await res.text();
  assert.match(body, /<!DOCTYPE html>/i);
  assert.match(body, /<html lang="en"/);
  assert.match(body, /<title>404/);
  assert.match(body, /404/);
  assert.match(body, /Page not found/i);
  assert.match(body, /Not Found/i);
});

test('404 screen is self-contained and uses the site design tokens', async () => {
  const { body } = await getPage('/missing');
  assert.match(body, /<style>/);
  assert.doesNotMatch(body, /<script[^>]+src=/);
  assert.doesNotMatch(body, /<link[^>]+href=/);
  for (const token of ['--color-bg', '--color-text', '--color-accent']) {
    assert.match(body, new RegExp(token.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')));
  }
  assert.match(body, /\[data-theme="dark"\]/);
  // Reuses the site's no-flash theme script so light/dark/system is respected.
  assert.match(body, /ThemeProvider/);
  assert.match(body, /prefers-color-scheme: dark/);
  assert.match(body, /localStorage/);
});

test('404 screen respects the dark theme when the flag is on and cookie is dark', async () => {
  const { body } = await getPage('/nope?dark-mode=1', { cookie: 'theme-preference=dark' });
  assert.match(body, /data-theme="dark"/);
  assert.match(body, /class="dark"/);
  assert.match(body, /dark-mode-enabled" content="true"/);
});

test('404 screen links back to the home page', async () => {
  const { body } = await getPage('/does-not-exist');
  assert.match(body, /href="\/"/);
  assert.match(body, /Go back home/i);
});

test('404 screen does not leak stack traces or internals', async () => {
  const { body } = await getPage('/nope');
  assert.doesNotMatch(body, /stack|at .*:\d+|Error:/);
  assert.doesNotMatch(body, /server\.js/);
});

test('unknown route with Accept: application/json returns a JSON 404', async () => {
  const res = await fetch(`${baseUrl}/nope`, { headers: { Accept: 'application/json' } });
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type'), /application\/json/);
  const body = await res.text();
  assert.doesNotMatch(body, /stack|at .*:\d+|Error:/);
  assert.deepEqual(JSON.parse(body), { error: 'Not found' });
});

test('unknown route with a browser Accept header returns the HTML screen', async () => {
  const res = await fetch(`${baseUrl}/nope`, { headers: { Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' } });
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type'), /text\/html/);
});

test('unknown non-GET route also returns the 404 screen', async () => {
  const res = await fetch(`${baseUrl}/nope`, { method: 'POST' });
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type'), /text\/html/);
});

// --- Unit: not-found renderer + content negotiation ---
test('renderNotFoundHtml returns a standalone themed page', () => {
  const page = renderNotFoundHtml({ path: '/gone' });
  assert.match(page, /<!DOCTYPE html>/i);
  assert.match(page, /404/);
  assert.match(page, /href="\/"/);
  assert.match(page, /<code>\/gone<\/code>/);
  assert.equal(typeof notFoundHtml, 'string');
  assert.match(notFoundHtml, /Page not found/i);
});

test('renderNotFoundHtml escapes untrusted paths (no reflected XSS)', () => {
  const page = renderNotFoundHtml({ path: '/<script>alert(1)</script>' });
  assert.doesNotMatch(page, /<script>alert\(1\)/);
  assert.match(page, /&lt;script&gt;/);
});

test('prefersJson only opts into JSON for explicit application/json requests', () => {
  assert.equal(prefersJson({ headers: { accept: '*/*' } }), false);
  assert.equal(prefersJson({ headers: { accept: 'text/html' } }), false);
  assert.equal(prefersJson({ headers: {} }), false);
  assert.equal(prefersJson({ headers: { accept: 'application/json' } }), true);
});

test('default port is 9385', () => {
  delete require.cache[require.resolve('../server')];
  delete process.env.PORT;
  const fresh = require('../server');
  assert.equal(Number(fresh.PORT), 9385);
});
