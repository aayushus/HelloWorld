const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const DEFAULT_INDEX_PATH = path.resolve(__dirname, 'index.html');
const FOOTER_STYLE = 'font-size: 0.75rem; color: #666; text-align: center;';

function getShortCommitHash(cwd = __dirname, env = process.env) {
  const envCommit =
    env &&
    (env.BUILD_COMMIT_HASH || env.COMMIT_HASH || env.BUILD_COMMIT || env.GIT_COMMIT);
  if (typeof envCommit === 'string' && envCommit.trim()) {
    const trimmed = envCommit.trim();
    return /^[a-f0-9]{7,40}$/i.test(trimmed) ? trimmed.slice(0, 7) : trimmed;
  }
  return execSync('git rev-parse --short=7 HEAD', {
    cwd,
    encoding: 'utf8',
  }).trim();
}

function getUtcBuildDate(now, env = process.env) {
  if (now !== undefined) {
    const dateObj = now instanceof Date ? now : new Date(now);
    return dateObj.toISOString().slice(0, 10);
  }
  if (env && typeof env.BUILD_DATE === 'string' && env.BUILD_DATE.trim()) {
    const trimmed = env.BUILD_DATE.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    return new Date(trimmed).toISOString().slice(0, 10);
  }
  if (env && typeof env.SOURCE_DATE_EPOCH === 'string' && env.SOURCE_DATE_EPOCH.trim()) {
    return new Date(Number(env.SOURCE_DATE_EPOCH.trim()) * 1000).toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function formatFooterText(commitHash, buildDate) {
  return `Build ${commitHash} · ${buildDate}`;
}

function formatFooterHtml(commitHash, buildDate) {
  return `<footer style="${FOOTER_STYLE}">${formatFooterText(commitHash, buildDate)}</footer>`;
}

function injectBuildFooter(html, { commitHash = getShortCommitHash(), buildDate = getUtcBuildDate() } = {}) {
  const footerHtml = formatFooterHtml(commitHash, buildDate);
  let workingHtml = String(html).replace(/\r\n/g, '\n');

  const hasPlaceholders =
    /\{\{COMMIT_HASH\}\}|\{\{BUILD_DATE\}\}|__COMMIT_HASH__|__BUILD_DATE__|<short-commit-hash>|<UTC-build-date-ISO>/.test(
      workingHtml
    );

  if (hasPlaceholders) {
    workingHtml = workingHtml
      .replace(/\{\{COMMIT_HASH\}\}|__COMMIT_HASH__|<short-commit-hash>/g, commitHash)
      .replace(/\{\{BUILD_DATE\}\}|__BUILD_DATE__|<UTC-build-date-ISO>/g, buildDate);
  }

  if (/<footer\b[^>]*>[\s\S]*?<\/footer>/i.test(workingHtml)) {
    let seenFirst = false;
    return workingHtml.replace(
      /([ \t]*)<footer\b[^>]*>[\s\S]*?<\/footer>([ \t]*\n?)/gi,
      (_match, leading, trailing) => {
        if (!seenFirst) {
          seenFirst = true;
          return `${leading}${footerHtml}${trailing}`;
        }
        return '';
      }
    );
  }

  if (/<\/body>/i.test(workingHtml)) {
    return workingHtml.replace(/[ \t]*<\/body>/i, `  ${footerHtml}\n</body>`);
  }

  return `${workingHtml.replace(/\n*$/, '')}\n${footerHtml}\n`;
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--commit=') || arg.startsWith('--commit-hash=')) {
      options.commitHash = arg.slice(arg.indexOf('=') + 1);
    } else if ((arg === '--commit' || arg === '--commit-hash') && argv[i + 1]) {
      options.commitHash = argv[++i];
    } else if (arg.startsWith('--date=') || arg.startsWith('--build-date=')) {
      options.buildDate = arg.slice(arg.indexOf('=') + 1);
    } else if ((arg === '--date' || arg === '--build-date') && argv[i + 1]) {
      options.buildDate = argv[++i];
    } else if (arg.startsWith('--index=') || arg.startsWith('--index-path=')) {
      options.indexPath = path.resolve(arg.slice(arg.indexOf('=') + 1));
    } else if ((arg === '--index' || arg === '--index-path') && argv[i + 1]) {
      options.indexPath = path.resolve(argv[++i]);
    }
  }
  return options;
}

function buildIndexHtml({
  indexPath = process.env.BUILD_INDEX_PATH
    ? path.resolve(process.env.BUILD_INDEX_PATH)
    : DEFAULT_INDEX_PATH,
  commitHash = getShortCommitHash(),
  buildDate = getUtcBuildDate(),
} = {}) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const updated = injectBuildFooter(html, { commitHash, buildDate });
  if (updated !== html) {
    fs.writeFileSync(indexPath, updated, 'utf8');
  }
  return { commitHash, buildDate, html: updated };
}

if (require.main === module) {
  buildIndexHtml(parseCliArgs());
}

module.exports = {
  DEFAULT_INDEX_PATH,
  FOOTER_STYLE,
  getShortCommitHash,
  getUtcBuildDate,
  formatFooterText,
  formatFooterHtml,
  injectBuildFooter,
  parseCliArgs,
  buildIndexHtml,
};
