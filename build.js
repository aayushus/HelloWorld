const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const DEFAULT_INDEX_PATH = path.resolve(__dirname, 'index.html');
const FOOTER_STYLE = 'font-size: 0.75rem; color: #666; text-align: center;';

function getShortCommitHash(cwd = __dirname) {
  return execSync('git rev-parse --short=7 HEAD', {
    cwd,
    encoding: 'utf8',
  }).trim();
}

function getUtcBuildDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function formatFooterText(commitHash, buildDate) {
  return `Build ${commitHash} · ${buildDate}`;
}

function formatFooterHtml(commitHash, buildDate) {
  return `<footer style="${FOOTER_STYLE}">${formatFooterText(commitHash, buildDate)}</footer>`;
}

function injectBuildFooter(html, { commitHash = getShortCommitHash(), buildDate = getUtcBuildDate() } = {}) {
  const footerHtml = formatFooterHtml(commitHash, buildDate);

  if (html.includes('{{COMMIT_HASH}}') || html.includes('{{BUILD_DATE}}')) {
    const replaced = html
      .replace(/\{\{COMMIT_HASH\}\}/g, commitHash)
      .replace(/\{\{BUILD_DATE\}\}/g, buildDate);
    if (/<footer\b[^>]*>[\s\S]*?<\/footer>/i.test(replaced)) {
      return replaced;
    }
    return replaced;
  }

  if (/<footer\b[^>]*>[\s\S]*?<\/footer>/i.test(html)) {
    return html.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/i, footerHtml);
  }

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `  ${footerHtml}\n</body>`);
  }

  return `${html}\n${footerHtml}\n`;
}

function buildIndexHtml({
  indexPath = DEFAULT_INDEX_PATH,
  commitHash = getShortCommitHash(),
  buildDate = getUtcBuildDate(),
} = {}) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const updated = injectBuildFooter(html, { commitHash, buildDate });
  fs.writeFileSync(indexPath, updated, 'utf8');
  return { commitHash, buildDate, html: updated };
}

if (require.main === module) {
  buildIndexHtml();
}

module.exports = {
  FOOTER_STYLE,
  getShortCommitHash,
  getUtcBuildDate,
  formatFooterText,
  formatFooterHtml,
  injectBuildFooter,
  buildIndexHtml,
};
