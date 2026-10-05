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
    }
    if (post.draft) continue;
    posts.push(post);
  }
}
const slugs = new Set();
for (const p of posts) {
  if (slugs.has(p.slug)) throw new Error(`Duplicate slug: ${p.slug}`);
  slugs.add(p.slug);
}
posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

fs.mkdirSync(path.join(dist, 'news'), { recursive: true });
fs.writeFileSync(path.join(dist, 'news.html'), indexPage(posts));
for (const p of posts) fs.writeFileSync(path.join(dist, 'news', `${p.slug}.html`), postPage(p));

// sitemap.xml: add /news and every post
const smPath = path.join(dist, 'sitemap.xml');
let sm = fs.readFileSync(smPath, 'utf8').replace(/\s*<url>\s*<loc>https:\/\/nexcel\.kz\/news(?:\/[^<]*)?<\/loc>[\s\S]*?<\/url>/g, '');
const urls = [`  <url>\n    <loc>${SITE}/news</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`]
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
