// electron-app/main/db/queries.js
// ─────────────────────────────────────────────────────────────────────────────
// Main-process port of your mobile src/database/queries.js, on sql.js. Functions
// are ASYNC only because sql.js loads its WASM asynchronously (the queries
// themselves run synchronously once loaded). Every name and return shape matches
// the mobile version, so the renderer shim (src/database/queries.web.js) just
// forwards each call. Mutations write the DB back to disk via persist().
// ─────────────────────────────────────────────────────────────────────────────

const { getDb, persist } = require('./database');

function safeParse(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

// ── sql.js helpers (mimic better-sqlite3's all/get/run) ──
function all(db, sql, params) {
  const stmt = db.prepare(sql);
  if (params && params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
function get(db, sql, params) {
  const stmt = db.prepare(sql);
  if (params && params.length) stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : undefined;
  stmt.free();
  return row;
}
function run(db, sql, params) {
  db.run(sql, params && params.length ? params : undefined);
}

// ── lifecycle ──
async function initDatabase() {
  try { await getDb(); return true; }
  catch (e) { console.error('❌ Desktop DB init failed:', e); return false; }
}

async function resetDatabase() {
  try {
    const db = await getDb();
    db.run(`DROP TABLE IF EXISTS exam_history;
            DROP TABLE IF EXISTS questions;
            DROP TABLE IF EXISTS subjects;`);
    persist(db);
    return true;
  } catch (e) { console.error('❌ Reset failed:', e); return false; }
}

async function getDatabaseStats() {
  try {
    const db = await getDb();
    return {
      subjects:    (get(db, 'SELECT COUNT(*) AS count FROM subjects;') || {}).count || 0,
      questions:   (get(db, 'SELECT COUNT(*) AS count FROM questions;') || {}).count || 0,
      examHistory: (get(db, 'SELECT COUNT(*) AS count FROM exam_history;') || {}).count || 0,
    };
  } catch (e) { console.error('Failed to get stats:', e); return null; }
}

// ── questions / subjects ──
async function getSubjectsByExamBody(examBody) {
  try {
    const db = await getDb();
    return all(db, 'SELECT * FROM subjects WHERE exam_body = ? ORDER BY name ASC;', [examBody || 'JAMB']);
  } catch (e) { console.error('Failed to fetch subjects:', e); return []; }
}

async function getQuestionsForSubject(subjectId, limit = 40) {
  try {
    const db = await getDb();
    return all(db, 'SELECT * FROM questions WHERE subject_id = ? ORDER BY RANDOM() LIMIT ?;',
      [Number(subjectId) || 0, Number(limit) || 40]);
  } catch (e) { console.error('Failed to load questions:', e); return []; }
}

async function getCustomQuestionSet(arg) {
  try {
    const db = await getDb();
    const { subjectId, limit } = arg || {};
    return all(db, 'SELECT * FROM questions WHERE subject_id = ? ORDER BY RANDOM() LIMIT ?;',
      [Number(subjectId) || 0, Number(limit) || 40]);
  } catch (e) { console.error('Failed to load custom question set:', e); return []; }
}

async function getTopicsBySubject(subjectId) {
  try {
    const db = await getDb();
    const rows = all(db, 'SELECT DISTINCT topic_name FROM questions WHERE subject_id = ? AND topic_name IS NOT NULL;',
      [Number(subjectId) || 0]);
    return rows.map((r) => r.topic_name);
  } catch (e) { console.error('Failed to load topics:', e); return []; }
}

async function getQuestionCount(subjectId) {
  try {
    const db = await getDb();
    const row = get(db, 'SELECT COUNT(*) AS count FROM questions WHERE subject_id = ?;', [Number(subjectId) || 0]);
    return (row && row.count) || 0;
  } catch (e) { console.error('Failed to get question count:', e); return 0; }
}

// ── exam history ──
async function logExamResult(resultPayload) {
  try {
    const db = await getDb();
    const p = resultPayload || {};

    const subjectId        = p.subjectId ?? p.subject_id ?? null;
    const subjectName      = p.subjectName ?? p.subject_name ?? 'General Practice';
    const examBody         = p.examBody ?? p.exam_body ?? 'JAMB';
    const score            = p.score ?? p.finalScore ?? p.rawScore ?? 0;
    const totalQuestions   = p.totalQuestions ?? p.totalQ ?? 0;
    const finalScore       = p.finalScore ?? p.score ?? 0;
    const rawScore         = p.rawScore ?? p.score ?? 0;
    const percentage       = p.percentage ?? (totalQuestions > 0 ? Math.round((finalScore / totalQuestions) * 100) : 0);
    const requiredScore    = p.requiredScore ?? 50;
    const tabSwitchCount   = p.tabSwitchCount ?? 0;
    const penaltyDeduction = p.penaltyDeduction ?? 0;
    const bundleName       = p.bundleName || null;
    const wrongAnswers     = p.wrongAnswers || [];
    const wrongAnswersStr  = typeof wrongAnswers === 'string' ? wrongAnswers : JSON.stringify(wrongAnswers);

    const durationSeconds  = p.durationSeconds ?? p.duration_seconds ?? p.duration ?? 0;
    const startedAt        = p.startedAt ?? p.started_at ?? null;
    const teacherCode      = p.teacherCode ?? p.teacher_code ?? null;
    const classLevel       = p.classLevel ?? p.class_level ?? null;
    const timestamp        = new Date().toISOString();

    run(db,
      `INSERT INTO exam_history (
        subject_id, subject_name, exam_body, score, total_questions,
        final_score, raw_score, percentage, required_score,
        tab_switch_count, penalty_deduction, wrong_answers, bundle_name,
        duration_seconds, started_at, teacher_code, class_level, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        subjectId ? Number(subjectId) : null,
        subjectName, examBody,
        Number(score), Number(totalQuestions),
        Number(finalScore), Number(rawScore),
        Number(percentage), Number(requiredScore),
        Number(tabSwitchCount), Number(penaltyDeduction),
        wrongAnswersStr, bundleName,
        Number(durationSeconds), startedAt, teacherCode, classLevel,
        timestamp,
      ]);
    persist(db);
    return true;
  } catch (e) { console.error('Failed to log exam result:', e); return false; }
}

async function getExamHistory() {
  try {
    const db = await getDb();
    return all(db, 'SELECT * FROM exam_history ORDER BY id ASC;');
  } catch (e) { console.error('Failed fetching exam history:', e); return []; }
}

async function clearExamHistory() {
  try {
    const db = await getDb();
    run(db, 'DELETE FROM exam_history;');
    persist(db);
    return true;
  } catch (e) { console.error('Failed to clear exam history:', e); return false; }
}

// ── rates ──
async function getPupilRate(classLevel = null) {
  try {
    const db = await getDb();
    const row = classLevel
      ? get(db, 'SELECT AVG(percentage) AS rate, COUNT(*) AS tests FROM exam_history WHERE class_level = ?;', [classLevel])
      : get(db, 'SELECT AVG(percentage) AS rate, COUNT(*) AS tests FROM exam_history;');
    return { rate: Math.round((row && row.rate) || 0), testsTaken: (row && row.tests) || 0 };
  } catch (e) { console.error('Failed to compute pupil rate:', e); return { rate: 0, testsTaken: 0 }; }
}

async function getSubjectRates(classLevel = null) {
  try {
    const db = await getDb();
    const rows = classLevel
      ? all(db, `SELECT subject_name, ROUND(AVG(percentage)) AS rate, COUNT(*) AS tests
                 FROM exam_history WHERE class_level = ?
                 GROUP BY subject_name ORDER BY rate ASC;`, [classLevel])
      : all(db, `SELECT subject_name, ROUND(AVG(percentage)) AS rate, COUNT(*) AS tests
                 FROM exam_history
                 GROUP BY subject_name ORDER BY rate ASC;`);
    return rows.map((r) => ({ subject: r.subject_name || 'General', rate: r.rate || 0, tests: r.tests || 0 }));
  } catch (e) { console.error('Failed to compute subject rates:', e); return []; }
}

async function getClassPerformanceSummary() {
  try {
    const db = await getDb();
    const overallRows = all(db,
      `SELECT class_level, ROUND(AVG(percentage)) AS rate, COUNT(*) AS tests
       FROM exam_history WHERE class_level IS NOT NULL AND class_level != ''
       GROUP BY class_level;`);
    const subjectRows = all(db,
      `SELECT class_level, subject_name, ROUND(AVG(percentage)) AS rate, COUNT(*) AS tests
       FROM exam_history WHERE class_level IS NOT NULL AND class_level != ''
       GROUP BY class_level, subject_name ORDER BY class_level ASC, rate ASC;`);

    const summary = {};
    for (const r of overallRows) {
      summary[r.class_level] = { overallRate: r.rate || 0, testsTaken: r.tests || 0, subjects: [] };
    }
    for (const s of subjectRows) {
      if (!summary[s.class_level]) summary[s.class_level] = { overallRate: 0, testsTaken: 0, subjects: [] };
      summary[s.class_level].subjects.push({ subject: s.subject_name || 'General', rate: s.rate || 0, tests: s.tests || 0 });
    }
    return summary;
  } catch (e) { console.error('Failed to build class performance summary:', e); return {}; }
}

// ── teacher roster ──
async function upsertRosterPupil(pupil) {
  try {
    const db = await getDb();
    const {
      pupilDeviceCode, fullName = '', classLevels = [], overallRate = 0,
      performance = {}, teacherCode = '', snapshot = {},
    } = pupil || {};
    if (!pupilDeviceCode) return false;
    run(db,
      `INSERT INTO teacher_roster
         (pupil_device_code, full_name, class_levels, overall_rate, performance, teacher_code, snapshot, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(pupil_device_code) DO UPDATE SET
         full_name = excluded.full_name, class_levels = excluded.class_levels,
         overall_rate = excluded.overall_rate, performance = excluded.performance,
         teacher_code = excluded.teacher_code, snapshot = excluded.snapshot,
         updated_at = excluded.updated_at;`,
      [
        pupilDeviceCode, fullName, JSON.stringify(classLevels),
        Math.round(overallRate) || 0, JSON.stringify(performance),
        teacherCode, JSON.stringify(snapshot), new Date().toISOString(),
      ]);
    persist(db);
    return true;
  } catch (e) { console.error('Failed to upsert roster pupil:', e); return false; }
}

async function getRosterPupils() {
  try {
    const db = await getDb();
    const rows = all(db, 'SELECT * FROM teacher_roster ORDER BY updated_at DESC;');
    return rows.map((r) => ({
      id: r.id,
      pupilDeviceCode: r.pupil_device_code,
      fullName: r.full_name || 'Unnamed pupil',
      classLevels: safeParse(r.class_levels, []),
      overallRate: r.overall_rate || 0,
      performance: safeParse(r.performance, {}),
      teacherCode: r.teacher_code || '',
      snapshot: safeParse(r.snapshot, {}),
      updatedAt: r.updated_at,
    }));
  } catch (e) { console.error('Failed to read roster:', e); return []; }
}

async function deleteRosterPupil(pupilDeviceCode) {
  try {
    const db = await getDb();
    run(db, 'DELETE FROM teacher_roster WHERE pupil_device_code = ?;', [pupilDeviceCode]);
    persist(db);
    return true;
  } catch (e) { console.error('Failed to delete roster pupil:', e); return false; }
}

async function clearRoster() {
  try {
    const db = await getDb();
    run(db, 'DELETE FROM teacher_roster;');
    persist(db);
    return true;
  } catch (e) { console.error('Failed to clear roster:', e); return false; }
}

// ── answer breakdown ──
async function getClassTestsForReport() {
  try {
    const db = await getDb();
    const rows = all(db,
      `SELECT id, subject_name, bundle_name, class_level, teacher_code,
              percentage, total_questions, wrong_answers, timestamp
       FROM exam_history WHERE class_level IS NOT NULL AND class_level != ''
       ORDER BY timestamp DESC;`);
    return rows.map((r) => ({
      id: r.id,
      subjectName: r.subject_name || 'General',
      bundleName: r.bundle_name || '',
      classLevel: r.class_level || '',
      teacherCode: r.teacher_code || '',
      percentage: r.percentage || 0,
      totalQuestions: r.total_questions || 0,
      date: r.timestamp,
      wrongAnswers: safeParse(r.wrong_answers, []),
    }));
  } catch (e) { console.error('Failed to read class tests for report:', e); return []; }
}

async function saveImportedReport(arg) {
  try {
    const db = await getDb();
    const { pupilDeviceCode, fullName = '', teacherCode = '', report = {} } = arg || {};
    if (!pupilDeviceCode) return false;
    run(db,
      `INSERT INTO pupil_reports (pupil_device_code, full_name, teacher_code, report, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(pupil_device_code) DO UPDATE SET
         full_name = excluded.full_name, teacher_code = excluded.teacher_code,
         report = excluded.report, updated_at = excluded.updated_at;`,
      [pupilDeviceCode, fullName, teacherCode, JSON.stringify(report), new Date().toISOString()]);
    persist(db);
    return true;
  } catch (e) { console.error('Failed to save imported report:', e); return false; }
}

async function getReportForPupil(pupilDeviceCode) {
  try {
    const db = await getDb();
    const row = get(db, 'SELECT * FROM pupil_reports WHERE pupil_device_code = ?;', [pupilDeviceCode]);
    if (!row) return null;
    const parsed = safeParse(row.report, null);
    return parsed ? { ...parsed, updatedAt: row.updated_at } : null;
  } catch (e) { console.error('Failed to read pupil report:', e); return null; }
}

async function getReportPupilCodes() {
  try {
    const db = await getDb();
    return all(db, 'SELECT pupil_device_code FROM pupil_reports;').map((r) => r.pupil_device_code);
  } catch (e) { console.error('Failed to read report codes:', e); return []; }
}

async function deleteReportForPupil(pupilDeviceCode) {
  try {
    const db = await getDb();
    run(db, 'DELETE FROM pupil_reports WHERE pupil_device_code = ?;', [pupilDeviceCode]);
    persist(db);
    return true;
  } catch (e) { console.error('Failed to delete pupil report:', e); return false; }
}

module.exports = {
  initDatabase, resetDatabase, getDatabaseStats,
  getSubjectsByExamBody, getQuestionsForSubject, getCustomQuestionSet, getTopicsBySubject, getQuestionCount,
  logExamResult, getExamHistory, clearExamHistory,
  getPupilRate, getSubjectRates, getClassPerformanceSummary,
  upsertRosterPupil, getRosterPupils, deleteRosterPupil, clearRoster,
  getClassTestsForReport, saveImportedReport, getReportForPupil, getReportPupilCodes, deleteReportForPupil,
};
