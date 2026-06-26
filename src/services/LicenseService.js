import * as SecureStore from 'expo-secure-store';

const LICENSE_KEY = 'DEVICE_LICENSE_CODE';

// Generates a random 6-digit number as a string e.g. "482910"
const generateSixDigitCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Call this on app startup — returns existing code or creates a new one
export const getOrCreateDeviceLicense = async () => {
  try {
    const existing = await SecureStore.getItemAsync(LICENSE_KEY);
    if (existing) return existing;

    const newCode = generateSixDigitCode();
    await SecureStore.setItemAsync(LICENSE_KEY, newCode);
    return newCode;
  } catch (err) {
    console.error('LicenseService error:', err);
    return null;
  }
};

// Validates the uploaded JSON's license against this device's code
export const validateLicenseInFile = async (parsedJson) => {
  try {
    const deviceCode = await SecureStore.getItemAsync(LICENSE_KEY);
    const fileCode = parsedJson?.deviceLicense?.toString();

    if (!fileCode) {
      return { valid: false, reason: 'NO_LICENSE_IN_FILE' };
    }
    if (!deviceCode) {
      return { valid: false, reason: 'NO_DEVICE_CODE' };
    }
    if (fileCode !== deviceCode) {
      return { valid: false, reason: 'MISMATCH', fileCode, deviceCode };
    }

    return { valid: true };
  } catch (err) {
    console.error('License validation error:', err);
    return { valid: false, reason: 'ERROR' };
  }
};