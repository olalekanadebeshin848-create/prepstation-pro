// electron-app/main/file.js
// ─────────────────────────────────────────────────────────────────────────────
// Handles writing the pupil's answer-breakdown (.psr) file to disk and letting
// the teacher pick a file to import. expo-file-system has NO web implementation,
// so the renderer can't write files itself on Electron — this does it in the
// main process using real Node `fs`, and also opens native save/open dialogs.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const { app, dialog, shell } = require('electron');

function registerFileIpc(ipcMain) {
  // Write the compressed .psr contents to a temp folder and return its path.
  ipcMain.handle('file:writeBreakdown', (_evt, { filename, contents }) => {
    try {
      const dir = path.join(app.getPath('temp'), 'prepstation-exports');
      fs.mkdirSync(dir, { recursive: true });
      const fullPath = path.join(dir, filename);
      fs.writeFileSync(fullPath, contents, 'utf8');
      return { success: true, path: fullPath };
    } catch (err) {
      console.error('file:writeBreakdown failed:', err);
      return { success: false, error: String(err && err.message || err) };
    }
  });

  // Let the pupil pick where to save the file permanently (e.g. Desktop, USB
  // drive) instead of leaving it in a temp folder only.
  ipcMain.handle('file:saveBreakdownAs', async (_evt, { filename, contents }) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Save answer breakdown',
        defaultPath: filename,
        filters: [{ name: 'PrepStation Report', extensions: ['psr'] }],
      });
      if (canceled || !filePath) return { success: false, canceled: true };
      fs.writeFileSync(filePath, contents, 'utf8');
      return { success: true, path: filePath };
    } catch (err) {
      console.error('file:saveBreakdownAs failed:', err);
      return { success: false, error: String(err && err.message || err) };
    }
  });

  // Reveal the exported file in the OS file explorer (Finder/Explorer) so the
  // pupil can attach it to WhatsApp/email themselves — Electron has no native
  // share sheet like mobile does.
  ipcMain.handle('file:showInFolder', (_evt, filePath) => {
    try {
      shell.showItemInFolder(filePath);
      return { success: true };
    } catch (err) {
      console.error('file:showInFolder failed:', err);
      return { success: false, error: String(err && err.message || err) };
    }
  });

  // TEACHER side: open a file picker for importing a pupil's .psr file, and
  // return its contents directly (avoids expo-file-system's read quirks too).
  ipcMain.handle('file:pickAndReadBreakdown', async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Import pupil answer breakdown',
        properties: ['openFile'],
        filters: [{ name: 'PrepStation Report', extensions: ['psr'] }],
      });
      if (canceled || !filePaths || !filePaths[0]) return { success: false, canceled: true };
      const contents = fs.readFileSync(filePaths[0], 'utf8');
      return { success: true, path: filePaths[0], contents };
    } catch (err) {
      console.error('file:pickAndReadBreakdown failed:', err);
      return { success: false, error: String(err && err.message || err) };
    }
  });
}

module.exports = { registerFileIpc };
