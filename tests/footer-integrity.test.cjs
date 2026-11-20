const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { checkFooters } = require('../scripts/check-footers.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexcel-footer-integrity-'));
  t.after(() => {
    if (path.dirname(directory) !== os.tmpdir()) throw new Error('Unexpected fixture directory');
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const footer = '<footer><address>Астана, просп. Мангилик Ел, 55/1</address></footer>';
  fs.mkdirSync(path.join(directory, 'partials'));
  fs.mkdirSync(path.join(directory, 'dist/news'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'dist/partials'));
  fs.writeFileSync(path.join(directory, 'partials/footer.html'), footer);
  fs.writeFileSync(path.join(directory, 'dist/partials/footer.html'), footer);
  const page = '<html><body>' + footer + '</body></html>';
  for (const file of ['index.html', 'free.html', '404.html', 'news/example.html']) {
    fs.writeFileSync(path.join(directory, 'dist', file), page);
  }
  return { directory, footer, page };
}

test('all pages, including news and 404, share the canonical footer hash', t => {
  const { directory } = fixture(t);
  const result = checkFooters(directory);
  assert.deepEqual(result.pages.map(item => item.page).sort(), ['/', '/404', '/free', '/news/example']);
  assert.match(result.hash, /^[a-f0-9]{64}$/);
  assert(result.pages.every(item => item.hash === result.hash));
});

test('a different, missing or duplicate footer fails verification', t => {
  const { directory, footer } = fixture(t);
  const target = path.join(directory, 'dist/free.html');
  for (const html of ['<footer>Другой футер</footer>', '<main>Нет футера</main>', footer + footer]) {
    fs.writeFileSync(target, html);
    assert.throws(() => checkFooters(directory), /footer differs|expected exactly one footer/);
  }
});

test('obsolete addresses fail verification even outside the footer or inside encoded links', t => {
  const { directory, page } = fixture(t);
  const target = path.join(directory, 'dist/news/example.html');
  for (const address of [
    ['53', '1'].join('/'),
    ['53', '1'].join(' / '),
    ['53', '1'].join('%20%2F%20'),
    'Бект' + 'ұров',
    'Бект' + 'уров',
    'кв.' + ' 15',
    '010' + '000'
  ]) {
    fs.writeFileSync(target, page.replace('</body>', '<p>' + address + '</p></body>'));
    assert.throws(() => checkFooters(directory), /obsolete address/);
  }
});

test('an obsolete address in the canonical footer also fails verification', t => {
  const { directory } = fixture(t);
  fs.writeFileSync(path.join(directory, 'partials/footer.html'), '<footer>' + ['53', '1'].join('/') + '</footer>');
  assert.throws(() => checkFooters(directory), /obsolete address/);
});
