const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function checkClients(browser) {
  const screenshots = await fs.mkdtemp(path.join(os.tmpdir(), 'nexcel-clients-'));
  console.log('Screenshots: ' + screenshots);
  for (const width of [360, 390, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : width === 768 ? 1024 : 900 }, reducedMotion: 'no-preference' });
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.goto('http://127.0.0.1:5500');
    const section = page.locator('#clients');
    const track = page.locator('.clients-track');
    const originals = page.locator('.clients-group:not([aria-hidden]) .clients-item');
    await page.locator('#site-header header').waitFor();
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      assert(!await section.evaluate(el => el.contains(document.activeElement)));
    }
    await section.scrollIntoViewIfNeeded();
    await page.locator('#clients img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
    assert.equal(await originals.count(), 8);
    assert.equal(await page.locator('.clients-group[aria-hidden] img[alt=""]').count(), 8);
    assert.equal(await section.locator('[tabindex]').count(), 0);
    assert.equal(await section.locator('img[loading="lazy"]').count(), 0);
    assert.equal(await section.locator('img[loading="eager"]').count(), 16);
    assert.equal(await originals.locator('img[alt=""]').count(), 3);
    assert.equal(await originals.locator('span').count(), 3);
    assert(await section.locator('h2').evaluate(el => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const text = range.getBoundingClientRect(), section = el.closest('section').getBoundingClientRect();
      return text.left >= section.left && text.right <= section.right && text.top >= section.top && text.bottom <= section.bottom && getComputedStyle(el).overflow === 'visible';
    }));
    assert(await originals.locator('span').evaluateAll(labels => labels.every(el => getComputedStyle(el).whiteSpace === 'nowrap' && el.scrollWidth <= el.clientWidth)));
    assert.equal(await section.locator('h2').textContent(), 'Нам доверяют организации из госсектора, образования и бизнеса');
    assert.deepEqual(await originals.locator('span').allTextContents(), ['Правительство для граждан', 'КазНУ им. аль-Фараби', 'Nazarbayev University']);
    assert(await page.locator('#clients img').evaluateAll(images => images.every(img =>
      img.naturalWidth === Number(img.getAttribute('width')) && img.naturalHeight === Number(img.getAttribute('height')))));
    await page.mouse.move(0, 0);
    await page.waitForTimeout(260);
    assert(await originals.locator('img.clients-logo-fine').evaluateAll(images => images.length === 2 && images.every(el => {
      const style = getComputedStyle(el);
      return style.opacity === '0.9' && style.filter === 'grayscale(1) contrast(1.2)';
    })));
    const initial = await track.evaluate(el => getComputedStyle(el).transform);
    await page.waitForTimeout(100);
    assert.notEqual(await track.evaluate(el => getComputedStyle(el).transform), initial);
    // At one full duration, the duplicate lands exactly where the original began.
    const seam = await track.evaluate(el => {
      const animation = el.getAnimations()[0];
      animation.currentTime = 0;
      const first = el.children[0].firstElementChild.getBoundingClientRect().left;
      const groupWidth = el.children[0].getBoundingClientRect().width;
      const halfWidth = el.getBoundingClientRect().width / 2;
      animation.currentTime = Number(animation.effect.getTiming().duration) - 0.001;
      const last = el.children[1].firstElementChild.getBoundingClientRect().left;
      animation.currentTime = 0;
      return { first, last, groupWidth, halfWidth };
    });
    assert(Math.abs(seam.first - seam.last) < 0.1);
    assert.equal(seam.groupWidth, seam.halfWidth);
    const logoBox = await originals.first().boundingBox();
    await page.mouse.move(Math.max(32, logoBox.x + logoBox.width / 2), logoBox.y + logoBox.height / 2);
    assert.equal(await track.evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
    await page.waitForTimeout(260);
    assert.equal(await originals.first().locator('img').evaluate(el => getComputedStyle(el).opacity), '1');
    assert.equal(await originals.first().locator('img').evaluate(el => getComputedStyle(el).filter), 'grayscale(0)');
    const paused = await track.evaluate(el => getComputedStyle(el).transform);
    await page.waitForTimeout(100);
    assert.equal(await track.evaluate(el => getComputedStyle(el).transform), paused);
    await page.mouse.move(0, 0);
    await track.evaluate(el => { const animation = el.getAnimations()[0]; animation.pause(); animation.currentTime = 0; });
    await section.scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if ([390, 768, 1440].includes(width)) await section.screenshot({path:path.join(screenshots, `clients-${width}.png`)});
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await track.evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.equal(await page.locator('.clients-group[aria-hidden]').evaluate(el => getComputedStyle(el).display), 'none');
    assert.equal(await page.locator('.clients-fade:visible').count(), 0);
    assert.equal(await page.locator('#clients img:visible').count(), 8);
    assert(await originals.evaluateAll(items => items.every(el => {
      const item = el.getBoundingClientRect(), container = el.closest('.clients-marquee').getBoundingClientRect();
      return item.left >= container.left - 1 && item.right <= container.right + 1;
    })));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if ([390, 1440].includes(width)) await section.screenshot({path:path.join(screenshots, `clients-reduced-${width}.png`)});
    await page.emulateMedia({reducedMotion:'no-preference'});
    assert.equal(await track.evaluate(el => getComputedStyle(el).animationName), 'clients-scroll');
    await page.close();
    console.log(`PASS clients ${width}px: motion, seamless loop, hover pause, no tab stops, eager images, logos, reduced motion, no overflow.`);
  }
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    await checkClients(browser);
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
