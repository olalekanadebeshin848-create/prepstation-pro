// electron-app/main/license/deviceId.js
// ─────────────────────────────────────────────────────────────────────────────
// The desktop machine identity, in the SAME shape as your mobile app's
// getUniqueDeviceId (SP-XXXX-XXXX-XXXX).
//
// Phone: fingerprint = brand + modelName + osBuildId  → SHA-256 → first 12 hex.
// Desktop: fingerprint = machine's stable GUID (node-machine-id) → SHA-256 → 12 hex.
//
// Re-derived on every call, never stored — copy the app to another PC and the ID
// changes, so the RSA activation re-locks. This module has NO electron-store /
// Electron dependency, so it runs in plain Node too (see selftest.js).
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const { machineIdSync } = require('node-machine-id');

function getUniqueDeviceId() {
  try {
    const fingerprint = machineIdSync(false); // stable per-machine GUID
    const fullHash = crypto.createHash('sha256').update(fingerprint).digest('hex');
    const cleanChunk = fullHash.substring(0, 12).toUpperCase();
    return `SP-${cleanChunk.match(/.{1,4}/g).join('-')}`;
  } catch (err) {
    console.error('Failed to calculate machine fingerprint:', err);
    return 'SP-ERR-DEVICE-ID';
  }
}

module.exports = { getUniqueDeviceId };
