const fs = require('node:fs');
const path = require('node:path');
const { validateNavigation } = require('./lib/navigation.cjs');
try {
  const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../shared/nav.json');
  const nav = validateNavigation(JSON.parse(fs.readFileSync(target, 'utf8')));
  console.log(`PASS: nav.json v${nav.version}, ${nav.nav.length} menu links; HTTPS, labels, schema and duplicates checked.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
