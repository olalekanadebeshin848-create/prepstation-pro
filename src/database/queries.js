import * as SQLite from 'expo-sqlite';

const DB_NAME = 'questions_v2.db';
let dbInstance = null;
let dbReadyPromise = null;

export function setDbInstance(instance) {
  dbInstance = instance;
  console.log('✅ queries.js received shared DB instance');
}

// Called by setup.js the moment initDatabase() starts, so anyone who calls
// getDb() before setup finishes awaits the SAME in-flight promise instead
// of opening a second competing connection.
export function setDbReadyPromise(promise) {
  dbReadyPromise = promise;
}

async function getDb() {
  if (dbInstance) return dbInstance;
  if (dbReadyPromise) {
    dbInstance = await dbReadyPromise;
    return dbInstance;
  }
  // Only reached if setup.js's initDatabase() was never called at all.
  console.warn('⚠️ getDb fallback triggered — initDatabase() was never called');
  dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
  return dbInstance;
}

// ... rest of queries.js (getSubjectsByExamBody, getQuestionsForSubject,
// getCustomQuestionSet, getTopicsBySubject, logExamResult, getExamHistory,
// getQuestionCount, clearExamHistory, getPupilRate, getSubjectRates,
// getClassPerformanceSummary, upsertRosterPupil, getRosterPupils,
// deleteRosterPupil, clearRoster) — unchanged, keep exactly as you have them.

export async function getSubjectsByExamBody(examBody) {
  try {
    const db = await getDb();
    return await db.getAllAsync(
      "SELECT * FROM subjects WHERE exam_body = ? ORDER BY name ASC;",
      [examBody || 'JAMB']
    );
  } catch (error) {
    console.error("Failed to fetch subjects:", error);
    return [];
  }
}

export async function getQuestionsForSubject(subjectId, limit = 40) {
  try {
    const db = await getDb();
    return await db.getAllAsync(
      "SELECT * FROM questions WHERE subject_id = ? ORDER BY RANDOM() LIMIT ?;",
      [Number(subjectId) || 0, Number(limit) || 40]
    );
  } catch (error) {
    console.error("Failed to load questions:", error);
    return [];
  }
}

export async function getCustomQuestionSet({ subjectId, limit }) {
  try {
    const db = await getDb();
    return await db.getAllAsync(
      "SELECT * FROM questions WHERE subject_id = ? ORDER BY RANDOM() LIMIT ?;",
      [Number(subjectId) || 0, Number(limit) || 40]
    );
  } catch (error) {
    console.error("Failed to load custom question set:", error);
    return [];
  }
}

export async function getTopicsBySubject(subjectId) {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync(
      "SELECT DISTINCT topic_name FROM questions WHERE subject_id = ? AND topic_name IS NOT NULL;",
      [Number(subjectId) || 0]
    );
    return rows.map(r => r.topic_name);
  } catch (error) {
    console.error("Failed to load topics:", error);
    return [];
  }
}

export async function logExamResult(resultPayload) {
  try {
    const db = await getDb();
    const safePayload = resultPayload || {};

    const subjectId        = safePayload.subjectId ?? safePayload.subject_id ?? null;
    const subjectName      = safePayload.subjectName ?? safePayload.subject_name ?? 'General Practice';
    const examBody         = safePayload.examBody ?? safePayload.exam_body ?? 'JAMB';
    const score            = safePayload.score ?? safePayload.finalScore ?? safePayload.rawScore ?? 0;
    const totalQuestions   = safePayload.totalQuestions ?? safePayload.totalQ ?? 0;
    const finalScore       = safePayload.finalScore ?? safePayload.score ?? 0;
    const rawScore         = safePayload.rawScore ?? safePayload.score ?? 0;
    const percentage       = safePayload.percentage ?? (totalQuestions > 0 ? Math.round((finalScore / totalQuestions) * 100) : 0);
    const requiredScore    = safePayload.requiredScore ?? 50;
    const tabSwitchCount   = safePayload.tabSwitchCount ?? 0;
    const penaltyDeduction = safePayload.penaltyDeduction ?? 0;
    const bundleName       = safePayload.bundleName || null;
    const wrongAnswers     = safePayload.wrongAnswers || [];
    const wrongAnswersStr  = typeof wrongAnswers === 'string' ? wrongAnswers : JSON.stringify(wrongAnswers);

    // ── Supervising-teacher / class-level testing fields ──
    const durationSeconds  = safePayload.durationSeconds ?? safePayload.duration_seconds ?? safePayload.duration ?? 0;
    const startedAt        = safePayload.startedAt ?? safePayload.started_at ?? null;
    const teacherCode      = safePayload.teacherCode ?? safePayload.teacher_code ?? null;
    const classLevel       = safePayload.classLevel ?? safePayload.class_level ?? null;

    const timestamp        = new Date().toISOString();

    await db.runAsync(
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
      ]
    );

    console.log('✅ Exam result logged successfully');
    return true;
  } catch (error) {
    console.error("Failed to log exam result:", error);
    return false;
  }
}

export async function getExamHistory() {
  try {
    const db = await getDb();
    return await db.getAllAsync("SELECT * FROM exam_history ORDER BY id ASC;");
  } catch (error) {
    console.error("Failed fetching exam history:", error);
    return [];
  }
}

export async function getQuestionCount(subjectId) {
  try {
    const db = await getDb();
    const result = await db.getFirstAsync(
      "SELECT COUNT(*) as count FROM questions WHERE subject_id = ?;",
      [Number(subjectId) || 0]
    );
    return result?.count || 0;
  } catch (error) {
    console.error("Failed to get question count:", error);
    return 0;
  }
}

export async function clearExamHistory() {
  try {
    const db = await getDb();
    await db.runAsync("DELETE FROM exam_history;");
    return true;
  } catch (error) {
    console.error("Failed to clear exam history:", error);
    return false;
  }
}

// ────────────────────────────────────────────────────────────
//  0–100% ACADEMIC RATE (plain percentages — no topic weighting)
// ────────────────────────────────────────────────────────────

// Overall rate = average of all test percentages. Optionally scope to
// a class level (e.g. 'JSS 2') by passing it in; omit for all history.
export async function getPupilRate(classLevel = null) {
  try {
    const db = await getDb();
    const row = classLevel
      ? await db.getFirstAsync(
          "SELECT AVG(percentage) as rate, COUNT(*) as tests FROM exam_history WHERE class_level = ?;",
          [classLevel]
        )
      : await db.getFirstAsync(
          "SELECT AVG(percentage) as rate, COUNT(*) as tests FROM exam_history;"
        );

    return {
      rate: Math.round(row?.rate || 0),   // 0–100
      testsTaken: row?.tests || 0,
    };
  } catch (error) {
    console.error("Failed to compute pupil rate:", error);
    return { rate: 0, testsTaken: 0 };
  }
}

// Per-subject rate, weakest first — this is the "what still needs work"
// view for both the pupil and (later) the supervising teacher.
export async function getSubjectRates(classLevel = null) {
  try {
    const db = await getDb();
    const rows = classLevel
      ? await db.getAllAsync(
          `SELECT subject_name,
                  ROUND(AVG(percentage)) as rate,
                  COUNT(*) as tests
           FROM exam_history
           WHERE class_level = ?
           GROUP BY subject_name
           ORDER BY rate ASC;`,
          [classLevel]
        )
      : await db.getAllAsync(
          `SELECT subject_name,
                  ROUND(AVG(percentage)) as rate,
                  COUNT(*) as tests
           FROM exam_history
           GROUP BY subject_name
           ORDER BY rate ASC;`
        );

    return rows.map(r => ({
      subject: r.subject_name || 'General',
      rate: r.rate || 0,   // 0–100
      tests: r.tests || 0,
    }));
  } catch (error) {
    console.error("Failed to compute subject rates:", error);
    return [];
  }
}

// One-pass rate summary for every class level that has recorded tests.
// Shape: { "JSS 2": { overallRate, testsTaken, subjects: [{ subject, rate, tests }] } }
// Subjects are weakest-first — this is exactly the plain performance picture
// the supervising teacher reads out of a pupil's PG Map.
export async function getClassPerformanceSummary() {
  try {
    const db = await getDb();

    const overallRows = await db.getAllAsync(
      `SELECT class_level,
              ROUND(AVG(percentage)) as rate,
              COUNT(*) as tests
       FROM exam_history
       WHERE class_level IS NOT NULL AND class_level != ''
       GROUP BY class_level;`
    );

    const subjectRows = await db.getAllAsync(
      `SELECT class_level,
              subject_name,
              ROUND(AVG(percentage)) as rate,
              COUNT(*) as tests
       FROM exam_history
       WHERE class_level IS NOT NULL AND class_level != ''
       GROUP BY class_level, subject_name
       ORDER BY class_level ASC, rate ASC;`
    );

    const summary = {};
    for (const r of overallRows) {
      summary[r.class_level] = {
        overallRate: r.rate || 0,   // 0–100, plain average of test %
        testsTaken:  r.tests || 0,
        subjects:    [],
      };
    }
    for (const s of subjectRows) {
      if (!summary[s.class_level]) {
        summary[s.class_level] = { overallRate: 0, testsTaken: 0, subjects: [] };
      }
      summary[s.class_level].subjects.push({
        subject: s.subject_name || 'General',
        rate:    s.rate || 0,       // 0–100
        tests:   s.tests || 0,
      });
    }
    return summary;
  } catch (error) {
    console.error("Failed to build class performance summary:", error);
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEACHER ROSTER — teacher mode stores each pupil decoded from their PG Map.
// A pupil is keyed by the device code in their snapshot, so re-loading an
// updated PG Map for the same pupil overwrites (upserts) their record.
// ─────────────────────────────────────────────────────────────────────────────

function safeParse(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

export async function upsertRosterPupil(pupil) {
  try {
    const db = await getDb();
    const {
      pupilDeviceCode, fullName = '', classLevels = [], overallRate = 0,
      performance = {}, teacherCode = '', snapshot = {},
    } = pupil || {};
    if (!pupilDeviceCode) return false;
    await db.runAsync(
      `INSERT INTO teacher_roster
         (pupil_device_code, full_name, class_levels, overall_rate, performance, teacher_code, snapshot, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(pupil_device_code) DO UPDATE SET
         full_name    = excluded.full_name,
         class_levels = excluded.class_levels,
         overall_rate = excluded.overall_rate,
         performance  = excluded.performance,
         teacher_code = excluded.teacher_code,
         snapshot     = excluded.snapshot,
         updated_at   = excluded.updated_at;`,
      [
        pupilDeviceCode,
        fullName,
        JSON.stringify(classLevels),
        Math.round(overallRate) || 0,
        JSON.stringify(performance),
        teacherCode,
        JSON.stringify(snapshot),
        new Date().toISOString(),
      ]
    );
    return true;
  } catch (error) {
    console.error("Failed to upsert roster pupil:", error);
    return false;
  }
}

export async function getRosterPupils() {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync("SELECT * FROM teacher_roster ORDER BY updated_at DESC;");
    return rows.map((r) => ({
      id:              r.id,
      pupilDeviceCode: r.pupil_device_code,
      fullName:        r.full_name || 'Unnamed pupil',
      classLevels:     safeParse(r.class_levels, []),
      overallRate:     r.overall_rate || 0,
      performance:     safeParse(r.performance, {}),
      teacherCode:     r.teacher_code || '',
      snapshot:        safeParse(r.snapshot, {}),
      updatedAt:       r.updated_at,
    }));
  } catch (error) {
    console.error("Failed to read roster:", error);
    return [];
  }
}

export async function deleteRosterPupil(pupilDeviceCode) {
  try {
    const db = await getDb();
    await db.runAsync("DELETE FROM teacher_roster WHERE pupil_device_code = ?;", [pupilDeviceCode]);
    return true;
  } catch (error) {
    console.error("Failed to delete roster pupil:", error);
    return false;
  }
}

export async function clearRoster() {
  try {
    const db = await getDb();
    await db.runAsync("DELETE FROM teacher_roster;");
    return true;
  } catch (error) {
    console.error("Failed to clear roster:", error);
    return false;
  }
}
