const fs = require('node:fs');
const path = require('node:path');
const { renderArtifacts } = require('./lib/navigation.cjs');
const root = path.resolve(__dirname, '..');

function generate(check = false) {
  const source = JSON.parse(fs.readFileSync(path.join(root, 'content/navigation.json'), 'utf8'));
  const artifacts = renderArtifacts(source, root);
  const stale = [];
  for (const [file, content] of Object.entries(artifacts)) {
    const target = path.join(root, file);
    const expected = content.replaceAll('\r\n', '\n');
    const actual = fs.existsSync(target) ? fs.readFileSync(target, 'utf8').replaceAll('\r\n', '\n') : null;
    if (actual === expected) continue;
    if (check) stale.push(file);
    else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, expected); }
  }
  if (stale.length) throw new Error('Generated navigation is stale: ' + stale.join(', ') + '. Run npm run generate:nav.');
  console.log(check ? 'PASS: shared navigation and partials match their source.' : 'Generated shared/nav.json and both partials from content/navigation.json.');
}
if (require.main === module) {
  try { generate(process.argv.includes('--check')); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { generate };
