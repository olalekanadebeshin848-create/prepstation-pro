// electron-app/main/main.js
// ─────────────────────────────────────────────────────────────────────────────
// Electron main process. In DEV it loads the Expo web dev server
// (npx expo start --web → http://localhost:8081). In PRODUCTION it serves the
// exported static web build (electron-app/web/) over a tiny local HTTP server and
// loads that — serving (rather than file://) avoids SPA asset-path issues.
// ─────────────────────────────────────────────────────────────────────────────

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { registerIpc } = require('./ipc');
const { registerFileIpc } = require('./file'); // NEW — handles .psr export/import

const isDev = !app.isPackaged;
const DEV_URL = 'http://localhost:8081';   // Expo web dev server default port
const WEB_DIR = path.join(__dirname, '..', 'web'); // exported build copied here (see README)

let staticServer = null;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.map': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.txt': 'text/plain',
};

// Fixed port for the packaged app's local static server. This MUST stay the
// same across launches — AsyncStorage (and everything else backed by browser
// storage) is scoped per-origin (host+port), so a random port every launch
// meant every launch looked like a brand-new browser profile with nothing
// saved. That's why the Profile screen kept reappearing even after it had
// already been filled in.
const STATIC_PORT = 47821;

// Minimal static file server with SPA fallback to index.html.
function startStaticServer(rootDir) {
  const handleRequest = (req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    const resolved = path.normalize(path.join(rootDir, urlPath));
    if (!resolved.startsWith(rootDir)) { res.writeHead(403); res.end('Forbidden'); return; }

    fs.readFile(resolved, (err, data) => {
      if (err) {
        // Fall back to index.html so client-side routing works.
        fs.readFile(path.join(rootDir, 'index.html'), (e2, idx) => {
          if (e2) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(idx);
        });
        return;
      }
      const ext = path.extname(resolved).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  };

  return new Promise((resolve, reject) => {
    const server = http.createServer(handleRequest);
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Extremely unlikely (another instance already running, or the port
        // is taken by something else) — fall back to a random port so the
        // app still opens, rather than crashing. Saved data won't carry over
        // for this one session, but that's a rare edge case, not the norm.
        console.warn(`Port ${STATIC_PORT} in use — falling back to a random port. Saved data may not persist for this session.`);
        const fallback = http.createServer(handleRequest);
        fallback.once('error', reject);
        fallback.listen(0, '127.0.0.1', () => resolve(fallback));
      } else {
        reject(err);
      }
    });
    server.listen(STATIC_PORT, '127.0.0.1', () => resolve(server));
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f172a',
    show: false,
    // Controls the title bar / taskbar icon while the app is actually
    // running — separate from electron-builder's win.icon, which only
    // controls the built .exe file's own icon. Needed in both dev (npm run
    // dev) and packaged builds, since the .exe icon alone doesn't apply here.
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,   // keep the page isolated from Node
      nodeIntegration: false,   // the UI never gets raw Node access
      webSecurity: false,       // allow cross-origin fetching to public strata CDNs
    },
  });

  win.once('ready-to-show', () => win.show());

  if (isDev && process.env.ELECTRON_SERVE_STATIC !== '1') {
    win.loadURL(DEV_URL).catch(async (err) => {
      console.warn(`Expo dev server not reachable at ${DEV_URL} — falling back to static web build:`, err.message);
      if (fs.existsSync(path.join(WEB_DIR, 'index.html'))) {
        try {
          staticServer = await startStaticServer(WEB_DIR);
          const { port } = staticServer.address();
          await win.loadURL(`http://127.0.0.1:${port}/`);
        } catch (e) {
          console.error('Static server fallback failed:', e);
        }
      }
    });
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    if (!fs.existsSync(path.join(WEB_DIR, 'index.html'))) {
      await win.loadURL(
        'data:text/html,' +
        encodeURIComponent('<h2 style="font-family:sans-serif;padding:24px">No web build found.</h2>' +
          '<p style="font-family:sans-serif;padding:0 24px">Run the build step in the README (expo export → copy into electron-app/web).</p>')
      );
      return;
    }
    staticServer = await startStaticServer(WEB_DIR);
    const { port } = staticServer.address();
    await win.loadURL(`http://127.0.0.1:${port}/`);
  }
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.delmamatiagroups.prepstationpro.desktop');
  }
  registerIpc(ipcMain);
  registerFileIpc(ipcMain); // NEW — .psr export/import file handlers
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (staticServer) { try { staticServer.close(); } catch (e) { /* ignore */ } }
  if (process.platform !== 'darwin') app.quit();
});
