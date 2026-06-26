import { KEYUTIL, KJUR } from 'jsrsasign';
import { PUBLIC_KEY_PEM } from './keys';

/**
 * Mathematically validates an activation license key against a specific Device ID completely offline.
 * @param {string} deviceId - The formatted hardware ID (e.g., SP-A4B8-D9E2-F1A3)
 * @param {string} activationKey - The cryptographic license key entered by the student
 * @returns {boolean} True if the key is authentic and belongs to this exact device
 */
export function verifyOfflineLicense(deviceId, activationKey) {
  try {
    // 1. Clean inputs of any accidental leading/trailing spaces
    const cleanDeviceId = deviceId.trim();
    const cleanKey = activationKey.trim();

    // 2. Initialize the RSA public key structure
    const pubKeyObj = KEYUTIL.getKey(PUBLIC_KEY_PEM);

    // 3. Set up the cryptographic signature verification engine using SHA256withRSA
    const signatureEngine = new KJUR.crypto.Signature({ alg: 'SHA256withRSA' });
    signatureEngine.init(pubKeyObj);

    // 4. Feed the original device ID as the verification subject data
    signatureEngine.updateString(cleanDeviceId);

    // 5. Check if the provided activation key matches the payload signature
    const isValid = signatureEngine.verify(cleanKey);

    return isValid;
  } catch (error) {
    console.error("Cryptographic verification crashed:", error);
    return false; // Fail securely by default
  }
}