// Validates content/vendors.json and that the generated blocks match it (source pages and dist).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadRegistry, syncSources, root } = require('./lib/vendors.cjs');

const raw = JSON.parse(fs.readFileSync(path.join(root, 'content', 'vendors.json'), 'utf8'));
assert.ok(typeof raw.partnerLabel === 'string' && raw.partnerLabel.trim(), 'partnerLabel is required');
assert.ok(Array.isArray(raw.vendors) && raw.vendors.length > 0, 'vendors must be a non-empty array');

const ids = new Set();
for (const vendor of raw.vendors) {
  const where = 'vendor "' + vendor.id + '"';
  assert.match(String(vendor.id), /^[a-z0-9]+(-[a-z0-9]+)*$/, where + ': id must be kebab-case');
  assert.ok(!ids.has(vendor.id), where + ': duplicate id');
  ids.add(vendor.id);
  for (const key of ['name', 'logoSource', 'category', 'description']) assert.ok(typeof vendor[key] === 'string' && vendor[key].trim(), where + ': missing ' + key);
  assert.ok(Array.isArray(vendor.bullets) && vendor.bullets.length === 3 && vendor.bullets.every(item => typeof item === 'string' && item.trim()), where + ': exactly 3 bullets');
  assert.ok(Number.isFinite(vendor.order), where + ': order must be a number');
  assert.ok(typeof vendor.enabled === 'boolean', where + ': enabled must be boolean');
  assert.ok(vendor.showInCarousel === undefined || typeof vendor.showInCarousel === 'boolean', where + ': showInCarousel must be boolean');
  assert.ok(vendor.logo && typeof vendor.logo === 'object', where + ': logo is required');
  if (vendor.logo.type === 'text') {
    assert.ok(vendor.logo.text, where + ': text logo needs text');
  } else {
    for (const key of ['src', 'alt']) assert.ok(typeof vendor.logo[key] === 'string' && vendor.logo[key], where + ': logo.' + key);
    assert.ok(Number.isInteger(vendor.logo.width) && Number.isInteger(vendor.logo.height), where + ': logo width/height');
    assert.match(vendor.logo.src, /^\/assets\/partners\/[\w.-]+$/, where + ': logo must be in /assets/partners');
    assert.ok(fs.existsSync(path.join(root, vendor.logo.src.slice(1))), where + ': logo file is missing: ' + vendor.logo.src);
  }
  if (vendor.pageUrl) {
    assert.match(vendor.pageUrl, /^\/[a-z0-9-]+$/, where + ': pageUrl must be a local route');
    assert.ok(fs.existsSync(path.join(root, vendor.pageUrl.slice(1) + '.html')), where + ': pageUrl page does not exist: ' + vendor.pageUrl);
  }
  if (vendor.siteUrl) assert.match(vendor.siteUrl, /^https:\/\//, where + ': siteUrl must be https');
  assert.doesNotMatch(JSON.stringify(vendor), /(?:официальн[\p{L}]*|авторизованн[\p{L}]*)\s+партн[её]р/iu, where + ': forbidden partner wording');
}

const { partnerLabel, vendors } = loadRegistry();
assert.deepEqual(syncSources({ check: true }), [], 'generated blocks are out of date: run npm run generate:vendors');

const count = (html, pattern) => (html.match(pattern) || []).length;
const carouselIds = vendors.filter(vendor => vendor.showInCarousel).map(vendor => vendor.id);
const pages = [['source', root], ...(fs.existsSync(path.join(root, 'dist')) ? [['dist', path.join(root, 'dist')]] : [])];
for (const [label, base] of pages) {
  const licensing = fs.readFileSync(path.join(base, 'licensing.html'), 'utf8');
  const index = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
  assert.equal(count(licensing, /<article id="partner-[a-z0-9-]+"/g), vendors.length, label + ': /licensing card count');
  for (const vendor of vendors) assert.ok(licensing.includes(`<article id="partner-${vendor.id}"`), label + ': /licensing card for ' + vendor.id);
  assert.equal(count(licensing, new RegExp('>' + partnerLabel + '</p>', 'g')), vendors.length, label + ': partnerLabel on every card');
  assert.ok(!licensing.includes('id="licensing-solutions"'), label + ': legacy licensing-solutions section must be gone');
  const groups = index.match(/<ul class="partner-marquee-group"[\s\S]*?<\/ul>/g) || [];
  assert.equal(groups.length, 2, label + ': two marquee copies');
  for (const group of groups) assert.deepEqual([...group.matchAll(/data-vendor="([^"]+)"/g)].map(match => match[1]), carouselIds, label + ': marquee logos match the registry');
  assert.ok(groups[1].includes('aria-hidden="true"') && !groups[0].includes('aria-hidden'), label + ': aria-hidden copy');
  assert.ok(index.includes('id="partners-teaser"') && licensing.includes('id="partners"'), label + ': section ids');
}
console.log(`PASS vendors: ${vendors.length} vendors, ${carouselIds.length} in the carousel, ${pages.map(page => page[0]).join(' + ')} verified.`);
