const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
const source = require('../content/navigation.json');
const { localHref } = require('./lib/navigation.cjs');
const base = process.argv[2] || 'http://127.0.0.1:5500';
const groups = source.serviceGroups;
const services = groups.flatMap(group => group.links).map(item => localHref(item.href));
const sections = source.headerPages.map(id => localHref(source.pages[id].href));
const activeHighlight = /(?:^|\s)text-emeraldAccent(?:\s|$)/;
async function openPage(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await page.goto(base); await page.locator('#site-header header').waitFor(); return page;
}
async function checkStaticHeader(page) {
  for (const mode of ['desktop', 'mobile']) {
    const containers = page.locator('[data-' + mode + '-group]');
    await expect(containers).toHaveCount(2);
    for (const group of groups) {
      const box = page.locator('#' + mode + '-' + group.id);
      await expect(box.locator('button')).toHaveText(group.label.ru);
      assert.deepEqual(await box.locator('a').evaluateAll(els => els.map(e => e.getAttribute('href'))), group.links.map(item => localHref(item.href)));
    }
    const all = await containers.locator('a').evaluateAll(els => els.map(e => e.getAttribute('href')));
    assert.equal(new Set(all).size, all.length);
  }
  await expect(page.locator('header button').filter({ hasText: /^Услуги$/ })).toHaveCount(0);
  for (const group of groups) {
    const column = page.locator('footer nav[aria-label="' + group.label.ru + '"]');
    assert.deepEqual(await column.locator('a').evaluateAll(els => els.map(e => e.getAttribute('href'))), group.links.map(item => localHref(item.href)));
  }
  await expect(page.locator('footer nav[aria-label="Компания"] a[href="/bitrix24"]')).toHaveCount(0);
  await expect(page.locator('footer nav[aria-label="Компания"] a[href="/licensing#partners"]')).toHaveCount(1);
}
async function checkDesktopDisclosure(page) {
  for (const [index, group] of groups.entries()) {
    const toggle = page.locator('#desktop-' + group.id + '-toggle');
    const menu = page.locator('#desktop-' + group.id + '-menu');
    const items = menu.locator('a');
    await expect(toggle).toHaveAttribute('aria-haspopup', 'menu');
    await toggle.hover(); await expect(menu).toBeVisible();
    await page.mouse.move(1, 899); await expect(menu).toBeHidden();
    await toggle.click(); await expect(items.first()).toBeFocused();
    await page.mouse.move(1, 899); await expect(menu).toBeVisible();
    await page.mouse.click(1, 899); await expect(menu).toBeHidden();
    await toggle.press('Enter'); await expect(items.first()).toBeFocused();
    await page.keyboard.press('ArrowDown'); await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowUp'); await expect(items.first()).toBeFocused();
    await page.keyboard.press('End'); await expect(items.last()).toBeFocused();
    await page.keyboard.press('Home'); await expect(items.first()).toBeFocused();
    await page.keyboard.press('Escape'); await expect(toggle).toBeFocused(); await expect(menu).toBeHidden();
    await toggle.press('Space'); await expect(items.first()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(index === 0 ? page.locator('#desktop-licensing-toggle') : page.locator('header a[href="/news"]:visible')).toBeFocused();
    await expect(menu).toBeHidden();
    await page.setViewportSize({ width: 1024, height: 270 });
    await toggle.press('ArrowUp'); await expect(items.last()).toBeFocused();
    assert(await items.last().evaluate(item => { const r=item.getBoundingClientRect(), p=item.closest('ul').getBoundingClientRect(); return r.top>=p.top && r.bottom<=p.bottom && p.bottom<=innerHeight; }));
    await page.keyboard.press('Escape'); await page.setViewportSize({ width: 1280, height: 900 });
  }
}
async function checkMobileAccordion(page) {
  const main = page.locator('#mobile-menu-toggle');
  await main.press('Enter');
  for (const group of groups) {
    const toggle = page.locator('#mobile-' + group.id + '-toggle'), list = page.locator('#mobile-' + group.id + '-menu');
    await toggle.press('Enter'); await expect(list).toBeVisible();
    await page.keyboard.press('Tab'); await expect(list.locator('a').first()).toBeFocused();
    await page.keyboard.press('Escape'); await expect(list).toBeHidden(); await expect(toggle).toBeFocused();
  }
  await page.locator('#mobile-development-toggle').click(); await page.locator('#mobile-licensing-toggle').click();
  await expect(page.locator('#mobile-development-menu')).toBeVisible(); await expect(page.locator('#mobile-licensing-menu')).toBeVisible();
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await expect(page.locator('#mobile-menu')).toBeHidden(); await expect(main).toBeFocused();
  await main.press('Enter'); await page.locator('#mobile-whatsapp').focus(); await page.keyboard.press('Tab');
  await expect(page.locator('#mobile-menu')).toBeHidden();
}
async function checkLinks(page, mobile) {
  const mode=mobile?'mobile':'desktop';
  const nav=page.locator(mobile?'#mobile-menu':'#site-header-row nav');
  for (const target of [...services, ...sections]) {
    await page.goto(base);
    if (mobile) await page.locator('#mobile-menu-toggle').click();
    const group = groups.find(group => group.links.some(item => localHref(item.href) === target));
    if (group) await page.locator('#'+mode+'-'+group.id+'-toggle').click();
    await nav.locator('a[href="'+target+'"]').click(); await page.waitForURL(base+target);
    await expect(nav.locator('a[href="'+target+'"]')).toHaveAttribute('aria-current', target.includes('#')?'location':'page');
    await expect(nav.locator('a[aria-current]')).toHaveCount(1);
    for (const candidate of groups) {
      if (candidate===group) await expect(page.locator('#'+mode+'-'+candidate.id+'-toggle')).toHaveClass(activeHighlight);
      else await expect(page.locator('#'+mode+'-'+candidate.id+'-toggle')).not.toHaveClass(activeHighlight);
    }
    if (group && target!=='/licensing') {
      const crumb=page.locator('nav[aria-label="Хлебные крошки"]');
      await expect(crumb).toContainText(group.label.ru);
      const middle=await page.locator('script[type="application/ld+json"]').evaluateAll(els=>els.map(e=>JSON.parse(e.textContent)).flatMap(s=>s['@graph']||[s]).find(e=>e['@type']==='BreadcrumbList').itemListElement[1]);
      assert.equal(middle.name, group.label.ru);
      if (group.id==='development') { assert.equal(middle.item, undefined); await expect(crumb.locator('a')).toHaveCount(1); }
      else { assert.equal(middle.item,'https://nexcel.kz/licensing'); await expect(crumb.locator('a[href="/licensing"]')).toHaveCount(1); }
    }
    if (group) await expect(page.locator('#'+mode+'-'+group.id+'-toggle')).toHaveAttribute('aria-expanded','false');
  }
  await page.locator('#site-brand').click();
  await page.waitForURL(base + '/');
  await page.locator('#site-header-row').waitFor();
  await page.locator('#site-footer nav[aria-label="Компания"] a[href="/o-kompanii"]').click();
  await page.waitForURL(base + '/o-kompanii');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('О компании Nexcel Solutions');

  await page.goto(base + '/templates#template-stock');
  await page.waitForURL(base + '/free#template-stock');
  await expect(page.locator('#template-stock')).toBeVisible();
  await expect(nav.locator('a[href="/templates"]')).toHaveCount(0);
  await page.goto(base + '/free');
  await expect(nav.locator('a[href="/free"]')).toHaveAttribute('aria-current', 'page');
  await expect(nav.locator('a[href="/free"]')).toHaveClass(activeHighlight);
  await expect(page.locator('main a[href^="/templates"]')).toHaveCount(0);
  const sheets = page.locator('#free-templates a[href^="https://docs.google.com/spreadsheets/d/"]');
  await expect(sheets).toHaveCount(2);
  for (const link of await sheets.all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  await expect(page.locator('#free-templates button[data-action="request-template"]')).toHaveCount(3);
  await page.locator('#tools a[href="/#calculator"]').click();
  await page.waitForURL(base + '/#calculator');
  await expect(page.locator('#calculator')).toBeVisible();
  await expect(nav.locator('a[href="/#calculator"]')).toHaveCount(0);
  await expect(nav.locator('a[href^="https://photo.nexcel.kz/"]')).toHaveCount(0);
  await page.goto(base + '/licensing');
  await expect(page.locator('#partner-bitrix24 img')).toHaveAttribute('src', '/assets/partners/1c-bitrix-logo.svg');
  await expect(page.locator('main a[href="/bitrix24"]')).toHaveCount(1);
  await page.locator('#partner-bitrix24 a[href="/bitrix24"]').click();
  await page.waitForURL(base + '/bitrix24');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Продажа лицензий и внедрение Битрикс24 для вашего бизнеса');
  await expect(page.locator('footer a[href="/bitrix24"]')).toHaveCount(1);
  for (const route of ['/', '/licensing']) {
    await page.goto(base + route);
    await expect(page.locator('#partner-veeam')).toContainText('Veeam');
    await page.locator('#partner-veeam a[href="/veeam"]').click();
    await page.waitForURL(base + '/veeam');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Поставка лицензий Veeam и защита данных для вашего бизнеса');
    await expect(page.locator('#veeam-supply-badge')).toHaveText('Поставка лицензий Veeam');
    await expect(page.locator('footer a[href="/veeam"]')).toHaveCount(1);
    await expect(page.locator('main form, main input, main textarea, main select')).toHaveCount(0);
    const whatsapp = new URL(await page.locator('#request a[href^="https://wa.me/"]').getAttribute('href'));
    assert.equal(whatsapp.searchParams.get('text'), 'Здравствуйте! Нужен расчет Veeam');
    assert.doesNotMatch(await page.locator('main').innerText(), /\d[\d\s.,]*\s*(?:₸|тенге|KZT)|(?:официальн[\p{L}]*|авторизованн[\p{L}]*)\s+партн[её]р|ProPartner|Partner\s*ID|n\.abenov@nexcel\.kz/iu);
    await page.getByRole('link', { name: 'Запросить расчет стоимости', exact: true }).click();
    await expect(page).toHaveURL(base + '/veeam#request');
    await expect(page.locator('#request-heading')).toBeInViewport();
  }
  await page.goto(base + '/news/5-priznakov-chto-excel-pora-avtomatizirovat');
  const news = nav.locator('a[href="/news"]');
  await expect(news).toHaveClass(activeHighlight);
  await expect(news).not.toHaveAttribute('aria-current', 'page');
}

async function run() {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const desktop = await openPage(browser, 1280);
    await checkStaticHeader(desktop);
    await checkDesktopDisclosure(desktop);
    await checkLinks(desktop, false);
    await desktop.close();

    const mobile = await openPage(browser, 360);
    await checkMobileAccordion(mobile);
    await checkLinks(mobile, true);
    await mobile.close();

    const stale = await browser.newPage();
    await stale.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await stale.route(base + '/', async route => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        '<div id="site-footer"></div>',
        '<div id="site-footer"><footer data-stale-footer>Старый футер</footer></div>'
      );
      await route.fulfill({ response, body });
    });
    await stale.goto(base);
    await expect(stale.locator('footer[data-stale-footer]')).toHaveCount(0);
    await expect(stale.locator('footer a[href="https://go.2gis.com/cyGjq"]')).toBeAttached();
    await stale.close();

    const restored = await browser.newPage();
    await restored.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await restored.goto(base);
    await restored.locator('#cookie-notice').waitFor();
    await restored.evaluate(() => {
      window.savedCookieNotice = document.getElementById('cookie-notice');
      document.querySelector('footer').setAttribute('data-restored-footer', 'outdated');
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await expect(restored.locator('footer[data-restored-footer]')).toHaveCount(0);
    assert(await restored.evaluate(() => document.getElementById('cookie-notice') === window.savedCookieNotice));
    await restored.locator('#cookie-notice-dismiss').click();
    await expect(restored.locator('#cookie-notice')).toBeHidden();
    await restored.close();

    const page = await browser.newPage();
    await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await page.route('**/partials/**', route => route.fulfill({ status: 500, body: 'error' }));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.locator('#pill-bots').click();
    await page.locator('#inspector-bots').waitFor();
    assert.deepEqual(errors, []);
    const clicks = 2 * (services.filter(href => href.startsWith('/')).length + sections.length + 2);
    console.log('PASS: static header links, desktop dropdown and mobile accordion interactions, ' + clicks + ' navigation clicks, active states, fetch failure isolation');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
