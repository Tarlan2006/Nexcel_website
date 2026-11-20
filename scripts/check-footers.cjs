const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const normalize = html => html.replace(/\r\n/g, '\n');
const footerPattern = /<footer\b[^>]*>[\s\S]*?<\/footer>/gi;
const legacyAddress = /53\s*\/\s*1|Бект[ұу]ров|кв\.\s*15|010000/iu;

function checkAddress(html, file) {
  const searchable = html.replace(/%2f/gi, '/').replace(/%20/gi, ' ');
  const match = searchable.match(legacyAddress);
  if (match) throw new Error(file + ': obsolete address fragment ' + match[0]);
}

function checkFooters(root = path.resolve(__dirname, '..')) {
  const output = path.join(root, 'dist');
  const reference = normalize(fs.readFileSync(path.join(root, 'partials/footer.html'), 'utf8'));
  checkAddress(reference, 'partials/footer.html');
  const referenceFooters = [...reference.matchAll(footerPattern)];
  if (referenceFooters.length !== 1) throw new Error('partials/footer.html must contain exactly one footer');
  const canonical = referenceFooters[0][0];
  const hash = createHash('sha256').update(canonical).digest('hex');
  const pages = [];

  function inspect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Build output must not contain symlinks: ' + file);
      if (entry.isDirectory()) {
        inspect(file);
        continue;
      }
      if (!entry.name.endsWith('.html')) continue;
      const relative = path.relative(output, file).split(path.sep).join('/');
      const html = normalize(fs.readFileSync(file, 'utf8'));
      checkAddress(html, relative);
      if (relative.startsWith('partials/')) {
        if (relative === 'partials/footer.html' && html !== reference) {
          throw new Error('dist/partials/footer.html differs from its canonical source');
        }
        continue;
      }
      const footers = [...html.matchAll(footerPattern)];
      if (footers.length !== 1) throw new Error(relative + ': expected exactly one footer, found ' + footers.length);
      if (footers[0][0] !== canonical) throw new Error(relative + ': footer differs from partials/footer.html');
      const page = relative === 'index.html' ? '/' : '/' + relative.replace(/\.html$/, '');
      pages.push({ page, hash });
    }
  }

  inspect(output);
  if (!pages.length) throw new Error('No built HTML pages found');
  return { hash, pages };
}

if (require.main === module) {
  try {
    const result = checkFooters();
    if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else if (process.argv.includes('--table')) console.table(result.pages);
    else console.log('PASS footers: ' + result.pages.length + ' identical HTML page footers, no obsolete addresses. SHA-256 ' + result.hash);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { checkFooters };
