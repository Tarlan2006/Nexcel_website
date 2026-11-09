// Builds the News section into dist/ from content/news/*.json.
// Runs AFTER scripts/build-site.cjs (which prunes dist/), see "build" in package.json.
// Adding a post = adding one JSON file to content/news/ and pushing to main.
const fs = require('node:fs');
const path = require('node:path');
const { postPage, indexPage } = require('./news-templates.cjs');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const contentDir = path.join(root, 'content', 'news');
const SITE = 'https://nexcel.kz';
// Date of the last change to the news listing itself. New articles can supersede it.
const NEWS_INDEX_LASTMOD = '2026-11-09';
const serviceTitles = new Map([
  ['avtomatizaciya-excel', 'Автоматизация Excel'],
  ['seo', 'SEO-оптимизация и продвижение сайтов']
]);

async function buildNews() {

if (!fs.existsSync(dist)) throw new Error('dist/ not found: run build-site first');

const posts = [];
if (fs.existsSync(contentDir)) {
  for (const file of fs.readdirSync(contentDir).filter((f) => f.endsWith('.json')).sort()) {
    const post = JSON.parse(fs.readFileSync(path.join(contentDir, file), 'utf8'));
    for (const key of ['slug', 'date', 'title', 'excerpt', 'body']) {
      if (!post[key] || typeof post[key] !== 'string') throw new Error(`${file}: missing "${key}"`);
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(post.slug)) throw new Error(`${file}: slug must be latin lowercase with dashes`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(post.date)) throw new Error(`${file}: date must be YYYY-MM-DD`);
    for (const key of ['date', 'updated']) {
      if (post[key] === undefined && key === 'updated') continue;
      if (typeof post[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(post[key]) || !Number.isFinite(Date.parse(post[key])) || new Date(post[key]).toISOString().slice(0, 10) !== post[key]) throw new Error(`${file}: invalid ${key}`);
    }
    if (post.draft !== undefined && typeof post.draft !== 'boolean') throw new Error(`${file}: draft must be boolean`);
    if (post.image !== undefined) {
      if (typeof post.image !== 'string' || !/^\/assets\/[a-zA-Z0-9/_-]+\.(png|jpe?g|webp)$/.test(post.image)) throw new Error(`${file}: image must be a local asset path`);
      fs.accessSync(path.join(dist, post.image.slice(1)));
      const metadata = await require('sharp')(path.join(dist, post.image.slice(1))).metadata();
      post.imageWidth = metadata.width;
      post.imageHeight = metadata.height;
    }
    if (post.ogImage !== undefined) {
      if (typeof post.ogImage !== 'string' || !/^\/assets\/[a-zA-Z0-9/_-]+\.(png|jpe?g|webp)$/.test(post.ogImage)) throw new Error(`${file}: ogImage must be a local asset path`);
      const metadata = await require('sharp')(path.join(dist, post.ogImage.slice(1))).metadata();
      if (metadata.width !== 1200 || metadata.height !== 630) throw new Error(`${file}: ogImage must be 1200x630`);
    }
    if (post.draft) continue;
    posts.push(post);
  }
}
const postsBySlug = new Map();
for (const p of posts) {
  if (postsBySlug.has(p.slug)) throw new Error(`Duplicate slug: ${p.slug}`);
  postsBySlug.set(p.slug, p);
}

for (const p of posts) {
  if (!Array.isArray(p.related) || p.related.length !== 2 || new Set(p.related).size !== 2) {
    throw new Error(`${p.slug}: expected two distinct related articles`);
  }
  p.relatedPosts = p.related.map((slug) => {
    const related = postsBySlug.get(slug);
    if (!related || related === p) throw new Error(`${p.slug}: invalid related article "${slug}"`);
    return related;
  });
  p.relatedServiceTitle = serviceTitles.get(p.relatedService);
  if (!p.relatedServiceTitle || !fs.existsSync(path.join(dist, p.relatedService + '.html'))) {
    throw new Error(`${p.slug}: invalid related service "${p.relatedService}"`);
  }
}
posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

fs.mkdirSync(path.join(dist, 'news'), { recursive: true });
fs.writeFileSync(path.join(dist, 'news.html'), indexPage(posts));
for (const p of posts) fs.writeFileSync(path.join(dist, 'news', `${p.slug}.html`), postPage(p));

// sitemap.xml: add /news and every post
const smPath = path.join(dist, 'sitemap.xml');
let sm = fs.readFileSync(smPath, 'utf8').replace(/\s*<url>\s*<loc>https:\/\/nexcel\.kz\/news(?:\/[^<]*)?<\/loc>[\s\S]*?<\/url>/g, '');
const newsLastmod = posts.reduce((latest, post) => {
  const modified = post.updated || post.date;
  return modified > latest ? modified : latest;
}, NEWS_INDEX_LASTMOD);
const urls = [`  <url>\n    <loc>${SITE}/news</loc>\n    <lastmod>${newsLastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`]
  .concat(posts.map((p) => `  <url>\n    <loc>${SITE}/news/${p.slug}</loc>\n    <lastmod>${p.updated || p.date}</lastmod>\n    <priority>0.6</priority>\n  </url>`));
sm = sm.replace('</urlset>', urls.join('\n') + '\n</urlset>');
fs.writeFileSync(smPath, sm);

// llms.txt: short list of the latest posts for AI search
const llmsPath = path.join(dist, 'llms.txt');
if (fs.existsSync(llmsPath)) {
  const base = fs.readFileSync(llmsPath, 'utf8').replace(/\n## Новости и кейсы\n[\s\S]*?(?=\n## |$)/g, '').trimEnd();
  const list = posts.slice(0, 10).map((p) => `- [${p.title}](${SITE}/news/${p.slug}): ${p.excerpt}`).join('\n');
  fs.writeFileSync(llmsPath, base + (posts.length ? `\n\n## Новости и кейсы\n\n${list}\n` : '\n'));
}
console.log(`News built: ${posts.length} post(s) -> dist/news.html, dist/news/`);
}

buildNews().catch(error => { console.error(error.message); process.exitCode = 1; });
