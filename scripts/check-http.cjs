// Run against either the local preview or Wrangler. Never sends contact forms.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const base = process.argv[2] || 'http://127.0.0.1:5500';
const cloudflare = process.argv.includes('--cloudflare');
const root = path.resolve(__dirname, '..');
let checks = 0;

async function request(route, options = {}) {
  return fetch(new URL(route, base), { redirect: 'manual', signal: AbortSignal.timeout(10000), ...options });
}

async function run() {
  for (const [route, file] of [['/partials/header.html', 'partials/header.html'], ['/partials/footer.html', 'partials/footer.html'], ['/assets/include-partials.js', 'assets/include-partials.js'], ['/', 'index.html'], ['/licensing', 'licensing.html'], ['/templates', 'templates.html'], ['/faq', 'faq.html'], ['/assets/faq.js', 'assets/faq.js'], ['/assets/styles.css', 'assets/styles.css'], ['/robots.txt', 'robots.txt'], ['/sitemap.xml', 'sitemap.xml'], ['/llms.txt', 'llms.txt']]) {
    const response = await request(route, cloudflare && route.startsWith('/partials/') ? { redirect: 'follow' } : {});
    assert.equal(response.status, 200, route);
    assert.equal(await response.text(), await fs.readFile(path.join(root, file), 'utf8'), `${route}: body`);
    if (file.endsWith('.html')) {
      assert.match(response.headers.get('content-type'), /text\/html/);
      if (cloudflare) {
        assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
        assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
      }
    }
    checks++;
  }
  for (const [route, target] of [['/index.html', '/'], ['/licensing.html', '/licensing'], ['/licensing/', '/licensing'], ['/templates.html', '/templates'], ['/faq.html', '/faq'], ['/faq/', '/faq'], ['/faq.html?source=check', '/faq?source=check'], ['/templates/', '/templates'], ['/templates.html?source=check', '/templates?source=check']]) {
    const response = await request(route);
    assert.equal(response.status, 307, `${route}: redirect`);
    const location = new URL(response.headers.get('location'), base);
    assert.equal(location.pathname + location.search, target, `${route}: destination`);
    checks++;
  }
  for (const route of ['/does-not-exist', '/package.json', '/package-lock.json', '/wrangler.jsonc', '/AI_HANDOFF.md', '/audit%20from%20claude.txt', '/.assetsignore', '/.ignore', '/.git/config', '/.wrangler/state', '/src/input.css', '/scripts/dev-server.cjs', '/node_modules/wrangler/package.json', '/_headers']) {
    assert.equal((await request(route)).status, 404, `${route}: must not be public`);
    checks++;
  }
  const head = await request('/templates', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await request('/', { method: 'POST' })).status, 405);
  checks += 2;
  // The shared footer is fetched at runtime, so inspect built partials as well.
  const placeholders = [];
  async function inspectBuiltHtml(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await inspectBuiltHtml(file);
      else if (entry.name.endsWith('.html') && /example\.invalid/i.test(await fs.readFile(file, 'utf8'))) {
        placeholders.push(path.relative(root, file));
      }
    }
  }
  await inspectBuiltHtml(path.join(root, 'dist'));
  assert.equal(placeholders.length, 0, `Replace example.invalid placeholders before publishing: ${placeholders.join(', ')}`);
  checks++;
  console.log(`PASS: ${checks} HTTP checks (${cloudflare ? 'Cloudflare runtime + headers' : 'local preview'}).`);
}

run().catch(error => { console.error(error.message); process.exitCode = 1; });
