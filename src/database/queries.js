import * as SQLite from 'expo-sqlite';

const DB_NAME = 'questions_v2.db';
let dbInstance = null;

export function setDbInstance(instance) {
  dbInstance = instance;
  console.log('✅ queries.js received shared DB instance');
}

async function getDb() {
  if (dbInstance) return dbInstance;
  console.warn('⚠️ getDb fallback triggered');
  dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
  return dbInstance;
}

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
    const timestamp        = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO exam_history (
        subject_id, subject_name, exam_body, score, total_questions,
        final_score, raw_score, percentage, required_score,
        tab_switch_count, penalty_deduction, wrong_answers, bundle_name, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        subjectId ? Number(subjectId) : null,
        subjectName, examBody,
        Number(score), Number(totalQuestions),
        Number(finalScore), Number(rawScore),
        Number(percentage), Number(requiredScore),
        Number(tabSwitchCount), Number(penaltyDeduction),
        wrongAnswersStr, bundleName, timestamp,
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