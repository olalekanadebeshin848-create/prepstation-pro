// electron-app/main/license/strataLicense.js
// ─────────────────────────────────────────────────────────────────────────────
// Desktop port of your mobile src/services/LicenseService.js.
//
// The strata device code is a RANDOM 6-digit number, generated once and stored —
// exactly like the phone (it is NOT hardware-derived). So this ports almost
// verbatim: SecureStore → electron-store.
//
// The XOR validation and APP_SECRET_KEY are byte-for-byte identical to the phone
// AND to your admin tool, so a strata that your tool locks to a desktop's 6-digit
// code opens on that desktop and nowhere else — the same handshake you use today.
//
// The user reads getOrCreateDeviceLicense() off the screen and sends it to you; you
// feed it to the admin tool, which injects sig_a + sig_b; validateLicenseInFile()
// decrypts and matches.
// ─────────────────────────────────────────────────────────────────────────────

const Store = require('electron-store');

const store = new Store({ name: 'scholar_practice_license' });
const LICENSE_KEY = 'DEVICE_LICENSE_CODE';

// SAME key as mobile LicenseService.js, PGMapService.js, and the admin tool.
const APP_SECRET_KEY = 'PSP_2025_DMS_GROUPS_SECURE_KEY_XK92';

function generateSixDigitCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getOrCreateDeviceLicense() {
  try {
    const existing = store.get(LICENSE_KEY);
    if (existing) return existing;
    const newCode = generateSixDigitCode();
    store.set(LICENSE_KEY, newCode);
    return newCode;
  } catch (err) {
    console.error('LicenseService error:', err);
    return null;
  }
}

// Identical transform to the phone / admin tool. atob, escape and unescape are all
// available in Electron's Node runtime, so the decrypted bytes match exactly.
function xorDecrypt(encoded, key) {
  try {
    const text = decodeURIComponent(escape(atob(encoded)));
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Validate an imported strata JSON's embedded license against this desktop's code.
 * Mirrors the mobile return shape exactly: { valid, reason?, fileCode? }.
 */
function validateLicenseInFile(updateDataPack) {
  try {
    const currentDeviceCode = getOrCreateDeviceLicense();

    const meta = (updateDataPack && updateDataPack.strataMetadata) || {};
    const sigA = meta.sig_a;
    const sigB = meta.sig_b;
    const plainLicense = updateDataPack && updateDataPack.deviceLicense; // legacy format

    // HMAC check if schemaRev and seq exist
    const schemaRev = updateDataPack?.structuralStrata?.schemaRev;
    const seq = updateDataPack?.structuralStrata?.bundles?.[0]?.seq;
    if (schemaRev && seq) {
      const examCategory = updateDataPack?.structuralStrata?.examCategory;
      const strataId = updateDataPack?.structuralStrata?.strataId;
      const crypto = require('crypto');
      const expected = crypto.createHmac('sha256', APP_SECRET_KEY)
        .update(`${currentDeviceCode}|${examCategory}|${strataId}`)
        .digest('hex');
      if (expected === `${schemaRev}${seq}`) {
        return { valid: true };
      }
    }

    if (!sigA && !sigB && !plainLicense) {
      return { valid: false, reason: 'NO_LICENSE_IN_FILE' };
    }

    let decryptedCode = null;
    if (sigA && sigB) {
      decryptedCode = xorDecrypt(sigA + sigB, APP_SECRET_KEY);
    } else if (plainLicense) {
      decryptedCode = plainLicense;
    }

    if (!decryptedCode) return { valid: false, reason: 'DECRYPT_FAILED' };

    if (decryptedCode !== currentDeviceCode) {
      return { valid: false, reason: 'MISMATCH', fileCode: '******' }; // never expose the code
    }

    return { valid: true };
  } catch (err) {
    console.error('License validation error:', err);
    return { valid: false, reason: 'ERROR' };
  }
}

module.exports = { getOrCreateDeviceLicense, validateLicenseInFile };
