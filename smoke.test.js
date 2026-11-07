import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, 'index.html');

test('index.html exists and contains an h1', () => {
  assert.ok(fs.existsSync(indexPath), `Expected index.html to exist at ${indexPath}`);
  const html = fs.readFileSync(indexPath, 'utf8');
  assert.match(html, /<h1\b[^>]*>/i, 'Expected index.html to contain an <h1> tag');
});
