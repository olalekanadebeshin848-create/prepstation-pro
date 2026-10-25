// scripts/build-catalog.js
// ─────────────────────────────────────────────────────────────────────────────
// PREPSTATION PRO — AUTOMATED STRATA CATALOG GENERATOR
// ─────────────────────────────────────────────────────────────────────────────
// Automatically scans the 'strata/' folder, extracts question counts, bundle
// totals, categories, and tiers, and builds 'strata_catalog.json'.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

// Repository configuration
const GITHUB_OWNER = process.env.GITHUB_REPOSITORY_OWNER || 'olalekanadebeshin848-create';
const GITHUB_REPO =
  (process.env.GITHUB_REPOSITORY ? process.env.GITHUB_REPOSITORY.split('/')[1] : null) || 'prepstation-pro';
const BRANCH = 'main';

const STRATA_DIR = path.join(__dirname, '../strata');
const OUTPUT_FILE = path.join(__dirname, '../strata_catalog.json');
const RAW_BASE_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${BRANCH}/strata/`;

// Valid categories recognized by PrepStation Pro
const VALID_CATEGORIES = [
  'JAMB', 'WAEC', 'NECO',
  'BASIC 3', 'BASIC 4', 'BASIC 5', 'BASIC 6',
  'JSS 1', 'JSS 2', 'JSS 3',
  'SS 1', 'SS 2', 'SS 3'
];

// Ensure strata directory exists
if (!fs.existsSync(STRATA_DIR)) {
  fs.mkdirSync(STRATA_DIR, { recursive: true });
}

console.log(`[PrepStation Catalog] 🔍 Scanning: ${STRATA_DIR}`);
console.log(`[PrepStation Catalog] 🌐 Base URL: ${RAW_BASE_URL}`);

const allFiles = fs.readdirSync(STRATA_DIR).filter((f) => {
  const ext = path.extname(f).toLowerCase();
  return ext === '.json' || ext === '.psz' || ext === '.psr';
});

console.log(`[PrepStation Catalog] 📦 Found ${allFiles.length} file(s) in strata/`);

const strataList = allFiles.map((filename) => {
  const filePath = path.join(STRATA_DIR, filename);
  const stats = fs.statSync(filePath);
  const ext = path.extname(filename).toLowerCase();
  const isPsz = ext === '.psz' || ext === '.psr';
  const sizeKb = `${Math.max(1, Math.round(stats.size / 1024))} KB`;

  const cleanBaseName = path.basename(filename, path.extname(filename));
  const upperName = filename.toUpperCase();

  // Sensible defaults derived from filename
  let displayName = cleanBaseName.replace(/_/g, ' ');
  let examCategory = 'SS 1';
  let strataId = 'strata_1';
  let totalBundles = 1;
  let totalQuestions = 0;
  let description = `${displayName} questions and bundle drills.`;
  let version = '1.0.0';

  // Category detection from filename (Check JSS and BASIC before SS to avoid false substring match)
  if (upperName.includes('WAEC')) examCategory = 'WAEC';
  else if (upperName.includes('JAMB')) examCategory = 'JAMB';
  else if (upperName.includes('NECO')) examCategory = 'NECO';
  else if (upperName.includes('JSS 3') || upperName.includes('JSS_3') || upperName.includes('JSS3')) examCategory = 'JSS 3';
  else if (upperName.includes('JSS 2') || upperName.includes('JSS_2') || upperName.includes('JSS2')) examCategory = 'JSS 2';
  else if (upperName.includes('JSS 1') || upperName.includes('JSS_1') || upperName.includes('JSS1')) examCategory = 'JSS 1';
  else if (upperName.includes('BASIC 6') || upperName.includes('BASIC_6') || upperName.includes('BASIC6')) examCategory = 'BASIC 6';
  else if (upperName.includes('BASIC 5') || upperName.includes('BASIC_5') || upperName.includes('BASIC5')) examCategory = 'BASIC 5';
  else if (upperName.includes('BASIC 4') || upperName.includes('BASIC_4') || upperName.includes('BASIC4')) examCategory = 'BASIC 4';
  else if (upperName.includes('BASIC 3') || upperName.includes('BASIC_3') || upperName.includes('BASIC3')) examCategory = 'BASIC 3';
  else if (upperName.includes('SS 3') || upperName.includes('SS_3') || upperName.includes('SS3')) examCategory = 'SS 3';
  else if (upperName.includes('SS 2') || upperName.includes('SS_2') || upperName.includes('SS2')) examCategory = 'SS 2';
  else if (upperName.includes('SS 1') || upperName.includes('SS_1') || upperName.includes('SS1')) examCategory = 'SS 1';

  // Strata identifier detection (strata_1, strata_2, strata_3)
  const stgMatch = upperName.match(/(?:STG|STAGE|STRATA|STRA)[ _-]?([0-9]+)/i);
  if (stgMatch && stgMatch[1]) {
    strataId = `strata_${stgMatch[1]}`;
  }

  // Parse JSON file contents for rich metadata
  if (!isPsz) {
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      // Strip UTF-8 Byte Order Mark (BOM) if present
      content = content.replace(/^\uFEFF/, '').trim();
      const parsed = JSON.parse(content);
      const structural = parsed.structuralStrata || parsed;
      const meta = parsed.strataMetadata || {};

      if (meta.label) {
        displayName = meta.label;
      } else if (structural.displayName && structural.displayName !== 'STRATA 1') {
        displayName = structural.displayName;
      }

      if (structural.examCategory && VALID_CATEGORIES.includes(structural.examCategory)) {
        examCategory = structural.examCategory;
      }

      if (structural.strataId) {
        strataId = structural.strataId;
      }

      if (structural.version) {
        version = structural.version;
      }

      if (structural.description) {
        description = structural.description;
      } else if (meta.gradeLevel || meta.term) {
        description = `${meta.gradeLevel || examCategory} ${meta.term || ''} — comprehensive practice drills.`.trim();
      }

      if (Array.isArray(structural.bundles)) {
        totalBundles = structural.bundles.length;
        for (const bundle of structural.bundles) {
          if (Array.isArray(bundle.questions)) {
            totalQuestions += bundle.questions.length;
          } else if (Array.isArray(bundle.subjects)) {
            for (const subj of bundle.subjects) {
              if (Array.isArray(subj.questions)) {
                totalQuestions += subj.questions.length;
              } else if (typeof subj.totalQuestions === 'number') {
                totalQuestions += subj.totalQuestions;
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[PrepStation Catalog] ⚠️ Could not parse JSON for ${filename}:`, err.message);
    }
  } else {
    // Default estimated numbers for encrypted binary packages
    totalBundles = 10;
    totalQuestions = 200;
  }

  // Tier detection:
  // If filename or strata ID explicitly indicates premium, mark as premium; otherwise basic
  const isPremium =
    upperName.includes('PREMIUM') ||
    upperName.includes('PAID') ||
    strataId === 'strata_2' ||
    strataId === 'strata_3' ||
    strataId === 'strata_4';

  const tier = isPremium ? 'premium' : 'basic';
  const id = cleanBaseName.toLowerCase().replace(/[^a-z0-9]/g, '_');

  return {
    id,
    strataId,
    examCategory,
    displayName,
    description,
    tier,
    version,
    fileType: isPsz ? 'psz' : 'json',
    fileUrl: `${RAW_BASE_URL}${encodeURIComponent(filename)}`,
    size: sizeKb,
    totalBundles: totalBundles || 1,
    totalQuestions: totalQuestions || 50,
    updatedAt: stats.mtime.toISOString(),
  };
});

// Sort by category then by strataId
strataList.sort((a, b) => {
  if (a.examCategory !== b.examCategory) {
    return a.examCategory.localeCompare(b.examCategory);
  }
  return a.strataId.localeCompare(b.strataId);
});

const catalog = {
  catalogVersion: 1,
  appName: 'PrepStation Pro',
  organization: 'Delmama Groups',
  lastUpdated: new Date().toISOString(),
  totalCount: strataList.length,
  strataList,
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(catalog, null, 2), 'utf8');

console.log(`[PrepStation Catalog] ✅ Successfully built ${OUTPUT_FILE}`);
console.log(`[PrepStation Catalog] 📊 Indexed ${strataList.length} strata package(s).`);
