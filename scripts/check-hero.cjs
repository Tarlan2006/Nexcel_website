const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const width of [320, 390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'no-preference' });
      await context.route('https://fonts.googleapis.com/**', route => route.abort());
      await context.addInitScript(() => {
        window.heroAnimationCalls = 0;
        const original = Element.prototype.animate;
        Element.prototype.animate = function (...args) {
          if (this.classList.contains('inspector-panel')) window.heroAnimationCalls++;
          return original.apply(this, args);
        };
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:5500');
      assert.equal(await page.evaluate(() => heroAnimationCalls), 1);
      const initialHeight = await page.locator('#hero-panels').evaluate(el => el.getBoundingClientRect().height);
      await page.locator('#hero-orders').fill('500');
      for (const key of ['bots', 'ai', 'saas', 'tables']) {
        await page.locator('#pill-' + key).click();
        const middle = await page.locator('#inspector-' + key).evaluate(el => {
          const animation = el.getAnimations()[0];
          if (!animation) return null;
          animation.pause(); animation.currentTime = 100;
          return Number(getComputedStyle(el).opacity);
        });
        assert(middle > 0 && middle < 1, 'Intermediate reveal frame');
        await page.locator('#inspector-' + key).evaluate(el => el.getAnimations().forEach(a => a.finish()));
        const state = await page.evaluate(key => ({
          active: [...document.querySelectorAll('.inspector-panel')].filter(el => getComputedStyle(el).visibility === 'visible').map(el => el.id),
          pressed: [...document.querySelectorAll('.hero-pill[aria-pressed="true"]')].map(el => el.id),
          hiddenInert: [...document.querySelectorAll('.inspector-panel.hidden')].every(el => el.inert && el.getAttribute('aria-hidden') === 'true'),
          height: document.getElementById('hero-panels').getBoundingClientRect().height,
          scrollWidth: document.documentElement.scrollWidth
        }), key);
        assert.deepEqual(state.active, ['inspector-' + key]);
        assert.deepEqual(state.pressed, ['pill-' + key]);
        assert(state.hiddenInert);
        assert(Math.abs(state.height - initialHeight) < 1);
        assert(state.scrollWidth <= width);
      }
      assert.equal(await page.locator('#hero-orders').inputValue(), '500');
      assert.equal(await page.locator('#hero-total-rev').textContent(), '25\u00a0000\u00a0000 ₸');
      const before = await page.evaluate(() => heroAnimationCalls);
      await page.locator('#pill-tables').click();
      assert.equal(await page.evaluate(() => heroAnimationCalls), before);
      await page.evaluate(() => { for (let i = 0; i < 40; i++) setHeroInspector(['tables', 'bots', 'ai', 'saas'][i % 4]); });
      assert.equal(await page.locator('.inspector-panel:not(.hidden)').getAttribute('id'), 'inspector-saas');
      assert.equal(await page.locator('.inspector-panel').evaluateAll(panels => panels.reduce((n, panel) => n + panel.getAnimations().length, 0)), 1);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => [...document.querySelectorAll('.inspector-panel')].every(el => el.getAnimations().length === 0));
      await page.locator('#pill-tables').click();
      assert.equal(await page.locator('#inspector-tables').evaluate(el => getComputedStyle(el).opacity), '1');
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS ${width}px: reveal, stable height, one visible panel, rapid clicks, preserved inputs, reduced motion.`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
