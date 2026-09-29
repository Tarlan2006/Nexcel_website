const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({channel:'chrome'});
 try {
  for (const width of [320,768,1440]) {
   const page = await browser.newPage({viewport:{width,height:900}});
   await page.route('https://fonts.googleapis.com/**', r => r.abort());
   await page.goto('http://127.0.0.1:5500');
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
   await page.evaluate(()=>{for(let i=0;i<31;i++) toggleFaq(i%5+1);});
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
   console.log('PASS FAQ '+width+': open/close, intermediate frame, keyboard, rapid clicks, reduced motion');
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
