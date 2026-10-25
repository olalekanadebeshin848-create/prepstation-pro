// src/database/queries.web.js
// ─────────────────────────────────────────────────────────────────────────────
// Metro automatically picks THIS file on web/desktop instead of queries.js, so
// your screens keep importing '../database/queries' unchanged. Every call forwards
// to the Electron main process via window.electronDB (the preload bridge).
//
// In a plain browser (npx expo start --web WITHOUT Electron) window.electronDB is
// absent, so each function returns a safe empty value and the UI still renders —
// data just won't load until you're running inside Electron.
// ─────────────────────────────────────────────────────────────────────────────

const DB = (typeof window !== 'undefined' && window.electronDB) ? window.electronDB : null;

const call = (name, fallback) => async (...args) => {
  if (!DB) return fallback;
  try {
    const r = await DB[name](...args);
    return (r === null || r === undefined) ? fallback : r;
  } catch (e) {
    console.warn(`electronDB.${name} failed`, e);
    return fallback;
  }
};

// No-ops kept so imports that existed against the native queries.js still resolve.
export function setDbInstance() {}
export function setDbReadyPromise() {}

export const getSubjectsByExamBody      = call('getSubjectsByExamBody', []);
export const getQuestionsForSubject     = call('getQuestionsForSubject', []);
export const getCustomQuestionSet       = call('getCustomQuestionSet', []);
export const getTopicsBySubject         = call('getTopicsBySubject', []);
export const getQuestionCount           = call('getQuestionCount', 0);
export const logExamResult              = call('logExamResult', false);
export const getExamHistory             = call('getExamHistory', []);
export const clearExamHistory           = call('clearExamHistory', false);
export const getPupilRate               = call('getPupilRate', { rate: 0, testsTaken: 0 });
export const getSubjectRates            = call('getSubjectRates', []);
export const getClassPerformanceSummary = call('getClassPerformanceSummary', {});
export const upsertRosterPupil          = call('upsertRosterPupil', false);
export const getRosterPupils            = call('getRosterPupils', []);
export const deleteRosterPupil          = call('deleteRosterPupil', false);
export const clearRoster                = call('clearRoster', false);
export const getClassTestsForReport     = call('getClassTestsForReport', []);
export const saveImportedReport         = call('saveImportedReport', false);
export const getReportForPupil          = call('getReportForPupil', null);
export const getReportPupilCodes        = call('getReportPupilCodes', []);
export const deleteReportForPupil       = call('deleteReportForPupil', false);
