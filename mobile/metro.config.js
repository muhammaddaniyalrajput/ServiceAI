/**
 * Metro bundler config for Expo SDK 54 + NativeWind v4
 *
 * NativeWind v4 requires CSS-in-JS to be processed via Metro's
 * cssTransformer — NOT a Babel plugin.
 */
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  // NativeWind global CSS entry (created below)
  input: './global.css',
});