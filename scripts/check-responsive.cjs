const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');

const desktopWidth = 1024;
const calculatorAnchor = '#calculator';

async function openNavigation(page, width, services = false) {
  const mobile = width < desktopWidth;
  if (mobile) await page.locator('#mobile-menu-toggle').click();
  if (services) {
    const prefix = mobile ? 'mobile' : 'desktop';
    await page.locator(`#${prefix}-services-toggle`).click();
    return page.locator(`#${prefix}-services-menu`);
  }
  return page.locator(mobile ? '#mobile-menu' : '#site-header-row nav');
}

function fitsViewport(element) {
  const bounds = element.getBoundingClientRect();
  return bounds.width > 0 && bounds.left >= -1 && bounds.right <= innerWidth + 1 &&
    document.documentElement.scrollWidth <= innerWidth;
}

(async () => {
  await fs.mkdir('.review/responsive', { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const results = [];
  const failures = [];
  const widths = [320, 360, 390, 768, 1000, 1024, 1150, 1280, 1440, 1536, 1920];
  try {
    for (const width of widths) {
      for (const route of ['/', '/licensing', '/avtomatizaciya-excel', '/telegram-boty', '/vnedrenie-ii', '/seo', '/templates', '/faq', '/o-kompanii']) {
        const page = await context.newPage();
        await page.setViewportSize({ width, height: 900 });
        await page.goto('http://127.0.0.1:5500' + route);
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
          return {
            width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
            overlap, singleHeaderRow, correctHeaderControls,
            headerBottom: header.getBoundingClientRect().bottom,
            headingTop: document.querySelector('h1').getBoundingClientRect().top,
            overflowing: [...document.querySelectorAll('body *')].filter(visible).filter(el => el.getBoundingClientRect().right > innerWidth + 1 || el.getBoundingClientRect().left < -1).map(el => ({tag: el.tagName, id: el.id, text: el.textContent.trim().slice(0, 60)})).slice(0, 12),
            fonts: ['Inter', 'Manrope', ...(document.querySelector('.font-mono') ? ['JetBrains Mono'] : [])].every(name => [...document.fonts].some(face => face.family.replace(/"/g, '') === name && face.status === 'loaded'))
          };
        });
        const name = route === '/' ? 'index' : route.slice(1);
        await page.screenshot({ path: `.review/responsive/${name}-${width}.png` });
        if ([390, 768, 1440].includes(width)) {
          await page.screenshot({ path: `.review/responsive/${name}-${width}-full.png`, fullPage: true });
          if (route === '/') {
            for (const id of ['directions', 'calculator', 'cases']) {
              await page.locator('#' + id).screenshot({ path: `.review/responsive/${id}-${width}.png` });
            }
          }
        }
        results.push({ route, ...result });
        console.log(`Checked ${route} at ${width}px; fonts loaded: ${result.fonts}`);
        if (result.scrollWidth > width || result.overlap.length || result.headingTop < result.headerBottom || result.overflowing.length) failures.push(`${route} at ${width}px: layout`);
        if (!result.singleHeaderRow || !result.correctHeaderControls) failures.push(`${route} at ${width}px: header controls do not fit on one row`);
        const needsMono = route === '/' || route === '/licensing';
        const fontsLoaded = await page.evaluate(needsMono => ['Inter', 'Manrope', ...(needsMono ? ['JetBrains Mono'] : [])].every(name => [...document.fonts].some(face => face.family.replace(/"/g, '') === name && face.status === 'loaded')), needsMono);
        if (!fontsLoaded) failures.push(`${route} at ${width}px: fonts unavailable`);
        if (route === '/') {
          for (const key of ['tables', 'bots', 'ai', 'saas']) {
            await page.locator('#pill-' + key).click();
            const clipped = await page.locator('#inspector-' + key).evaluate(panel => [...panel.querySelectorAll('*')].some(el => {const rect = el.getBoundingClientRect(); return rect.width > 0 && (rect.right > innerWidth + 1 || rect.left < -1);}));
            if (clipped) failures.push(`${width}px: inspector ${key} overflows`);
          }
          const nav = await openNavigation(page, width, true);
          if (!await nav.evaluate(fitsViewport)) failures.push(`${width}px: services panel overflows`);
          await nav.locator(`a[href="/${calculatorAnchor}"]`).click();
          const position = await page.locator(calculatorAnchor).evaluate(el => ({ top: el.getBoundingClientRect().top, header: document.querySelector('header').getBoundingClientRect().bottom }));
          if (position.top < position.header - 1) failures.push(`${width}px: calculator behind header`);
          if (width < desktopWidth && await page.locator('#mobile-menu-toggle').getAttribute('aria-expanded') !== 'false') failures.push(`${width}px: menu stayed open`);
        }
        if (route === '/templates') {
          await page.locator('a[href="#library"]').click();
          const bounds = await page.locator('#library h2').evaluate(el => ({ top: el.getBoundingClientRect().top, header: document.querySelector('header').getBoundingClientRect().bottom }));
          if (bounds.top < bounds.header) failures.push(`${width}px: library behind header`);
        }
        if (route !== '/') {
          const target = route === '/licensing' ? '/templates' : '/licensing';
          const nav = await openNavigation(page, width, target === '/licensing');
          await nav.locator(`a[href="${target}"]`).click();
          if (new URL(page.url()).pathname !== target) failures.push(`${width}px: interpage navigation`);
        }
        await page.close();
      }
    }
    for (const viewport of [{width:320,height:568},{width:844,height:390}]) {
      const page = await context.newPage();
      await page.setViewportSize(viewport);
      await page.goto('http://127.0.0.1:5500');
      const services = await openNavigation(page, viewport.width, true);
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
  else console.log('PASS:', results.length, 'single-row header layouts,', widths.length * 4, 'inspector panels,', widths.length, 'calculator anchors,', widths.length, 'library anchors,', results.length - widths.length, 'interpage links and 2 short-screen mobile menu checks.');
})().catch(error => { console.error(error); process.exitCode = 1; });
