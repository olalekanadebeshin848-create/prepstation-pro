import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

// This name keeps our storage vault unique on the phone
const SECURE_STORAGE_KEY = 'scholar_practice_activation_data';

/**
 * 1. Generates a unique, permanent Device ID based on this specific phone's hardware.
 */
export async function getUniqueDeviceId() {
    try {
      // 1. Combine hardware parameters to build the unique seed string
      const hardwareFingerprint = `${Device.brand}-${Device.modelName}-${Device.osBuildId || 'offline-fallback'}`;
      
      // 2. Generate the full secure SHA-256 hash string
      const fullSecureHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        hardwareFingerprint
      );
      
      // 3. Take just the first 12 characters of the hash in uppercase
      const cleanChunk = fullSecureHash.substring(0, 12).toUpperCase();
      
      // 4. Split it cleanly into blocks of 4 characters: XXXX-XXXX-XXXX
      const formattedId = `SP-${cleanChunk.match(/.{1,4}/g).join('-')}`;
      
      return formattedId; // Output format example: SP-A4B8-D9E2-F1A3
    } catch (error) {
      console.error("Failed to calculate hardware fingerprint:", error);
      return "SP-ERR-DEVICE-ID";
    }
  }

/**
 * 2. Checks if the app is already unlocked on this device.
 */
export async function checkCurrentActivationStatus() {
  try {
    const savedDataString = await SecureStore.getItemAsync(SECURE_STORAGE_KEY);
    
    // If nothing is saved, the app is brand new or locked
    if (!savedDataString) return false;

    const savedData = JSON.parse(savedDataString);
    const actualCurrentDeviceId = await getUniqueDeviceId();

    // PIRACY CHECK: If someone copies the app's files to a different phone,
    // the device IDs won't match. We instantly lock them out.
    if (savedData.deviceId !== actualCurrentDeviceId) {
      console.log("Security Alert: License file mismatch. Relocking app.");
      await SecureStore.deleteItemAsync(SECURE_STORAGE_KEY);
      return false;
    }

    return savedData.isActivated === true;
  } catch (error) {
    return false; // Safely lock on any file error
  }
}

/**
 * 3. Saves a successful activation key into the phone's secure hardware vault.
 */
export async function saveSuccessfulActivation(enteredKey) {
  try {
    const currentDeviceId = await getUniqueDeviceId();
    
    // Create the package to save inside the secure memory vault
    const activationPayload = {
      deviceId: currentDeviceId,
      isActivated: true,
      activatedAt: new Date().toISOString(),
      licenseKeyUsed: enteredKey
    };

    // Save it to hardware-encrypted storage
    await SecureStore.setItemAsync(SECURE_STORAGE_KEY, JSON.stringify(activationPayload));
    return { success: true };
  } catch (error) {
    return { success: false, message: "Could not write to secure phone storage." };
  }
}