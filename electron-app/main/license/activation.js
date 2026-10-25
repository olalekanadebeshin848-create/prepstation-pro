// electron-app/main/license/activation.js
// ─────────────────────────────────────────────────────────────────────────────
// Desktop port of your mobile src/utils/activation.js — the RSA activation gate's
// storage half. The device identity lives in ./deviceId.js (importable without
// Electron); this file adds the persisted activation state.
//
//   SecureStore  →  electron-store (encrypted-at-rest file in the app's userData).
//
// The piracy check is the same as the phone: the saved record stores the device ID
// it was activated on; if the app's files are opened on a different machine the ID
// won't match and the app re-locks.
// ─────────────────────────────────────────────────────────────────────────────

const Store = require('electron-store');
const { getUniqueDeviceId } = require('./deviceId');

const store = new Store({
  name: 'scholar_practice_activation',
  // Obfuscates the file at rest. NOT real security (the key ships in the bundle) —
  // the RSA signature check is the actual gate. See README.
  encryptionKey: 'sp-activation-vault-v1',
});

function checkCurrentActivationStatus() {
  try {
    const saved = store.get('activation');
    if (!saved) return false;

    // Piracy check: a copied config opened on a different machine won't match.
    if (saved.deviceId !== getUniqueDeviceId()) {
      store.delete('activation');
      return false;
    }
    return saved.isActivated === true;
  } catch (err) {
    return false; // fail closed
  }
}

function saveSuccessfulActivation(enteredKey) {
  try {
    store.set('activation', {
      deviceId: getUniqueDeviceId(),
      isActivated: true,
      activatedAt: new Date().toISOString(),
      licenseKeyUsed: enteredKey,
    });
    return { success: true };
  } catch (err) {
    return { success: false, message: 'Could not write to secure desktop storage.' };
  }
}

module.exports = { checkCurrentActivationStatus, saveSuccessfulActivation };
