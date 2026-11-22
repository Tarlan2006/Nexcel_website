const fs = require('node:fs');
const path = require('node:path');
const schema = require('../../schemas/nav.schema.json');

const SITE = 'https://nexcel.kz';
const asLink = item => ({ label: item.label, href: item.href,
  ...(item.children ? { children: item.children.map(asLink) } : {}) });
const flattenLinks = items => items.flatMap(item => [item, ...flattenLinks(item.children || [])]);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const localHref = href => {
  const url = new URL(href);
  return url.origin === SITE ? url.pathname + url.search + url.hash : href;
};

const officeAddress = contacts => contacts.officeAddress || (contacts.addressLines
  ? 'Казахстан, г. ' + contacts.addressLines.slice(0, 2).map(line => line.ru).join(', ')
  : '');

function navigationFromSource(source) {
  const { footer, contacts } = source;
  const address = officeAddress(contacts);
  return {
    version: source.version, updatedAt: source.updatedAt, logo: source.logo,
    nav: [...source.services, ...source.headerPages.map(id => source.pages[id])].map(asLink),
    cta: source.cta,
    footer: {
      columns: [
        { title: source.servicesTitle, links: source.services.map(item => asLink({ ...item, label: item.footerLabel || item.label })) },
        { title: footer.companyTitle, links: source.footerPages.map(id => asLink(source.pages[id])) }
      ],
      contacts: { title: contacts.title, location: contacts.location, email: contacts.email, phone: contacts.phone,
        whatsapp: { label: { ru: contacts.phone, kk: '' }, href: contacts.whatsapp }, ...(contacts.map ? { map: contacts.map } : {}) },
      social: source.social.map(({ id, label, title, href }) => ({ id, label, title, href })),
      legal: footer.company + ' БИН: ' + footer.businessId + (address ? ' Адрес: ' + address : ''),
      description: footer.description, about: { label: footer.aboutLabel, href: source.pages.about.href },
      badges: footer.badges, socialTitle: source.socialTitle,
      copyright: footer.copyright, privacy: asLink(source.pages.privacy), paymentTerms: footer.paymentTerms, logoRights: footer.logoRights
    }
  };
}

function validateNavigation(nav) {
  // Dependency-free execution of the JSON Schema keywords used by our v1 schema.
  function shape(value, rule, field) {
    if (rule.$ref) {
      const target = rule.$ref.slice(2).split('/').reduce((item, key) => item[key], schema);
      return shape(value, target, field);
    }
    const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    if (rule.type && type !== rule.type) throw new Error(field + ': schema expects ' + rule.type);
    if (Object.hasOwn(rule, 'const') && value !== rule.const) throw new Error(field + ': unsupported schema version');
    if (type === 'string') {
      if (value.length < (rule.minLength || 0) || rule.pattern && !new RegExp(rule.pattern).test(value)) throw new Error(field + ': string does not match schema');
    } else if (type === 'object') {
      for (const key of rule.required || []) if (!Object.hasOwn(value, key)) throw new Error(field + '.' + key + ': required by schema');
      for (const [key, item] of Object.entries(value)) {
        if (rule.properties?.[key]) shape(item, rule.properties[key], field + '.' + key);
        else if (rule.additionalProperties === false) throw new Error(field + '.' + key + ': unknown schema field');
      }
    } else if (type === 'array') {
      if (value.length < (rule.minItems || 0)) throw new Error(field + ': too few items');
      if (rule.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) throw new Error(field + ': duplicate items');
      value.forEach((item, index) => shape(item, rule.items, field + '[' + index + ']'));
    }
  }
  shape(nav, schema, 'nav.json');
  const fail = (condition, field, message) => { if (!condition) throw new Error(field + ': ' + message); };
  const object = (value, field) => fail(value && typeof value === 'object' && !Array.isArray(value), field, 'ожидается объект');
  const text = (value, field) => fail(typeof value === 'string' && value.trim().length > 0, field, 'обязательная непустая строка');
  const label = (value, field) => {
    object(value, field); text(value.ru, field + '.ru');
    fail(typeof value.kk === 'string', field + '.kk', 'обязательная строка; без перевода оставьте пустой');
    fail(Object.keys(value).every(key => ['ru','kk'].includes(key)), field, 'допустимы только ru и kk');
  };
  const https = (value, field) => {
    text(value, field);
    let url;
    try { url = new URL(value); } catch { throw new Error(field + ': требуется абсолютный HTTPS URL'); }
    fail(/^https:\/\//.test(value) && value.trim() === value && url.protocol === 'https:' && !url.username && !url.password,
      field, 'требуется абсолютный HTTPS URL без логина и пароля');
    return url;
  };
  const link = (value, field) => { object(value, field); label(value.label, field + '.label'); https(value.href, field + '.href'); };
  const links = (values, field, seen = new Set()) => {
    fail(Array.isArray(values) && values.length > 0, field, 'ожидается непустой массив');
    values.forEach((value, index) => {
      link(value, field + '[' + index + ']');
      const url = new URL(value.href);
      url.pathname = url.pathname.replace(/\/$/, '') || '/';
      fail(!seen.has(url.href), field + '[' + index + '].href', 'повтор ссылки внутри списка');
      seen.add(url.href);
      if (value.children) links(value.children, field + '[' + index + '].children', seen);
    });
  };
  object(nav, 'nav.json');
  fail(nav.version === 1, 'version', 'поддерживается версия 1');
  text(nav.updatedAt, 'updatedAt');
  fail(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(nav.updatedAt) && Number.isFinite(Date.parse(nav.updatedAt)) &&
    new Date(nav.updatedAt).toISOString() === nav.updatedAt.replace(/Z$/, nav.updatedAt.includes('.') ? 'Z' : '.000Z'), 'updatedAt', 'требуется действительная ISO-дата UTC');
  object(nav.logo, 'logo'); https(nav.logo.href, 'logo.href'); https(nav.logo.src, 'logo.src'); text(nav.logo.alt, 'logo.alt');
  links(nav.nav, 'nav'); link(nav.cta, 'cta');
  object(nav.footer, 'footer');
  fail(Array.isArray(nav.footer.columns) && nav.footer.columns.length > 0, 'footer.columns', 'ожидаются колонки');
  const titles = new Set();
  nav.footer.columns.forEach((column, index) => {
    const key = 'footer.columns[' + index + ']'; object(column, key); label(column.title, key + '.title'); links(column.links, key + '.links');
    fail(!titles.has(column.title.ru), key + '.title', 'повтор колонки'); titles.add(column.title.ru);
  });
  const contacts = nav.footer.contacts;
  object(contacts, 'footer.contacts'); label(contacts.title, 'footer.contacts.title'); label(contacts.location, 'footer.contacts.location');
  text(contacts.email, 'footer.contacts.email');
  fail(/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(contacts.email), 'footer.contacts.email', 'некорректная почта');
  text(contacts.phone, 'footer.contacts.phone'); link(contacts.whatsapp, 'footer.contacts.whatsapp');
  if (contacts.map) link(contacts.map, 'footer.contacts.map');
  links(nav.footer.social, 'footer.social');
  const socialIds = new Set();
  nav.footer.social.forEach((item, index) => {
    fail(typeof item.id === 'string' && /^[a-z][a-z0-9-]*$/.test(item.id), 'footer.social[' + index + '].id', 'некорректный идентификатор');
    fail(!socialIds.has(item.id), 'footer.social[' + index + '].id', 'повтор идентификатора'); socialIds.add(item.id);
    label(item.title, 'footer.social[' + index + '].title');
  });
  text(nav.footer.legal, 'footer.legal');
  for (const field of ['description','socialTitle','copyright','paymentTerms','logoRights']) label(nav.footer[field], 'footer.' + field);
  for (const field of ['about','privacy']) link(nav.footer[field], 'footer.' + field);
  fail(Array.isArray(nav.footer.badges), 'footer.badges', 'ожидается массив');
  nav.footer.badges.forEach((item, index) => label(item, 'footer.badges[' + index + ']'));
  // Inspect every URL field, including future optional fields, before publication.
  function walk(value, field) {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'href' || key === 'src') https(item, field + '.' + key);
      else walk(item, field + '.' + key);
    }
  }
  walk(nav, 'nav.json');
  return nav;
}

const desktopServiceClass = 'block rounded px-3 py-2 hover:bg-paperSecondary hover:text-emeraldAccent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emeraldAccent';
const desktopPageClass = 'rounded py-2 hover:text-emeraldAccent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emeraldAccent';
const mobileClass = 'block rounded px-3 py-2.5 hover:bg-white hover:text-emeraldAccent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emeraldAccent';

function renderArtifacts(source, root) {
  const nav = validateNavigation(navigationFromSource(source));
  const anchor = (item, className, attributes = '') => `<a${attributes} href="${escapeHtml(localHref(item.href))}" class="${className}">${escapeHtml(item.label.ru)}</a>`;
  const services = source.services;
  const primary = source.headerPages.map(id => source.pages[id]);
  const groupLabel = item => 'Решения в разделе ' + item.label.ru;
  function serviceList(items, mobile, parent) {
    return items.map(item => {
      const attributes = (mobile ? '' : ' role="menuitem" tabindex="-1"') +
        (parent ? ` data-section="${escapeHtml(localHref(parent.href))}"` : '');
      const children = item.children ? `<ul${mobile ? '' : ' role="group"'} aria-label="${escapeHtml(groupLabel(item))}" class="ml-3 border-l border-gridBorder pl-2">${serviceList(item.children, mobile, item)}</ul>` : '';
      return `<li${mobile ? '' : ' role="none"'}>${anchor(item, mobile ? mobileClass : desktopServiceClass, attributes)}${children}</li>`;
    }).join('\n');
  }
  const brand = source.logo.alt.split(' ');
  const values = {
    home: escapeHtml(localHref(source.logo.href)), brandFirst: escapeHtml(brand.shift()), brandRest: escapeHtml(brand.join(' ')),
    email: escapeHtml(source.contacts.email), phone: escapeHtml(source.contacts.phone),
    ctaHref: escapeHtml(source.cta.href), ctaLabel: escapeHtml(source.cta.label.ru), servicesTitle: escapeHtml(source.servicesTitle.ru),
    desktopServices: serviceList(services, false),
    mobileServices: '<ul>' + serviceList(services, true) + '</ul>',
    desktopPages: primary.map(item => '        ' + anchor(item, desktopPageClass)).join('\n'),
    mobilePages: primary.map(item => '        ' + anchor(item, mobileClass)).join('\n')
  };
  const artifacts = { 'shared/nav.json': JSON.stringify(nav, null, 2) + '\n' };
  const template = fs.readFileSync(path.join(root, 'src/shared/header.template.html'), 'utf8');
  artifacts['partials/header.html'] = template.replace(/{{(\w+)}}/g, (_match, key) => {
    if (!Object.hasOwn(values, key)) throw new Error('Unknown template field: ' + key);
    return values[key];
  });
  return artifacts;
}

module.exports = { navigationFromSource, validateNavigation, renderArtifacts, localHref, escapeHtml, flattenLinks };
