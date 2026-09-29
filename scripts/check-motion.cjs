const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'no-preference' });
      // Motion behaviour is independent of remote font availability.
      await context.route('https://fonts.googleapis.com/**', route => route.abort());
      await context.addInitScript(() => {
        window.revealCalls = [];
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (frames, options) {
          if (this.hasAttribute('data-card-reveal')) window.revealCalls.push({ id: this.id, delay: options.delay });
          return animate.call(this, frames, options);
        };
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:5500');
      assert.equal(await page.locator('[data-card-reveal]').count(), 13);
      assert.equal(await page.evaluate(() => revealCalls.length), 0);
      await page.locator('#direction-tables').evaluate(el => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, el.offsetTop - 100); });
      await page.waitForFunction(() => document.querySelector('#direction-tables').getAnimations().length > 0);
      const middle = await page.locator('#direction-tables').evaluate(el => {
        const animation = el.getAnimations()[0];
        animation.pause(); animation.currentTime = 150;
        return { opacity: Number(getComputedStyle(el).opacity), transform: getComputedStyle(el).transform };
      });
      assert(middle.opacity > 0 && middle.opacity < 1);
      assert.notEqual(middle.transform, 'none');
      await page.locator('#direction-tables').evaluate(el => el.getAnimations().forEach(a => a.finish()));
      // Reveal all thirteen cards, then ensure scrolling back does not replay them.
      for (const card of await page.locator('[data-card-reveal]').all()) {
        await card.scrollIntoViewIfNeeded();
        await page.waitForTimeout(650);
        assert.equal(await card.evaluate(el => getComputedStyle(el).opacity), '1');
      }
      const calls = await page.evaluate(() => revealCalls);
      assert.equal(calls.length, 13);
      if (width === 1440) assert(calls.some(call => call.delay === 70));
      else assert(calls.every(call => call.delay === 0));
      await page.locator('#direction-tables').evaluate(el => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, el.offsetTop - 100); });
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => revealCalls.length), 13);
      await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0); });
      await page.reload();
      await page.locator('#direction-tables').evaluate(el => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, el.offsetTop - 100); });
      await page.waitForFunction(() => document.querySelector('#direction-tables').getAnimations().length > 0);
      await page.locator('#direction-tables button').focus();
      assert.equal(await page.locator('#direction-tables').evaluate(el => getComputedStyle(el).opacity), '1');
      await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0); });
      await page.reload();
      await page.locator('#direction-tables').evaluate(el => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, el.offsetTop - 100); });
      await page.waitForFunction(() => document.querySelector('#direction-tables').getAnimations().length > 0);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => [...document.querySelectorAll('[data-card-reveal]')].every(el => el.getAnimations().length === 0));
      await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0); });
      await page.reload();
      await page.locator('#cases').scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => revealCalls.length), 0);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto('http://127.0.0.1:5500/#direction-ai');
      await page.waitForTimeout(100);
      assert.equal(await page.locator('#direction-ai').evaluate(el => getComputedStyle(el).opacity), '1');
      assert(!await page.evaluate(() => revealCalls.some(call => call.id === 'direction-ai')));
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS ${width}px: thirteen cards, stagger, single playback, keyboard, hash and reduced motion.`);
    }
    for (const mode of ['no-js', 'no-observer']) {
      const context = await browser.newContext({ javaScriptEnabled: mode !== 'no-js' });
      await context.route('https://fonts.googleapis.com/**', route => route.abort());
      if (mode === 'no-observer') await context.addInitScript(() => { delete window.IntersectionObserver; });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:5500');
      assert(await page.locator('[data-card-reveal]').evaluateAll(cards => cards.every(el => getComputedStyle(el).opacity === '1')));
      await context.close();
      console.log(`PASS ${mode}: content visible.`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
