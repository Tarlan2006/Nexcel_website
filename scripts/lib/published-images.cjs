const fs = require('node:fs');
const path = require('node:path');

// Read the finished site so images in news, social metadata and shared partials
// are included alongside ordinary HTML, CSS and runtime asset references.
function referencedImages(directory) {
  const origin = 'https://nexcel.kz';
  const urls = new Set();
  for (const file of fs.readdirSync(directory, { recursive: true })) {
    if (!/\.(?:html|css|js|json|svg|txt)$/i.test(file)) continue;
    const source = fs.readFileSync(path.join(directory, file), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const base = new URL(file.split(path.sep).join('/'), origin);
    const references = /(?:^|[\s("'`=,])((?:(?:https?:)?\/\/[\w.-]+(?::\d+)?)?[\w./%~-]+\.(?:png|webp|jpe?g|svg|gif|avif|ico))(?=[\s"'`<>),?#]|$)/gi;
    for (const match of source.matchAll(references)) {
      const url = new URL(match[1], base);
      if (url.origin === origin) urls.add(url.pathname);
    }
  }
  return urls;
}

module.exports = { referencedImages };
