const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Force the bundler to recognize and package raw SQLite .db assets
config.resolver.assetExts.push('db');

module.exports = config;