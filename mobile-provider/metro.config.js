const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Disable unstable package exports resolution in Metro.
// Expo SDK 52+ enables this by default, which can cause module resolution mismatches
// for Firebase, leading to "Component auth has not been registered yet" errors.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
