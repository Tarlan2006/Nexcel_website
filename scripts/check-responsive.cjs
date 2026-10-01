const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');

(async () => {
  await fs.mkdir('.review/responsive', { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const results = [];
  const failures = [];
  try {
    for (const width of [320, 390, 768, 1000, 1024, 1150, 1280, 1440, 1920]) {
      for (const route of ['/', '/licensing', '/templates', '/faq']) {
        const page = await context.newPage();
        await page.setViewportSize({ width, height: 900 });
        await page.goto('http://127.0.0.1:5500' + route);
        await page.locator('#site-header header').waitFor();
        await page.locator('#site-footer footer').waitFor();
        await page.evaluate(() => document.fonts.ready);
        const result = await page.evaluate(() => {
          const visible = el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
          const header = document.querySelector('header');
          const items = [...header.querySelectorAll('a, button')].filter(visible).map(el => ({ text: el.textContent.trim() || el.getAttribute('aria-label'), rect: el.getBoundingClientRect().toJSON() }));
          const overlap = [];
          for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
            const a = items[i].rect, b = items[j].rect;
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlap.push([items[i].text, items[j].text]);
          }
          return {
            width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
            overlap, headerBottom: header.getBoundingClientRect().bottom,
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
        const needsMono = route === '/' || route === '/licensing';
        const fontsLoaded = await page.evaluate(needsMono => ['Inter', 'Manrope', ...(needsMono ? ['JetBrains Mono'] : [])].every(name => [...document.fonts].some(face => face.family.replace(/"/g, '') === name && face.status === 'loaded')), needsMono);
        if (!fontsLoaded) failures.push(`${route} at ${width}px: fonts unavailable`);
        if (route === '/') {
          for (const key of ['tables', 'bots', 'ai', 'saas']) {
            await page.locator('#pill-' + key).click();
            const clipped = await page.locator('#inspector-' + key).evaluate(panel => [...panel.querySelectorAll('*')].some(el => {const rect = el.getBoundingClientRect(); return rect.width > 0 && (rect.right > innerWidth + 1 || rect.left < -1);}));
            if (clipped) failures.push(`${width}px: inspector ${key} overflows`);
          }
          for (const target of ['#direction-tables', '#direction-bots', '#direction-ai', '#calculator', '#cases']) {
            if (width < 1024) await page.locator('#mobile-menu-toggle').click();
            const nav = width < 1024 ? '#mobile-menu' : 'header nav[aria-label="Основная навигация"]';
            await page.locator(`${nav} a[href="/${target}"]`).click();
            const position = await page.locator(target).evaluate(el => ({ top: el.getBoundingClientRect().top, header: document.querySelector('header').getBoundingClientRect().bottom }));
            if (position.top < position.header - 1) failures.push(`${width}px: ${target} behind header`);
            if (width < 1024 && await page.locator('#mobile-menu-toggle').getAttribute('aria-expanded') !== 'false') failures.push(`${width}px: menu stayed open`);
          }
        }
        if (route === '/templates') {
          await page.locator('a[href="#library"]').click();
          const bounds = await page.locator('#library h2').evaluate(el => ({ top: el.getBoundingClientRect().top, header: document.querySelector('header').getBoundingClientRect().bottom }));
          if (bounds.top < bounds.header) failures.push(`${width}px: library behind header`);
        }
        if (route !== '/') {
          if (width < 1024) await page.locator('#mobile-menu-toggle').click();
          const nav = width < 1024 ? '#mobile-menu' : 'header nav[aria-label="Основная навигация"]';
          const target = route === '/licensing' ? '/templates' : '/licensing';
          await page.locator(`${nav} a[href="${target}"]`).click();
          if (new URL(page.url()).pathname !== target) failures.push(`${width}px: interpage navigation`);
        }
        await page.close();
      }
    }
    for (const viewport of [{width:320,height:568},{width:844,height:390}]) {
      const page = await context.newPage();
      await page.setViewportSize(viewport);
      await page.goto('http://127.0.0.1:5500');
      await page.locator('#mobile-menu-toggle').click();
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
  else console.log('PASS: 36 layouts, 36 inspector panels, 45 main navigation anchors, 9 library anchors, 27 interpage links and 2 short-screen FAQ navigation checks.');
})().catch(error => { console.error(error); process.exitCode = 1; });
