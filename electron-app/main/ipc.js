// electron-app/main/ipc.js
// ─────────────────────────────────────────────────────────────────────────────
// Registers every main-process handler the renderer (your React-Native-Web UI)
// can call over IPC — licensing and the database. This is the ONLY surface the UI
// can reach; it can't touch the filesystem, the DB, or the license internals
// directly.
// ─────────────────────────────────────────────────────────────────────────────

const { getUniqueDeviceId } = require('./license/deviceId');
const { checkCurrentActivationStatus, saveSuccessfulActivation } = require('./license/activation');
const { verifyOfflineLicense } = require('./license/rsaVerify');
const { getOrCreateDeviceLicense, validateLicenseInFile } = require('./license/strataLicense');
const db = require('./db/queries');

// Database methods exposed 1:1 as `db:<name>` channels. Names + arg order match
// the mobile queries.js exactly, so the renderer shim just forwards.
const DB_METHODS = [
  'initDatabase', 'resetDatabase', 'getDatabaseStats',
  'getSubjectsByExamBody', 'getQuestionsForSubject', 'getCustomQuestionSet',
  'getTopicsBySubject', 'getQuestionCount',
  'logExamResult', 'getExamHistory', 'clearExamHistory',
  'getPupilRate', 'getSubjectRates', 'getClassPerformanceSummary',
  'upsertRosterPupil', 'getRosterPupils', 'deleteRosterPupil', 'clearRoster',
  'getClassTestsForReport', 'saveImportedReport', 'getReportForPupil',
  'getReportPupilCodes', 'deleteReportForPupil',
];

function registerIpc(ipcMain) {
  // ── Licensing: RSA activation ──
  ipcMain.handle('license:getDeviceId', () => getUniqueDeviceId());
  ipcMain.handle('license:checkActivation', () => checkCurrentActivationStatus());
  ipcMain.handle('license:activate', (_evt, enteredKey) => {
    const deviceId = getUniqueDeviceId();
    if (!verifyOfflineLicense(deviceId, enteredKey)) return { success: false, reason: 'INVALID_KEY' };
    return saveSuccessfulActivation(enteredKey);
  });

  // ── Licensing: strata lock ──
  ipcMain.handle('license:getStrataCode', () => getOrCreateDeviceLicense());
  ipcMain.handle('strata:validate', (_evt, parsedJson) => validateLicenseInFile(parsedJson));

  // ── Database ── (better-sqlite3 is synchronous; the return value resolves the
  // renderer's invoke() Promise automatically)
  for (const name of DB_METHODS) {
    ipcMain.handle(`db:${name}`, (_evt, ...args) => {
      try {
        return db[name](...args);
      } catch (err) {
        console.error(`db:${name} failed:`, err);
        return null;
      }
    });
  }
}

module.exports = { registerIpc, DB_METHODS };
