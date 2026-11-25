// Single vendor registry (content/vendors.json) -> cards on /licensing and the marquee on the home page.
// The generated blocks live in the source HTML between marker comments, so the dev server shows them too.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const registryFile = path.join(root, 'content', 'vendors.json');
const targets = [
  { file: 'licensing.html', marker: 'CARDS', render: renderCards, indent: '        ' },
  { file: 'index.html', marker: 'CAROUSEL', render: renderCarousel, indent: '            ' }
];

const escapeHtml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emeraldAccent';

function loadRegistry() {
  const data = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
  if (!data.partnerLabel || typeof data.partnerLabel !== 'string') throw new Error('vendors.json: partnerLabel is required');
  if (!Array.isArray(data.vendors)) throw new Error('vendors.json: vendors must be an array');
  const vendors = data.vendors
    .filter(vendor => vendor.enabled !== false)
    .map(vendor => ({ ...vendor, showInCarousel: vendor.showInCarousel !== false }))
    .sort((a, b) => a.order - b.order);
  return { partnerLabel: data.partnerLabel, vendors };
}

function logoMarkup(vendor, { alt, hideCaption }) {
  const { logo } = vendor;
  if (logo.type === 'text') return `<span class="font-heading font-extrabold text-3xl text-darkBg">${escapeHtml(logo.text)}</span>`;
  const img = `<img${logo.imgClass ? ` class="${escapeHtml(logo.imgClass)}"` : ''} src="${escapeHtml(logo.src)}" alt="${escapeHtml(alt)}" width="${logo.width}" height="${logo.height}" loading="lazy" decoding="async" draggable="false" />`;
  if (!logo.caption) return img;
  return `${img}\n<span${hideCaption ? ' aria-hidden="true"' : ''} class="font-heading font-extrabold text-2xl text-darkBg">${escapeHtml(logo.caption)}</span>`;
}

function logoClasses(vendor, extra = '') {
  return ['partner-logo', vendor.logoClass, vendor.logo.caption ? 'gap-3' : '', extra].filter(Boolean).join(' ');
}

function renderCard(vendor, partnerLabel) {
  const links = [];
  if (vendor.siteUrl) links.push(`<a href="${escapeHtml(vendor.siteUrl)}" target="_blank" rel="noopener noreferrer" class="text-sm font-semibold text-emeraldAccent underline underline-offset-4 ${focus}">Сайт ${escapeHtml(vendor.name)} ↗</a>`);
  if (vendor.pageUrl) links.push(`<a href="${escapeHtml(vendor.pageUrl)}" aria-label="Подробнее о ${escapeHtml(vendor.name)}" class="text-sm font-semibold text-emeraldAccent underline underline-offset-4 ${focus}">Подробнее</a>`);
  links.push(`<a href="https://wa.me/77711369095" class="motion-button inline-flex items-center justify-center px-5 py-3 rounded bg-emeraldAccent hover:bg-emeraldHover text-white text-sm font-semibold transition-colors ${focus}">Запросить КП</a>`);
  return [
    `<article id="partner-${escapeHtml(vendor.id)}" data-card-reveal class="motion-card min-w-0 bg-white border border-gridBorder rounded-xl p-5 sm:p-8 flex flex-col gap-5 hover:border-emeraldAccent transition-all">`,
    `  <div class="${escapeHtml(logoClasses(vendor))}">${logoMarkup(vendor, { alt: vendor.logo.alt || vendor.name, hideCaption: true })}</div>`,
    `  <div class="space-y-2">`,
    `    <p class="inline-flex w-fit rounded-full bg-emeraldLight px-3 py-1 text-xs font-semibold text-emeraldAccent">${escapeHtml(partnerLabel)}</p>`,
    `    <h3 class="font-mono text-xs uppercase tracking-wider text-textMuted">${escapeHtml(vendor.category)}</h3>`,
    `    <p class="text-sm leading-relaxed text-textMuted">${escapeHtml(vendor.description)}</p>`,
    `  </div>`,
    `  <div class="space-y-2">`,
    `    <h4 class="text-sm font-semibold text-darkBg">Что делаем мы</h4>`,
    `    <ul class="list-disc pl-5 space-y-2 text-sm text-textMuted">`,
    ...vendor.bullets.map(bullet => `      <li>${escapeHtml(bullet)}</li>`),
    `    </ul>`,
    `  </div>`,
    `  <div class="mt-auto flex flex-wrap items-center gap-4">`,
    ...links.map(link => `    ${link}`),
    `  </div>`,
    `</article>`
  ].join('\n');
}

function renderCards() {
  const { partnerLabel, vendors } = loadRegistry();
  return [
    '<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 sm:gap-8">',
    ...vendors.map(vendor => renderCard(vendor, partnerLabel).split('\n').map(line => '  ' + line).join('\n')),
    '</div>'
  ].join('\n');
}

function renderCarousel() {
  const { vendors } = loadRegistry();
  const items = vendors.filter(vendor => vendor.showInCarousel);
  // Text next to an icon already names the vendor, so the icon stays decorative in the visible copy.
  const group = visible => items.map(vendor => {
    const alt = visible && !vendor.logo.caption ? vendor.logo.alt || vendor.name : '';
    return [`<li class="${escapeHtml(logoClasses(vendor, 'shrink-0'))}" data-vendor="${escapeHtml(vendor.id)}">`, `  ${logoMarkup(vendor, { alt, hideCaption: false }).replace(/\n/g, '\n  ')}`, '</li>'].join('\n');
  }).map(item => item.split('\n').map(line => '  ' + line).join('\n')).join('\n');
  return [
    '<ul class="partner-marquee-group" role="list">', group(true), '</ul>',
    '<ul class="partner-marquee-group" aria-hidden="true">', group(false), '</ul>'
  ].join('\n');
}

function markerPattern(name) {
  return new RegExp(`(<!-- VENDORS:${name} -->)[\\s\\S]*?(<!-- /VENDORS:${name} -->)`);
}

function applyMarker(html, name, rendered, indent) {
  const pattern = markerPattern(name);
  if (!pattern.test(html)) throw new Error(`Missing <!-- VENDORS:${name} --> markers`);
  const body = rendered.split('\n').map(line => (line ? indent + line : line)).join('\n');
  return html.replace(pattern, (_, open, close) => `${open}\n${body}\n${indent}${close}`);
}

// Rewrites (or with { check: true } only verifies) the generated blocks in the source pages.
function syncSources({ check = false } = {}) {
  const stale = [];
  for (const target of targets) {
    const file = path.join(root, target.file);
    const original = fs.readFileSync(file, 'utf8');
    const next = applyMarker(original, target.marker, target.render(), target.indent);
    if (next !== original) {
      stale.push(target.file);
      if (!check) fs.writeFileSync(file, next);
    }
  }
  return stale;
}

module.exports = { loadRegistry, renderCards, renderCarousel, syncSources, targets, root };

if (require.main === module) {
  const check = process.argv.includes('--check');
  const stale = syncSources({ check });
  if (check && stale.length) {
    console.error('Vendor blocks are out of date: ' + stale.join(', ') + '. Run: npm run generate:vendors');
    process.exit(1);
  }
  console.log(check ? 'Vendor blocks are up to date' : stale.length ? 'Vendor blocks updated: ' + stale.join(', ') : 'Vendor blocks already up to date');
}
