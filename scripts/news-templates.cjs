// HTML templates for the News section. Kept in scripts/ and listed in tailwind.config.js `content`
// so every Tailwind class used here is compiled into assets/styles.css by `npm run build:css`.
const SITE = 'https://nexcel.kz';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function ruDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
const jsonLd = (obj) => JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');

function shell({ title, description, path, ogType, ld, main, image }) {
  const url = SITE + path;
  return `<!DOCTYPE html>
<html lang="ru" class="scroll-smooth">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="${ogType}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${esc(image ? SITE + image : SITE + "/assets/og-preview.png")}" />
  <link rel="icon" type="image/x-icon" href="/favicon.ico" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/assets/styles.css" />
  <script type="application/ld+json">
${jsonLd(ld)}
  </script>
</head>
<body class="bg-paper text-textMain flex flex-col min-h-screen">
  <a href="#main-content" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-emeraldAccent focus:text-white focus:px-4 focus:py-2 focus:rounded focus:text-xs focus:font-sans focus:font-semibold">Перейти к основному содержанию</a>

  <div id="site-header"></div>

  <main id="main-content" class="flex-grow pt-16">
${main}
  </main>

  <div id="site-footer"></div>

  <script src="/assets/include-partials.js" defer></script>
</body>
</html>
`;
}

// Mini-markdown: "## heading", "- list item", blank-line paragraphs, **bold**, [text](https://url)
function inline(text) {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-darkBg">$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, '<a href="$2" class="text-emeraldAccent font-semibold hover:underline">$1</a>');
}
function renderBody(body) {
  const lines = String(body).replace(/\r\n/g, '\n').trim().split('\n');
  const html = [];
  for (let i = 0; i < lines.length;) {
    if (!lines[i].trim()) { i++; continue; }
    if (/^##\s+/.test(lines[i])) {
      html.push(`<h2 class="font-heading font-bold text-xl sm:text-2xl text-darkBg pt-3">${inline(lines[i++].replace(/^##\s+/, ''))}</h2>`);
    } else if (/^-\s+/.test(lines[i])) {
      const items = [];
      while (i < lines.length && /^-\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^-\s+/, ''))}</li>`);
      html.push(`<ul class="list-disc pl-5 space-y-1.5 text-sm sm:text-base text-textMain leading-relaxed">${items.join('')}</ul>`);
    } else {
      const paragraph = [];
      while (i < lines.length && lines[i].trim() && !/^(##|-)\s+/.test(lines[i])) paragraph.push(lines[i++]);
      html.push(`<p class="text-sm sm:text-base text-textMain leading-relaxed">${inline(paragraph.join(' '))}</p>`);
    }
  }
  return html.join('\n        ');
}

const CTA = `        <div class="border border-gridBorder rounded-lg bg-white p-4 sm:p-6 space-y-3 font-sans">
          <div class="font-heading font-bold text-base sm:text-lg text-darkBg">Есть похожая задача?</div>
          <p class="text-sm text-textMuted leading-relaxed">Напишите нам, и мы бесплатно разберём один ваш процесс и скажем, что в нём можно автоматизировать.</p>
          <div class="flex flex-wrap gap-2 text-sm font-semibold">
            <a href="https://wa.me/77711369095" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-4 py-2 rounded bg-emeraldAccent text-white hover:bg-emeraldHover transition-colors">Написать в WhatsApp</a>
            <a href="https://t.me/nexcel_kz" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-4 py-2 rounded border border-gridBorder bg-white text-darkBg hover:text-emeraldAccent transition-colors">Telegram-канал</a>
          </div>
        </div>`;

function postPage(p) {
  const path = `/news/${p.slug}`;
  const main = `    <article class="py-10 sm:py-14 lg:py-20 border-b border-gridBorder bg-paper">
      <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 sm:space-y-8">
        <a href="/news" class="inline-flex items-center gap-1 text-sm font-semibold text-emeraldAccent hover:underline"><span aria-hidden="true">←</span> Все новости</a>
        <header class="space-y-3">
          <time datetime="${esc(p.date)}" class="block text-xs font-sans text-textMuted uppercase tracking-wider">${ruDate(p.date)}</time>
          <h1 class="font-heading font-extrabold text-3xl sm:text-4xl text-darkBg">${esc(p.title)}</h1>
        </header>
        ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.title)}" class="w-full h-auto rounded-lg" />` : ''}
        <div class="space-y-3 sm:space-y-4">
        ${renderBody(p.body)}
        </div>
${CTA}
      </div>
    </article>`;
  return shell({
    title: `${p.title} — Nexcel Solutions`,
    description: p.excerpt,
    path,
    ogType: 'article',
    image: p.image,
    main,
    ld: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      '@id': `${SITE}${path}#article`,
      headline: p.title,
      description: p.excerpt,
      datePublished: p.date,
      dateModified: p.updated || p.date,
      inLanguage: 'ru',
      mainEntityOfPage: `${SITE}${path}`,
      image: p.image ? SITE + p.image : `${SITE}/assets/og-preview.png`,
      author: { '@type': 'Organization', name: 'Nexcel Solutions', url: SITE },
      publisher: { '@type': 'Organization', name: 'Nexcel Solutions', url: SITE }
    }
  });
}

function indexPage(posts) {
  const cards = posts.length
    ? posts.map((p) => `          <a href="/news/${p.slug}" class="block border border-gridBorder rounded-lg bg-white p-4 sm:p-5 hover:border-emeraldAccent transition-colors">
            <time datetime="${esc(p.date)}" class="block text-xs font-sans text-textMuted uppercase tracking-wider">${ruDate(p.date)}</time>
            <h2 class="font-heading font-bold text-lg sm:text-xl text-darkBg mt-1">${esc(p.title)}</h2>
            <p class="text-sm font-sans text-textMuted leading-relaxed mt-2">${esc(p.excerpt)}</p>
            <span class="inline-block text-sm font-semibold text-emeraldAccent mt-3">Читать <span aria-hidden="true">→</span></span>
          </a>`).join('\n')
    : '          <p class="text-sm font-sans text-textMuted">Новости появятся совсем скоро.</p>';
  const main = `    <section class="py-10 sm:py-14 lg:py-20 border-b border-gridBorder bg-paper">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 sm:space-y-8">
        <a href="/" class="inline-flex items-center gap-1 text-sm font-semibold text-emeraldAccent hover:underline"><span aria-hidden="true">←</span> Главная</a>
        <div class="space-y-2">
          <h1 class="font-heading font-extrabold text-3xl sm:text-4xl text-darkBg">Новости и кейсы</h1>
          <p class="text-sm font-sans text-textMuted">Как мы автоматизируем бизнес-процессы: Excel и Google Таблицы, документы, Telegram-боты и ИИ. Пишем коротко и по делу.</p>
        </div>
        <div class="space-y-3 font-sans">
${cards}
        </div>
      </div>
    </section>`;
  return shell({
    title: 'Новости и кейсы — Nexcel Solutions',
    description: 'Кейсы и новости Nexcel Solutions: автоматизация Excel и Google Таблиц, документооборот, Telegram-боты и внедрение ИИ для бизнеса в Казахстане.',
    path: '/news',
    ogType: 'website',
    main,
    ld: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${SITE}/news#page`,
      name: 'Новости и кейсы Nexcel Solutions',
      url: `${SITE}/news`,
      inLanguage: 'ru'
    }
  });
}

module.exports = { postPage, indexPage, ruDate };
