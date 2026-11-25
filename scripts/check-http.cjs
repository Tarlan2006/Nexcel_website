// Run against either the local preview or Wrangler. Never sends contact forms.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const base = process.argv[2] || 'http://127.0.0.1:5500';
const cloudflare = process.argv.includes('--cloudflare');
const root = path.resolve(__dirname, '..');
const serviceRoutes = ['/bitrix24', '/veeam', '/avtomatizaciya-excel', '/telegram-boty', '/vnedrenie-ii', '/sozdanie-saitov', '/seo', '/analitika-dannyh', '/ii-agenty', '/mashinnoe-obuchenie', '/kompyuternoe-zrenie', '/razrabotka-igr'];
let checks = 0;

async function request(route, options = {}) {
  return fetch(new URL(route, base), { redirect: 'manual', signal: AbortSignal.timeout(10000), ...options });
}

function checkSecurityHeaders(response) {
  assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
  const csp = (response.headers.get('content-security-policy') || '').split(';').map(value => value.trim());
  const requiredDirectives = [
    "default-src 'none'",
    "script-src 'self' https://mc.yandex.ru https://yastatic.net https://static.cloudflareinsights.com",
    "script-src-attr 'none'",
    "img-src 'self' data: https://mc.yandex.ru https://yandex.ru",
    "connect-src 'self' https://mc.yandex.ru https://mc.yandex.md/cc https://cloudflareinsights.com",
    'frame-src blob: https://mc.yandex.ru https://mc.yandex.md/metrika/zzlc.html',
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'"
  ];
  for (const directive of requiredDirectives) {
    assert.ok(csp.includes(directive), `Missing CSP directive: ${directive}`);
  }
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
}

async function run() {
  const integrity = require('./check-footers.cjs').checkFooters(root);
  const dist = path.join(root, 'dist');
  const images = require('./lib/published-images.cjs').referencedImages(dist);
  for (const image of images) {
    const response = await request(image);
    assert.equal(response.status, 200, image);
    assert.match(response.headers.get('content-type') || '', /^image\//, image);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await fs.readFile(path.join(dist, image)), image);
    checks++;
  }
  console.log('PASS: ' + images.size + ' referenced images returned 200.');
  console.log('PASS header/footer integrity: ' + integrity.pages.length + ' built pages');
  console.table(integrity.pages.map(({ page, headerHash, footerHash }) => ({ page, header: headerHash.slice(0, 16), footer: footerHash.slice(0, 16) })));
  assert(await fs.readFile(path.join(root, 'dist/free.html'), 'utf8').then(html => html.includes('id="tools"') && html.includes('href="/#calculator"')), '/free#tools must contain the calculator card');
  const navResponse = await request('/shared/nav.json', { headers: { Origin: 'https://photo.nexcel.kz' } });
  assert.equal(navResponse.status, 200, 'shared navigation must be public');
  assert.match(navResponse.headers.get('content-type'), /^application\/json/);
  assert.equal(navResponse.headers.get('cache-control'), 'public, max-age=300');
  assert.equal(navResponse.headers.get('access-control-allow-origin'), 'https://photo.nexcel.kz');
  const nav = require('./lib/navigation.cjs').validateNavigation(await navResponse.json());
  assert.deepEqual(nav, JSON.parse(await fs.readFile(path.join(root, 'shared/nav.json'), 'utf8')));
  checks++;
  const servicePages = serviceRoutes.map(route => [route, `${route.slice(1)}.html`]);
  for (const [route, file] of [['/partials/header.html', 'partials/header.html'], ['/partials/footer.html', 'partials/footer.html'], ['/assets/include-partials.js', 'assets/include-partials.js'], ['/assets/cookie-notice.js', 'assets/cookie-notice.js'], ['/', 'index.html'], ['/licensing', 'licensing.html'], ...servicePages, ['/free', 'free.html'], ['/faq', 'faq.html'], ['/o-kompanii', 'o-kompanii.html'], ['/privacy', 'privacy.html'], ['/assets/faq.js', 'assets/faq.js'], ['/assets/styles.css', 'assets/styles.css'], ['/assets/partners/1c-bitrix-logo.svg', 'assets/partners/1c-bitrix-logo.svg'], ['/robots.txt', 'robots.txt'], ['/sitemap.xml', 'sitemap.xml'], ['/llms.txt', 'llms.txt']]) {
    const response = await request(route, cloudflare && route.startsWith('/partials/') ? { redirect: 'follow' } : {});
    assert.equal(response.status, 200, route);
    assert.equal(await response.text(), await fs.readFile(path.join(root, cloudflare ? 'dist' : '.', file), 'utf8'), `${route}: body`);
    if (file.endsWith('.html')) {
      assert.match(response.headers.get('content-type'), /text\/html/);
      if (cloudflare) {
        checkSecurityHeaders(response);
      }
    }
    checks++;
  }
  for (const [from, to] of [['/templates', '/free'], ['/data-science', '/analitika-dannyh'], ['/videoanalitika', '/kompyuternoe-zrenie']]) {
    for (const suffix of ['', '.html', '/', '?source=check', '.html?source=check']) {
      const route = from + suffix;
      const response = await request(route);
      assert.equal(response.status, 301, route + ': permanent redirect');
      const location = new URL(response.headers.get('location'), base);
      assert.equal(location.pathname, to, route + ': destination');
      assert.equal(location.search, new URL(route, base).search, route + ': preserve query');
      checks++;
    }
  }
  const agent = await (await request('/ii-agenty')).text();
  assert.match(agent, /<meta name="robots" content="noindex"/);
  assert.doesNotMatch(await (await request('/sitemap.xml')).text(), /\/(?:ii-agenty|videoanalitika|data-science)<\/loc>/);
  assert.doesNotMatch(await (await request('/llms.txt')).text(), /https:\/\/nexcel\.kz\/ii-agenty\)/);
  const bitrix = await fs.readFile(path.join(root, 'dist', 'bitrix24.html'), 'utf8');
  assert.doesNotMatch(bitrix, /Битрикс[\s-]+24|Bitrix\s+24|\d[\d\s.,]*\s*(?:₸|тенге)/iu, 'Bitrix page brand and pricing');
  assert.doesNotMatch(bitrix, /<(?:form|input|textarea|select)\b/i, 'Bitrix page has no data-entry form');
  assert.match(bitrix, /href="https:\/\/www\.bitrix24\.kz\/create\.php\?p=29389888" target="_blank" rel="noopener noreferrer sponsored"/, 'Bitrix partner signup');
  checks++;
  const veeam = await fs.readFile(path.join(root, 'dist', 'veeam.html'), 'utf8');
  assert.doesNotMatch(veeam, /\d[\d\s.,]*\s*(?:₸|тенге|KZT)|(?:официальн[\p{L}]*|авторизованн[\p{L}]*)\s+партн[её]р|Partner\s*ID|n\.abenov@nexcel\.kz/iu, 'Veeam page has no prices, unconfirmed partner claims or private contacts');
  assert.doesNotMatch(veeam, /<(?:form|input|textarea|select)\b/i, 'Veeam page has no data-entry form');
  assert.ok(veeam.includes('<!-- после подтверждения статуса: «Veeam ProPartner Registered Reseller» -->'), 'Veeam status comment is preserved');
  assert.match(veeam, /href="https:\/\/www\.veeam\.com\/" target="_blank" rel="noopener noreferrer"/, 'Veeam external technology link');
  const veeamSchema = JSON.parse(veeam.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  const veeamService = veeamSchema.find(item => item['@type'] === 'Service');
  assert.equal(veeamService.url, 'https://nexcel.kz/veeam');
  assert.equal(veeamService.provider.name, 'Nexcel Solutions');
  assert.equal(veeamService.areaServed.name, 'Казахстан');
  assert.equal(veeamSchema.find(item => item['@type'] === 'BreadcrumbList').itemListElement.at(-1).item, veeamService.url);
  for (const filename of ['veeam-logo.svg', 'veeam-proPartner-badge.svg', 'veeam-letter-of-recognition.pdf']) {
    const asset = 'assets/partners/' + filename;
    if (!await fs.stat(path.join(root, asset)).catch(() => null)) assert.ok(!veeam.includes(`="/${asset}"`), 'Missing Veeam asset must not be linked: ' + filename);
  }
  checks++;
  const serviceRedirects = serviceRoutes.flatMap(route => [[`${route}.html`, route], [`${route}/`, route], [`${route}.html?source=check`, `${route}?source=check`]]);
  for (const [route, target] of [['/index.html', '/'], ['/licensing.html', '/licensing'], ['/licensing/', '/licensing'], ...serviceRedirects, ['/free.html', '/free'], ['/free/', '/free'], ['/free.html?source=check', '/free?source=check'], ['/faq.html', '/faq'], ['/faq/', '/faq'], ['/faq.html?source=check', '/faq?source=check'], ['/o-kompanii.html', '/o-kompanii'], ['/o-kompanii/', '/o-kompanii'], ['/privacy.html', '/privacy'], ['/privacy/', '/privacy']]) {
    const response = await request(route);
    assert.equal(response.status, 307, `${route}: redirect`);
    const location = new URL(response.headers.get('location'), base);
    assert.equal(location.pathname + location.search, target, `${route}: destination`);
    checks++;
  }
  for (const route of ['/does-not-exist', '/package.json', '/package-lock.json', '/wrangler.jsonc', '/AI_HANDOFF.md', '/audit%20from%20claude.txt', '/.assetsignore', '/.ignore', '/.git/config', '/.wrangler/state', '/src/input.css', '/src/shared/header.template.html', '/content/navigation.json', '/schemas/nav.schema.json', '/.github/workflows/notify-subsites.yml', '/scripts/dev-server.cjs', '/node_modules/wrangler/package.json', '/_headers', '/_redirects', '/.env', '/.env.production', '/.dev.vars', '/.dev.vars.production', '/.local/preview.json', '/.local-tools/npm.cmd']) {
    const response = await request(route);
    assert.equal(response.status, 404, `${route}: must not be public`);
    if (cloudflare && route === '/does-not-exist') {
      const html = await response.text();
      assert.equal(html, await fs.readFile(path.join(root, 'dist', '404.html'), 'utf8'), 'custom 404 body');
      assert.match(html, /<meta name="robots" content="noindex"/);
      checks++;
    }
    checks++;
  }
  const head = await request('/free', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await request('/', { method: 'POST' })).status, 405);
  checks += 2;
  if (cloudflare) {
    // Verify the generated news listing and articles served by Cloudflare.
    const newsFiles = ['news.html', ...(await fs.readdir(path.join(root, 'dist', 'news'))).filter(file => file.endsWith('.html')).map(file => `news/${file}`)];
    for (const file of newsFiles) {
      const route = '/' + file.replace(/\.html$/, '');
      const response = await request(route);
      assert.equal(response.status, 200, route);
      checkSecurityHeaders(response);
      const html = await response.text();
      assert.equal(html, await fs.readFile(path.join(root, 'dist', file), 'utf8'), `${route}: body`);
      assert.match(html, /<html lang="ru"/);
      assert.ok(html.includes(`href="https://nexcel.kz${route}"`), `${route}: canonical`);
      assert.doesNotMatch(html, /(?:href|src)="[^"\n]*\.html(?:[?#"][^\n]*)?/);
      const ogImage = html.match(/<meta property="og:image" content="https:\/\/nexcel\.kz([^"\n]+)"/);
      assert.ok(ogImage, `${route}: og:image`);
      const metadata = await require('sharp')(path.join(root, 'dist', ogImage[1].slice(1))).metadata();
      assert.equal(metadata.width, 1200, `${route}: OG width`);
      assert.equal(metadata.height, 630, `${route}: OG height`);
      const imageResponse = await request(ogImage[1]);
      assert.equal(imageResponse.status, 200, `${route}: OG image response`);
      assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), await fs.readFile(path.join(root, 'dist', ogImage[1].slice(1))));
      checks++;
    }
  }
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
