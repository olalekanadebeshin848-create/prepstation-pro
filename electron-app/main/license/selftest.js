// electron-app/main/license/selftest.js
// ─────────────────────────────────────────────────────────────────────────────
// Quick sanity check you can run in PLAIN NODE (no Electron needed) before the
// desktop app exists:
//
//     cd electron-app/main/license
//     npm init -y && npm install node-machine-id jsrsasign
//     node selftest.js
//
// It prints this machine's SP- device ID (the value you'd sign an activation key
// for) and proves the strata XOR round-trip matches your admin tool.
//
// NOTE: activation.js and strataLicense.js instantiate electron-store at load, so
// they only run inside Electron — this test deliberately avoids importing them and
// re-implements just the pure XOR here to demonstrate the match.
// ─────────────────────────────────────────────────────────────────────────────

const { getUniqueDeviceId } = require('./deviceId');

const APP_SECRET_KEY = 'PSP_2025_DMS_GROUPS_SECURE_KEY_XK92';

// Same as the admin tool's xorEncrypt / the app's xorDecrypt.
function xorEncrypt(text, key) {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(unescape(encodeURIComponent(result)));
}
function xorDecrypt(encoded, key) {
  const text = decodeURIComponent(escape(atob(encoded)));
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

console.log('\n── PrepStation desktop license self-test ──\n');

// 1) Machine identity (RSA activation layer)
console.log('This machine\u2019s device ID :', getUniqueDeviceId());
console.log('  → sign THIS string with your private key to mint its activation key.\n');

// 2) Strata XOR round-trip (strata lock layer) — mimics the admin tool.
const sampleCode = '482910';                 // a device's 6-digit strata code
const encrypted  = xorEncrypt(sampleCode, APP_SECRET_KEY);
const half       = Math.ceil(encrypted.length / 2);
const sigA       = encrypted.slice(0, half);
const sigB       = encrypted.slice(half);
const recovered  = xorDecrypt(sigA + sigB, APP_SECRET_KEY);

console.log('Strata lock round-trip:');
console.log('  code            :', sampleCode);
console.log('  sig_a           :', sigA);
console.log('  sig_b           :', sigB);
console.log('  recovered       :', recovered);
console.log('  matches         :', recovered === sampleCode ? 'YES \u2705' : 'NO \u274c');
console.log('');
