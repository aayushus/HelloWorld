// KAN-8 — Custom not-found screen: a friendly, themed HTML 404 page.
// KAN-6 — Add dark mode (user-selectable light / dark / system theme).
// Zero-dependency Node HTTP server. Runs on PORT (default 9385).
// Exported for tests; only listens when run directly.
//
// Feature flag `dark-mode`: shipped behind a flag, OFF by default.
// Enable via env `DARK_MODE=true`, query `?dark-mode=1`, `?feature=dark-mode`,
// or header `x-feature-flag: dark-mode`. When off, the server never
// server-renders a dark theme for a cold visit (default stays light/system),
// but a user who explicitly opts in via the selector can still toggle
// instantly — the flag controls the default rollout, not user choice.
// See README.md "Dark mode (KAN-6)" for the token migration guide.

const http = require('http');

const PORT = process.env.PORT || 9385;

const THEME_PREFERENCE_KEY = 'theme-preference';
const VALID_THEMES = ['light', 'dark', 'system'];
const DEFAULT_THEME = 'system';
const FEATURE_FLAG_DARK_MODE = 'dark-mode';

// --- Feature flag -----------------------------------------------------------
// Off by default. Only an explicit opt-in turns it on.
function isDarkModeEnabled(req, env = process.env) {
  if (env.DARK_MODE === 'true' || env.DARK_MODE === '1') return true;
  if (env.FEATURE_DARK_MODE === 'true' || env.DARK_MODE_ENABLED === 'true') return true;
  if (!req) return false;
  const url = req.url || '';
  if (/(?:\?|&)dark-mode=(?:1|true)\b/.test(url)) return true;
  if (/(?:\?|&)feature=dark-mode\b/.test(url)) return true;
  const headers = req.headers || {};
  const flag = headers['x-feature-flag'] || '';
  if (String(flag).split(',').map((s) => s.trim()).includes(FEATURE_FLAG_DARK_MODE)) return true;
  return false;
}

// --- Theme helpers ----------------------------------------------------------
function normalizeTheme(value) {
  return VALID_THEMES.includes(value) ? value : DEFAULT_THEME;
}

// Resolve a stored preference to a concrete theme.
// `prefersDark` is the OS-level `prefers-color-scheme: dark` result.
function resolveTheme(preference, prefersDark) {
  const normalized = normalizeTheme(preference);
  if (normalized === 'light') return 'light';
  if (normalized === 'dark') return 'dark';
  return prefersDark ? 'dark' : 'light'; // system
}

function parseCookies(req) {
  const header = (req && req.headers && req.headers.cookie) || '';
  const cookies = {};
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key) cookies[key] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return cookies;
}

// Server-side persistence: authenticated/server flow mirrors the
// `theme-preference` cookie so a cold load can be server-rendered
// with the correct class and avoid a flash of the wrong theme.
function getThemePreference(req) {
  const cookies = parseCookies(req);
  return normalizeTheme(cookies[THEME_PREFERENCE_KEY]);
}

// The class/theme the server can render without knowing the OS preference:
// only explicit light/dark cookie values are server-rendered; `system`
// is left for the inline script to resolve before first paint.
function getServerRenderedTheme(req) {
  const pref = getThemePreference(req);
  return pref === 'light' || pref === 'dark' ? pref : null;
}

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// Escape untrusted text (e.g. a requested path) before reflecting it in HTML.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Inline (blocking, in <head> before the stylesheet/body) theme script.
// Runs before first paint so there is no flash of incorrect theme (FOUC),
// reads localStorage first, falls back to the server cookie, resolves
// `system` via matchMedia('(prefers-color-scheme: dark)'), and keeps
// reacting to OS changes while System is selected.
const themeScript = `(function(){try{
var KEY='theme-preference';
function valid(v){return v==='light'||v==='dark'||v==='system'?v:'system';}
function stored(){
  try{var v=localStorage.getItem(KEY);if(valid(v)===v&&v)return v;}catch(e){}
  try{var m=/theme-preference=([^;]+)/.exec(document.cookie||'');if(m)return valid(decodeURIComponent(m[1]));}catch(e){}
  return 'system';
}
function systemDark(){return typeof matchMedia!=='undefined'&&matchMedia('(prefers-color-scheme: dark)').matches;}
function resolved(pref){return pref==='dark'?'dark':pref==='light'?'light':(systemDark()?'dark':'light');}
var theme=stored();
var media=typeof matchMedia!=='undefined'?matchMedia('(prefers-color-scheme: dark)'):null;
function apply(pref){
  var r=resolved(pref);
  var root=document.documentElement;
  root.dataset.theme=r;root.dataset.themePreference=pref;root.dataset.resolvedTheme=r;
  if(r==='dark'){root.classList.add('dark');}else{root.classList.remove('dark');}
  root.style.colorScheme=r;
  try{var s=document.getElementById('theme-select');if(s)s.value=pref;}catch(e){}
  return r;
}
var resolvedTheme=apply(theme);
var ThemeProvider={
  get theme(){return theme;},
  get resolvedTheme(){return resolvedTheme;},
  setTheme:function(next){
    theme=valid(next);
    try{localStorage.setItem(KEY,theme);}catch(e){}
    try{document.cookie=KEY+'='+encodeURIComponent(theme)+';path=/;max-age=31536000;SameSite=Lax';}catch(e){}
    resolvedTheme=apply(theme);
    try{document.dispatchEvent(new CustomEvent('theme-change',{detail:{theme:theme,resolvedTheme:resolvedTheme}}));}catch(e){}
    return resolvedTheme;
  },
  resolveTheme:resolved
};
ThemeProvider.setTheme=ThemeProvider.setTheme;
window.ThemeProvider=ThemeProvider;
window.ThemeStore=ThemeProvider;
window.__THEME_STORE__=ThemeProvider;
function onOsChange(){if(theme==='system'){resolvedTheme=apply(theme);try{document.dispatchEvent(new CustomEvent('theme-change',{detail:{theme:theme,resolvedTheme:resolvedTheme}}));}catch(e){}}}
if(media){if(media.addEventListener){media.addEventListener('change',onOsChange);}else if(media.addListener){media.addListener(onOsChange);}}
document.addEventListener('DOMContentLoaded',function(){
  var s=document.getElementById('theme-select');
  if(s){s.value=theme;s.addEventListener('change',function(){ThemeProvider.setTheme(s.value);});}
});
}catch(e){}})();`;

function renderHtml({ themePreference = DEFAULT_THEME, serverTheme = null, darkModeEnabled = false } = {}) {
  const initialTheme = serverTheme || 'light';
  // Server-rendered attributes: a dark cookie + flag on => data-theme="dark"
  // before any script/pait. Without a cookie we default to light on the
  // server and let the inline script resolve system/localStorage pre-paint.
  const dataTheme = serverTheme || initialTheme;
  const htmlClass = dataTheme === 'dark' ? ' class="dark"' : '';
  return `<!DOCTYPE html>
<html lang="en" data-theme="${escAttr(dataTheme)}" data-theme-preference="${escAttr(themePreference)}"${htmlClass}>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="description" content="HelloWorld — a tiny zero-dependency page with user-selectable light, dark, and system themes." />
<meta name="feature-flag" content="dark-mode" />
<meta name="dark-mode-enabled" content="${darkModeEnabled ? 'true' : 'false'}" />
<title>HelloWorld</title>
<script>${themeScript}</script>
<style>
  :root {
    --color-bg: #ffffff;
    --color-text: #1d1d1f;
    --color-border: #d2d2d7;
    --color-surface: #f5f5f7;
    --color-muted: #595959;
    --color-accent: #0071e3;
    --color-accent-hover: #005fc4;
    color-scheme: light;
  }
  [data-theme="dark"], .dark {
    --color-bg: #000000;
    --color-text: #f5f5f7;
    --color-border: #424245;
    --color-surface: #1d1d1f;
    --color-muted: #a1a1a6;
    --color-accent: #2997ff;
    --color-accent-hover: #66bbff;
    color-scheme: dark;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif;
    background: var(--color-bg);
    color: var(--color-text);
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--color-accent); }
  .nav {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 20px; background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }
  .nav nav { display: flex; gap: 16px; align-items: center; }
  .theme-selector { display: inline-flex; gap: 8px; align-items: center; font-size: 14px; }
  .theme-selector label { color: var(--color-muted); }
  select#theme-select, [data-testid="theme-selector"] {
    background: var(--color-bg); color: var(--color-text);
    border: 1px solid var(--color-border); border-radius: 8px; padding: 6px 10px;
  }
  main { max-width: 1024px; margin: 0 auto; padding: 64px 20px; text-align: center; }
  h1 { font-size: clamp(36px, 6vw, 64px); letter-spacing: -0.02em; }
  .sub { color: var(--color-muted); font-size: 18px; margin-top: 12px; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; max-width: 1024px; margin: 32px auto 0; }
  .tile { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 16px; padding: 24px; text-align: left; }
  .tile h2 { font-size: 20px; }
  .tile p { color: var(--color-muted); margin-top: 6px; font-size: 14px; }
  .btn { display: inline-block; margin-top: 24px; padding: 10px 22px; border-radius: 980px; background: var(--color-accent); color: #fff; text-decoration: none; }
  .btn:hover { background: var(--color-accent-hover); }
  footer { border-top: 1px solid var(--color-border); color: var(--color-muted); font-size: 12px; padding: 20px; text-align: center; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme]) { color-scheme: dark; }
  }
</style>
</head>
<body>
<header class="nav">
  <strong>HelloWorld</strong>
  <nav aria-label="Primary">
    <a href="#features">Features</a>
    <span class="theme-selector">
      <label for="theme-select">Theme</label>
      <select id="theme-select" data-testid="theme-selector" aria-label="Theme" name="theme">
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </span>
  </nav>
</header>
<main>
  <h1>Hello, world.</h1>
  <p class="sub">A tiny zero-dependency page. Pick Light, Dark, or System — it updates instantly and remembers your choice.</p>
  <a class="btn" href="#features">Learn more</a>
  <section class="tiles" id="features" aria-label="Features">
    <article class="tile"><h2>Light</h2><p>Clean, high-contrast light theme.</p></article>
    <article class="tile"><h2>Dark</h2><p>Easy-on-the-eyes dark theme.</p></article>
    <article class="tile"><h2>System</h2><p>Follows your OS, updates when it changes.</p></article>
  </section>
</main>
<footer>Copyright &copy; 2026 HelloWorld. Theme preference is stored as <code>theme-preference</code>.</footer>
</body>
</html>`;
}

// --- Custom not-found screen (KAN-8) ----------------------------------------
// Renders a friendly, self-contained HTML 404 page that matches the site's
// visual design: the same design tokens + no-flash theme script as the home
// page, so it respects the user's Light / Dark / System preference. It never
// exposes stack traces or internal error details.
function renderNotFoundHtml({ themePreference = DEFAULT_THEME, serverTheme = null, darkModeEnabled = false, path = '' } = {}) {
  const dataTheme = serverTheme || 'light';
  const htmlClass = dataTheme === 'dark' ? ' class="dark"' : '';
  // Only ever reflect a path, never a query string, and escape it to avoid XSS.
  const safePath = path ? String(path).split('?')[0] : '';
  const pathLine = safePath
    ? `<p class="path-line">We couldn't find <code>${escapeHtml(safePath)}</code>.</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="en" data-theme="${escAttr(dataTheme)}" data-theme-preference="${escAttr(themePreference)}"${htmlClass}>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<meta name="description" content="404 Not Found — the page you requested could not be found." />
<meta name="dark-mode-enabled" content="${darkModeEnabled ? 'true' : 'false'}" />
<title>404 — Page not found | HelloWorld</title>
<script>${themeScript}</script>
<style>
  :root {
    --color-bg: #ffffff;
    --color-text: #1d1d1f;
    --color-border: #d2d2d7;
    --color-surface: #f5f5f7;
    --color-muted: #595959;
    --color-accent: #0071e3;
    --color-accent-hover: #005fc4;
    color-scheme: light;
  }
  [data-theme="dark"], .dark {
    --color-bg: #000000;
    --color-text: #f5f5f7;
    --color-border: #424245;
    --color-surface: #1d1d1f;
    --color-muted: #a1a1a6;
    --color-accent: #2997ff;
    --color-accent-hover: #66bbff;
    color-scheme: dark;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif;
    background: var(--color-bg);
    color: var(--color-text);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--color-accent); }
  .nav {
    display: flex; align-items: center;
    padding: 12px 20px; background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }
  .brand { font-weight: 700; text-decoration: none; color: var(--color-text); }
  main { flex: 1; max-width: 640px; width: 100%; margin: 0 auto; padding: 64px 20px; text-align: center; }
  .code { font-size: clamp(72px, 18vw, 160px); font-weight: 700; line-height: 1; letter-spacing: -0.04em; color: var(--color-accent); }
  h1 { font-size: clamp(24px, 4vw, 36px); letter-spacing: -0.02em; margin-top: 12px; }
  .lead { color: var(--color-muted); font-size: 18px; margin-top: 12px; }
  .path-line { color: var(--color-muted); font-size: 14px; margin-top: 16px; word-break: break-all; }
  .path-line code { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 6px; padding: 2px 8px; }
  .btn { display: inline-block; margin-top: 28px; padding: 12px 24px; border-radius: 980px; background: var(--color-accent); color: #fff; text-decoration: none; font-weight: 600; }
  .btn:hover { background: var(--color-accent-hover); }
  footer { border-top: 1px solid var(--color-border); color: var(--color-muted); font-size: 12px; padding: 20px; text-align: center; }
</style>
</head>
<body>
<header class="nav"><a class="brand" href="/">HelloWorld</a></header>
<main>
  <p class="code">404</p>
  <h1>Page not found</h1>
  <p class="lead">Sorry, we can't find the page you're looking for.</p>
  ${pathLine}
  <a class="btn" href="/">Go back home</a>
</main>
<footer>Copyright &copy; 2026 HelloWorld.</footer>
</body>
</html>`;
}

// A stable, pre-rendered version of the not-found screen (no request context).
const notFoundHtml = renderNotFoundHtml({});

// Content negotiation: browsers (and `fetch` with `Accept: */*`) get the
// friendly HTML screen; explicit API clients that prefer JSON still receive
// the short machine-readable error. JSON is purely opt-in via Accept.
function prefersJson(req) {
  const accept = (req && req.headers && req.headers.accept) || '';
  return /application\/json/i.test(accept) && !/text\/html/i.test(accept);
}

function createServer() {
  return http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html' || req.url.startsWith('/?') || req.url.startsWith('/index.html?'))) {
      const themePreference = getThemePreference(req);
      const darkModeEnabled = isDarkModeEnabled(req);
      // Only server-render dark when the flag is on (or the request
      // explicitly opted in) — flag is off by default, so a cold
      // anonymous visit stays light until the user chooses otherwise.
      const serverTheme = darkModeEnabled ? getServerRenderedTheme(req) : null;
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      res.end(renderHtml({ themePreference, serverTheme, darkModeEnabled }));
      return;
    }
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    // KAN-8: unmatched routes render a friendly, themed HTML not-found
    // screen. API clients that explicitly prefer JSON still get a short
    // machine-readable error. No stack traces / internals are ever leaked.
    if (prefersJson(req)) {
      res.writeHead(404, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    const themePreference = getThemePreference(req);
    const darkModeEnabled = isDarkModeEnabled(req);
    const serverTheme = darkModeEnabled ? getServerRenderedTheme(req) : null;
    res.writeHead(404, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(renderNotFoundHtml({ themePreference, serverTheme, darkModeEnabled, path: req.url }));
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`HelloWorld listening on http://localhost:${PORT}`);
  });
}

module.exports = {
  createServer,
  PORT,
  html: renderHtml({}),
  renderHtml,
  renderNotFoundHtml,
  notFoundHtml,
  prefersJson,
  themeScript,
  THEME_PREFERENCE_KEY,
  VALID_THEMES,
  DEFAULT_THEME,
  FEATURE_FLAG_DARK_MODE,
  isDarkModeEnabled,
  normalizeTheme,
  resolveTheme,
  parseCookies,
  getThemePreference,
  getServerRenderedTheme,
};
