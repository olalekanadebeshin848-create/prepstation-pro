// src/config/categories.js
// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY REGISTRY — single source of truth
//
// PrepStation tests fall into two kinds of "category":
//   • EXAM bodies  — self-study candidates            (JAMB / WAEC / NECO)
//   • CLASS levels — in-school pupils, teacher-supervised
//                    (Basic 3–6, JSS 1–3, SS 1–3)
//
// IMPORTANT: each `id` below is EXACTLY the string that must appear as
// `structuralStrata.examCategory` inside a generated strata file, and is the
// key used in AsyncStorage `examStrataMap`. The strata generator MUST emit
// these ids verbatim, or the upload validator will reject the file.
//
// Fields:
//   id               category id (see note above)
//   label            display name
//   type             'exam' | 'class'
//   group            for class levels: 'Basic' | 'JSS' | 'SS'  (null for exams)
//   subjectSlots     how many subjects a run selects by default (JAMB=4, else 5)
//   fallbackTotal    question count when strata carries none (exams keep old
//                    400/500 behaviour; class levels are strata-driven → null)
//   theoryCompulsory mirrors the old `selectedExam === 'WAEC' || 'NECO'` flag
// ─────────────────────────────────────────────────────────────────────────────

export const CATEGORIES = [
  // ── Exam bodies (behaviour unchanged from before) ──
  { id: 'JAMB', label: 'JAMB', type: 'exam', group: null, subjectSlots: 4, fallbackTotal: 400, theoryCompulsory: false },
  { id: 'WAEC', label: 'WAEC', type: 'exam', group: null, subjectSlots: 5, fallbackTotal: 500, theoryCompulsory: true  },
  { id: 'NECO', label: 'NECO', type: 'exam', group: null, subjectSlots: 5, fallbackTotal: 500, theoryCompulsory: true  },

  // ── Class levels (teacher-supervised) ──
  { id: 'BASIC 3', label: 'BASIC 3', type: 'class', group: 'BASIC', subjectSlots: 5, fallbackTotal: null, theoryCompulsory: false },
  { id: 'BASIC 4', label: 'BASIC 4', type: 'class', group: 'BASIC', subjectSlots: 5, fallbackTotal: null, theoryCompulsory: false },
  { id: 'BASIC 5', label: 'BASIC 5', type: 'class', group: 'BASIC', subjectSlots: 5, fallbackTotal: null, theoryCompulsory: false },
  { id: 'BASIC 6', label: 'BASIC 6', type: 'class', group: 'BASIC', subjectSlots: 5, fallbackTotal: null, theoryCompulsory: false },
  { id: 'JSS 1',   label: 'JSS 1',   type: 'class', group: 'JSS',   subjectSlots: 5, fallbackTotal: null, theoryCompulsory: false },
  { id: 'JSS 2',   label: 'JSS 2',   type: 'class', group: 'JSS',   subjectSlots: 5, fallbackTotal: null, theoryCompulsory: false },
  { id: 'JSS 3',   label: 'JSS 3',   type: 'class', group: 'JSS',   subjectSlots: 5, fallbackTotal: null, theoryCompulsory: false },
  { id: 'SS 1',    label: 'SS 1',    type: 'class', group: 'SS',    subjectSlots: 5, fallbackTotal: null, theoryCompulsory: false },
  { id: 'SS 2',    label: 'SS 2',    type: 'class', group: 'SS',    subjectSlots: 5, fallbackTotal: null, theoryCompulsory: false },
  { id: 'SS 3',    label: 'SS 3',    type: 'class', group: 'SS',    subjectSlots: 5, fallbackTotal: null, theoryCompulsory: false },
];

export const ALL_CATEGORY_IDS   = CATEGORIES.map(c => c.id);
export const EXAM_CATEGORY_IDS   = CATEGORIES.filter(c => c.type === 'exam').map(c => c.id);
export const CLASS_CATEGORY_IDS  = CATEGORIES.filter(c => c.type === 'class').map(c => c.id);

const BY_ID = CATEGORIES.reduce((acc, c) => { acc[c.id] = c; return acc; }, {});

export function getCategory(id)     { return BY_ID[id] || null; }
export function isExamCategory(id)  { return getCategory(id)?.type === 'exam'; }
export function isClassCategory(id) { return getCategory(id)?.type === 'class'; }
export function categoryLabel(id)   { return getCategory(id)?.label || id; }

// Build an "empty" per-category map, e.g. { JAMB: [], WAEC: [], ..., 'SS 3': [] }.
// Use this everywhere the old literal { JAMB: [], WAEC: [], NECO: [] } appeared
// (examStrataMap defaults, activeStrataIndexMap defaults, etc.).
export function emptyCategoryMap(fill = () => []) {
  return ALL_CATEGORY_IDS.reduce((acc, id) => { acc[id] = fill(); return acc; }, {});
}

// Class levels grouped, for a two-step picker (Basic ▸ 3/4/5/6, etc.).
export const CLASS_GROUPS = ['BASIC', 'JSS', 'SS'].map(group => ({
  group,
  levels: CATEGORIES.filter(c => c.type === 'class' && c.group === group),
}));
