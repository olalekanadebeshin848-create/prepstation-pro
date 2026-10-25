#!/usr/bin/env node
/**
 * lock-strata.js
 * ------------------------------------------------------------------
 * Admin-side companion to src/services/LicenseService.js
 *
 * The app's validateLicenseInFile() decrypts strataMetadata.sig_a + sig_b
 * with XOR against APP_SECRET_KEY and compares the result to the
 * device's 6-digit code. This script does the encoding side: given a
 * strata content file (JSON) and a device's license code, it produces
 * a new JSON file with sig_a/sig_b embedded, locked to that device.
 *
 * USAGE:
 *   node lock-strata.js <input-strata.json> <deviceCode> [output.json]
 *
 * EXAMPLE:
 *   node lock-strata.js waec-maths-strata.json 482910 waec-maths-locked.json
 *
 * If no output path is given, it writes "<input>.locked.json" next to
 * the input file.
 * ------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

// MUST match APP_SECRET_KEY in src/services/LicenseService.js exactly.
// If you ever rotate this key in the app, update it here too — old
// strata files locked with the previous key will stop validating.
const APP_SECRET_KEY = 'PSP_2025_DMS_GROUPS_SECURE_KEY_XK92';

function xorTransform(text, key) {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(
      text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  return result;
}

/**
 * Mirrors the app's xorDecrypt in reverse:
 *   app decode: atob(encoded) -> escape -> decodeURIComponent -> XOR -> plain
 *   here:       plain -> XOR -> base64 (raw byte-safe) -> encoded
 */
function encodeLicenseSignature(deviceCode, secretKey = APP_SECRET_KEY) {
  const xored = xorTransform(deviceCode, secretKey);
  // 'latin1' treats each char as a raw byte (0-255), matching atob's semantics —
  // required for round-trip correctness with the app's atob()-based decoder.
  return Buffer.from(xored, 'latin1').toString('base64');
}

function splitSignature(encoded) {
  const mid = Math.ceil(encoded.length / 2);
  return {
    sig_a: encoded.slice(0, mid),
    sig_b: encoded.slice(mid),
  };
}

function main() {
  const [, , inputPath, deviceCode, outputPathArg] = process.argv;

  if (!inputPath || !deviceCode) {
    console.error('Usage: node lock-strata.js <input-strata.json> <deviceCode> [output.json]');
    process.exit(1);
  }

  const cleanCode = deviceCode.trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    console.warn(`Warning: "${cleanCode}" doesn't look like the usual 6-digit device code. Proceeding anyway.`);
  }

  const resolvedInput = path.resolve(inputPath);
  if (!fs.existsSync(resolvedInput)) {
    console.error(`Input file not found: ${resolvedInput}`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(resolvedInput, 'utf8'));
  } catch (err) {
    console.error(`Failed to parse ${inputPath} as JSON:`, err.message);
    process.exit(1);
  }

  const { sig_a, sig_b } = splitSignature(encodeLicenseSignature(cleanCode));

  data.strataMetadata = {
    ...(data.strataMetadata || {}),
    sig_a,
    sig_b,
  };
  // Remove any legacy plain-format field so the app uses the secure path
  delete data.deviceLicense;

  const outputPath = path.resolve(
    outputPathArg || inputPath.replace(/\.json$/i, '') + '.locked.json'
  );

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');

  console.log('✅ Strata file locked successfully.');
  console.log(`   Device code : ${cleanCode}`);
  console.log(`   Output file : ${outputPath}`);
}

main();
