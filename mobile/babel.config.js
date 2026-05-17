/**
 * Babel config for Expo SDK 54 + NativeWind v4 + Reanimated v4
 *
 * RULES:
 *  1. 'babel-preset-expo' must be the only preset.
 *  2. NativeWind v4 does NOT use a Babel plugin — it uses Metro transform.
 *  3. 'react-native-reanimated/plugin' MUST be the LAST plugin entry.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // react-native-reanimated plugin must always be last
      'react-native-reanimated/plugin',
    ],
  };
};
