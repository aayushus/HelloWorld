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
behavior, the resolved-theme logic, `/healthz`, 404s, and the default port.

## Files

- `server.js` — zero-dependency HTTP server + themed page.
- `test/server.test.js` — automated tests (node:test + fetch).
- `package.json` — scripts (`start`, `test`) and metadata.
- `README.md` — this file.
