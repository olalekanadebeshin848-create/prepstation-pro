// electron-app/scripts/copy-web.js
// Copies the Expo web export (<rn-project>/dist) into electron-app/web so Electron
// can serve and package it. Assumes electron-app/ sits directly inside your RN
// project root. Run `npx expo export --platform web` from the RN root first.

const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', '..', 'dist'); // <rn-root>/dist
const dest = path.join(__dirname, '..', 'web');       // electron-app/web

if (!fs.existsSync(src)) {
  console.error(`\n\u2716 No web export found at: ${src}`);
  console.error('  From your React Native project root, run:');
  console.error('    npx expo export --platform web\n');
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`\u2714 Copied web build \u2192 ${dest}`);
