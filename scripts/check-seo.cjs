// Validate the built documents and print the metadata used in the PR review.
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require('@playwright/test');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const site = 'https://nexcel.kz';
const organizationId = site + '/#organization';
const articleOrganization = { '@id': organizationId, '@type': 'Organization', name: 'Nexcel Solutions' };
const organizationRef = { ...articleOrganization, url: site + '/' };
const organizationPages = new Set(['/', '/o-kompanii']);
const newServices = ['/telegram-boty', '/vnedrenie-ii'];
const websiteService = '/sozdanie-saitov';
const companyServices = ['/avtomatizaciya-excel', ...newServices, '/licensing', '/seo'];
const services = [...companyServices, websiteService];
const faqCounts = new Map([
  ['/', 5], ['/faq', 12], ['/o-kompanii', 3], ['/avtomatizaciya-excel', 6],
  ...newServices.map(route => [route, 4]), ['/licensing', 4], ['/seo', 7], [websiteService, 7]
]);
const jargon = /оцифров[\p{L}]*|mini[\p{Pd}\s]erp|инспектор\s+направлений|доказательн[\p{L}]*\s+баз[\p{L}]*/iu;

function gitText(...args) {
  const result = spawnSync('git', args, {
    cwd: root, encoding: 'utf8', windowsHide: true
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

async function getPosts() {
  const folder = path.join(root, 'content', 'news');
  const files = (await fs.readdir(folder)).filter(file => file.endsWith('.json'));
  const posts = await Promise.all(files.map(async file => JSON.parse(await fs.readFile(path.join(folder, file), 'utf8'))));
  return new Map(posts.filter(post => !post.draft).map(post => ['/news/' + post.slug, post]));
}

function routeFor(file) {
  return file === 'index.html' ? '/' : '/' + file.slice(0, -5);
}

function* schemaNodes(value) {
  if (!value || typeof value !== 'object') return;
  if (!Array.isArray(value)) yield value;
  for (const child of Object.values(value)) yield* schemaNodes(child);
}

async function inspectHtml(page, html) {
  return page.evaluate(source => {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const clean = text => text.trim().replace(/\s+/g, ' ');
    const attrs = (selector, attr) => [...doc.querySelectorAll(selector)].map(el => el.getAttribute(attr));
    const faqs = [...doc.querySelectorAll('#faq-container button[aria-controls]')].map(button => ({
      name: clean(button.querySelector('span').textContent.replace(/^\d+\.\s*/, '')),
      answer: clean(doc.getElementById(button.getAttribute('aria-controls')).textContent)
    })).concat([...doc.querySelectorAll('#service-faq details, #company-faq details')].map(details => ({
      name: clean(details.querySelector('summary').textContent),
      answer: clean(details.querySelector('p').textContent)
    })));
    const schemas = [...doc.querySelectorAll('script[type="application/ld+json"]')]
      .map(script => JSON.parse(script.textContent));
    const main = doc.querySelector('main');
    const copy = main.cloneNode(true);
    for (const element of copy.querySelectorAll('svg, script, style, template, [hidden], [aria-hidden="true"]')) {
      // FAQ answers hidden until a user opens the question still count as page copy.
      if (!element.matches('.faq-answer')) element.remove();
    }
    // Count the About page's prose separately from its diagram and step labels.
    for (const element of copy.querySelectorAll('#scheme-flow, #work-steps')) element.remove();
    const walker = doc.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode.textContent);
    return {
      titles: [...doc.querySelectorAll('title')].map(el => clean(el.textContent)),
      descriptions: attrs('meta[name="description"]', 'content'),
      ogTitles: attrs('meta[property="og:title"]', 'content'),
      ogDescriptions: attrs('meta[property="og:description"]', 'content'),
      twitterTitles: attrs('meta[name="twitter:title"]', 'content'),
      twitterDescriptions: attrs('meta[name="twitter:description"]', 'content'),
      ogSiteNames: attrs('meta[property="og:site_name"]', 'content'),
      canonicals: attrs('link[rel="canonical"]', 'href'),
      robots: attrs('meta[name="robots"]', 'content'),
      hasKeywords: Boolean(doc.querySelector('meta[name="keywords" i]')),
      headings: [...doc.querySelectorAll('h1')].map(el => clean(el.textContent)),
      text: clean(doc.body.textContent),
      words: (textNodes.join(' ').match(/[\p{L}\p{N}]+(?:[-’][\p{L}\p{N}]+)*/gu) || []).length,
      faqs,
      schemas,
      links: attrs('a[href]', 'href'),
      mainLinks: attrs('main a[href]', 'href'),
      ids: attrs('[id]', 'id'),
      nav: ['[data-desktop-group]', '[data-mobile-group]', '#site-footer'].map(selector => attrs(selector + ' a[href]', 'href')),
      ending: [...(main.lastElementChild?.querySelectorAll('a[href]') || [])].map(link => ({
        href: link.getAttribute('href'), text: clean(link.textContent)
      }))
    };
  }, html);
}

async function run() {
  const posts = await getPosts();
  const pageDates = JSON.parse(await fs.readFile(path.join(root, 'content', 'lastmod.json'), 'utf8'));
  const hasHistory = existsSync(path.join(root, '.git')) && gitText('rev-parse', '--is-shallow-repository') === 'false';
  const latestPostDate = [...posts.values()].map(post => post.updated || post.date).sort().at(-1);
  const rootFiles = (await fs.readdir(dist)).filter(file => file.endsWith('.html')).sort();
  const newsFiles = (await fs.readdir(path.join(dist, 'news'))).filter(file => file.endsWith('.html')).sort();
  const files = rootFiles.concat(newsFiles.map(file => 'news/' + file));
  const llms = await fs.readFile(path.join(dist, 'llms.txt'), 'utf8');
  const xml = await fs.readFile(path.join(dist, 'sitemap.xml'), 'utf8');
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
  const report = [];
  const schemaIds = new Set();
  const schemaReferences = [];
  const seenTitles = new Set();
  const seenDescriptions = new Set();
  let homeOrganization;
  let aboutOrganization;
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
    assert.ok(llms.includes('[О компании Nexcel Solutions](' + site + '/o-kompanii)'), 'llms.txt: company page link');
    const pagesByRoute = new Map();
    const publicLinks = [];
    for (const file of files) {
      const route = routeFor(file);
      const html = await fs.readFile(path.join(dist, file), 'utf8');
      const data = await inspectHtml(page, html);
      pagesByRoute.set(route, new Set(data.ids));
      for (const href of data.links) {
        const url = new URL(href, site + route);
        if (url.origin === site) publicLinks.push({ route, href, url });
      }
      const entities = data.schemas.flatMap(schema => schema['@graph'] || schema);
      const organizationNodes = [];
      for (const node of schemaNodes(data.schemas)) {
        const id = node['@id'];
        const types = [node['@type']].flat();
        if (types.includes('Organization') || types.includes('ProfessionalService')) {
          assert.ok(typeof id === 'string' && id.trim(), route + ': organization node missing @id');
        }
        if (id === organizationId) {
          assert.equal(node.name, organizationRef.name, route + ': organization reference name');
          organizationNodes.push(node);
        }
        if (typeof id !== 'string') continue;
        if (Object.keys(node).length === 1 || (id === organizationId && !organizationPages.has(route))) {
          schemaReferences.push({ route, id });
        } else {
          schemaIds.add(id);
        }
      }
      if (posts.has(route)) {
        const article = entities.find(entity => entity['@type'] === 'Article');
        assert.deepEqual(article?.author, articleOrganization, route + ': article author');
        assert.deepEqual(article?.publisher, articleOrganization, route + ': article publisher');
        assert.equal(organizationNodes.length, 2, route + ': organization references');
      } else if (!organizationPages.has(route)) {
        const expected = route === '/licensing' ? [organizationRef, organizationRef] : [organizationRef];
        assert.deepEqual(organizationNodes, expected, route + ': organization references');
      }
      assert.equal(data.headings.length, 1, route + ': H1 count');
      assert.ok(data.headings[0], route + ': H1 text');
      assert.equal(data.titles.length, 1, route + ': title count');
      assert.equal(data.descriptions.length, 1, route + ': description count');
      const [title] = data.titles;
      const [description] = data.descriptions;
      assert.match(title, /^[^|]+ \| Nexcel Solutions$/, route + ': title format');
      assert.doesNotMatch(title, /^(?:главная|home|добро пожаловать)(?:[\s:|]|$)/iu, route + ': title introduction');
      if (route === '/') assert.equal(title, 'Автоматизация бизнеса и лицензии ПО в Казахстане | Nexcel Solutions');
      assert.ok(!seenTitles.has(title), route + ': duplicate title');
      seenTitles.add(title);
      assert.ok(description && [...description].length >= 140 && [...description].length <= 160, route + ': description length (' + [...(description || '')].length + ')');
      assert.ok(!seenDescriptions.has(description), route + ': duplicate description');
      seenDescriptions.add(description);
      assert.deepEqual(data.ogTitles, [title], route + ': Open Graph title');
      assert.deepEqual(data.ogDescriptions, [description], route + ': Open Graph description');
      if (route !== '/404') {
        assert.deepEqual(data.twitterTitles, [title], route + ': Twitter title');
        assert.deepEqual(data.twitterDescriptions, [description], route + ': Twitter description');
      }
      assert.deepEqual(data.ogSiteNames, ['Nexcel Solutions'], route + ': Open Graph site name');
      assert.equal(data.hasKeywords, false, route + ': meta keywords');
      assert.doesNotMatch([title, description, data.text, JSON.stringify(entities)].join(' '), jargon, route + ': jargon');
      assert.doesNotMatch(html, /⚠|\bTODO\b|lorem\s+ipsum|example\.invalid/i, route + ': unpublished notes');
      assert.ok(!data.links.some(link => /^(?:#|javascript:.*)?$/i.test(link.trim())), route + ': empty or placeholder links');
      assert.deepEqual(data.canonicals, [site + route], route + ': canonical');
      if (route === '/404') assert.deepEqual(data.robots, ['noindex'], route + ': noindex');
      assert.ok(!data.links.some(link => ['/#direction-bots', '/#direction-ai', '/sozdanie-sajtov'].includes(link)), route + ': stale or unconfirmed links');

      if (route !== '/404') {
        if (route !== '/') {
          const crumb = entities.find(entity => entity['@type'] === 'BreadcrumbList');
          assert.ok(crumb, route + ': BreadcrumbList');
          assert.equal(crumb.itemListElement[0].item, site + '/');
          assert.equal(crumb.itemListElement.at(-1).item, site + route);
        }
        const post = posts.get(route);
        const lastmod = post ? post.updated || post.date : route === '/news' ? latestPostDate : pageDates[file];
        assert.match(lastmod, /^\d{4}-\d{2}-\d{2}$/, route + ': lastmod format');
        assert.equal(sitemap.get(site + route), lastmod, route + ': sitemap lastmod');
        if (hasHistory && !post && route !== '/news') {
          const sourceDate = gitText('log', '-1', '--format=%cs', '--', file);
          if (sourceDate) assert.equal(lastmod, sourceDate, route + ': page date matches Git');
        }
      }

      if (faqCounts.has(route)) {
        assert.equal(data.faqs.length, faqCounts.get(route), route + ': visible FAQ count');
        const faq = entities.find(entity => entity['@type'] === 'FAQPage');
        assert.ok(faq, route + ': FAQPage');
        assert.deepEqual(faq.mainEntity.map(item => ({
          name: item.name, answer: item.acceptedAnswer.text
        })), data.faqs, route + ': FAQPage matches visible text');
      }
      if (route === '/o-kompanii') {
        const about = entities.find(entity => entity['@type'] === 'AboutPage');
        aboutOrganization = about?.mainEntity;
        assert.deepEqual(organizationNodes, [aboutOrganization], route + ': AboutPage main entity');
        assert.ok(data.words >= 350 && data.words <= 500, route + ': ' + data.words + ' words');
        assert.ok([...companyServices, '/news'].every(link => data.mainLinks.includes(link)), route + ': service and case links');
      }
      if (services.includes(route)) {
        const service = entities.find(entity => entity['@type'] === 'Service');
        assert.deepEqual(service?.provider, organizationRef, route + ': Service provider');
        if (route === '/licensing') {
          assert.deepEqual(service.offers?.seller, organizationRef, route + ': Offer seller');
        }
        assert.ok(data.ending.some(link => link.href.startsWith('https://wa.me/77711369095') &&
          link.text === 'Обсудить задачу в WhatsApp'), route + ': final WhatsApp CTA');
        if (route === websiteService) {
          assert.ok(data.mainLinks.includes('/seo'), route + ': link to the SEO service');
        } else {
          const related = data.ending.filter(link => services.includes(link.href));
          const cases = data.ending.filter(link => link.href.startsWith('/news/') || link.href === '/#case-marathons');
          assert.ok(related.length >= 1 && related.length <= 2, route + ': 1–2 related services');
          assert.ok(cases.length >= 1 && cases.length <= 2, route + ': 1–2 case links');
        }
      }
      if (route === '/') {
        const org = entities.find(entity => entity['@type'] === 'ProfessionalService');
        assert.deepEqual(organizationNodes, [org], 'homepage organization definition');
        assert.equal(org.url, site + '/');
        homeOrganization = org;
        const offers = org.hasOfferCatalog.itemListElement.map(offer => offer.itemOffered.url).sort();
        assert.deepEqual(offers, services.map(service => site + service).sort(), 'OfferCatalog service URLs');
        for (const service of [...newServices, websiteService]) {
          assert.ok(data.nav.every(links => links.includes(service)), service + ': header, mobile and footer');
          assert.ok(llms.includes('(' + site + service + ')'), service + ': llms.txt link');
        }
      }
      if (newServices.includes(route)) assert.ok(data.words >= 450, route + ': ' + data.words + ' words');
      report.push({ route, title, description, h1: data.headings[0], words: data.words });
    }
    for (const { route, href, url } of publicLinks) {
      const target = url.pathname.replace(/\/$/, '') || '/';
      const ids = pagesByRoute.get(target);
      assert.ok(ids || (await fs.stat(path.join(dist, target)).catch(() => null))?.isFile(), route + ': missing link target ' + href);
      if (ids && url.hash) assert.ok(ids.has(decodeURIComponent(url.hash.slice(1))), route + ': missing anchor ' + href);
    }
    const { legalName, identifier, taxID, hasOfferCatalog, ...sharedOrganization } = homeOrganization;
    const companyOfferCatalog = {
      ...hasOfferCatalog,
      itemListElement: hasOfferCatalog.itemListElement.filter(offer => offer.itemOffered.url !== site + websiteService)
    };
    assert.deepEqual(aboutOrganization, { ...sharedOrganization, hasOfferCatalog: companyOfferCatalog },
      'Shared organization fields on / and /o-kompanii must match');
    for (const { route, id } of schemaReferences) {
      assert.ok(schemaIds.has(id), route + ': undefined JSON-LD reference ' + id);
    }
  } finally {
    await browser.close();
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else console.log('PASS SEO: ' + report.length + ' pages, metadata, FAQ, breadcrumbs, navigation and sitemap. ' +
    report.filter(page => newServices.includes(page.route) || page.route === '/o-kompanii').map(page => page.route + ': ' + page.words + ' words').join(', '));
}

run().catch(error => { console.error(error); process.exitCode = 1; });
