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

test('running the build twice with identical fixed build metadata produces byte-identical index.html with one build footer', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helloworld-idempotent-'));
  try {
    const tmpIndex = path.join(tmpDir, 'index.html');
    fs.writeFileSync(
      tmpIndex,
      '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>HelloWorld</title>\n</head>\n<body>\n  <h1>Hello, world.</h1>\n</body>\n</html>\n',
      'utf8'
    );

    const fixedMeta = {
      indexPath: tmpIndex,
      commitHash: '1a2b3c4',
      buildDate: '2026-11-15',
    };

    const firstRun = buildIndexHtml(fixedMeta);
    const firstBytes = fs.readFileSync(tmpIndex);

    const secondRun = buildIndexHtml(fixedMeta);
    const secondBytes = fs.readFileSync(tmpIndex);

    assert.equal(Buffer.compare(firstBytes, secondBytes), 0, 'Expected byte-identical index.html across consecutive runs');
    assert.equal(firstRun.html, secondRun.html);

    const html = secondBytes.toString('utf8');
    const footers = html.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi) || [];
    assert.equal(footers.length, 1, 'Expected exactly one <footer> in index.html');
    assert.equal(
      footers[0],
      `<footer style="${FOOTER_STYLE}">Build 1a2b3c4 · 2026-11-15</footer>`
    );

    // Also verify CLI execution with fixed environment variables is byte-identical
    const cliEnv = {
      ...process.env,
      BUILD_INDEX_PATH: tmpIndex,
      COMMIT_HASH: '1a2b3c4',
      BUILD_DATE: '2026-11-15',
    };
    execSync(`node "${path.resolve(__dirname, 'build.js')}"`, { cwd: __dirname, env: cliEnv });
    const thirdBytes = fs.readFileSync(tmpIndex);
    assert.equal(Buffer.compare(secondBytes, thirdBytes), 0, 'Expected CLI build with identical metadata to produce identical bytes');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('changing build metadata updates the existing footer rather than adding another', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helloworld-update-'));
  try {
    const tmpIndex = path.join(tmpDir, 'index.html');
    fs.copyFileSync(indexPath, tmpIndex);

    buildIndexHtml({
      indexPath: tmpIndex,
      commitHash: 'aaaa111',
      buildDate: '2026-11-14',
    });
    const afterFirst = fs.readFileSync(tmpIndex, 'utf8');
    const firstFooters = afterFirst.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi) || [];
    assert.equal(firstFooters.length, 1);
    assert.match(firstFooters[0], />Build aaaa111 · 2026-11-14<\/footer>$/);

    buildIndexHtml({
      indexPath: tmpIndex,
      commitHash: 'bbbb222',
      buildDate: '2026-11-15',
    });
    const afterSecond = fs.readFileSync(tmpIndex, 'utf8');
    const secondFooters = afterSecond.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi) || [];
    assert.equal(secondFooters.length, 1, 'Expected exactly one <footer> after metadata update');
    assert.equal(
      secondFooters[0],
      `<footer style="${FOOTER_STYLE}">Build bbbb222 · 2026-11-15</footer>`
    );
    assert.doesNotMatch(afterSecond, /aaaa111|2026-11-14/);

    // Verify duplicate footers in input HTML are also collapsed to one updated footer
    const duplicateFooterHtml = afterSecond.replace(
      '</body>',
      `  <footer style="${FOOTER_STYLE}">Build cccc333 · 2026-11-16</footer>\n</body>`
    );
    fs.writeFileSync(tmpIndex, duplicateFooterHtml, 'utf8');
    buildIndexHtml({
      indexPath: tmpIndex,
      commitHash: 'dddd444',
      buildDate: '2026-11-17',
    });
    const afterDedupe = fs.readFileSync(tmpIndex, 'utf8');
    const dedupedFooters = afterDedupe.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi) || [];
    assert.equal(dedupedFooters.length, 1, 'Expected duplicate footers to be collapsed to a single footer');
    assert.equal(
      dedupedFooters[0],
      `<footer style="${FOOTER_STYLE}">Build dddd444 · 2026-11-17</footer>`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
