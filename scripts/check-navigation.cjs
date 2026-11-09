const {chromium}=require('@playwright/test');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome'});let checks=0;try{
const expected=['/','/avtomatizaciya-excel','/#direction-bots','/#direction-ai','/licensing','/seo','/#calculator','/#cases','/templates','/news','/faq'];
for(const width of [390,1280])for(const route of ['/','/licensing','/avtomatizaciya-excel','/seo','/templates','/news']){
const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
for(const target of expected){await page.goto('http://localhost:5500'+route);await page.locator('header').waitFor();await page.locator('footer').waitFor();const nav=width<1024?'#mobile-menu':'header nav[aria-label="Основная навигация"]';assert.deepEqual(await page.locator(nav+' a').evaluateAll(es=>es.map(e=>e.getAttribute('href'))),expected);assert.equal(await page.locator(nav+' a[aria-current="page"]').getAttribute('href'),route);if(width<1024)await page.locator('#mobile-menu-toggle').click();await page.locator(nav+' a[href="'+target+'"]').click();await page.waitForURL('http://localhost:5500'+target);if(target.includes('#'))await page.locator(target.slice(1)).waitFor();checks++;}
await page.close();}
const home=await browser.newPage();await home.goto('http://localhost:5500/');await home.locator('footer').waitFor();
for(const service of ['/avtomatizaciya-excel','/seo']){assert.equal(await home.locator('#directions a[href="'+service+'"]').count(),1);assert.equal(await home.locator('footer a[href="'+service+'"]').count(),1);}
await home.close();
const page=await browser.newPage();await page.route('**/partials/**',r=>r.fulfill({status:500,body:'error'}));const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:5500/');await page.locator('#pill-bots').click();await page.locator('#inspector-bots').waitFor();assert.deepEqual(errors,[]);console.log('PASS: '+checks+' navigation clicks, current page indicators, fetch failure isolation');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
