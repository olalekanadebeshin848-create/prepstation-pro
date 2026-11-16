// scripts/publish-strata.js
// ─────────────────────────────────────────────────────────────────────────────
// PREPSTATION PRO — INSTANT STRATA PUBLISHER
// ─────────────────────────────────────────────────────────────────────────────
// Automatically syncs additions, updates, AND removals in the 'strata/' folder.
// Whenever you run this script:
// 1. Configures Git on Windows to bypass unreachable revocation servers.
// 2. Pulls latest cloud state (git pull --rebase).
// 3. Stages all file changes and DELETIONS in strata/ (git add -A strata/).
// 4. Commits and pushes to GitHub.
// 5. The GitHub robot automatically rebuilds the catalogue in seconds!
// ─────────────────────────────────────────────────────────────────────────────

const { execSync } = require('child_process');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

function run(cmd) {
  return execSync(cmd, { cwd: ROOT_DIR, stdio: 'inherit' });
}

// 0. Ensure Windows SChannel does not fail on offline CRL/OCSP revocation servers
try {
  execSync('git config http.schannelCheckRevoke false', { cwd: ROOT_DIR, stdio: 'ignore' });
  execSync('git config --global http.schannelCheckRevoke false', { cwd: ROOT_DIR, stdio: 'ignore' });
} catch (e) {}

console.log('\n🚀 [PrepStation Cloud Sync] Publishing your strata changes...');

// 1. Pull latest cloud updates first
console.log('📥 1. Pulling latest cloud updates from GitHub...');
try {
  run('git pull --rebase --autostash origin main');
} catch (e) {
  console.log('ℹ️ Pull note:', e.message || 'Already up to date with cloud.');
}

// 2. Stage ALL additions, updates, AND REMOVALS in the strata/ folder, plus catalog manifest
console.log('📦 2. Detecting additions, modifications, and removals in strata/...');
run('git add -A strata/ strata_catalog.json PrepStation_Strata_Cloud_Publisher.html scripts/build-catalog.js scripts/publish-strata.js');

// 3. Commit only if changes exist
console.log('💾 3. Committing your changes...');
try {
  run('git commit -m "sync: update strata packages (additions and removals)"');
} catch (e) {
  console.log('ℹ️ No new uncommitted file changes detected.');
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
  console.error('\n❌ Push failed:', e.message);
  console.log('\n💡 Troubleshooting Tips:');
  console.log('1. If Windows SChannel reports CRYPT_E_REVOCATION_OFFLINE, run:');
  console.log('   git config --global http.schannelCheckRevoke false');
  console.log('2. Alternatively, switch to OpenSSL backend:');
  console.log('   git config --global http.sslBackend openssl');
  console.log('3. Or publish without git using the Web Portal:');
  console.log('   Open PrepStation_Strata_Cloud_Publisher.html in your browser!\n');
}
