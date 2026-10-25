// src/database/setup.web.js
// ─────────────────────────────────────────────────────────────────────────────
// Metro picks THIS on web/desktop instead of setup.js. The real database lives in
// the Electron main process (better-sqlite3); here we just trigger and await its
// init through the bridge, so App.js's existing `await initDatabase()` call works
// unchanged on desktop.
//
// Outside Electron (plain browser) it resolves true so the UI still boots — the
// DB simply isn't available there.
// ─────────────────────────────────────────────────────────────────────────────

const DB = (typeof window !== 'undefined' && window.electronDB) ? window.electronDB : null;

export async function initDatabase() {
  if (!DB) {
    console.warn('electronDB unavailable (running outside Electron) — DB features disabled on web');
    return true;
  }
  try {
    return await DB.initDatabase();
  } catch (e) {
    console.error('initDatabase (desktop) failed:', e);
    return false;
  }
}

export async function resetDatabase() {
  if (!DB) return true;
  try { return await DB.resetDatabase(); } catch { return false; }
}

export async function getDatabaseStats() {
  if (!DB) return null;
  try { return await DB.getDatabaseStats(); } catch { return null; }
}
