const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({channel:'chrome'});
 try {
  for (const [route, expectedCount] of [['/', 5], ['/faq', 12]]) {
   for (const width of [320,768,1440]) {
    const page = await browser.newPage({viewport:{width,height:900}});
    await page.route('https://fonts.googleapis.com/**', r => r.abort());
    await page.goto('http://127.0.0.1:5500' + route);
    const pairs = await page.locator('#faq-container button[aria-controls]').evaluateAll(buttons => buttons.map(button => ({
     name: button.querySelector('span').textContent.replace(/^\d+\.\s*/, '').trim(),
     text: document.getElementById(button.getAttribute('aria-controls')).textContent.trim()
    })));
    const entities = await page.locator('script[type="application/ld+json"]').evaluate(el => {
     const schema = JSON.parse(el.textContent);
     return (schema['@graph'] || [schema]).find(item => item['@type'] === 'FAQPage').mainEntity;
    });
    assert.equal(pairs.length, expectedCount);
    assert.deepEqual(entities.map(item => ({name: item.name, text: item.acceptedAnswer.text})), pairs);
    for (let i = 1; i <= pairs.length; i++) {
     const button = page.locator(`[aria-controls="faq-ans-${i}"]`);
     await button.focus();
     await page.keyboard.press('Enter');
     assert.equal(await button.getAttribute('aria-expanded'), 'true');
     assert.equal(await page.locator(`#faq-ans-${i}`).evaluate(el => el.inert), false);
     assert.equal(await page.locator('.faq-answer:not(.hidden)').count(), 1);
    }
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => [...document.querySelectorAll('.faq-answer')].every(el => el.getBoundingClientRect().height === 0));
    const answer = page.locator('#faq-ans-1');
    assert.equal(await answer.evaluate(e=>e.getBoundingClientRect().height),0);
    await page.locator('[aria-controls="faq-ans-1"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(40);
    const middle = await answer.evaluate(e=> {
     e.getAnimations().forEach(a=>{a.pause();a.currentTime=100;});
     return {height:e.getBoundingClientRect().height, full:e.firstElementChild.scrollHeight, opacity:+getComputedStyle(e).opacity};
    });
    assert(middle.height>0 && middle.height<middle.full);
    assert(middle.opacity>0 && middle.opacity<1);
    await answer.evaluate(e=>e.getAnimations().forEach(a=>a.finish()));
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('faq-ans-1').getBoundingClientRect().height === 0);
    assert.equal(await answer.evaluate(e=>e.getBoundingClientRect().height),0);
    await page.evaluate(count=>{for(let i=0;i<count*6+1;i++) toggleFaq(i%count+1);}, pairs.length);
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.faq-answer:not(.hidden)').count(),1);
    assert.equal(await page.locator('[aria-controls^="faq-ans-"][aria-expanded="true"]').count(),1);
    await page.evaluate(()=>toggleFaq(2));
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForTimeout(50);
    assert.equal(await page.locator('#faq-ans-2').evaluate(e=>e.inert),false);
    assert.equal(await answer.evaluate(e=>e.getBoundingClientRect().height),0);
    await page.evaluate(()=>toggleFaq(2));
    assert.equal(await page.locator('#faq-ans-2').evaluate(e=>e.getBoundingClientRect().height),0);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.close();
    console.log('PASS FAQ '+route+' '+width+': '+expectedCount+' HTML/JSON-LD pairs, all keyboard toggles, open/close, intermediate frame, rapid clicks, reduced motion');
   }
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
