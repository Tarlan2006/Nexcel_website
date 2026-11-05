// Run against the built site served by Wrangler. Contact links are intercepted;
// no messages, uploads, or payment requests are sent.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('@playwright/test');

const base = process.argv[2] || 'http://127.0.0.1:8787';
const root = path.resolve(__dirname, '..');

async function run() {
  const secrets = ['.env', '.env.production', '.dev.vars', '.dev.vars.production', 'nested/.env.local'];
  const ignored = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], {
    cwd: root, input: secrets.join('\n') + '\n', encoding: 'utf8'
  }).trim().split(/\r?\n/);
  assert.deepEqual(ignored, secrets, 'Secret files must be ignored without creating them');

  const articles = (await fs.readdir(path.join(root, 'dist', 'news')))
    .filter(file => file.endsWith('.html')).map(file => '/news/' + file.slice(0, -5));
  const routes = ['/', '/licensing', '/templates', '/faq', '/news', ...articles];
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {})
  });
  let pages = 0;
  let actions = 0;
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      // Keep the test deterministic and prevent all external communication.
      await context.route('**/*', route => {
        if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
        return route.abort();
      });
      await context.addInitScript(() => {
        window.securityViolations = [];
        document.addEventListener('securitypolicyviolation', event => {
          window.securityViolations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
        });
        window.contactUrls = [];
        window.open = (url, target, features) => { window.contactUrls.push({ url, target, features }); return null; };
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const route of routes) {
        const response = await page.goto(new URL(route, base).href);
        assert.equal(response.status(), 200, route);
        assert.ok(response.headers()['content-security-policy'], `${route}: enforced CSP`);
        await page.locator('header nav').first().waitFor({ state: 'attached' });
        const unsafe = await page.evaluate(() => [...document.querySelectorAll('*')].some(element =>
          [...element.attributes].some(attribute => /^on/i.test(attribute.name)) ||
          element.tagName === 'SCRIPT' && !element.src && element.type !== 'application/ld+json'
        ));
        assert.equal(unsafe, false, `${route}: executable inline code`);
        assert.deepEqual(await page.evaluate(() => window.securityViolations), [], `${route}: CSP violations`);
        await page.locator('script[type="application/ld+json"]').evaluateAll(elements => elements.forEach(el => JSON.parse(el.textContent)));

        if (width < 1024) {
          const toggle = page.locator('#mobile-menu-toggle');
          await toggle.click();
          assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
          await toggle.click();
          assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        }
        for (const button of await page.locator('button[data-action]').all()) {
          const action = await button.getAttribute('data-action');
          const value = await button.getAttribute('data-action-value');
          const contactCount = await page.evaluate(() => window.contactUrls.length);
          if (action === 'faq-toggle') {
            await button.focus();
            await page.keyboard.press('Enter');
            assert.equal(await button.getAttribute('aria-expanded'), 'true');
            assert.equal(await page.locator('#faq-ans-' + value).evaluate(el => el.inert), false);
          } else {
            await button.click();
            if (action === 'hero-direction') assert.equal(await button.getAttribute('aria-pressed'), 'true');
            else {
              const contacts = await page.evaluate(() => window.contactUrls);
              assert.equal(contacts.length, contactCount + 1, `${route}: ${action}`);
              const contact = contacts.at(-1);
              const url = new URL(contact.url);
              assert.equal(url.origin, 'https://wa.me');
              assert.equal(url.pathname, '/77711369095');
              assert.ok(url.searchParams.get('text'));
              if (value) assert.ok(url.searchParams.get('text').includes(value));
              assert.equal(contact.features, 'noopener,noreferrer');
            }
          }
          actions++;
        }
        if (route === '/') {
          await page.locator('#pill-tables').click();
          await page.locator('#hero-orders').fill('500');
          assert.equal((await page.locator('#hero-total-rev').textContent()).replace(/\D/g, ''), '25000000');
          await page.evaluate(() => {
            for (const [id, value] of [['calc-employees', 50], ['calc-hours', 1], ['calc-rate', 150000]]) {
              document.getElementById(id).value = value;
              document.getElementById(id).dispatchEvent(new Event('input'));
            }
          });
          assert.match(await page.locator('#calc-res-hours').textContent(), /217/);
          assert.equal((await page.locator('#calc-res-money').textContent()).replace(/\D/g, ''), '193304');
          await page.locator('[data-action="send-roi"]').click();
          const message = await page.evaluate(() => new URL(window.contactUrls.at(-1).url).searchParams.get('text'));
          assert.ok(message.includes('217 ч'));
          assert.ok(message.replace(/\s/g, '').includes('193304'));
        }
        assert.deepEqual(errors, [], `${route}: browser errors`);
        assert.deepEqual(await page.evaluate(() => window.securityViolations), [], `${route}: CSP after interaction`);
        pages++;
      }

      // Prove that CSP rejects executable HTML even if markup reaches the DOM.
      await page.goto(new URL('/', base).href);
      await page.evaluate(() => {
        const script = document.createElement('script');
        script.textContent = 'window.securityProbeExecuted = true';
        document.body.append(script);
        const button = document.createElement('button');
        button.setAttribute('onclick', 'window.securityProbeExecuted = true');
        document.body.append(button);
        button.click();
      });
      await page.waitForFunction(() =>
        window.securityViolations.some(item => item.directive === 'script-src-elem') &&
        window.securityViolations.some(item => item.directive === 'script-src-attr')
      );
      assert.equal(await page.evaluate(() => window.securityProbeExecuted), undefined);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`PASS: ${pages} page/viewport checks, ${actions} button actions, calculators, secret exclusions, and CSP injection blocking.`);
}

run().catch(error => { console.error(error); process.exitCode = 1; });
