import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const LICENSE_KEY = 'DEVICE_LICENSE_CODE';

// expo-secure-store only works on real phones (iOS/Android). On web/Electron
// it silently fails, which is why the desktop app was showing "------"
// instead of a code. AsyncStorage works everywhere, so we use it on web
// and keep SecureStore (the more secure option) on real devices.
const isWeb = Platform.OS === 'web';

async function storageGet(key) {
  return isWeb ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key);
}

async function storageSet(key, value) {
  return isWeb ? AsyncStorage.setItem(key, value) : SecureStore.setItemAsync(key, value);
}

// Generates a random 6-digit number as a string e.g. "482910"
const generateSixDigitCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Call this on app startup — returns existing code or creates a new one
export const getOrCreateDeviceLicense = async () => {
  try {
    const existing = await storageGet(LICENSE_KEY);
    if (existing) return existing;

    const newCode = generateSixDigitCode();
    await storageSet(LICENSE_KEY, newCode);
    return newCode;
  } catch (err) {
    console.error('LicenseService error:', err);
    return null;
  }
};

// Validates the uploaded JSON's license against this device's code
const APP_SECRET_KEY = 'PSP_2025_DMS_GROUPS_SECURE_KEY_XK92';

function xorDecrypt(encoded, key) {
  try {
    const text = decodeURIComponent(escape(atob(encoded)));
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(
        text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      );
    }
    return result;
  } catch {
    return null;
  }
}

export async function validateLicenseInFile(updateDataPack) {
  try {
    const currentDeviceCode = await getOrCreateDeviceLicense();

    // New secure format — split across sig_a + sig_b
    const sigA = updateDataPack?.strataMetadata?.sig_a;
    const sigB = updateDataPack?.strataMetadata?.sig_b;

    // Fallback: old plain format (deviceLicense field)
    const plainLicense = updateDataPack?.deviceLicense;

    if (!sigA && !sigB && !plainLicense) {
      return { valid: false, reason: 'NO_LICENSE_IN_FILE' };
    }

    let decryptedCode = null;

    if (sigA && sigB) {
      // New secure format
      const encrypted = sigA + sigB;
      decryptedCode = xorDecrypt(encrypted, APP_SECRET_KEY);
    } else if (plainLicense) {
      // Old plain format — still supported
      decryptedCode = plainLicense;
    }

    if (!decryptedCode) {
      return { valid: false, reason: 'DECRYPT_FAILED' };
    }

    if (decryptedCode !== currentDeviceCode) {
      return {
        valid: false,
        reason: 'MISMATCH',
        fileCode: '******',  // never expose the decrypted code
      };
    }

    return { valid: true };
  } catch (err) {
    console.error('License validation error:', err);
    return { valid: false, reason: 'ERROR' };
  }
}