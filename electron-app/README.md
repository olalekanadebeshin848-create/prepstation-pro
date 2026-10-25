# PrepStation Pro — Desktop (Phase 1: Electron shell + React Native Web)

This is the desktop shell. It runs your **existing** app on Windows/Mac/Linux by
rendering your React Native screens through **React Native Web**, wrapped in
**Electron**, with native features (licensing now, SQLite next) added over IPC.

Place this `electron-app/` folder **inside your React Native project root**
(`scholar-practice/electron-app/`), so the paths below line up.

```
scholar-practice/            ← your existing Expo/RN project
├─ App.js, src/, app.json …
├─ dist/                      ← created by `expo export --platform web`
└─ electron-app/              ← THIS folder
   ├─ main/
   │  ├─ main.js              ← Electron main process (loads the web build)
   │  ├─ preload.js           ← safe bridge → window.desktopLicense
   │  ├─ ipc.js               ← wires the license modules
   │  └─ license/             ← the ported licensing layer (see its own README)
   ├─ scripts/copy-web.js
   ├─ web/                    ← the exported build gets copied here (generated)
   └─ package.json
```

> Heads-up on your stack: Expo SDK 56 is still **beta** and RN 0.85 shipped very
> recently, so expect a few rough edges on web — we iterate. The old
> `expo-electron-adapter` is dead; this uses the modern Metro-based flow instead.

---

## Step 1 — Add web support to your RN project

From the **RN project root** (not this folder), install the web deps **through
Expo** so it picks the versions matched to your SDK (plain `npm install
react-native-web` lags React 19 — don't):

```
npx expo install react-dom react-native-web @expo/metro-runtime
```

Then confirm your app renders in a browser:

```
npx expo start --web
```

It'll open on `http://localhost:8081`. **Expect the native bits to break here** —
`expo-sqlite`, `expo-camera`, `expo-file-system`, etc. don't exist on web yet.
That's fine: Phase 1 is about getting the **shell and the screens** up. Phase 2
swaps those modules for desktop equivalents. If startup crashes hard on a native
call (e.g. `initDatabase`), guard it for now with a `Platform.OS === 'web'` check
so the UI can render — we'll replace it properly in Phase 2.

## Step 2 — Install and run the desktop shell (dev)

In **this** `electron-app/` folder:

```
npm install
npm install electron@latest electron-builder@latest --save-dev
npm run dev
```

With `npx expo start --web` running in the other terminal, `npm run dev` opens an
Electron window pointed at `http://localhost:8081` — your app, on the desktop,
with hot reload. DevTools open automatically.

## Step 3 — Verify the licensing bridge

Open the Electron DevTools console and run:

```js
await window.desktopLicense.getDeviceId()     // → "SP-XXXX-XXXX-XXXX"
await window.desktopLicense.getStrataCode()    // → a 6-digit code
```

Those are the two values a user communicates to you — the RSA activation ID and
the strata-lock code — coming straight from the ported modules in `main/license/`.
(See `main/license/README.md` for the full mapping and the `node selftest.js` check.)

## Step 4 — Production build → `.exe` (when the app renders)

From the RN project root:

```
npx expo export --platform web
```

Then from `electron-app/`:

```
npm run dist
```

`npm run dist` copies `../dist` → `./web`, then `electron-builder` packages a
Windows installer into `electron-app/release/`. (Mac/Linux targets can be added to
the `build` block in `package.json` later.)

---

## What's done and what's next

**Done in Phase 1:** the Electron shell, the dev/prod web-loading pipeline, the
IPC bridge, and the full licensing layer wired in (`window.desktopLicense`).

**Phase 2 — the platform layer** (the real remaining work): behind
`Platform.OS === 'web'` / `.web.js` files, swap the phone-only modules for desktop
ones —
- `expo-sqlite` → `better-sqlite3` in the main process (new IPC handlers) — this
  is the big one, and better-sqlite3 is a native module, so it needs an
  Electron rebuild step;
- `expo-document-picker` / `expo-sharing` → Electron `dialog`;
- `react-native-webview` + KaTeX → render KaTeX directly in the DOM;
- `expo-camera` → webcam + a JS QR reader, or drop it on desktop;
- `AsyncStorage` → `electron-store`;
- and point your app's `LicenseService` at `window.desktopLicense` on web.
