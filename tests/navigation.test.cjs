const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { navigationFromSource, validateNavigation, renderArtifacts } = require('../scripts/lib/navigation.cjs');
const source = require('../content/navigation.json');
const root = path.resolve(__dirname, '..');
const navigation = () => structuredClone(navigationFromSource(source));

test('public schema has all canonical links, real logo and no invented KZ translation', () => {
  const nav = validateNavigation(navigation());
  assert.equal(nav.nav.length, source.services.length + source.headerPages.length + 1);
  assert.ok(nav.nav.some(item => item.href === 'https://photo.nexcel.kz/' && item.label.ru === 'Фото на документы'));
  assert.ok(nav.nav.some(item => item.href === 'https://nexcel.kz/sozdanie-saitov'));
  assert.equal(nav.logo.src, 'https://nexcel.kz/assets/logo.svg');
  function labels(value) {
    if (!value || typeof value !== 'object') return;
    if ('ru' in value) { assert.ok(value.ru.trim()); assert.equal(value.kk, ''); }
    for (const item of Object.values(value)) labels(item);
  }
  labels(nav);
});

test('one new service reaches JSON, desktop, mobile and footer, with escaped labels', () => {
  const changed = structuredClone(source);
  changed.services.push({ id:'example',label:{ru:'Тест <новой> & "услуги"',kk:''},href:'https://nexcel.kz/example' });
  const artifacts = renderArtifacts(changed, root), nav = JSON.parse(artifacts['shared/nav.json']);
  assert.equal(nav.nav.filter(item => item.href === 'https://nexcel.kz/example').length,1);
  assert.equal(nav.footer.columns[0].links.filter(item => item.href === 'https://nexcel.kz/example').length,1);
  assert.equal(artifacts['partials/header.html'].match(/href="\/example"/g).length,2);
  assert.equal(artifacts['partials/footer.html'].match(/href="\/example"/g).length,1);
  assert.ok(artifacts['partials/header.html'].includes('Тест &lt;новой&gt; &amp; &quot;услуги&quot;'));
});

test('schema rejects missing labels, invalid dates, wrong types and extra fields', () => {
  const cases = [
    nav => { delete nav.nav[0].label.ru; }, nav => { nav.nav[0].label.ru='  '; },
    nav => { delete nav.nav[0].label.kk; }, nav => { nav.updatedAt='2026-02-30T00:00:00.000Z'; },
    nav => { nav.footer.columns={}; }, nav => { nav.footer.columns[0].title=null; },
    nav => { nav.version=2; }, nav => { nav.extra='unversioned'; }
  ];
  for (const mutate of cases) { const nav=navigation();mutate(nav);assert.throws(()=>validateNavigation(nav)); }
});

test('all href and logo URLs require absolute HTTPS without embedded credentials', () => {
  for (const href of ['/relative','http://nexcel.kz/','javascript:alert(1)','//nexcel.kz/','https://user:pass@nexcel.kz/',' https://nexcel.kz/']) {
    const nav=navigation();nav.nav[0].href=href;assert.throws(()=>validateNavigation(nav));
  }
  const nav=navigation();nav.logo.src='/assets/logo.svg';assert.throws(()=>validateNavigation(nav));
});

test('duplicates are rejected per list while intentional menu/footer reuse is allowed', () => {
  assert.doesNotThrow(()=>validateNavigation(navigation()));
  for (const select of [nav=>nav.nav,nav=>nav.footer.columns[0].links,nav=>nav.footer.social]) {
    const nav=navigation(),items=select(nav);items.push({...items[0],label:{ru:'Другая подпись',kk:''}});
    assert.throws(()=>validateNavigation(nav),/повтор|duplicate/);
  }
  const nav=navigation();nav.nav.push({...nav.nav[0],href:nav.nav[0].href+'/'});assert.throws(()=>validateNavigation(nav),/повтор/);
});

test('generated artifacts are deterministic and committed copies are current', () => {
  const artifacts=renderArtifacts(source,root);
  assert.deepEqual(artifacts,renderArtifacts(source,root));
  for (const [file,content] of Object.entries(artifacts)) assert.equal(fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n'),content.replaceAll('\r\n','\n'),file);
});
