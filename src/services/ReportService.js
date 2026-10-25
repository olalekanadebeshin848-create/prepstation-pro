import AsyncStorage from '@react-native-async-storage/async-storage';
// The functional file API (writeAsStringAsync / readAsStringAsync / EncodingType
// / cacheDirectory) is deprecated on the main "expo-file-system" entry in newer
// SDKs. Expo preserves it at the "/legacy" entry point, which is exactly the API
// used below — so import from there. (Future option: migrate to the new File /
// Paths classes.)
import * as FileSystem from 'expo-file-system/legacy';
// New-API File class (SDK 54+) for the primary read path below. If the installed
// version predates it, `new File()` throws and we fall back to the legacy reads.
import { File } from 'expo-file-system';
// pako ships as a CJS/ESM module that marks itself __esModule but exposes only
// named exports (no default). `import pako from 'pako'` therefore resolves to
// undefined under Metro/Babel interop. Import the namespace and fall back to it
// when there's no real default, so pako.deflate / pako.inflate always resolve.
import * as pakoImport from 'pako';
const pako = pakoImport && pakoImport.default ? pakoImport.default : pakoImport;
import { getOrCreateDeviceLicense } from './LicenseService';
import { getClassTestsForReport } from '../database/queries';

// ─────────────────────────────────────────────────────────────────────────────
// REPORT SERVICE — "answer breakdown"
//
// Carries the per-question detail of every class test to the teacher. This is
// far too big for a QR (that density is what crashed low-RAM phones) AND, at
// 500-question bundles, too big for a comfortable copy-paste. So it is:
//   1. COMPRESSED with pako (deflate) — repeated JSON keys / subject names /
//      option letters collapse to almost nothing, cutting size ~3–4x. pako is
//      pure JavaScript, so no native rebuild is needed for the compression.
//   2. Written to a small .psr FILE and shared one-tap (expo-sharing) instead
//      of pasted. A file has no practical size limit and no paste friction.
//
// DESKTOP (Electron): expo-file-system has NO web implementation, so
// FileSystem.writeAsStringAsync() throws UnavailabilityError on the Electron
// renderer. window.electronFile (exposed by preload.js) is used instead, which
// writes the file for real using Node fs in the main process.
//
// PRIVACY BY DESIGN: the pupil's phone graded locally and knows the answers,
// but this report KEEPS ONLY the question and the option the pupil picked. The
// correct answer, solution text, and explanation are stripped here and never
// leave the device.
// ─────────────────────────────────────────────────────────────────────────────

const ElectronFile = (typeof window !== 'undefined' && window.electronFile) ? window.electronFile : null;

// Uint8Array → base64, chunked so a large array doesn't blow the call stack.
// btoa/atob are available in the app runtime (the PG Map already uses them).
function bytesToBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// JSON string → compressed base64 string. pako 2.x encodes the string as UTF-8
// before deflating, so non-ASCII question text round-trips correctly.
function encodeReport(jsonStr) {
  const deflated = pako.deflate(jsonStr);
  return 'PSRz1:' + bytesToBase64(deflated); // small marker so we can spot our format
}

// Compressed base64 string → JSON string (or null if it isn't our format).
function decodeReport(encoded) {
  const raw = (encoded || '').trim();
  if (!raw.startsWith('PSRz1:')) return null;
  const bytes = base64ToBytes(raw.slice(6));
  return pako.inflate(bytes, { to: 'string' });
}

// Build the pupil's answer-breakdown report object from their class tests, with
// the solution stripped. Returns { report, encoded, testCount, missCount }.
async function buildBreakdownReport() {
  const deviceCode = await getOrCreateDeviceLicense();
  const [profileRaw, teacherCode] = await Promise.all([
    AsyncStorage.getItem('studentProfile'),
    AsyncStorage.getItem('supervisingTeacherCode'),
  ]);
  const profile = profileRaw ? JSON.parse(profileRaw) : null;

  const tests = await getClassTestsForReport();

  let missCount = 0;
  const strippedTests = tests.map((t) => {
    const misses = (t.wrongAnswers || []).map((w) => {
      missCount += 1;
      return {
        subject: w.subjectName || t.classLevel || 'General',
        q:       w.questionText || '',
        // The option the pupil picked — letter + text. NOTHING about the correct
        // answer travels: no correctKey, no correctAnswerText, no explanation.
        pk: w.studentKey || null,
        pt: w.studentAnswer || 'Not answered',
      };
    });
    return {
      id:  t.id,
      cl:  t.classLevel,
      bn:  t.bundleName,
      sn:  t.subjectName,
      dt:  t.date,
      pct: t.percentage,
      tq:  t.totalQuestions,
      misses,
    };
  });

  const report = {
    v: 2,
    type: 'psr',
    deviceCode,
    teacherCode: teacherCode || null,
    pupilName: (profile && profile.fullName) || 'Unnamed pupil',
    generatedAt: new Date().toISOString(),
    tests: strippedTests,
  };

  const encoded = encodeReport(JSON.stringify(report));
  return { report, encoded, testCount: strippedTests.length, missCount };
}

// PUPIL: build + compress + write a .psr file. Returns { uri, testCount,
// missCount } so the caller can hand the uri to expo-sharing (native/plain web)
// or to the Electron "show in folder" flow (desktop). uri is null when there
// are no class tests to send, or when the write itself failed.
export async function exportAnswerBreakdownFile() {
  try {
    const { encoded, testCount, missCount, report } = await buildBreakdownReport();
    if (!encoded || testCount === 0) return { uri: null, testCount: 0, missCount: 0 };

    const safeName = (report.pupilName || 'pupil').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pupil';
    const filename = `Breakdown-${safeName}.psr`;

    // DESKTOP (Electron): write the file for real via the main process, since
    // expo-file-system throws UnavailabilityError in this renderer.
    if (ElectronFile) {
      const result = await ElectronFile.writeBreakdown(filename, encoded);
      if (!result || !result.success) {
        console.error('exportAnswerBreakdownFile (electron) error:', result && result.error);
        return { uri: null, testCount: 0, missCount: 0, error: true };
      }
      // Flag isElectron:true so HomeScreen knows to use showInFolder/saveAs
      // instead of expo-sharing, which doesn't work on desktop either.
      return { uri: result.path, testCount, missCount, isElectron: true };
    }

    // NATIVE / plain browser: original expo-file-system path.
    const uri = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(uri, encoded, { encoding: FileSystem.EncodingType.UTF8 });
    return { uri, testCount, missCount };
  } catch (err) {
    console.error('exportAnswerBreakdownFile error:', err);
    return { uri: null, testCount: 0, missCount: 0, error: true };
  }
}

// DESKTOP ONLY: let the pupil pick a permanent save location (Desktop, USB
// drive, etc.) via a native save dialog, instead of the temp folder above.
export async function saveAnswerBreakdownFileAs(pupilName) {
  if (!ElectronFile) return { uri: null, error: 'Not running on desktop' };
  try {
    const { encoded, testCount, report } = await buildBreakdownReport();
    if (!encoded || testCount === 0) return { uri: null, testCount: 0 };
    const safeName = (report.pupilName || pupilName || 'pupil').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pupil';
    const filename = `Breakdown-${safeName}.psr`;
    const result = await ElectronFile.saveBreakdownAs(filename, encoded);
    if (!result || !result.success) return { uri: null, testCount, canceled: !!(result && result.canceled) };
    return { uri: result.path, testCount };
  } catch (err) {
    console.error('saveAnswerBreakdownFileAs error:', err);
    return { uri: null, error: true };
  }
}

// Normalises the compact field names back to what the teacher UI reads.
function expandReport(report) {
  if (!report || typeof report !== 'object' || report.type !== 'psr') return null;
  return {
    deviceCode:  report.deviceCode,
    teacherCode: report.teacherCode,
    pupilName:   report.pupilName,
    generatedAt: report.generatedAt,
    tests: (report.tests || []).map((t) => ({
      id:             t.id,
      classLevel:     t.cl,
      bundleName:     t.bn,
      subjectName:    t.sn,
      date:           t.dt,
      percentage:     t.pct,
      totalQuestions: t.tq,
      misses: (t.misses || []).map((m) => ({
        subject:    m.subject,
        q:          m.q,
        pickedKey:  m.pk,
        pickedText: m.pt,
      })),
    })),
  };
}

// A file handed over by another app (WhatsApp → document picker) can land in a
// cache path the sandboxed file API refuses to read directly — especially inside
// Expo Go. Try several strategies so a standalone build always works and Expo Go
// works when it can.
async function readPickedText(uri) {
  // 1. New File API (recommended, non-deprecated).
  try {
    const f = new File(uri);
    const txt = await f.text();
    if (txt) return txt;
  } catch (e) { /* fall through */ }
  // 2. Copy into our OWN cache first, then read the copy — sidesteps read
  //    permission quirks on the picker's own cache path.
  try {
    const dest = `${FileSystem.cacheDirectory}import-breakdown.psr`;
    try { await FileSystem.deleteAsync(dest, { idempotent: true }); } catch (e) { /* ignore */ }
    await FileSystem.copyAsync({ from: uri, to: dest });
    return await FileSystem.readAsStringAsync(dest, { encoding: FileSystem.EncodingType.UTF8 });
  } catch (e) { /* fall through */ }
  // 3. Last resort — direct legacy read.
  return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
}

// TEACHER: read a picked .psr file → expanded report object (or null).
export async function readAnswerBreakdownFile(uri) {
  try {
    const encoded = await readPickedText(uri);
    const json = decodeReport(encoded);
    if (!json) return null;
    return expandReport(JSON.parse(json));
  } catch (err) {
    console.error('readAnswerBreakdownFile error:', err);
    return null;
  }
}

// DESKTOP ONLY: teacher-side file picker + read, using the native dialog
// instead of expo-document-picker (which also has no web implementation).
export async function pickAndReadAnswerBreakdownFile() {
  if (!ElectronFile) return null;
  try {
    const result = await ElectronFile.pickAndReadBreakdown();
    if (!result || !result.success) return null;
    const json = decodeReport(result.contents);
    if (!json) return null;
    return expandReport(JSON.parse(json));
  } catch (err) {
    console.error('pickAndReadAnswerBreakdownFile error:', err);
    return null;
  }
}

// Kept for flexibility (e.g. a pasted fallback): decode a raw string too.
export function decodeAnswerBreakdown(encoded) {
  try {
    const json = decodeReport(encoded);
    if (!json) return null;
    return expandReport(JSON.parse(json));
  } catch (err) {
    console.error('decodeAnswerBreakdown error:', err);
    return null;
  }
}
