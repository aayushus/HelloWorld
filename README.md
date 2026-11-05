# HelloWorld — Dark Mode (KAN-6)

A tiny zero-dependency Node.js HTTP server (port **9385**) with a
user-selectable **Light / Dark / System** color theme.

## Dark mode (KAN-6)

- **Theme selector** in the header (`<select id="theme-select">`) with
  Light, Dark, and System options. Changing it updates the UI instantly
  via CSS custom properties — no page reload.
- **Persistence key `theme-preference`** (`light` / `dark` / `system`):
  anonymous users read/write `localStorage`; the choice is also mirrored
  to a `theme-preference` cookie (server persistence) so a cold load can
  be server-rendered with the correct theme.
- **No flash of wrong theme**: a small blocking inline script runs in
  `<head>` before first paint, reads localStorage → cookie → system,
  then sets `data-theme` / `data-theme-preference` on `<html>`.
- **System**: resolves via `matchMedia('(prefers-color-scheme: dark)')`
  and re-applies live when the OS theme changes.
- **Design tokens** (CSS custom properties): `--color-bg`,
  `--color-text`, `--color-border`, `--color-surface`, `--color-muted`,
  `--color-accent`, `--color-accent-hover`, override under
  `[data-theme="dark"]`. All text meets WCAG AA contrast in both themes.
- **JS**: `window.ThemeProvider` (alias `window.ThemeStore`) exposes
  `theme`, `setTheme(value)`, and `resolvedTheme`.
- **Feature flag `dark-mode`**: off by default. Enable with
  `DARK_MODE=true`, `?dark-mode=1`, or header `x-feature-flag: dark-mode`.
  When off, the server does not server-render dark for cold visits; an
  explicit user choice via the selector still works instantly.

### Token migration guide

1. Replace hard-coded colors with tokens: `background: var(--color-bg)`,
   `color: var(--color-text)`, `border-color: var(--color-border)`.
2. Reuse `--color-surface` for cards/nav, `--color-muted` for secondary
   text, `--color-accent` / `--color-accent-hover` for interactive states.
3. Add any new token to BOTH `:root` (light) and `[data-theme="dark"]`,
   and verify WCAG AA contrast (≈4.5:1 body text, ≥3:1 large text/UI).
4. Third-party components need their own token mapping — they do not
   inherit automatically.

## Custom not-found screen (KAN-8)

Unknown routes no longer return a bare `Not Found` line. They render a
friendly, self-contained **404 HTML page** that matches the rest of the site:

- **HTTP `404`** with `Content-Type: text/html; charset=utf-8`.
- A clear **"404 — Page not found"** message plus the requested path
  (HTML-escaped, so it can never inject markup / XSS).
- A **"Go back home"** link back to `/`.
- Reuses the site's **design tokens** and the inline no-flash theme script,
  so the screen respects the user's **Light / Dark / System** preference.
- Fully self-contained (inline `<style>`, inline theme script, no external
  assets) and accessible (`lang="en"`, viewport meta, `noindex`).
- **No stack traces or internal error details** are ever exposed.

**Content negotiation**: API clients that explicitly prefer JSON still get the
short machine-readable error instead of the HTML screen:

```bash
curl -i http://localhost:9385/does-not-exist
# HTTP/1.1 404 Not Found
# Content-Type: text/html; charset=utf-8
# ... friendly 404 page ...

curl -i -H 'Accept: application/json' http://localhost:9385/does-not-exist
# HTTP/1.1 404 Not Found
# Content-Type: application/json; charset=utf-8
#
# {"error":"Not found"}
```

Browsers (`Accept: text/html, ...`) and default/ambiguous requests
(`Accept: */*`, as sent by `fetch`) receive the HTML screen. JSON is purely
opt-in via an explicit `Accept: application/json` header.

## Run locally

```bash
npm start
# → HelloWorld listening on http://localhost:9385
```

Open http://localhost:9385 in your browser. Set `PORT` to change the port.

## Run with Docker

```bash
docker run --rm -p 9385:9385 -v "$PWD":/app -w /app node:20 node server.js
```

## Test

```bash
npm test
```

Runs the Node built-in test runner (`node --test`) against a server on an
ephemeral port — covers the HTML response, theme selector, design tokens,
inline no-flash script, `theme-preference` cookie persistence, feature-flag
behavior, the resolved-theme logic, `/healthz`, the custom 404 not-found
screen (theming, home link, no leaked stack traces, XSS-escaped paths, and
JSON content negotiation), and the default port.

## Files

- `server.js` — zero-dependency HTTP server, themed page, and custom 404
  not-found screen.
- `test/server.test.js` — automated tests (node:test + fetch).
- `package.json` — scripts (`start`, `test`) and metadata.
- `README.md` — this file.
