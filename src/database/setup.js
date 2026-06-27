// setup.js - Complete Database Initialization
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';

const DB_NAME = 'questions_v2.db';

export async function initDatabase() {
  try {
    console.log('🚀 Opening database via native driver...');
    const db = await SQLite.openDatabaseAsync(DB_NAME);

    console.log('📦 Executing base database schema migrations...');
    
    // Create all tables with proper schema
    await db.execAsync(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;

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
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE SET NULL
      );

      -- Indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_exam_history_subject ON exam_history(subject_id);
      CREATE INDEX IF NOT EXISTS idx_exam_history_timestamp ON exam_history(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id);
    `);

    console.log('✅ Base schema created successfully');

// ── SCHEMA MIGRATION: Add missing columns to existing installs ──
const migrations = [
  `ALTER TABLE exam_history ADD COLUMN raw_score INTEGER DEFAULT 0;`,
  `ALTER TABLE exam_history ADD COLUMN final_score INTEGER DEFAULT 0;`,
  `ALTER TABLE exam_history ADD COLUMN penalty_deduction INTEGER DEFAULT 0;`,
  `ALTER TABLE exam_history ADD COLUMN wrong_answers TEXT;`,
  `ALTER TABLE exam_history ADD COLUMN bundle_name TEXT;`,
  `ALTER TABLE exam_history ADD COLUMN required_score INTEGER DEFAULT 50;`,
  `ALTER TABLE exam_history ADD COLUMN tab_switch_count INTEGER DEFAULT 0;`,
];

for (const migration of migrations) {
  try {
    await db.runAsync(migration);
    console.log('✅ Migration applied:', migration.substring(0, 60));
  } catch (e) {
    // Column already exists — safe to ignore
  }
}

    // Check if we have subjects, if not seed initial data
    const subjectCheck = await db.getAllAsync("SELECT COUNT(*) as count FROM subjects;");
    const subjectCount = subjectCheck[0]?.count || 0;

    if (subjectCount === 0) {
      console.log('🌱 Seeding initial practice data...');
      
      // Insert subjects
      await db.execAsync(`
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
      `);

      // Insert sample questions
      await db.execAsync(`
        INSERT INTO questions (subject_id, year, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, topic_name) VALUES
          (1, 2024, 'Solve for x if 2x + 5 = 15.', '3', '5', '10', '20', 'B', 'Subtract 5 from both sides: 2x = 10. Divide by 2: x = 5.', 'Algebra'),
          (1, 2024, 'Find the value of log10(100).', '1', '2', '3', '10', 'B', 'Since 10 squared is 100, log10(100) = 2.', 'Logarithms'),
          (1, 2024, 'What is the derivative of x^2?', 'x', '2x', 'x^2', '2', 'B', 'The derivative of x^n is nx^(n-1), so derivative of x^2 is 2x.', 'Calculus'),
          (2, 2024, 'Choose the correct spelling: _____', 'Accomodate', 'Acommodate', 'Accommodate', 'Acomodate', 'C', 'The correct spelling is "Accommodate" with double "c" and double "m".', 'Spelling'),
          (2, 2024, 'The word "benevolent" means:', 'Kind and generous', 'Cruel and harsh', 'Lazy and idle', 'Brave and bold', 'A', 'Benevolent means showing or motivated by sympathy and understanding.', 'Vocabulary'),
          (3, 2023, 'A triangle has angles 45° and 45°. What is the third angle?', '40°', '60°', '90°', '180°', 'C', 'Angles in a triangle total 180°. 180 - (45 + 45) = 90°.', 'Geometry'),
          (3, 2023, 'Calculate the area of a circle with radius 7cm. (Use π = 22/7)', '154 cm²', '44 cm²', '22 cm²', '154 cm²', 'A', 'Area = πr² = 22/7 × 7 × 7 = 154 cm².', 'Geometry'),
          (5, 2024, 'What is the SI unit of force?', 'Newton', 'Joule', 'Watt', 'Pascal', 'A', 'The SI unit of force is the Newton (N).', 'Mechanics');
      `);

      console.log('✅ Sample questions seeded successfully');
    } else {
      console.log(`📊 Database already has ${subjectCount} subjects`);
    }

    // Verify everything works
    const testQuery = await db.getAllAsync("SELECT COUNT(*) as count FROM exam_history;");
    console.log(`📈 Exam history has ${testQuery[0]?.count || 0} records`);

    console.log('✅ Database initialization complete!');
    return true;
  } catch (error) {
    console.error('❌ CRITICAL: Database initialization failed:', error);
    return false;
  }
}

// Helper function to reset the entire database (for testing)
export async function resetDatabase() {
  try {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    
    // Drop all tables
    await db.execAsync(`
      DROP TABLE IF EXISTS exam_history;
      DROP TABLE IF EXISTS questions;
      DROP TABLE IF EXISTS subjects;
    `);
    
    console.log('🗑️ Database reset complete');
    return true;
  } catch (error) {
    console.error('❌ Failed to reset database:', error);
    return false;
  }
}

// Helper function to get database stats
export async function getDatabaseStats() {
  try {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    
    const stats = {
      subjects: 0,
      questions: 0,
      examHistory: 0,
    };
    
    const subjectResult = await db.getAllAsync("SELECT COUNT(*) as count FROM subjects;");
    stats.subjects = subjectResult[0]?.count || 0;
    
    const questionResult = await db.getAllAsync("SELECT COUNT(*) as count FROM questions;");
    stats.questions = questionResult[0]?.count || 0;
    
    const historyResult = await db.getAllAsync("SELECT COUNT(*) as count FROM exam_history;");
    stats.examHistory = historyResult[0]?.count || 0;
    
    return stats;
  } catch (error) {
    console.error('Failed to get database stats:', error);
    return null;
  }
}