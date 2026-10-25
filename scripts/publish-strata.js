// scripts/publish-strata.js
// ─────────────────────────────────────────────────────────────────────────────
// PREPSTATION PRO — INSTANT STRATA PUBLISHER
// ─────────────────────────────────────────────────────────────────────────────
// Automatically syncs additions, updates, AND removals in the 'strata/' folder.
// Whenever you run this script:
// 1. Pulls latest cloud state (git pull --rebase).
// 2. Stages all file changes and DELETIONS in strata/ (git add -A strata/).
// 3. Commits and pushes to GitHub.
// 4. The GitHub robot automatically rebuilds the catalogue in seconds!
// ─────────────────────────────────────────────────────────────────────────────

const { execSync } = require('child_process');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

function run(cmd) {
  return execSync(cmd, { cwd: ROOT_DIR, stdio: 'inherit' });
}

console.log('\n🚀 [PrepStation Cloud Sync] Publishing your strata changes...');

// 1. Pull latest cloud updates first
console.log('📥 1. Pulling latest cloud updates from GitHub...');
try {
  run('git pull --rebase origin main');
} catch (e) {
  console.log('Already up to date with cloud.');
}

// 2. Stage ALL additions, updates, AND REMOVALS in the strata/ folder
console.log('📦 2. Detecting additions, modifications, and removals in strata/...');
run('git add -A strata/');

// 3. Commit only if changes exist
console.log('💾 3. Committing your changes...');
try {
  run('git commit -m "sync: update strata packages (additions and removals)"');
} catch (e) {
  console.log('ℹ️ No file changes detected in strata/ folder.');
}

// 4. Push to GitHub
console.log('🌐 4. Pushing to GitHub...');
try {
  run('git push origin main');
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('🎉 SUCCESS! Your strata changes are live on GitHub.');
  console.log('👉 The GitHub robot is updating the catalogue:');
  console.log('   • Any removed files are now removed from the catalogue.');
  console.log('   • Any new files will appear with the ✨ NEW badge.');
  console.log('👉 Open PrepStation Pro → Tap Refresh (🔄) in Strata Cloud Hub!');
  console.log('════════════════════════════════════════════════════════════════\n');
} catch (e) {
  console.error('❌ Push failed:', e.message);
}
