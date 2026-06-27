// queries.js
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'questions_v2.db';
let dbInstance = null;
let connectionPromise = null;

/**
 * Thread-safe singleton accessor for the database handle.
 */
async function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  if (!connectionPromise) {
    connectionPromise = (async () => {
      try {
        const db = await SQLite.openDatabaseAsync(DB_NAME);
        
        try {
          if (typeof db.runAsync === 'function') {
            await db.runAsync('PRAGMA journal_mode = WAL;');
            await db.runAsync('PRAGMA foreign_keys = ON;');
          }
        } catch (pragmaErr) {
          console.log("Pragma tuning skipped or unsupported on this device profile:", pragmaErr.message);
        }

        dbInstance = db;
        return db;
      } catch (error) {
        console.error("Critical database connection initialization failure:", error);
        throw error;
      } finally {
        connectionPromise = null;
      }
    })();
  }

  return connectionPromise;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SUBJECT QUERIES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Get all subjects for a specific exam body
 */
export async function getSubjectsByExamBody(examBody) {
  try {
    const db = await getDb();
    const sanitizedExamBody = examBody || 'JAMB';

    if (typeof db.getAllAsync === 'function') {
      return await db.getAllAsync(
        "SELECT * FROM subjects WHERE exam_body = ? ORDER BY name ASC;",
        [sanitizedExamBody]
      );
    }
    return [];
  } catch (error) {
    console.error("Failed to fetch subjects by exam body:", error);
    return [];
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUESTION BANK ENGINE QUERIES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Fetch localized sample randomized questions for test configurations
 */
export async function getQuestionsForSubject(subjectId, limit = 40) {
  try {
    const db = await getDb();
    
    const sanitizedSubjectId = Number(subjectId) || 0;
    const sanitizedLimit = Number(limit) && Number(limit) > 0 ? Number(limit) : 40;

    if (typeof db.getAllAsync === 'function') {
      return await db.getAllAsync(
        "SELECT * FROM questions WHERE subject_id = ? ORDER BY RANDOM() LIMIT ?;",
        [sanitizedSubjectId, sanitizedLimit]
      );
    }
    return [];
  } catch (error) {
    console.error("Failed to load active question vectors:", error);
    return [];
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXAM SESSION OPERATION LOGS (ANALYTICS ENGINE)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Commit single test results bundle payload into persistent cache store
 */
export async function logExamResult(resultPayload) {
  try {
    const db = await getDb();
    const timestamp = new Date().toISOString();
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

    const wrongAnswers = safePayload.wrongAnswers || [];
    const wrongAnswersStr = typeof wrongAnswers === 'string' ? wrongAnswers : JSON.stringify(wrongAnswers);

    const query = `INSERT INTO exam_history (
      subject_id, subject_name, exam_body, score, total_questions,
      final_score, raw_score, percentage, required_score,
      tab_switch_count, penalty_deduction, wrong_answers, bundle_name, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`;

    const params = [
      subjectId ? Number(subjectId) : null,
      subjectName,
      examBody,
      Number(score),
      Number(totalQuestions),
      Number(finalScore),
      Number(rawScore),
      Number(percentage),
      Number(requiredScore),
      Number(tabSwitchCount),
      Number(penaltyDeduction),
      wrongAnswersStr,
      bundleName,
      timestamp
    ];

    if (typeof db.runAsync === 'function') {
      await db.runAsync(query, params);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Failed recording exam instance profile details safely:", error);
    return false;
  }
}

/**
 * Read sequential analytics telemetry lists
 */
export async function getExamHistory() {
  try {
    const db = await getDb();
    if (typeof db.getAllAsync === 'function') {
      return await db.getAllAsync("SELECT * FROM exam_history ORDER BY id ASC;");
    }
    return [];
  } catch (error) {
    console.error("Failed fetching complete analytical history logs:", error);
    return [];
  }
}

/**
 * Get count of questions for a subject
 */
export async function getQuestionCount(subjectId) {
  try {
    const db = await getDb();
    const sanitizedSubjectId = Number(subjectId) || 0;

    if (typeof db.getFirstAsync === 'function') {
      const result = await db.getFirstAsync(
        "SELECT COUNT(*) as count FROM questions WHERE subject_id = ?;",
        [sanitizedSubjectId]
      );
      return result?.count || 0;
    }
    return 0;
  } catch (error) {
    console.error("Failed to get question count:", error);
    return 0;
  }
}

/**
 * Clear all exam history (for testing)
 */
export async function clearExamHistory() {
  try {
    const db = await getDb();
    if (typeof db.runAsync === 'function') {
      await db.runAsync("DELETE FROM exam_history;");
      return true;
    }
    return false;
  } catch (error) {
    console.error("Failed to clear exam history:", error);
    return false;
  }
}