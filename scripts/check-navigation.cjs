const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');

const base = 'http://127.0.0.1:5500';
const services = ['/avtomatizaciya-excel', '/telegram-boty', '/vnedrenie-ii', '/licensing', '/seo', '/#calculator'];
const sections = ['/templates', '/news', '/o-kompanii', '/faq'];
const activeHighlight = /(?:^|\s)text-emeraldAccent(?:\s|$)/;

async function openPage(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await page.goto(base);
  await page.locator('#site-header header').waitFor();
  return page;
}

async function checkStaticHeader(page) {
  const response = await page.request.get(base + '/partials/header.html');
  assert.equal(response.status(), 200);
  const header = await page.evaluate(html => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const hrefs = (root, selector = 'a[href]', exclude) => [...(root?.querySelectorAll(selector) ?? [])]
      .filter(link => !exclude || !link.closest(exclude))
      .map(link => link.getAttribute('href'));
    const desktopNav = doc.querySelector('#desktop-services-toggle')?.closest('nav');
    return {
      brand: doc.querySelector('a#site-brand')?.getAttribute('href'),
      contactGroups: ['desktop', 'mobile'].map(mode => hrefs(doc.querySelector(`#${mode}-contacts`))),
      desktopServices: hrefs(doc.querySelector('#desktop-services-menu')),
      desktopSections: hrefs(desktopNav, 'a[href]', '#desktop-services-menu, #desktop-whatsapp'),
      mobileServices: hrefs(doc.querySelector('#mobile-services-menu')),
      mobileSections: hrefs(doc.querySelector('#mobile-menu'), 'a[href]', '#mobile-services-menu, #mobile-contacts'),
      mobileLast: [...doc.querySelectorAll('#mobile-menu a[href]')].at(-1)?.id,
      contacts: hrefs(doc, 'a#desktop-whatsapp[href], a#mobile-whatsapp[href]')
    };
  }, await response.text());

  assert.equal(header.brand, '/');
  assert.deepEqual(header.desktopServices, services);
  assert.deepEqual(header.desktopSections, sections);
  assert.deepEqual(header.mobileServices, services);
  assert.deepEqual(header.mobileSections, sections);
  assert.equal(header.mobileLast, 'mobile-whatsapp');
  assert.equal(header.contacts.length, 2);
  assert.deepEqual(header.contactGroups, header.contacts.map(contact => ['mailto:info@nexcel.kz', contact]));
  for (const contact of header.contacts) {
    const url = new URL(contact);
    assert.equal(url.origin + url.pathname, 'https://wa.me/77711369095');
    assert.ok(url.searchParams.get('text'), 'WhatsApp has a prepared message');
  }
  await expect(page.locator('footer a[href="mailto:info@nexcel.kz"]')).toBeAttached();
  for (const service of ['/avtomatizaciya-excel', '/telegram-boty', '/vnedrenie-ii', '/seo']) {
    await expect(page.locator('#directions a[href="' + service + '"]')).toHaveCount(1);
    await expect(page.locator('footer a[href="' + service + '"]')).toHaveCount(1);
  }
}

async function checkDesktopDisclosure(page) {
  const toggle = page.locator('#desktop-services-toggle');
  const menu = page.locator('#desktop-services-menu');
  const items = menu.locator('a[role="menuitem"][href][tabindex="-1"]');
  await expect(toggle).toHaveAttribute('aria-haspopup', 'menu');
  await expect(toggle).toHaveAttribute('aria-controls', 'desktop-services-menu');
  await expect(menu).toHaveAttribute('role', 'menu');
  await expect(items).toHaveCount(services.length);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeHidden();

  await toggle.hover();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await items.first().hover();
  await expect(items.first()).toBeVisible();
  await page.locator('main h1').hover();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await toggle.click();
  await expect(items.first()).toBeFocused();
  await page.locator('main h1').hover();
  await expect(menu).toBeVisible();
  await page.locator('main h1').click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await page.locator('#site-brand').focus();
  await page.keyboard.press('Tab');
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(toggle).toBeFocused();

  await page.keyboard.press('Space');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('header a[href="/templates"]:visible')).toBeFocused();
  await expect(menu).toBeHidden();

  await page.setViewportSize({ width: 1024, height: 270 });
  await toggle.press('ArrowUp');
  await expect(items.last()).toBeFocused();
  assert(await items.last().evaluate(item => {
    const panel = item.closest('[role="menu"]').getBoundingClientRect();
    const bounds = item.getBoundingClientRect();
    return bounds.top >= panel.top && bounds.bottom <= panel.bottom && panel.bottom <= innerHeight;
  }), 'The last item is reachable in a short desktop viewport');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1280, height: 900 });
}

async function checkMobileAccordion(page) {
  const menuToggle = page.locator('#mobile-menu-toggle');
  const menu = page.locator('#mobile-menu');
  const toggle = page.locator('#mobile-services-toggle');
  const services = page.locator('#mobile-services-menu');
  await expect(page.locator('#desktop-whatsapp')).toBeHidden();
  await expect(page.locator('#desktop-email')).toBeHidden();
  await expect(menu).toBeHidden();
  await menuToggle.press('Enter');
  await expect(menu).toBeVisible();
  await expect(page.locator('#mobile-whatsapp')).toBeVisible();
  await expect(page.locator('#mobile-email')).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-controls', 'mobile-services-menu');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(services).toBeHidden();

  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(services.locator('a').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(services).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(menuToggle).toBeFocused();

  await menuToggle.press('Enter');
  await page.locator('#mobile-whatsapp').focus();
  await page.keyboard.press('Tab');
  await expect(menu).toBeHidden();
  assert(await page.evaluate(() => document.activeElement.closest('main') !== null), 'Tab moves to the page without leaving the menu over it');
}

async function checkLinks(page, mobile) {
  const nav = mobile ? page.locator('#mobile-menu') : page.locator('header nav').filter({ has: page.locator('#desktop-services') });
  const servicesToggle = page.locator(mobile ? '#mobile-services-toggle' : '#desktop-services-toggle');
  for (const target of [...services, ...sections]) {
    await page.goto(base);
    if (mobile) await page.locator('#mobile-menu-toggle').click();
    if (services.includes(target)) await servicesToggle.click();
    await nav.locator('a[href="' + target + '"]').click();
    await page.waitForURL(base + target);
    await expect(nav.locator('a[href="' + target + '"]')).toHaveAttribute('aria-current', target.includes('#') ? 'location' : 'page');
    await expect(nav.locator('a[aria-current]')).toHaveCount(1);
    if (target.includes('#')) await expect(page.locator(target.slice(1))).toBeVisible();
    if (services.includes(target)) await expect(servicesToggle).toHaveClass(activeHighlight);
    else await expect(servicesToggle).not.toHaveClass(activeHighlight);
    const menuToggle = mobile ? page.locator('#mobile-menu-toggle') : servicesToggle;
    await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
  }
  await page.locator('#site-brand').click();
  await page.waitForURL(base + '/');
  await page.locator('#site-header-row').waitFor();
  await page.locator('#site-footer nav[aria-label="Компания"] a[href="/o-kompanii"]').click();
  await page.waitForURL(base + '/o-kompanii');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('О компании Nexcel Solutions');

  await page.goto(base + '/templates#library');
  await expect(nav.locator('a[href="/templates"]')).toHaveAttribute('aria-current', 'page');
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

    const page = await browser.newPage();
    await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await page.route('**/partials/**', route => route.fulfill({ status: 500, body: 'error' }));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.locator('#pill-bots').click();
    await page.locator('#inspector-bots').waitFor();
    assert.deepEqual(errors, []);
    const clicks = 2 * (services.length + sections.length + 2);
    console.log('PASS: static header links, desktop dropdown and mobile accordion interactions, ' + clicks + ' navigation clicks, active states, fetch failure isolation');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
