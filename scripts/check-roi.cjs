const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'no-preference' });
      await context.route('https://fonts.googleapis.com/**', route => route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:5500');
      const read = () => page.evaluate(() => ({
        hours: parseInt(document.getElementById('calc-res-hours').textContent),
        money: Number(document.getElementById('calc-res-money').textContent.replace(/\D/g, ''))
      }));
      const set = values => page.evaluate(values => {
        ['calc-employees', 'calc-hours', 'calc-rate'].forEach((id, i) => { document.getElementById(id).value = values[i]; });
        document.getElementById('calc-employees').dispatchEvent(new Event('input', { bubbles: true }));
      }, values);
      const settled = async values => {
        const hours = Math.round(values[0] * values[1] * 4.33);
        const money = Math.round(values[0] * values[1] * 4.33 * values[2] / 168);
        await page.waitForFunction(({ hours, money }) => parseInt(document.getElementById('calc-res-hours').textContent) === hours && Number(document.getElementById('calc-res-money').textContent.replace(/\D/g, '')) === money, { hours, money });
        assert.deepEqual(await read(), { hours, money });
      };
      assert.deepEqual(await read(), { hours: 139, money: 329905 });
      await set([50, 30, 1000000]);
      await page.waitForFunction(() => { const n = parseInt(document.getElementById('calc-res-hours').textContent); return n > 139 && n < 6495; });
      await settled([50, 30, 1000000]);
      await set([1, 1, 150000]);
      await settled([1, 1, 150000]);
      // Rapid input, with direction reversals: only the last target should win.
      await page.evaluate(() => {
        for (let i = 0; i < 40; i++) {
          document.getElementById('calc-employees').value = i % 2 ? 1 : 50;
          document.getElementById('calc-employees').dispatchEvent(new Event('input'));
        }
      });
      await settled([1, 1, 150000]);
      // Intercept window.open; never navigate to or send anything in WhatsApp.
      const message = await page.evaluate(() => {
        window.open = url => { window.capturedRoiUrl = url; };
        document.getElementById('calc-employees').value = 50;
        document.getElementById('calc-employees').dispatchEvent(new Event('input'));
        document.querySelector('[onclick="sendRoiToWhatsApp()"]').click();
        return new URL(window.capturedRoiUrl).searchParams.get('text');
      });
      assert(message.includes('217 ч'));
      assert(message.replace(/\s/g, '').includes('193304'));
      await settled([50, 1, 150000]);
      await set([50, 30, 1000000]);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await settled([50, 30, 1000000]);
      await set([1, 1, 150000]);
      assert.deepEqual(await read(), { hours: 4, money: 3866 });
      await page.reload();
      assert.deepEqual(await read(), { hours: 139, money: 329905 });
      assert.equal(await page.locator('#calc-res-money').getAttribute('aria-live'), null);
      assert.match(await page.locator('#calc-announcement').textContent(), /139/);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS ${width}px: initial values, interpolation, limits, rapid reversal, final WhatsApp values, reduced motion and final-only announcement.`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
