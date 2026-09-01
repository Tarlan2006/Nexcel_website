const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, '..', 'node_modules', 'lucide-static', 'icons');
const htmlPath = path.join(__dirname, '..', 'index.html');

let html = fs.readFileSync(htmlPath, 'utf8');

const cache = {};
function getInner(name) {
  if (cache[name]) return cache[name];
  const svg = fs.readFileSync(path.join(iconsDir, name + '.svg'), 'utf8');
  const match = svg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
  const inner = match[1].trim().replace(/\s+/g, ' ');
  cache[name] = inner;
  return inner;
}

let count = 0;
html = html.replace(/<i data-lucide="([a-z0-9-]+)" class="([^"]*)"><\/i>/g, (full, name, classes) => {
  count++;
  const inner = getInner(name);
  return `<svg aria-hidden="true" class="${classes}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
});

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('Replaced', count, 'icon tags');
