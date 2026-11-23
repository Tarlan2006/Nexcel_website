const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const normalize = html => html.replace(/\r\n/g, '\n');
const digest = html => createHash('sha256').update(html).digest('hex');
const legacyAddress = /53\s*\/\s*1|Бект[ұу]ров|кв\.\s*15|010000/iu;

function checkText(html, file) {
  const searchable = html.replace(/%2f/gi, '/').replace(/%20/gi, ' ').replace(/&amp;|&#38;/gi, '&');
  const match = searchable.match(legacyAddress);
  if (match) throw new Error(file + ': obsolete address fragment ' + match[0]);
  if (/Лицензии ПО\s*&\s*SaaS|GEO[-–‑]оптимизаци/iu.test(searchable)) throw new Error(file + ': obsolete wording');
  for (const nav of searchable.matchAll(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi)) {
    const text = nav[0].replace(/<[^>]*>/g, ' ');
    if (/(?:^|\s)Услуги(?:\s|$)/iu.test(text)) throw new Error(file + ': obsolete navigation label');
  }
}
function extract(html, tag, file) {
  const matches = [...html.matchAll(new RegExp('<' + tag + '\\b[^>]*>[\\s\\S]*?</' + tag + '>', 'gi'))];
  if (matches.length !== 1) throw new Error(file + ': expected exactly one ' + tag + ', found ' + matches.length);
  return matches[0][0];
}
function pagePartial(html, tag, file) {
  const marker = '<div id="site-' + tag + '">';
  if (html.split(marker).length !== 2) throw new Error(file + ': expected exactly one site-' + tag + ' container');
  const start = html.indexOf(marker) + marker.length;
  // Article headers in news are semantic content, not the shared site header.
  const divs = /<\/?div\b[^>]*>/gi;
  divs.lastIndex = start;
  let depth = 1;
  for (let match; (match = divs.exec(html));) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return extract(html.slice(start, match.index), tag, file);
  }
  throw new Error(file + ': unclosed site-' + tag + ' container');
}
function checkFooters(root = path.resolve(__dirname, '..')) {
  const output = path.join(root, 'dist');
  const references = Object.fromEntries(['header', 'footer'].map(tag => {
    const file = 'partials/' + tag + '.html';
    const html = normalize(fs.readFileSync(path.join(root, file), 'utf8'));
    checkText(html, file);
    return [tag, { html, markup: extract(html, tag, file) }];
  }));
  const headerHash = digest(references.header.markup), footerHash = digest(references.footer.markup);
  const pages = [];
  const includeScript = path.join(output, 'assets/include-partials.js');
  const includeVersion = fs.existsSync(includeScript) ? digest(fs.readFileSync(includeScript)).slice(0, 16) : null;
  for (const source of fs.readdirSync(root).filter(file => file.endsWith('.html'))) {
    if (!fs.existsSync(path.join(output, source))) throw new Error('Source HTML page missing from build: ' + source);
    const html = fs.readFileSync(path.join(root, source), 'utf8');
    for (const tag of ['header', 'footer']) {
      if (!new RegExp('<div id="site-' + tag + '">\\s*</div>').test(html)) throw new Error(source + ': use the shared ' + tag + ' placeholder in source');
    }
  }
  function inspect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Build output must not contain symlinks: ' + file);
      if (entry.isDirectory()) { inspect(file); continue; }
      if (!entry.name.endsWith('.html')) continue;
      const relative = path.relative(output, file).split(path.sep).join('/');
      const html = normalize(fs.readFileSync(file, 'utf8'));
      checkText(html, relative);
      if (relative.startsWith('partials/')) {
        for (const tag of ['header', 'footer']) {
          if (relative === 'partials/' + tag + '.html' && html !== references[tag].html) throw new Error(relative + ' differs from its canonical source');
        }
        continue;
      }
      if (includeVersion && !html.includes('src="/assets/include-partials.js?v=' + includeVersion + '"')) throw new Error(relative + ': shared navigation script version is missing or stale');
      if (includeVersion && !/<meta name="nexcel-page-version" content="[a-f0-9]{16}"/.test(html)) throw new Error(relative + ': page version is missing');
      for (const tag of ['header', 'footer']) {
        if (pagePartial(html, tag, relative) !== references[tag].markup) throw new Error(relative + ': ' + tag + ' differs from partials/' + tag + '.html');
      }
      const page = relative === 'index.html' ? '/' : '/' + relative.replace(/\.html$/, '');
      pages.push({ page, headerHash, footerHash, hash: footerHash });
    }
  }
  inspect(output);
  if (!pages.length) throw new Error('No built HTML pages found');
  return { hash: footerHash, headerHash, footerHash, pages };
}
if (require.main === module) {
  try {
    const result = checkFooters();
    if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else if (process.argv.includes('--table')) console.table(result.pages.map(({ page, headerHash, footerHash }) => ({ page, headerHash, footerHash })));
    else console.log('PASS shared partials: ' + result.pages.length + ' identical headers and footers; no obsolete navigation, wording or addresses. Header SHA-256 ' + result.headerHash + '; footer SHA-256 ' + result.footerHash);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { checkFooters };
