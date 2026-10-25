const fs = require('fs');
const path = require('path');

const FONTS_DIR = path.join(__dirname, 'node_modules/katex/dist/fonts');

const MIME_BY_EXT = {
  '.woff2': 'font/woff2',
  '.woff':  'font/woff',
  '.ttf':   'font/ttf',
};

let css = fs.readFileSync('./node_modules/katex/dist/katex.min.css', 'utf8');

// Inline every referenced font file as a base64 data: URI, so the CSS is fully
// self-contained — no filesystem path or network request needed once this is
// embedded in a sandboxed WebView/iframe. This is required for offline builds
// (Android + Windows/Electron): relative "fonts/..." paths can't resolve inside
// injected HTML, which silently drops all KaTeX fonts and misaligns every
// fraction, exponent, root, and symbol that depends on KaTeX's own font metrics.
css = css.replace(/url\(fonts\/([^)]+?)(?:\.([a-z0-9]+))?\)\s*format\((['"])([^'"]+)\3\)/g,
  (match, filenameNoExt, extInUrl, quote, format) => {
    // The filename in url(...) sometimes omits the extension when a separate
    // format(...) hint follows; katex.min.css uses "url(fonts/X.woff2) format('woff2')"
    // style references, so reconstruct the real file name from the format hint
    // when needed and fall back to what's literally inside the parens otherwise.
    const extFromFormat = format === 'woff2' ? '.woff2' : format === 'woff' ? '.woff' : format === 'truetype' ? '.ttf' : null;
    const realFilename = extInUrl ? `${filenameNoExt}.${extInUrl}` : (extFromFormat ? `${filenameNoExt}${extFromFormat}` : filenameNoExt);
    const fullPath = path.join(FONTS_DIR, realFilename);

    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️  Font file not found, leaving unresolved: ${realFilename}`);
      return match;
    }

    const ext = path.extname(realFilename).toLowerCase();
    const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
    const base64 = fs.readFileSync(fullPath).toString('base64');
    return `url(data:${mime};base64,${base64}) format(${quote}${format}${quote})`;
  });

const js = fs.readFileSync('./node_modules/katex/dist/katex.min.js', 'utf8');
const ar = fs.readFileSync('./node_modules/katex/dist/contrib/auto-render.min.js', 'utf8');

const out = `export const katexCSS = ${JSON.stringify(css)};
export const katexJS = ${JSON.stringify(js)};
export const autoRenderJS = ${JSON.stringify(ar)};`;

fs.mkdirSync('./assets/katex', { recursive: true });
fs.writeFileSync('./assets/katex/katex-bundle.js', out);
console.log('Done — katex-bundle.js generated successfully (fonts embedded as base64, fully offline-safe)');
