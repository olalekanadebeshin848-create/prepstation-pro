# Desktop licensing layer

This folder is the desktop (Electron) port of your mobile licensing. It runs in the
**Electron main process** (Node); your UI in the renderer calls it over IPC.

Your app has **two independent locks** and both are preserved here:

| Layer | What it gates | Value it keys off | Crypto | Mobile origin | Desktop file |
|---|---|---|---|---|---|
| **Activation** | the whole app | `SP-XXXX-XXXX-XXXX` device ID | RSA (SHA256withRSA) | `activation.js` + `security.js` + `keys.js` | `deviceId.js`, `activation.js`, `rsaVerify.js`, `keys.js` |
| **Strata lock** | each strata file | random **6-digit** code | XOR + Base64 | `LicenseService.js` | `strataLicense.js` |

## What changed vs. mobile (and what didn't)

- **RSA verify (`rsaVerify.js`)** — identical to `security.js`. `jsrsasign` is pure JS.
  **Your signing does not change**: you still sign the device-ID *string* with your
  private key. Keep that private key **out of this project**.
- **Device ID (`deviceId.js`)** — the *only* real change. The phone hashed its
  hardware; the desktop hashes the machine's stable GUID (`node-machine-id`) into the
  **same `SP-XXXX-XXXX-XXXX` format**. Re-derived each call, never stored, so copying
  the app to another PC re-locks it — same anti-piracy behaviour.
- **Strata lock (`strataLicense.js`)** — near-verbatim. The 6-digit code is random +
  stored (it was never hardware-derived), and the XOR + `APP_SECRET_KEY` are
  byte-for-byte identical to the phone and your admin tool. Verified: a code encrypted
  by the admin tool's `sig_a`/`sig_b` split decrypts back correctly here.
- **Storage** — `expo-secure-store` → `electron-store` (encrypted-at-rest).

## Install

```
npm install jsrsasign node-machine-id electron-store@8
```

> Use `electron-store@8` (CommonJS). v9+ is ESM-only and won't `require()` cleanly
> from a CommonJS main process.

## Try it now (plain Node, before the app exists)

```
node selftest.js
```

Prints this machine's `SP-` device ID (the value you sign an activation key for) and
proves the strata XOR round-trip. `activation.js` / `strataLicense.js` themselves only
run inside Electron (they open `electron-store` at load).

## How it wires into Electron

- **Main process** owns these modules (it has Node, the filesystem, and the machine ID).
- **Renderer** (your React-Native-Web UI) never imports them directly. Expose a tiny,
  safe surface through a **preload** script + `ipcMain.handle`:
  - `license:getDeviceId` → `getUniqueDeviceId()`
  - `license:getStrataCode` → `getOrCreateDeviceLicense()`  (show on screen for the user to send you)
  - `license:checkActivation` → `checkCurrentActivationStatus()`
  - `license:activate` (key) → `verifyOfflineLicense(getUniqueDeviceId(), key)` then `saveSuccessfulActivation(key)`
  - `strata:validate` (parsedJson) → `validateLicenseInFile(parsedJson)`

## Security notes (honest)

- The **RSA activation stays strong** on desktop — the public key can't forge licenses,
  and the private key never ships.
- The **strata XOR lock is obfuscation, not real crypto** (same as on Android), and an
  Electron app's files are more extractable than an APK, so `APP_SECRET_KEY` is more
  exposed here. It's the *secondary* lock behind the RSA gate; fine unless piracy is a
  serious worry, in which case we'd revisit signing strata too.
- The 6-digit strata code is **not recoverable** if `electron-store` is wiped — a new
  code is generated and previously-licensed strata would then read as `MISMATCH` (same
  behaviour as clearing the phone's secure store).

## Where this sits in the whole port

1. **Electron shell + React-Native-Web** — get your existing screens rendering on desktop.
2. **Platform layer** — swap the phone-only modules: `expo-sqlite` → `better-sqlite3`
   (main + IPC); file dialogs → Electron `dialog`; KaTeX → render in the DOM (no WebView);
   camera → webcam + JS QR, or drop it; `AsyncStorage` → `electron-store`; sharing → save dialog.
3. **Licensing (this folder)** — wire the activation gate + strata import via IPC.
4. **Package** — `electron-builder` → a Windows `.exe` (Mac/Linux optional).
