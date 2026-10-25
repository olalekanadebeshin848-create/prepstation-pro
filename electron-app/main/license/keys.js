// electron-app/main/license/keys.js
// ─────────────────────────────────────────────────────────────────────────────
// The SAME public key as your mobile app (src/utils/keys.js). It ships inside the
// desktop bundle and is completely safe to expose: a public key can only VERIFY
// activation licenses, never forge them.
//
// ⚠️ REPLACE the placeholder below with your REAL public key (the one in your
// mobile keys.js is clearly a dummy). Keep your PRIVATE key OUT of this project
// entirely — it lives only wherever you sign device IDs to mint activation keys.
// ─────────────────────────────────────────────────────────────────────────────

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0G4u8d1hC7M2p+n3Z5wX
8h8jKld9N8gY9n6KzL2fN5vXm9zE8P7q8f9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n
8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n
8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n
8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n8v9n
-----END PUBLIC KEY-----`;

module.exports = { PUBLIC_KEY_PEM };
