/**
 * Babel config for Expo SDK 54 + NativeWind v4 + Reanimated v4
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // react-native-reanimated plugin must always be last
      'react-native-reanimated/plugin',
    ],
  };
};
