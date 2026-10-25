// electron-app/main/db/database.js
// ─────────────────────────────────────────────────────────────────────────────
// Desktop database using sql.js — SQLite compiled to WebAssembly. Pure JavaScript,
// so it needs NO native build tools (no Python / Visual Studio / electron-rebuild).
//
// Trade-off vs better-sqlite3: sql.js holds the database IN MEMORY. There is no
// automatic disk persistence, so we load the .db file on startup and write the
// whole file back after every change (see persist()). At this app's data size
// (seed questions + history + roster + reports; strata live in AsyncStorage, not
// here) that's cheap and safe.
//
// The SCHEMA and SEED are copied verbatim from your mobile setup.js.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const initSqlJs = require('sql.js');

const DB_NAME = 'questions_v2.db';
let dbPromise = null;

function dbFilePath() {
  return path.join(app.getPath('userData'), DB_NAME);
}

// sql.js is memory-resident — write the whole DB back to disk after each change.
function persist(db) {
  try {
    fs.writeFileSync(dbFilePath(), Buffer.from(db.export()));
  } catch (e) {
    console.error('Failed to persist DB:', e);
  }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    exam_body TEXT NOT NULL,
    color TEXT
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER,
    year INTEGER,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option TEXT NOT NULL CHECK(correct_option IN ('A','B','C','D')),
    explanation TEXT,
    topic_name TEXT,
    FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS exam_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER,
    subject_name TEXT,
    exam_body TEXT,
    score INTEGER DEFAULT 0,
    total_questions INTEGER DEFAULT 0,
    final_score INTEGER DEFAULT 0,
    raw_score INTEGER DEFAULT 0,
    percentage INTEGER DEFAULT 0,
    required_score INTEGER DEFAULT 50,
    tab_switch_count INTEGER DEFAULT 0,
    bundle_name TEXT,
    penalty_deduction INTEGER DEFAULT 0,
    wrong_answers TEXT,
    duration_seconds INTEGER DEFAULT 0,
    started_at TEXT,
    teacher_code TEXT,
    class_level TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_exam_history_subject ON exam_history(subject_id);
  CREATE INDEX IF NOT EXISTS idx_exam_history_timestamp ON exam_history(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id);

  CREATE TABLE IF NOT EXISTS teacher_roster (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pupil_device_code TEXT UNIQUE,
    full_name TEXT,
    class_levels TEXT,
    overall_rate INTEGER DEFAULT 0,
    performance TEXT,
    teacher_code TEXT,
    snapshot TEXT,
    updated_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_roster_pupil ON teacher_roster(pupil_device_code);

  CREATE TABLE IF NOT EXISTS pupil_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pupil_device_code TEXT UNIQUE,
    full_name TEXT,
    teacher_code TEXT,
    report TEXT,
    updated_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_pupil_reports ON pupil_reports(pupil_device_code);
`;

// Parity with the phone's migration list. On a fresh DB the CREATE above already
// has every column, so each is a harmless no-op (duplicate column → caught).
const MIGRATIONS = [
  `ALTER TABLE exam_history ADD COLUMN raw_score INTEGER DEFAULT 0;`,
  `ALTER TABLE exam_history ADD COLUMN final_score INTEGER DEFAULT 0;`,
  `ALTER TABLE exam_history ADD COLUMN penalty_deduction INTEGER DEFAULT 0;`,
  `ALTER TABLE exam_history ADD COLUMN wrong_answers TEXT;`,
  `ALTER TABLE exam_history ADD COLUMN bundle_name TEXT;`,
  `ALTER TABLE exam_history ADD COLUMN required_score INTEGER DEFAULT 50;`,
  `ALTER TABLE exam_history ADD COLUMN tab_switch_count INTEGER DEFAULT 0;`,
  `ALTER TABLE exam_history ADD COLUMN duration_seconds INTEGER DEFAULT 0;`,
  `ALTER TABLE exam_history ADD COLUMN started_at TEXT;`,
  `ALTER TABLE exam_history ADD COLUMN teacher_code TEXT;`,
  `ALTER TABLE exam_history ADD COLUMN class_level TEXT;`,
];

const SEED_SUBJECTS = `
  INSERT INTO subjects (id, name, exam_body, color) VALUES
    (1, 'Mathematics', 'JAMB', '#8b5cf6'),
    (2, 'English Language', 'JAMB', '#3b82f6'),
    (3, 'Mathematics', 'WAEC', '#8b5cf6'),
    (4, 'English Language', 'WAEC', '#3b82f6'),
    (5, 'Physics', 'JAMB', '#06b6d4'),
    (6, 'Chemistry', 'JAMB', '#22c55e'),
    (7, 'Biology', 'JAMB', '#16a34a'),
    (8, 'Economics', 'JAMB', '#f59e0b'),
    (9, 'Government', 'JAMB', '#a855f7'),
    (10, 'Literature in English', 'JAMB', '#f43f5e'),
    (11, 'Physics', 'WAEC', '#06b6d4'),
    (12, 'Chemistry', 'WAEC', '#22c55e'),
    (13, 'Biology', 'WAEC', '#16a34a'),
    (14, 'Economics', 'WAEC', '#f59e0b'),
    (15, 'Government', 'WAEC', '#a855f7'),
    (16, 'Literature in English', 'WAEC', '#f43f5e');
`;

const SEED_QUESTIONS = `
  INSERT INTO questions (subject_id, year, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, topic_name) VALUES
    (1, 2024, 'Solve for x if 2x + 5 = 15.', '3', '5', '10', '20', 'B', 'Subtract 5 from both sides: 2x = 10. Divide by 2: x = 5.', 'Algebra'),
    (1, 2024, 'Find the value of log10(100).', '1', '2', '3', '10', 'B', 'Since 10 squared is 100, log10(100) = 2.', 'Logarithms'),
    (1, 2024, 'What is the derivative of x^2?', 'x', '2x', 'x^2', '2', 'B', 'The derivative of x^n is nx^(n-1), so derivative of x^2 is 2x.', 'Calculus'),
    (2, 2024, 'Choose the correct spelling:', 'Accomodate', 'Acommodate', 'Accommodate', 'Acomodate', 'C', 'The correct spelling is Accommodate.', 'Spelling'),
    (2, 2024, 'The word benevolent means:', 'Kind and generous', 'Cruel and harsh', 'Lazy and idle', 'Brave and bold', 'A', 'Benevolent means showing sympathy and understanding.', 'Vocabulary'),
    (3, 2023, 'A triangle has angles 45 and 45 degrees. What is the third angle?', '40', '60', '90', '180', 'C', 'Angles in a triangle total 180. 180 minus 90 equals 90.', 'Geometry'),
    (3, 2023, 'Calculate the area of a circle with radius 7cm using pi as 22/7.', '154 cm2', '44 cm2', '22 cm2', '308 cm2', 'A', 'Area equals pi r squared equals 154 cm2.', 'Geometry'),
    (5, 2024, 'What is the SI unit of force?', 'Newton', 'Joule', 'Watt', 'Pascal', 'A', 'The SI unit of force is the Newton.', 'Mechanics');
`;

async function openAndSetupDb() {
  // The .wasm ships inside the sql.js package; point sql.js at it.
  const wasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => wasmPath });

  const file = dbFilePath();
  let db;
  if (fs.existsSync(file)) {
    console.log('🚀 Loading desktop database from', file);
    db = new SQL.Database(fs.readFileSync(file));
  } else {
    console.log('🚀 Creating desktop database at', file);
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON;');
  db.run(SCHEMA);

  for (const m of MIGRATIONS) {
    try { db.run(m); } catch (e) { /* column exists */ }
  }

  const stmt = db.prepare('SELECT COUNT(*) AS count FROM subjects;');
  stmt.step();
  const subjectCount = stmt.getAsObject().count;
  stmt.free();

  if (subjectCount === 0) {
    console.log('🌱 Seeding desktop data...');
    db.run(SEED_SUBJECTS);
    db.run(SEED_QUESTIONS);
    console.log('✅ Seed complete');
  }

  persist(db); // create the file on first run / save any migrations
  console.log('✅ Desktop database ready');
  return db;
}

// Async singleton — sql.js loads its WASM asynchronously. Every caller comes in
// through an IPC handler, which can await, so the query functions are async.
async function getDb() {
  if (!dbPromise) dbPromise = openAndSetupDb();
  return dbPromise;
}

module.exports = { getDb, persist };
