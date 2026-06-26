const fs = require('fs');

const css = fs.readFileSync('./node_modules/katex/dist/katex.min.css', 'utf8')
  .replace(/url\(fonts\/[^)]+\)/g, 'url()');

const js = fs.readFileSync('./node_modules/katex/dist/katex.min.js', 'utf8');

const ar = fs.readFileSync('./node_modules/katex/dist/contrib/auto-render.min.js', 'utf8');

const out = `export const katexCSS = ${JSON.stringify(css)};
export const katexJS = ${JSON.stringify(js)};
export const autoRenderJS = ${JSON.stringify(ar)};`;

fs.mkdirSync('./assets/katex', { recursive: true });
fs.writeFileSync('./assets/katex/katex-bundle.js', out);
console.log('Done — katex-bundle.js generated successfully');