// electron-app/main/preload.js
// ─────────────────────────────────────────────────────────────────────────────
// Runs in an isolated context between Electron and your web UI. It exposes ONLY
// the named bridges below — nothing else from Node/Electron leaks into the page.
// contextIsolation stays ON.
//   window.desktopLicense → licensing
//   window.electronDB     → the database (what src/database/queries.web.js calls)
//   window.electronFile   → file export/import (what ReportService.js calls)
// ─────────────────────────────────────────────────────────────────────────────

const { contextBridge, ipcRenderer } = require('electron');

// ── Licensing bridge ──
contextBridge.exposeInMainWorld('desktopLicense', {
  getDeviceId:     () => ipcRenderer.invoke('license:getDeviceId'),
  checkActivation: () => ipcRenderer.invoke('license:checkActivation'),
  activate:        (key) => ipcRenderer.invoke('license:activate', key),
  getStrataCode:   () => ipcRenderer.invoke('license:getStrataCode'),
  validateStrata:  (parsedJson) => ipcRenderer.invoke('strata:validate', parsedJson),
  isDesktop: true,
});

// ── Database bridge ── (names match mobile queries.js exactly)
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

const electronDB = {};
for (const name of DB_METHODS) {
  electronDB[name] = (...args) => ipcRenderer.invoke(`db:${name}`, ...args);
}
contextBridge.exposeInMainWorld('electronDB', electronDB);

// ── File bridge (NEW) ── expo-file-system has no web implementation, so the
// pupil-side .psr export and teacher-side .psr import both go through here.
contextBridge.exposeInMainWorld('electronFile', {
  writeBreakdown:      (filename, contents) => ipcRenderer.invoke('file:writeBreakdown', { filename, contents }),
  saveBreakdownAs:     (filename, contents) => ipcRenderer.invoke('file:saveBreakdownAs', { filename, contents }),
  showInFolder:        (filePath) => ipcRenderer.invoke('file:showInFolder', filePath),
  pickAndReadBreakdown: () => ipcRenderer.invoke('file:pickAndReadBreakdown'),
});
