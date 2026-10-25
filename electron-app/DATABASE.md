# Phase 2 · Database (expo-sqlite → sql.js)

This makes your data layer work on desktop. Your screens **do not change** — Metro
automatically loads the `.web.js` shims on desktop, and those forward every call to
a real SQLite database (sql.js, WASM) running in Electron's main process.

## The flow

```
Screen  →  import '../database/queries'
        →  (on desktop, Metro picks) src/database/queries.web.js
        →  window.electronDB.<method>()        [preload bridge]
        →  ipcRenderer.invoke('db:<method>')   [IPC]
        →  electron-app/main/db/queries.js      [sql.js]
        →  electron-app/main/db/database.js     [the .db file in userData]
```

Same function names, same return shapes as your phone's `queries.js`, so nothing
upstream notices the swap. The desktop DB engine is **sql.js** (SQLite compiled to
WebAssembly) — pure JavaScript, so there are **no native build tools** to install.
It holds the database in memory and writes the file back to disk after each change.

## Files — where each goes

**Into your React Native project** (`src/database/`), alongside the existing
`queries.js` / `setup.js` (do NOT delete those — they still serve Android/iOS):

- `queries.web.js`
- `setup.web.js`

**Already in `electron-app/`** (main process):

- `main/db/database.js`  — schema + seed, copied verbatim from your `setup.js`
- `main/db/queries.js`   — all 20+ query functions, ported to sql.js
- `main/ipc.js`          — now also registers the `db:*` channels (updated)
- `main/preload.js`      — now also exposes `window.electronDB` (updated)

## Install (no build tools, no rebuild)

sql.js is pure JavaScript/WASM, so this is just:

```
npm install
```

There is **no `npm run rebuild`** and nothing to compile — no Python, no Visual
Studio. (For the packaged build, the `asarUnpack` entry in package.json keeps the
`sql-wasm.wasm` file loadable from inside the installer.)

Note on persistence: sql.js keeps the database in memory and this port writes the
whole `.db` file back to disk after every change, so nothing is lost between runs.
At this app's data size that's instant.

## Test it

1. RN root: `npx expo start --web`
2. `electron-app/`: `npm run dev`
3. In the app, go to a screen that lists subjects (or open DevTools console):

```js
await window.electronDB.getSubjectsByExamBody('JAMB')   // → array of 10 subjects
await window.electronDB.getDatabaseStats()               // → { subjects: 16, questions: 8, ... }
```

If those return data, your database is live on desktop — subjects, questions,
history, roster, and answer-breakdown storage all work now.

## What's left in Phase 2 (after this)

- `expo-document-picker` / `expo-sharing` → Electron `dialog` (open/save) so the
  teacher can import `.psr` files and pupils can export them.
- `react-native-webview` + KaTeX → render KaTeX directly in the DOM.
- `expo-camera` (QR scan) → webcam + a JS QR reader, or hide it on desktop.
- `AsyncStorage` → `electron-store` (strata map, profile, supervising-teacher code).
- Point your `LicenseService` at `window.desktopLicense` on web so strata validation
  and the device code use the desktop layer we built in Phase 1.

Each of those is the same pattern you just saw: a `.web.js` shim in `src/` that talks
to a main-process handler over IPC.
