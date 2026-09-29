// Keep source files, audit notes and runtime state outside the public directory.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, 'dist');
const files = ['index.html', 'licensing.html', 'templates.html', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'llms.txt', '_headers'];

// Validate both the output location and inputs before replacing generated files.
if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Invalid build directory');
if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw new Error('dist must not be a symlink');
const publicFiles = new Set([...files, '.assetsignore']);
function collectAssets(relative) {
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Public assets must not be symlinks');
    if (entry.isDirectory()) collectAssets(child);
    else publicFiles.add(child);
  }
}
collectAssets('assets');
collectAssets('partials');
for (const file of publicFiles) fs.accessSync(path.join(root, file));
fs.accessSync(path.join(root, 'assets/styles.css'));

// Preserve directory handles held by Wrangler on Windows; remove only stale files.
function prune(relative = '') {
  const directory = path.resolve(output, relative);
  if (directory !== output && !directory.startsWith(output + path.sep)) throw new Error('Invalid output path');
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Build output must not contain symlinks');
    if (entry.isDirectory()) prune(child);
    else if (!publicFiles.has(child)) fs.unlinkSync(path.join(output, child));
  }
}
fs.mkdirSync(output, { recursive: true });
prune();
for (const file of publicFiles) {
  const target = path.join(output, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, file), target);
}
console.log('Public site built in dist/');
