const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer, startServer, normalizeTheme, resolveTheme, getThemePreference, isDarkModeEnabled, THEME_PREFERENCE_KEY } = require('../server');

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

test('page contains exactly one footer with "Built with Garick"', async () => {
  const { body } = await getPage();
  const matches = body.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/g) || [];
  assert.equal(matches.length, 1);
  assert.match(matches[0], />Built with Garick<\/footer>/);
});

test('GET /health returns ok JSON', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('GET /healthz returns ok JSON', async () => {
  const res = await fetch(`${baseUrl}/healthz`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('unknown route returns 404 with JSON error and no stack trace', async () => {
  const res = await fetch(`${baseUrl}/nope`);
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type'), /application\/json/);
  const body = await res.text();
  assert.doesNotMatch(body, /stack|at .*:\d+|Error:/);
  const parsed = JSON.parse(body);
  assert.equal(typeof parsed.error, 'string');
});

test('startServer starts a server on an ephemeral port', async () => {
  const srv = startServer(0);
  try {
    await new Promise((resolve) => srv.once('listening', resolve));
    const res = await fetch(`http://127.0.0.1:${srv.address().port}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('default port is 9385', () => {
  delete require.cache[require.resolve('../server')];
  delete process.env.PORT;
  const fresh = require('../server');
  assert.equal(Number(fresh.PORT), 9385);
});
