// Local preview of this site's clean URLs; production is served by Cloudflare.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pages = new Map([['/', 'index.html'], ['/licensing', 'licensing.html'], ['/avtomatizaciya-excel', 'avtomatizaciya-excel.html'], ['/seo', 'seo.html'], ['/templates', 'templates.html'], ['/faq', 'faq.html']]);
const publicFiles = new Set(['favicon.ico', 'robots.txt', 'sitemap.xml', 'llms.txt', 'partials/header.html', 'partials/footer.html']);
const types = { '.js': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };

function pageFile(route) {
  if (route === '/news' || /^\/news\/[a-z0-9-]+$/.test(route)) return `dist${route}.html`;
  return pages.get(route);
}

const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const canonical = pathname === '/index.html' ? '/' : pathname.replace(/(?:\.html|\/)$/, '');
    const page = pageFile(canonical);
    if (pathname !== canonical && page) {
      res.writeHead(307, { Location: canonical + url.search }).end();
      return;
    }
    const relative = page || pathname.slice(1);
    const allowed = page || publicFiles.has(relative) || /^assets\/[\w./-]+$/.test(relative);
    const absolute = path.resolve(root, relative);
    if (!allowed || !absolute.startsWith(root + path.sep) || relative.split('/').some(part => part.startsWith('.'))) {
      res.writeHead(404).end('Not found');
      return;
    }
    const data = await fs.readFile(absolute);
    res.writeHead(200, { 'Content-Type': types[path.extname(absolute)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) {
    res.writeHead(error instanceof URIError ? 400 : 404).end('Not found');
  }
});

server.listen(Number(process.env.PORT || 5500), '127.0.0.1', () => {
  console.log(`Local preview: http://localhost:${server.address().port}`);
});
