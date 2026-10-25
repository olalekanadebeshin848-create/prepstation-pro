// electron-app/main/license/rsaVerify.js
// ─────────────────────────────────────────────────────────────────────────────
// Port of your mobile src/utils/security.js. jsrsasign is pure JavaScript, so this
// RSA check is byte-for-byte identical to the phone and runs unchanged in Electron's
// main process (Node). Your signing side does not change at all: you still sign the
// device-ID STRING with your private key to produce an activation key.
// ─────────────────────────────────────────────────────────────────────────────

const { KEYUTIL, KJUR } = require('jsrsasign');
const { PUBLIC_KEY_PEM } = require('./keys');

/**
 * Verify — fully offline — that `activationKey` is an RSA (SHA256withRSA) signature
 * of `deviceId` made with the private key matching PUBLIC_KEY_PEM.
 * @returns {boolean}
 */
function verifyOfflineLicense(deviceId, activationKey) {
  try {
    const cleanDeviceId = String(deviceId).trim();
    const cleanKey = String(activationKey).trim();

    const pubKeyObj = KEYUTIL.getKey(PUBLIC_KEY_PEM);
    const sig = new KJUR.crypto.Signature({ alg: 'SHA256withRSA' });
    sig.init(pubKeyObj);
    sig.updateString(cleanDeviceId);
    return sig.verify(cleanKey);
  } catch (err) {
    console.error('Cryptographic verification crashed:', err);
    return false; // fail closed
  }
}

module.exports = { verifyOfflineLicense };
