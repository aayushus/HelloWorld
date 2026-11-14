import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import buildModule from './build.js';

const {
  FOOTER_STYLE,
  getShortCommitHash,
  getUtcBuildDate,
  injectBuildFooter,
  buildIndexHtml,
} = buildModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, 'index.html');

test('index.html exists and contains an h1', () => {
  assert.ok(fs.existsSync(indexPath), `Expected index.html to exist at ${indexPath}`);
  const html = fs.readFileSync(indexPath, 'utf8');
  assert.match(html, /<h1\b[^>]*>/i, 'Expected index.html to contain an <h1> tag');
});

test('index.html contains a centered inline-styled build footer at the bottom matching /^Build [a-f0-9]{7} · \\d{4}-\\d{2}-\\d{2}$/', () => {
  const html = fs.readFileSync(indexPath, 'utf8');
  const footers = html.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi) || [];
  assert.equal(footers.length, 1, 'Expected exactly one <footer> in index.html');

  const footerMatch = html.match(/<footer\b([^>]*)>([\s\S]*?)<\/footer>/i);
  assert.ok(footerMatch, 'Expected index.html to contain a <footer> element');

  const [, attrs, text] = footerMatch;
  assert.match(attrs, /\bstyle="font-size:\s*0\.75rem;\s*color:\s*#666;\s*text-align:\s*center;"/i);
  assert.doesNotMatch(attrs, /\bclass=/i);
  assert.match(text, /^Build [a-f0-9]{7} · \d{4}-\d{2}-\d{2}$/);
  assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest/i);

  const footerEndIdx = html.indexOf('</footer>');
  const bodyEndIdx = html.indexOf('</body>');
  assert.ok(footerEndIdx !== -1 && bodyEndIdx !== -1 && footerEndIdx < bodyEndIdx);
  assert.equal(html.slice(footerEndIdx + '</footer>'.length, bodyEndIdx).trim(), '');
});

test('build script injects short git commit hash and UTC ISO date into index.html', () => {
  const expectedHash = execSync('git rev-parse --short=7 HEAD', {
    cwd: __dirname,
    encoding: 'utf8',
  }).trim();
  const expectedDate = new Date().toISOString().slice(0, 10);

  assert.equal(getShortCommitHash(), expectedHash);
  assert.match(expectedHash, /^[a-f0-9]{7}$/);
  assert.equal(getUtcBuildDate(new Date('2026-11-14T23:45:00Z')), '2026-11-14');

  const placeholderHtml = `<!DOCTYPE html>
<html lang="en">
<body>
  <h1>Hello, world.</h1>
  <footer style="${FOOTER_STYLE}">Build {{COMMIT_HASH}} · {{BUILD_DATE}}</footer>
</body>
</html>`;
  const injectedFromPlaceholders = injectBuildFooter(placeholderHtml, {
    commitHash: 'abc1234',
    buildDate: '2026-11-14',
  });
  const placeholderFooter = injectedFromPlaceholders.match(/<footer\b([^>]*)>([\s\S]*?)<\/footer>/i);
  assert.ok(placeholderFooter);
  assert.match(placeholderFooter[1], /\bstyle="font-size:\s*0\.75rem;\s*color:\s*#666;\s*text-align:\s*center;"/i);
  assert.equal(placeholderFooter[2], 'Build abc1234 · 2026-11-14');
  assert.match(placeholderFooter[2], /^Build [a-f0-9]{7} · \d{4}-\d{2}-\d{2}$/);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helloworld-build-'));
  try {
    const tmpIndex = path.join(tmpDir, 'index.html');
    fs.writeFileSync(
      tmpIndex,
      '<!DOCTYPE html>\n<html lang="en">\n<body>\n  <h1>Hello, world.</h1>\n</body>\n</html>\n',
      'utf8'
    );
    const result = buildIndexHtml({ indexPath: tmpIndex });
    assert.equal(result.commitHash, expectedHash);
    assert.equal(result.buildDate, expectedDate);

    const written = fs.readFileSync(tmpIndex, 'utf8');
    const match = written.match(/<footer\b([^>]*)>([\s\S]*?)<\/footer>/i);
    assert.ok(match);
    assert.match(match[1], /\bstyle="font-size:\s*0\.75rem;\s*color:\s*#666;\s*text-align:\s*center;"/i);
    assert.equal(match[2], `Build ${expectedHash} · ${expectedDate}`);
    assert.match(match[2], /^Build [a-f0-9]{7} · \d{4}-\d{2}-\d{2}$/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
