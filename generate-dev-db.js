const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = './assets/db/questions.db';

// Ensure directory paths exist
if (!fs.existsSync('./assets/db')) {
  fs.mkdirSync('./assets/db', { recursive: true });
}

// Clear out old DB version if it exists
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  console.log("Building database tables...");
  
  // 1. Create Core Structural Tables
  db.run(`CREATE TABLE subjects (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    exam_body TEXT NOT NULL,
    icon TEXT,
    color TEXT
  );`);

  db.run(`CREATE TABLE questions (
    id INTEGER PRIMARY KEY,
    subject_id INTEGER NOT NULL,
    exam_body TEXT NOT NULL,
    year INTEGER,
    topic TEXT,
    q_type TEXT DEFAULT 'MCQ',
    content TEXT NOT NULL,
    option_a TEXT,
    option_b TEXT,
    option_c TEXT,
    option_d TEXT,
    correct_answer TEXT NOT NULL,
    solution TEXT,
    image_path TEXT,
    difficulty TEXT DEFAULT 'MEDIUM',
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
  );`);

  db.run(`CREATE TABLE theory_questions (
    id INTEGER PRIMARY KEY,
    subject_id INTEGER NOT NULL,
    exam_body TEXT NOT NULL,
    year INTEGER,
    topic TEXT,
    content TEXT NOT NULL,
    model_answer TEXT NOT NULL,
    marking_guide TEXT,
    image_path TEXT
  );`);

  console.log("Injecting JAMB & WAEC sample data...");

  // 2. Populate Subjects
  const stmtSubject = db.prepare("INSERT INTO subjects VALUES (?, ?, ?, ?, ?)");
  stmtSubject.run(1, "Mathematics", "JAMB", "calculator", "#3b82f6");
  stmtSubject.run(2, "English Language", "JAMB", "book", "#ec4899");
  stmtSubject.run(3, "Mathematics", "WAEC", "calculator", "#10b981");
  stmtSubject.finalize();

  // 3. Inject Objective (MCQ) Questions
  db.run(`INSERT INTO questions (id, subject_id, exam_body, year, topic, content, option_a, option_b, option_c, option_d, correct_answer, solution) 
  VALUES (
    1, 1, 'JAMB', 2021, 'Algebra',
    'Solve for x if log3(x) + log3(x-2) = 1.',
    'x = 3', 'x = -1', 'x = 3 or x = -1', 'x = 4',
    'A',
    'Combining the logs gives log3(x(x-2)) = 1. This rewrites as x^2 - 2x = 3^1 => x^2 - 2x - 3 = 0. Factoring gives (x-3)(x+1) = 0. Since log arguments must be positive, x must be 3.'
  )`);

  db.run(`INSERT INTO questions (id, subject_id, exam_body, year, topic, content, option_a, option_b, option_c, option_d, correct_answer, solution) 
  VALUES (
    2, 3, 'WAEC', 2022, 'Trigonometry',
    'Given that sin(theta) = 3/5 and theta is acute, find cos(theta).',
    '2/5', '3/4', '4/5', '1/5',
    'C',
    'Using the identity sin^2(theta) + cos^2(theta) = 1, we get (3/5)^2 + cos^2(theta) = 1. 9/25 + cos^2(theta) = 1 => cos^2(theta) = 16/25. Taking the square root for an acute angle yields cos(theta) = 4/5.'
  )`);

  // 4. Inject a Theory/Essay Question
  db.run(`INSERT INTO theory_questions (id, subject_id, exam_body, year, topic, content, model_answer, marking_guide)
  VALUES (
    1, 3, 'WAEC', 2020, 'Mensuration',
    'A cylinder has a base radius of 7cm and a height of 10cm. Find its total surface area. [Take pi = 22/7]',
    'Total Surface Area = 2*pi*r(r + h) = 2 * (22/7) * 7 * (7 + 10) = 44 * 17 = 748 cm^2.',
    'Formula statement: 1 mark. Substitution of parameters: 2 marks. Correct final calculation with units: 2 marks.'
  )`);

  console.log("✓ Done! Your database is ready inside assets/db/questions.db");
});

db.close();