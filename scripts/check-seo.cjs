// Validate the built documents and print the metadata used in the PR review.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require('@playwright/test');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const site = 'https://nexcel.kz';
const newServices = ['/telegram-boty', '/vnedrenie-ii'];
const services = ['/avtomatizaciya-excel', ...newServices, '/licensing', '/seo'];
const faqCounts = new Map([
  ['/', 5], ['/faq', 12], ['/avtomatizaciya-excel', 6], ...services.slice(1).map(route => [route, 4])
]);
const jargon = /оцифров[\p{L}]*|mini[\p{Pd}\s]erp|инспектор\s+направлений|доказательн[\p{L}]*\s+баз[\p{L}]*/iu;

function gitDate(files) {
  const result = spawnSync('git', ['log', '-1', '--format=%cs', '--', ...files], {
    cwd: root, encoding: 'utf8', windowsHide: true
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

async function getPosts() {
  const folder = path.join(root, 'content', 'news');
  const files = (await fs.readdir(folder)).filter(file => file.endsWith('.json'));
  const posts = await Promise.all(files.map(async file => ({
    ...JSON.parse(await fs.readFile(path.join(folder, file), 'utf8')),
    source: 'content/news/' + file
  })));
  return new Map(posts.filter(post => !post.draft).map(post => ['/news/' + post.slug, post]));
}

function routeFor(file) {
  return file === 'index.html' ? '/' : '/' + file.slice(0, -5);
}

async function inspectHtml(page, html) {
  return page.evaluate(source => {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const clean = text => text.trim().replace(/\s+/g, ' ');
    const attrs = (selector, attr) => [...doc.querySelectorAll(selector)].map(el => el.getAttribute(attr));
    const faqs = [...doc.querySelectorAll('#faq-container button[aria-controls]')].map(button => ({
      name: clean(button.querySelector('span').textContent.replace(/^\d+\.\s*/, '')),
      answer: clean(doc.getElementById(button.getAttribute('aria-controls')).textContent)
    })).concat([...doc.querySelectorAll('#service-faq details')].map(details => ({
      name: clean(details.querySelector('summary').textContent),
      answer: clean(details.querySelector('p').textContent)
    })));
    const entities = [...doc.querySelectorAll('script[type="application/ld+json"]')].flatMap(script => {
      const json = JSON.parse(script.textContent);
      return json['@graph'] || [json];
    });
    const main = doc.querySelector('main');
    const copy = main.cloneNode(true);
    for (const element of copy.querySelectorAll('svg, script, style, template, [hidden], [aria-hidden="true"]')) {
      // FAQ answers hidden until a user opens the question still count as page copy.
      if (!element.matches('.faq-answer')) element.remove();
    }
    const walker = doc.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode.textContent);
    return {
      titles: [...doc.querySelectorAll('title')].map(el => clean(el.textContent)),
      descriptions: attrs('meta[name="description"]', 'content'),
      ogTitles: attrs('meta[property="og:title"]', 'content'),
      ogDescriptions: attrs('meta[property="og:description"]', 'content'),
      canonicals: attrs('link[rel="canonical"]', 'href'),
      hasKeywords: Boolean(doc.querySelector('meta[name="keywords" i]')),
      headings: [...doc.querySelectorAll('h1')].map(el => clean(el.textContent)),
      text: clean(doc.body.textContent),
      words: (textNodes.join(' ').match(/[\p{L}\p{N}]+(?:[-’][\p{L}\p{N}]+)*/gu) || []).length,
      faqs,
      entities,
      links: attrs('a[href]', 'href'),
      nav: ['#desktop-services-menu', '#mobile-services-menu', '#site-footer'].map(selector => attrs(selector + ' a[href]', 'href')),
      ending: [...(main.lastElementChild?.querySelectorAll('a[href]') || [])].map(link => ({
        href: link.getAttribute('href'), text: clean(link.textContent)
      }))
    };
  }, html);
}

async function run() {
  const posts = await getPosts();
  const rootFiles = (await fs.readdir(dist)).filter(file => file.endsWith('.html')).sort();
  const newsFiles = (await fs.readdir(path.join(dist, 'news'))).filter(file => file.endsWith('.html')).sort();
  const files = rootFiles.concat(newsFiles.map(file => 'news/' + file));
  const llms = await fs.readFile(path.join(dist, 'llms.txt'), 'utf8');
  const xml = await fs.readFile(path.join(dist, 'sitemap.xml'), 'utf8');
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
  const report = [];
  try {
    const page = await browser.newPage();
    await page.route('**/*', request => request.abort());
    const sitemap = new Map(await page.evaluate(source => {
      const doc = new DOMParser().parseFromString(source, 'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('Invalid sitemap XML');
      const entries = [...doc.querySelectorAll('url')].map(entry => [
        entry.querySelector('loc').textContent, entry.querySelector('lastmod')?.textContent || ''
      ]);
      if (new Set(entries.map(([loc]) => loc)).size !== entries.length) throw new Error('Duplicate sitemap URL');
      return entries;
    }, xml));
    assert.deepEqual([...sitemap.keys()].sort(), files.map(routeFor).filter(route => route !== '/404').map(route => site + route).sort(), 'sitemap covers the indexable pages');
    assert.doesNotMatch(llms, jargon, 'llms.txt: jargon');
    for (const file of files) {
      const route = routeFor(file);
      const html = await fs.readFile(path.join(dist, file), 'utf8');
      const data = await inspectHtml(page, html);
      assert.equal(data.headings.length, 1, route + ': H1 count');
      assert.ok(data.headings[0], route + ': H1 text');
      assert.equal(data.titles.length, 1, route + ': title count');
      assert.equal(data.descriptions.length, 1, route + ': description count');
      const [title] = data.titles;
      const [description] = data.descriptions;
      assert.ok(title.endsWith(' | Nexcel') && [...title].length <= 60, route + ': title limit (' + [...title].length + ')');
      assert.ok(description && [...description].length <= 160, route + ': description limit (' + [...(description || '')].length + ')');
      assert.deepEqual(data.ogTitles, [title], route + ': Open Graph title');
      assert.deepEqual(data.ogDescriptions, [description], route + ': Open Graph description');
      assert.equal(data.hasKeywords, false, route + ': meta keywords');
      assert.doesNotMatch([title, description, data.text, JSON.stringify(data.entities)].join(' '), jargon, route + ': jargon');
      assert.doesNotMatch(html, /⚠|\bTODO\b/, route + ': unpublished notes');
      assert.ok(!data.links.some(link => ['/#direction-bots', '/#direction-ai', '/sozdanie-sajtov'].includes(link)), route + ': stale or unconfirmed links');

      if (route !== '/404') {
        assert.deepEqual(data.canonicals, [site + route], route + ': canonical');
        if (route !== '/') {
          const crumb = data.entities.find(entity => entity['@type'] === 'BreadcrumbList');
          assert.ok(crumb, route + ': BreadcrumbList');
          assert.equal(crumb.itemListElement[0].item, site + '/');
          assert.equal(crumb.itemListElement.at(-1).item, site + route);
        }
        const sources = route === '/news'
          ? ['scripts/build-news.cjs', 'scripts/news-templates.cjs', ...[...posts.values()].map(post => post.source)]
          : [posts.get(route)?.source || file];
        const lastmod = gitDate(sources);
        if (lastmod) assert.equal(sitemap.get(site + route), lastmod, route + ': lastmod from Git');
      }

      if (faqCounts.has(route)) {
        assert.equal(data.faqs.length, faqCounts.get(route), route + ': visible FAQ count');
        const faq = data.entities.find(entity => entity['@type'] === 'FAQPage');
        assert.ok(faq, route + ': FAQPage');
        assert.deepEqual(faq.mainEntity.map(item => ({
          name: item.name, answer: item.acceptedAnswer.text
        })), data.faqs, route + ': FAQPage matches visible text');
      }
      if (services.includes(route)) {
        assert.ok(data.entities.some(entity => entity['@type'] === 'Service'), route + ': Service schema');
        assert.ok(data.ending.some(link => link.href.startsWith('https://wa.me/77711369095') &&
          link.text === 'Обсудить задачу в WhatsApp'), route + ': final WhatsApp CTA');
        const related = data.ending.filter(link => services.includes(link.href));
        const cases = data.ending.filter(link => link.href.startsWith('/news/') || link.href === '/#case-marathons');
        assert.ok(related.length >= 1 && related.length <= 2, route + ': 1–2 related services');
        assert.ok(cases.length >= 1 && cases.length <= 2, route + ': 1–2 case links');
      }
      if (route === '/') {
        const org = data.entities.find(entity => entity['@type'] === 'ProfessionalService');
        const offers = org.hasOfferCatalog.itemListElement.map(offer => offer.itemOffered.url).sort();
        assert.deepEqual(offers, services.map(service => site + service).sort(), 'OfferCatalog service URLs');
        for (const service of newServices) {
          assert.ok(data.nav.every(links => links.includes(service)), service + ': header, mobile and footer');
          assert.ok(llms.includes('(' + site + service + ')'), service + ': llms.txt link');
        }
      }
      if (newServices.includes(route)) assert.ok(data.words >= 450, route + ': ' + data.words + ' words');
      report.push({ route, title, description, h1: data.headings[0], words: data.words });
    }
  } finally {
    await browser.close();
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else console.log('PASS SEO: ' + report.length + ' pages, metadata, FAQ, breadcrumbs, navigation and sitemap. ' +
    report.filter(page => newServices.includes(page.route)).map(page => page.route + ': ' + page.words + ' words').join(', '));
}

run().catch(error => { console.error(error); process.exitCode = 1; });
