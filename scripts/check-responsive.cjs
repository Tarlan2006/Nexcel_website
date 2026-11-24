const { chromium, expect } = require('@playwright/test');
const base = process.argv[2] || 'http://127.0.0.1:8787';
const fs = require('node:fs/promises');
const { checkFooters } = require('./check-footers.cjs');

const desktopWidth = 1024;
const calculatorAnchor = '#calculator';
const screenshotStyle = '#cookie-notice { visibility: hidden !important; }';
const sectionScreenshotStyle = screenshotStyle + ' #site-header { visibility: hidden !important; }';

async function openNavigation(page, width, group = null) {
  const mobile = width < desktopWidth;
  if (mobile) await page.locator('#mobile-menu-toggle').click();
  if (group) {
    const prefix = mobile ? 'mobile' : 'desktop';
    await page.locator(`#${prefix}-${group}-toggle`).click();
    return page.locator(`#${prefix}-${group}-menu`);
  }
  return page.locator(mobile ? '#mobile-menu' : '#site-header-row nav');
}

function fitsViewport(element) {
  const bounds = element.getBoundingClientRect();
  return bounds.width > 0 && bounds.left >= -1 && bounds.right <= innerWidth + 1 &&
    document.documentElement.scrollWidth <= innerWidth;
}

function textOutsideViewport() {
  const issues = [];
  for (const element of document.querySelectorAll('main h1, main h2, main h3, main p, main li, main a, main button, footer a')) {
    // Demo windows and moving logo strips intentionally contain clipped content.
    if (element.closest('svg, [aria-hidden="true"], .sr-only, .inspector-panel, .clients-marquee, .partner-marquee')) continue;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      const style = getComputedStyle(parent);
      if (!node.textContent.trim() || parent.closest('.sr-only') || !parent.getClientRects().length || style.visibility === 'hidden' || style.display === 'none') continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      if ([...range.getClientRects()].some(rect => rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1))) {
        issues.push(node.textContent.trim().slice(0, 100));
      }
    }
  }
  return [...new Set(issues)];
}

function brokenTitleWords() {
  const heading = document.querySelector('main h1');
  const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
  const issues = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    for (const match of node.textContent.matchAll(/[\p{L}\p{N}]+/gu)) {
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      if (range.getClientRects().length > 1) issues.push(match[0]);
    }
  }
  return issues;
}

async function checkAddressStates(page, width) {
  const link = page.locator('footer a[href="https://go.2gis.com/cyGjq"]');
  const colors = () => link.evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const values = [getComputedStyle(element.querySelector('svg')).color];
    while (walker.nextNode()) {
      if (walker.currentNode.textContent.trim()) values.push(getComputedStyle(walker.currentNode.parentElement).color);
    }
    return [...new Set(values)];
  });
  await link.scrollIntoViewIfNeeded();
  await link.hover();
  await expect.poll(colors).toHaveLength(1);
  await page.mouse.move(width - 1, 0);
  // Reach the address with Tab so :focus-visible is exercised, not just :focus.
  await page.locator('footer nav[aria-label="Компания"] a').last().focus();
  await page.keyboard.press('Tab');
  await expect.poll(colors).toHaveLength(1);
  const visibleFocus = await link.evaluate(element => document.activeElement === element && element.matches(':focus-visible') && getComputedStyle(element).outlineStyle !== 'none');
  await link.evaluate(element => element.blur());
  return visibleFocus;
}

(async () => {
  const allRoutes = checkFooters().pages.map(({ page }) => page);
  await fs.mkdir('.review/responsive', { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const results = [];
  const failures = [];
  const widths = [320, 360, 390, 768, 1000, 1024, 1150, 1280, 1440, 1536, 1920];
  const coreRoutes = ['/', '/bitrix24', '/veeam', '/licensing', '/avtomatizaciya-excel', '/telegram-boty', '/vnedrenie-ii', '/sozdanie-saitov', '/seo', '/free', '/faq', '/o-kompanii'];
  const articleWidths = [320, 390, 768, 1024, 1440];
  try {
    for (const width of widths) {
      for (const route of allRoutes.filter(route => coreRoutes.includes(route) || articleWidths.includes(width))) {
        const page = await context.newPage();
        await page.setViewportSize({ width, height: 900 });
        await page.goto(base + route);
        await page.locator('#site-header-row').waitFor();
        await page.locator('#site-footer footer').waitFor();
        await page.evaluate(() => document.fonts.ready);
        const result = await page.evaluate(() => {
          const visible = el => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
          const header = document.querySelector('#site-header header');
          const row = document.getElementById('site-header-row');
          const rowBounds = row.getBoundingClientRect();
          const rowCenter = rowBounds.top + rowBounds.height / 2;
          const items = [...row.querySelectorAll('a, button')].filter(visible).map(el => ({
            text: el.textContent.trim() || el.getAttribute('aria-label'),
            rect: el.getBoundingClientRect().toJSON()
          }));
          const singleHeaderRow = items.every(({ rect }) =>
            Math.abs(rect.top + rect.height / 2 - rowCenter) <= 1 &&
            rect.left >= rowBounds.left - 1 && rect.right <= rowBounds.right + 1
          );
          const desktop = matchMedia('(min-width: 1024px)').matches;
          const correctHeaderControls = Boolean(visible(row.querySelector('#site-brand'))) &&
            Boolean(visible(row.querySelector('nav'))) === desktop &&
            Boolean(visible(row.querySelector('#desktop-email'))) === desktop &&
            Boolean(visible(row.querySelector('#desktop-whatsapp'))) === desktop &&
            Boolean(visible(row.querySelector('#mobile-menu-toggle'))) === !desktop;
          const overlap = [];
          for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
            const a = items[i].rect, b = items[j].rect;
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlap.push([items[i].text, items[j].text]);
          }
          const footerGrid = document.querySelector('.site-footer-grid');
          const office = footerGrid.querySelector('address');
          const footerColumns = getComputedStyle(footerGrid).gridTemplateColumns.split(' ').length;
          const addressLines = office.getBoundingClientRect().height / parseFloat(getComputedStyle(office).lineHeight);
          const developmentBounds = footerGrid.querySelector('nav[aria-label="Разработка"]').getBoundingClientRect();
          const licensingBounds = footerGrid.querySelector('nav[aria-label="Лицензии ПО и SaaS"]').getBoundingClientRect();
          const companyBounds = footerGrid.querySelector('nav[aria-label="Компания"]').getBoundingClientRect();
          const contactsBounds = office.closest('ul').parentElement.getBoundingClientRect();
          const footerPairedRows = Math.abs(developmentBounds.top - licensingBounds.top) < 1 &&
            Math.abs(companyBounds.top - contactsBounds.top) < 1 &&
            companyBounds.left < contactsBounds.left && companyBounds.top > developmentBounds.top;
          return {
            footerColumns, addressLines, footerPairedRows,
            width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
            overlap, singleHeaderRow, correctHeaderControls,
            headerBottom: header.getBoundingClientRect().bottom,
            headingTop: document.querySelector('h1').getBoundingClientRect().top,
            overflowing: [...document.querySelectorAll('body *')].filter(visible).filter(el => el.getBoundingClientRect().right > innerWidth + 1 || el.getBoundingClientRect().left < -1).map(el => ({tag: el.tagName, id: el.id, text: el.textContent.trim().slice(0, 60)})).slice(0, 12),
            fonts: ['Inter', 'Manrope', ...(document.querySelector('.font-mono') ? ['JetBrains Mono'] : [])].every(name => [...document.fonts].some(face => face.family.replace(/"/g, '') === name && face.status === 'loaded'))
          };
        });
        result.textOverflow = await page.evaluate(textOutsideViewport);
        result.brokenTitleWords = route.startsWith('/news/') ? await page.evaluate(brokenTitleWords) : [];
        const socials = await page.locator('.footer-socials a').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()));
        result.socialsOneRow = socials.length === 5 && socials.every(rect => Math.abs(rect.top - socials[0].top) < 1 && Math.abs(rect.width - rect.height) < 1 && rect.width >= 24);
        const name = route === '/' ? 'index' : route.slice(1).replaceAll('/', '-');
        if ([360, 1440].includes(width) && ['/', '/licensing'].includes(route)) {
          await page.locator(route === '/' ? '#partners-teaser' : '#partners').evaluate(async element => {
            await Promise.all([...element.querySelectorAll('img')].map(image => {
              image.loading = 'eager';
              return image.decode();
            }));
          });
        }
        await page.screenshot({ path: `.review/responsive/${name}-${width}.png`, style: screenshotStyle });
        if ([390, 768, 1440].includes(width) || (route === '/veeam' && width === 360)) {
          await page.screenshot({ path: `.review/responsive/${name}-${width}-full.png`, fullPage: true, style: screenshotStyle });
          if (route === '/') {
            for (const id of ['directions', 'calculator', 'cases']) {
              await page.locator('#' + id).screenshot({ path: `.review/responsive/${id}-${width}.png` });
            }
          }
        }
        if ([360, 1440].includes(width)) {
          if (route === '/') await page.locator('#partners-teaser').screenshot({ path: `.review/responsive/partners-home-${width}.png`, style: sectionScreenshotStyle });
          if (route === '/licensing') {
            await page.locator('#partners').screenshot({ path: `.review/responsive/partners-licensing-${width}.png`, style: sectionScreenshotStyle });
            await page.locator('#partner-veeam').screenshot({ path: `.review/responsive/veeam-card-${width}.png`, style: sectionScreenshotStyle });
          }
        }
        results.push({ route, ...result });
        console.log(`Checked ${route} at ${width}px; fonts loaded: ${result.fonts}`);
        if (result.scrollWidth > width || result.overlap.length || result.headingTop < result.headerBottom || result.overflowing.length) failures.push(`${route} at ${width}px: layout`);
        if (result.textOverflow.length) failures.push(`${route} at ${width}px: text overflows (${result.textOverflow.join('; ')})`);
        if (result.brokenTitleWords.length) failures.push(`${route} at ${width}px: article title splits words mid-letter (${result.brokenTitleWords.join('; ')})`);
        if (!result.socialsOneRow) failures.push(`${route} at ${width}px: social buttons wrap or become too small`);
        if (width >= 1024 && (result.footerColumns !== 5 || result.addressLines > 3.05)) failures.push(`${route} at ${width}px: desktop footer grid/address wraps incorrectly`);
        if (width < 1024 && (result.footerColumns !== 2 || !result.footerPairedRows)) failures.push(`${route} at ${width}px: footer sections must form two paired rows`);
        if (!result.singleHeaderRow || !result.correctHeaderControls) failures.push(`${route} at ${width}px: header controls do not fit on one row`);
        const needsMono = route === '/' || route === '/licensing';
        const fontsLoaded = await page.evaluate(needsMono => ['Inter', 'Manrope', ...(needsMono ? ['JetBrains Mono'] : [])].every(name => [...document.fonts].some(face => face.family.replace(/"/g, '') === name && face.status === 'loaded')), needsMono);
        if (!fontsLoaded) failures.push(`${route} at ${width}px: fonts unavailable`);
        if (route === '/') {
          if (!await checkAddressStates(page, width)) failures.push(`${width}px: address hover/focus colors differ or keyboard focus is missing`);
          for (const key of ['tables', 'bots', 'ai', 'web', 'saas']) {
            await page.locator('#pill-' + key).click();
            const clipped = await page.locator('#inspector-' + key).evaluate(panel => [...panel.querySelectorAll('*')].some(el => {const rect = el.getBoundingClientRect(); return rect.width > 0 && (rect.right > innerWidth + 1 || rect.left < -1);}));
            if (clipped) failures.push(`${width}px: inspector ${key} overflows`);
          }
          const nav = await openNavigation(page, width, 'development');
          if (!await nav.evaluate(fitsViewport)) failures.push(`${width}px: services panel overflows`);
          await page.keyboard.press('Escape');
          if (width < desktopWidth) await page.keyboard.press('Escape');
          await page.goto(base + '/free');
          await page.locator(`#tools a[href="/${calculatorAnchor}"]`).click();
          await page.waitForURL('**/#calculator');
          const position = await page.locator(calculatorAnchor).evaluate(el => ({ top: el.getBoundingClientRect().top, header: document.querySelector('header').getBoundingClientRect().bottom }));
          if (position.top < position.header - 1) failures.push(`${width}px: calculator behind header`);
          if (width < desktopWidth && await page.locator('#mobile-menu-toggle').getAttribute('aria-expanded') !== 'false') failures.push(`${width}px: menu stayed open`);
        }
        if (route === '/free') {
          await page.goto(base + '/free#free-templates');
          const bounds = await page.locator('#free-templates h2').evaluate(el => ({ top: el.getBoundingClientRect().top, header: document.querySelector('header').getBoundingClientRect().bottom }));
          if (bounds.top < bounds.header) failures.push(`${width}px: templates behind header`);
        }
        if (route !== '/') {
          const target = route === '/licensing' ? '/free' : '/licensing';
          const nav = await openNavigation(page, width, target === '/licensing' ? 'licensing' : null);
          await nav.locator(`a[href="${target}"]`).click();
          if (new URL(page.url()).pathname !== target) failures.push(`${width}px: interpage navigation`);
        }
        await page.close();
      }
    }
    for (const viewport of [{width:320,height:568},{width:844,height:390}]) {
      const page = await context.newPage();
      await page.setViewportSize(viewport);
      await page.goto(base);
      const services = await openNavigation(page, viewport.width, 'development');
      const contacts = page.locator('#mobile-contacts');
      await contacts.scrollIntoViewIfNeeded();
      if (!await services.evaluate(fitsViewport) || !await contacts.evaluate(element => {
        const [email, whatsapp] = [...element.querySelectorAll('a')].map(link => link.getBoundingClientRect());
        return email.width > 0 && whatsapp.width > 0 && Math.abs(email.top - whatsapp.top) <= 1 &&
          email.left >= 0 && email.right <= whatsapp.left && whatsapp.right <= innerWidth + 1 &&
          email.top >= 0 && whatsapp.bottom <= innerHeight + 1;
      })) failures.push(`${viewport.width}x${viewport.height}: mobile contacts do not fit side by side`);
      await page.locator('#mobile-menu a[href="/faq"]').scrollIntoViewIfNeeded();
      await page.screenshot({path:`.review/responsive/menu-${viewport.width}x${viewport.height}.png`});
      await page.locator('#mobile-menu a[href="/faq"]').click();
      await page.waitForURL('**/faq');
      await page.locator('#site-header header').waitFor();
      if (await page.locator('#mobile-menu-toggle').getAttribute('aria-expanded') !== 'false') failures.push('Landscape menu did not close');
      await page.locator('#mobile-menu-toggle').click();
      await page.keyboard.press('Escape');
      if (await page.locator('#mobile-menu-toggle').getAttribute('aria-expanded') !== 'false') failures.push('Escape did not close menu');
      await page.close();
    }
  } finally { await browser.close(); }
  await fs.writeFile('.review/responsive/layout.json', JSON.stringify(results, null, 2));
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
  else console.log('PASS:', allRoutes.length, 'pages;', results.length, 'layouts and text-overflow checks,', widths.length * 5, 'inspector panels,', widths.length, 'address hover/focus checks,', widths.length, 'calculator anchors,', widths.length, 'template section anchors,', results.length - widths.length, 'interpage links and 2 short-screen mobile menu checks.');
})().catch(error => { console.error(error); process.exitCode = 1; });
