// Run against the built site served by Wrangler. Contact links are intercepted;
// no messages, uploads, or payment requests are sent.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('@playwright/test');

const base = process.argv[2] || 'http://127.0.0.1:8787';
const siteOrigin = new URL(base).origin;
const metrikaTag = 'https://mc.yandex.ru/metrika/tag.js';
const root = path.resolve(__dirname, '..');
const serviceFaqCounts = new Map([
  ['/avtomatizaciya-excel', 6], ['/telegram-boty', 4], ['/vnedrenie-ii', 4], ['/licensing', 4], ['/seo', 7]
]);
const serviceLinks = [
  '/avtomatizaciya-excel', '/telegram-boty', '/vnedrenie-ii', '/licensing', '/seo', '/#calculator'
];

async function checkHeader(page, response, width, route) {
  const links = await page.evaluate(source => {
    const html = new DOMParser().parseFromString(source, 'text/html');
    return ['desktop', 'mobile'].map(mode =>
      [...html.querySelectorAll(`#${mode}-services-menu a[href]`)].map(link => link.getAttribute('href'))
    );
  }, await response.text());
  assert.deepEqual(links, [serviceLinks, serviceLinks], `${route}: services are ordinary links in the served HTML`);

  const mobile = width < 1024;
  const mode = mobile ? 'mobile' : 'desktop';
  const toggle = page.locator(`#${mode}-services-toggle`);
  const menu = page.locator(`#${mode}-services-menu`);
  const whatsapp = page.locator(`#${mode}-whatsapp`);
  const mainToggle = page.locator('#mobile-menu-toggle');
  if (mobile) {
    await mainToggle.click();
    assert.equal(await mainToggle.getAttribute('aria-expanded'), 'true', `${route}: mobile navigation opens`);
  } else {
    assert.equal(await toggle.getAttribute('aria-haspopup'), 'menu');
    assert.equal(await menu.getAttribute('role'), 'menu');
  }
  await whatsapp.waitFor();
  const contactUrl = new URL(await whatsapp.getAttribute('href'));
  assert.equal(contactUrl.origin, 'https://wa.me');
  assert.equal(contactUrl.pathname, '/77711369095');
  assert.ok(contactUrl.searchParams.get('text'));
  assert.equal(await whatsapp.getAttribute('target'), '_blank');
  assert.ok((await whatsapp.getAttribute('rel')).split(/\s+/).includes('noopener'));

  assert.equal(await toggle.getAttribute('aria-controls'), `${mode}-services-menu`);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(await menu.isVisible(), false);
  await toggle.press('Enter');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true', `${route}: services open with Enter`);
  await menu.waitFor();
  if (serviceLinks.includes(route)) {
    assert.equal(await menu.locator('a[aria-current="page"]').getAttribute('href'), route);
  }
  const firstLink = menu.locator('a[href]').first();
  if (mobile) await firstLink.focus();
  assert.equal(await firstLink.evaluate(link => document.activeElement === link), true);
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(await toggle.evaluate(button => document.activeElement === button), true, `${route}: Escape restores focus`);
  if (mobile) {
    assert.equal(await mainToggle.getAttribute('aria-expanded'), 'true', `${route}: Escape closes only the accordion first`);
    await page.keyboard.press('Escape');
    assert.equal(await mainToggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await mainToggle.evaluate(button => document.activeElement === button), true);
  }
}

async function checkServicePage(page, route, expectedQuestions) {
  assert.equal(await page.locator('h1').count(), 1, `${route}: exactly one H1`);
  const canonical = page.locator('link[rel="canonical"]');
  assert.equal(await canonical.count(), 1, `${route}: exactly one canonical`);
  assert.equal(await canonical.getAttribute('href'), `https://nexcel.kz${route}`);
  const entities = await page.locator('script[type="application/ld+json"]').evaluateAll(scripts =>
    scripts.flatMap(script => {
      const data = JSON.parse(script.textContent);
      return data['@graph'] || data;
    })
  );
  assert.ok(entities.some(entity => entity['@type'] === 'Service'), `${route}: Service schema`);
  const faq = entities.find(entity => entity['@type'] === 'FAQPage');
  assert.ok(faq, `${route}: FAQPage schema`);
  const questions = page.locator('#service-faq details');
  assert.equal(await questions.count(), expectedQuestions, `${route}: FAQ item count`);
  for (const [index, item] of faq.mainEntity.entries()) {
    const question = questions.nth(index);
    const summary = question.locator('summary');
    const answer = question.locator('p');
    assert.equal((await summary.innerText()).trim(), item.name, `${route}: FAQ question ${index + 1}`);
    await summary.click();
    assert.ok(await answer.isVisible(), `${route}: FAQ answer ${index + 1} is visible`);
    assert.equal((await answer.innerText()).trim(), item.acceptedAnswer.text, `${route}: FAQ answer ${index + 1}`);
  }
  assert.equal(faq.mainEntity.length, expectedQuestions, `${route}: FAQ schema item count`);
}

async function run() {
  const secrets = ['.env', '.env.production', '.dev.vars', '.dev.vars.production', 'nested/.env.local'];
  const ignored = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], {
    cwd: root, input: secrets.join('\n') + '\n', encoding: 'utf8'
  }).trim().split(/\r?\n/);
  assert.deepEqual(ignored, secrets, 'Secret files must be ignored without creating them');

  const articles = (await fs.readdir(path.join(root, 'dist', 'news')))
    .filter(file => file.endsWith('.html')).map(file => '/news/' + file.slice(0, -5));
  const routes = ['/', ...serviceFaqCounts.keys(), '/templates', '/faq', '/o-kompanii', '/privacy', '/news', ...articles];
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {})
  });
  let pages = 0;
  let actions = 0;
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      // Load Metrika scripts under CSP while keeping analytics and contact traffic isolated.
      await context.route('**/*', route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === siteOrigin) return route.continue();
        const metrikaScript = url.origin === 'https://mc.yandex.ru' && url.pathname.startsWith('/metrika/');
        if (request.resourceType() === 'script' && (metrikaScript || url.origin === 'https://yastatic.net')) {
          return route.continue();
        }
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
        const [, response] = await Promise.all([
          page.waitForResponse(response => response.ok() && response.url().split('?')[0] === metrikaTag),
          page.goto(new URL(route, base).href)
        ]);
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
        if (serviceFaqCounts.has(route)) await checkServicePage(page, route, serviceFaqCounts.get(route));

        await checkHeader(page, response, width, route);
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
  console.log(`PASS: ${pages} page/viewport checks (including static and keyboard navigation under CSP), ${actions} button actions, calculators, secret exclusions, and CSP injection blocking.`);
}

run().catch(error => { console.error(error); process.exitCode = 1; });
