// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Force the bundler to recognize and package raw SQLite .db assets
if (!config.resolver.assetExts.includes('db')) {
  config.resolver.assetExts.push('db');
}

// expo-sqlite on web runs SQLite compiled to WebAssembly. That WASM worker
// needs SharedArrayBuffer to do synchronous, cross-thread locking for writes
// (INSERT/UPDATE/DELETE) — reads can get by without it, which is exactly why
// questions loaded fine but exam results silently hung on save.
// SharedArrayBuffer requires these two response headers on every request, or
// the browser disables it entirely with no visible error.
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      return middleware(req, res, next);
    };
  },
};

module.exports = config;
