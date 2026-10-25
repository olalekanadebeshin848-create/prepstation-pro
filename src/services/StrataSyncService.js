// src/services/StrataSyncService.js
// ─────────────────────────────────────────────────────────────────────────────
// Cloud Strata Sync Service for PrepStation Pro (Mobile & Electron Desktop)
//
// Features:
// 1. Fetches remote strata catalog from GitHub / Supabase / Custom CDN.
// 2. Compares remote catalog with local AsyncStorage (examStrataMap) to detect:
//    - "NEW" (not yet installed)
//    - "UPDATE_AVAILABLE" (newer version or modified timestamp)
//    - "INSTALLED" (up to date)
// 3. Direct one-tap download via standard fetch() (cross-platform: iOS, Android, Electron).
// 4. Handles both .psz (decrypted via device license code) and .json files.
// 5. Automatically validates, unpacks, and installs directly into AsyncStorage.
//    No manual document picker needed!
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOrCreateDeviceLicense, validateLicenseInFile } from './LicenseService';
import { checkCurrentActivationStatus, getUniqueDeviceId } from '../utils/activation';
import {
  ALL_CATEGORY_IDS,
  emptyCategoryMap,
  isClassCategory,
} from '../config/categories';

// Default public catalog URL (can be customized by user or configured via settings)
export const DEFAULT_CATALOG_URL =
  'https://raw.githubusercontent.com/olalekanadebeshin848-create/prepstation-pro/main/strata_catalog.json';

const STORAGE_CATALOG_URL_KEY = 'strata_custom_catalog_url';
const STORAGE_CACHED_CATALOG_KEY = 'strata_cached_catalog';

// ── PSZ Decryption Helpers ──────────────────────────────────────────────────
const PSZ_MAGIC = 'PSZ1';
const PSZ_APP_SALT = 'PSP_2025_DMS_GROUPS_SECURE_KEY_XK92';

const derivePszKey = (deviceCode) =>
  PSZ_APP_SALT + '::' + deviceCode + '::' + PSZ_APP_SALT.split('').reverse().join('');

const xorBytes = (data, key) => {
  const enc = new TextEncoder();
  const keyBytes = enc.encode(key);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ keyBytes[i % keyBytes.length];
  }
  return out;
};

const checksumBytes = (data) => {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum = (sum + data[i]) & 0xffffffff;
  }
  return sum;
};

const bytesToUint32 = (b, offset) =>
  (((b[offset] << 24) | (b[offset + 1] << 16) | (b[offset + 2] << 8) | b[offset + 3]) >>> 0);

export const unpackPsz = (bytes, deviceCode) => {
  const magic = new TextDecoder().decode(bytes.slice(0, 4));
  if (magic !== PSZ_MAGIC && magic !== 'PSR1') {
    return { ok: false, reason: 'Not a valid .psz or .psr file.' };
  }
  const checksum = bytesToUint32(bytes, 5);
  const storedDev = new TextDecoder().decode(bytes.slice(9, 45)).replace(/\0/g, '').trim();

  // Allow universal or device-matching files
  const isUniversal = storedDev === 'UNIVERSAL' || storedDev === 'ALL' || storedDev === 'PUBLIC';
  if (
    storedDev &&
    !isUniversal &&
    deviceCode &&
    storedDev !== deviceCode
  ) {
    return {
      ok: false,
      reason: `File locked to device: ${storedDev}\nYour device: ${deviceCode}`,
    };
  }

  const encrypted = bytes.slice(45);
  const key = derivePszKey(isUniversal ? storedDev : (deviceCode || '000000'));
  const decrypted = xorBytes(encrypted, key);

  if (checksumBytes(decrypted) !== checksum) {
    return { ok: false, reason: 'Checksum mismatch — file is corrupted or tampered.' };
  }

  try {
    return { ok: true, payload: JSON.parse(new TextDecoder().decode(decrypted)) };
  } catch {
    return {
      ok: false,
      reason: 'Decryption produced invalid data. Wrong device code or corrupted file.',
    };
  }
};

// ── Catalog Management ─────────────────────────────────────────────────────

export async function getActiveCatalogUrl() {
  try {
    const custom = await AsyncStorage.getItem(STORAGE_CATALOG_URL_KEY);
    return custom && custom.trim() ? custom.trim() : DEFAULT_CATALOG_URL;
  } catch {
    return DEFAULT_CATALOG_URL;
  }
}

export async function setActiveCatalogUrl(newUrl) {
  try {
    if (!newUrl || !newUrl.trim()) {
      await AsyncStorage.removeItem(STORAGE_CATALOG_URL_KEY);
    } else {
      await AsyncStorage.setItem(STORAGE_CATALOG_URL_KEY, newUrl.trim());
    }
    return true;
  } catch (err) {
    console.error('Failed saving catalog URL:', err);
    return false;
  }
}

/**
 * Fetches the online strata catalog manifest.
 * Falls back to locally cached catalog if offline.
 */
export async function fetchStrataCatalog() {
  const url = await getActiveCatalogUrl();
  try {
    // Add cache-busting timestamp query to always get freshest uploads
    const fetchUrl = url.includes('?') ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;
    const response = await fetch(fetchUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed fetching strata catalog`);
    }

    const catalogData = await response.json();
    if (!catalogData || !Array.isArray(catalogData.strataList)) {
      throw new Error('Invalid catalog structure: expected "strataList" array.');
    }

    // Cache catalog locally for offline reference
    await AsyncStorage.setItem(STORAGE_CACHED_CATALOG_KEY, JSON.stringify(catalogData));
    return { catalog: catalogData, fromCache: false, error: null };
  } catch (err) {
    console.warn('Network catalog fetch failed, checking offline cache:', err.message);
    const cached = await AsyncStorage.getItem(STORAGE_CACHED_CATALOG_KEY);
    if (cached) {
      try {
        return {
          catalog: JSON.parse(cached),
          fromCache: true,
          error: `Offline mode: ${err.message}`,
        };
      } catch {
        // ignore JSON parse error
      }
    }
    return { catalog: null, fromCache: false, error: err.message };
  }
}

/**
 * Compares the catalog with current locally installed strata.
 * Returns an enriched list with syncStatus ('NEW' | 'UPDATE_AVAILABLE' | 'INSTALLED')
 */
export async function evaluateCatalogStatus(catalog) {
  if (!catalog || !Array.isArray(catalog.strataList)) {
    return { items: [], summary: { total: 0, newCount: 0, updateCount: 0, installedCount: 0 } };
  }

  const strataRaw = await AsyncStorage.getItem('examStrataMap');
  const currentMap = { ...emptyCategoryMap(), ...(strataRaw ? JSON.parse(strataRaw) : {}) };

  let newCount = 0;
  let updateCount = 0;
  let installedCount = 0;

  const items = catalog.strataList.map((item) => {
    const categoryStrata = currentMap[item.examCategory] || [];
    const existing = categoryStrata.find((s) => s.strataId === item.strataId);

    let status = 'NEW';
    if (existing) {
      // Check if remote version is newer
      if (item.version && existing.version && item.version !== existing.version) {
        status = 'UPDATE_AVAILABLE';
        updateCount++;
      } else if (item.updatedAt && existing.lastSyncedAt && item.updatedAt > existing.lastSyncedAt) {
        status = 'UPDATE_AVAILABLE';
        updateCount++;
      } else {
        status = 'INSTALLED';
        installedCount++;
      }
    } else {
      newCount++;
    }

    return {
      ...item,
      syncStatus: status,
      installedLocally: !!existing,
      localBundleCount: existing ? (existing.bundles?.length || 0) : 0,
    };
  });

  return {
    items,
    summary: {
      total: items.length,
      newCount,
      updateCount,
      installedCount,
    },
  };
}

/**
 * Checks whether this device/user is activated for Premium access.
 * Works on Mobile (SecureStore), Web (AsyncStorage), and Electron (desktopLicense).
 */
export async function checkUserPremiumStatus() {
  try {
    // 1. Check Electron desktop bridge if running on desktop
    if (typeof window !== 'undefined' && window.desktopLicense) {
      const desktopActive = await window.desktopLicense.checkActivation();
      if (desktopActive) return true;
    }

    // 2. Check mobile/web secure activation status
    const mobileActive = await checkCurrentActivationStatus();
    if (mobileActive) return true;

    // 3. Check fallback in AsyncStorage (for custom license tiers)
    const storedTier = await AsyncStorage.getItem('user_license_tier');
    if (storedTier === 'premium') return true;

    return false;
  } catch (err) {
    console.error('Error checking premium status:', err);
    return false;
  }
}

/**
 * Downloads a strata file from its URL and installs it directly into AsyncStorage.
 * No manual file picker needed!
 */
export async function downloadAndInstallStrata(strataItem, options = {}) {
  const { onProgress } = options;

  if (!strataItem || !strataItem.fileUrl) {
    throw new Error('Strata item has no valid download URL.');
  }

  // ── Premium Access Gate ──────────────────────────────────────────────────
  // Basic strata can be downloaded by everyone.
  // Premium strata requires an active license/activation.
  const isPremiumStrata = strataItem.tier === 'premium';
  if (isPremiumStrata) {
    const hasPremium = options.isUserActivated ?? (await checkUserPremiumStatus());
    if (!hasPremium) {
      const err = new Error('PREMIUM_REQUIRED');
      err.code = 'PREMIUM_REQUIRED';
      err.strataItem = strataItem;
      throw err;
    }
  }

  if (onProgress) onProgress({ phase: 'downloading', percent: 20 });

  const isPsz = /\.(psz|psr)$/i.test(strataItem.fileUrl) || strataItem.fileType === 'psz';
  const deviceLicenseCode = await getOrCreateDeviceLicense();

  const response = await fetch(strataItem.fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download file (HTTP ${response.status}). Check network or file URL.`);
  }

  if (onProgress) onProgress({ phase: 'unpacking', percent: 60 });

  let pack;

  if (isPsz) {
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (!deviceLicenseCode) {
      throw new Error('Could not read your device license code.');
    }

    const result = unpackPsz(bytes, deviceLicenseCode);
    if (!result.ok) {
      throw new Error(`PSZ Decryption Failed: ${result.reason}`);
    }

    pack = result.payload.strata || result.payload;
    if (!pack) {
      throw new Error('Decrypted PSZ package has no strata data.');
    }
  } else {
    const raw = await response.text();
    try {
      pack = JSON.parse(raw.trim());
    } catch {
      throw new Error('Downloaded file is not valid JSON.');
    }

    // License verification for JSON format
    const licenseCheck = await validateLicenseInFile(pack);
    if (!licenseCheck.valid) {
      // If file contains universal license or is free basic strata, allow pass
      const isUniversal =
        pack.deviceLicense === 'UNIVERSAL' ||
        pack.deviceLicense === 'PUBLIC' ||
        strataItem.tier === 'basic';

      if (!isUniversal) {
        const msg =
          licenseCheck.reason === 'NO_LICENSE_IN_FILE'
            ? `This file has no device license.\nDevice code: 🔑 ${deviceLicenseCode}`
            : licenseCheck.reason === 'MISMATCH'
            ? `File is locked to a different device.`
            : 'License verification failed.';
        throw new Error(msg);
      }
    }
  }

  if (onProgress) onProgress({ phase: 'installing', percent: 85 });

  // ── Validate Strata Structure ───────────────────────────────────────────
  if (!pack.structuralStrata) {
    throw new Error('Valid strata signature missing (no structuralStrata in file).');
  }

  const incoming = pack.structuralStrata;
  const examCat = incoming.examCategory || strataItem.examCategory;

  if (!examCat || !ALL_CATEGORY_IDS.includes(examCat)) {
    throw new Error(`Invalid category: "${examCat}".`);
  }

  if (!incoming.strataId) {
    throw new Error('Strata file must declare a strataId field.');
  }

  const tier = incoming.tier === 'premium' || strataItem.tier === 'premium' ? 'premium' : 'basic';
  const incomingBundles = incoming.bundles || [];

  if (isClassCategory(examCat)) {
    if (incomingBundles.length < 1) {
      throw new Error('This class strata contains no bundles.');
    }
  } else if (incomingBundles.length !== 5) {
    throw new Error(`Each exam strata must contain exactly 5 bundles (got ${incomingBundles.length}).`);
  }

  const strataNum = parseInt(incoming.strataId.replace(/\D/g, ''), 10) || 1;

  // ── Merge into AsyncStorage examStrataMap ────────────────────────────────
  const currentRaw = await AsyncStorage.getItem('examStrataMap');
  const currentMap = { ...emptyCategoryMap(), ...(currentRaw ? JSON.parse(currentRaw) : {}) };
  const currentStrata = currentMap[examCat] || [];

  const existingIdx = currentStrata.findIndex((s) => s.strataId === incoming.strataId);

  const buildBundles = (bundles, existing) =>
    bundles.map((b, i) => ({
      ...b,
      isUnlocked: i === 0 ? true : existing?.[i]?.isUnlocked || false,
      isCompleted: existing?.[i]?.isCompleted || false,
      lastScore: existing?.[i]?.lastScore || null,
      attempts: existing?.[i]?.attempts || [],
    }));

  const newEntry = {
    strataId: incoming.strataId,
    examCategory: examCat,
    displayName: incoming.displayName || strataItem.displayName || `STRATA ${strataNum}`,
    tier,
    version: strataItem.version || '1.0.0',
    lastSyncedAt: new Date().toISOString(),
    isUnlocked:
      strataNum === 1 ||
      currentStrata.some(
        (s) =>
          parseInt(s.strataId.replace(/\D/g, ''), 10) === strataNum - 1 &&
          s.bundles.every((b) => b.isCompleted)
      ),
    bundles: buildBundles(incomingBundles, existingIdx >= 0 ? currentStrata[existingIdx].bundles : []),
  };

  let updated;
  if (existingIdx >= 0) {
    updated = [...currentStrata];
    updated[existingIdx] = newEntry;
  } else {
    updated = [...currentStrata, newEntry].sort(
      (a, b) =>
        (parseInt(a.strataId.replace(/\D/g, ''), 10) || 1) -
        (parseInt(b.strataId.replace(/\D/g, ''), 10) || 1)
    );
  }

  const newMap = { ...currentMap, [examCat]: updated };
  await AsyncStorage.setItem('examStrataMap', JSON.stringify(newMap));

  // Update activeStrataIndexMap
  const savedIndexRaw = await AsyncStorage.getItem('activeStrataIndexMap');
  const newIndexMap = {
    ...emptyCategoryMap(() => 0),
    ...(savedIndexRaw ? JSON.parse(savedIndexRaw) : {}),
    [examCat]: strataNum - 1,
  };
  await AsyncStorage.setItem('activeStrataIndexMap', JSON.stringify(newIndexMap));

  if (onProgress) onProgress({ phase: 'done', percent: 100 });

  return {
    ok: true,
    examCategory: examCat,
    displayName: newEntry.displayName,
    bundleCount: incomingBundles.length,
    tier,
    strataId: incoming.strataId,
  };
}

/**
 * Batch installs all items that have 'NEW' or 'UPDATE_AVAILABLE' status.
 * Unactivated users will automatically sync all Basic strata while safely skipping Premium ones.
 */
export async function syncAllPendingStrata(itemsToSync, onBatchProgress, options = {}) {
  const isPremium = options.isUserActivated ?? (await checkUserPremiumStatus());
  const results = {
    total: itemsToSync.length,
    successCount: 0,
    failedCount: 0,
    skippedPremiumCount: 0,
    errors: [],
  };

  for (let i = 0; i < itemsToSync.length; i++) {
    const item = itemsToSync[i];

    // If user is not premium and this item is premium, skip and count
    if (item.tier === 'premium' && !isPremium) {
      results.skippedPremiumCount++;
      continue;
    }

    if (onBatchProgress) {
      onBatchProgress({
        currentIndex: i + 1,
        total: itemsToSync.length,
        currentItem: item,
      });
    }

    try {
      await downloadAndInstallStrata(item, { isUserActivated: isPremium });
      results.successCount++;
    } catch (err) {
      results.failedCount++;
      results.errors.push({ item, error: err.message });
      console.error(`Sync failed for ${item.displayName}:`, err);
    }
  }

  return results;
}
