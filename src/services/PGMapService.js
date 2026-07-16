import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOrCreateDeviceLicense } from './LicenseService';
import { ALL_CATEGORY_IDS, isClassCategory } from '../config/categories';
import { getClassPerformanceSummary } from '../database/queries';

// ─────────────────────────────────────────────────────────────────────────────
// PG MAP SERVICE
// Builds a tamper-evident progress snapshot and obfuscates it for QR encoding.
// Includes student profile (name, phone, school etc.) from AsyncStorage.
//
// v3 additions:
//   • Walks the full category registry (exam bodies + Basic/JSS/SS class levels)
//     instead of a hardcoded [JAMB, WAEC, NECO], so a class pupil's code carries
//     their class strata — and only categories that actually have data are sent.
//   • Carries the linked supervising-teacher code so the teacher app can claim
//     the pupil.
//   • Carries a plain per-class-level performance summary (overall % + per-subject
//     %, weakest first) read from exam_history — the "clear message of the child's
//     performance" the teacher scans.
//
// ⚠️ XOR + Base64 obfuscation only — not cryptographically secure.
// Upgrade to HMAC or an asymmetric scheme before treating as anti-cheat authority.
// ─────────────────────────────────────────────────────────────────────────────

const PG_MAP_KEY = 'PSP_2025_DMS_GROUPS_SECURE_KEY_XK92';

function xorEncode(text, key) {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(unescape(encodeURIComponent(result)));
}

function xorDecode(encoded, key) {
  const xored = decodeURIComponent(escape(atob(encoded)));
  let result = '';
  for (let i = 0; i < xored.length; i++) {
    result += String.fromCharCode(xored.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

export async function buildPGMapPayload() {
  try {
    const deviceCode = await getOrCreateDeviceLicense();

    const [strataRaw, profileRaw, teacherCode] = await Promise.all([
      AsyncStorage.getItem('examStrataMap'),
      AsyncStorage.getItem('studentProfile'),
      AsyncStorage.getItem('supervisingTeacherCode'),
    ]);

    const map     = strataRaw  ? JSON.parse(strataRaw)  : {};
    const profile = profileRaw ? JSON.parse(profileRaw) : null;

    // Plain rate picture per class level: overall average % plus each subject's
    // average % (weakest first). Empty {} for a pure exam-body candidate.
    const classPerformance = await getClassPerformanceSummary();

    const snapshot = {
      v: 3, // schema version — v3 adds teacher link + class performance
      deviceCode,
      teacherCode: teacherCode || null,
      generatedAt: new Date().toISOString(),
      student: profile ? {
        fullName:        profile.fullName        || '',
        dob:             profile.dob             || '',
        sex:             profile.sex             || '',
        phone:           profile.phone           || '',
        stateLocated:    profile.stateLocated    || '',
        forthcomingExam: profile.forthcomingExam || [],
        prevExam:        profile.prevExam        || '',
        expectation:     profile.expectation     || '',
        intendedCourse:  profile.intendedCourse  || '',
        profileDate:     profile.completedAt     || '',
      } : null,
      exams: {},
      classPerformance,
    };

    // Include only the categories this device actually has strata for, so a JSS
    // pupil's code isn't padded with empty exam-body sections (and vice-versa).
    const categoriesWithData = ALL_CATEGORY_IDS.filter(
      (id) => Array.isArray(map[id]) && map[id].length > 0
    );

    for (const category of categoriesWithData) {
      const strata = map[category] || [];
      snapshot.exams[category] = strata.map((st) => ({
        strataId: st.strataId,
        isClass:  isClassCategory(category),
        bundles: (st.bundles || []).map((b) => ({
          id:           b.id,
          name:         b.name,
          isCompleted:  !!b.isCompleted,
          lastScore:    b.lastScore ?? null,
          attemptCount: Array.isArray(b.attempts) ? b.attempts.length : 0,
          // NOTE: the per-attempt history (score/passed/timestamp of every try)
          // is intentionally NOT included here. It bloated the encoded string,
          // which produced a very dense QR that crashed low-RAM (<4GB) devices.
          // The teacher gets performance from `classPerformance` instead; full
          // attempt history, if ever needed, should travel as a file export.
        })),
      }));
    }

    const json    = JSON.stringify(snapshot);
    const encoded = xorEncode(json, PG_MAP_KEY);

    return { encoded, snapshot };
  } catch (err) {
    console.error('buildPGMapPayload error:', err);
    return { encoded: null, snapshot: null };
  }
}

// Reverse of buildPGMapPayload's encoding — teacher mode decodes a pupil's
// pasted/scanned string back into the snapshot object. Returns null on failure.
export function decodePGMapPayload(encoded) {
  try {
    if (!encoded || typeof encoded !== 'string') return null;
    const json = xorDecode(encoded.trim(), PG_MAP_KEY);
    const snap = JSON.parse(json);
    return snap && typeof snap === 'object' ? snap : null;
  } catch (err) {
    console.error('decodePGMapPayload error:', err);
    return null;
  }
}

// Length of the supervising-teacher code. Widened from 6 to 8 digits so each
// device's derived code is effectively unique — an 8-digit space (100,000,000)
// is 100x larger than 6 digits, making two devices colliding extremely unlikely.
// This is the single source of truth for the code length; the pupil-facing entry
// gate and editor read it too, so changing this one value re-sizes it everywhere.
export const TEACHER_CODE_LENGTH = 8;

// A teacher's code is derived deterministically from their device license, so it
// is stable, unique to that device, needs no account, and works fully offline.
// Pupils type this code; every pupil result they submit then carries it back.
export function deriveTeacherCode(license) {
  const seed = String(license || '');
  // FNV-1a hash of the unique device license, reduced to TEACHER_CODE_LENGTH
  // digits. Deterministic and synchronous — the same device always yields the
  // same code with no stored state.
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const span = Math.pow(10, TEACHER_CODE_LENGTH);
  return String(h % span).padStart(TEACHER_CODE_LENGTH, '0');
}

export async function getMyTeacherCode() {
  try {
    const license = await getOrCreateDeviceLicense();
    return deriveTeacherCode(license);
  } catch (err) {
    console.error('getMyTeacherCode error:', err);
    return null;
  }
}
