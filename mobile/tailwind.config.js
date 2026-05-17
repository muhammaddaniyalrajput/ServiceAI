/** @type {import('tailwindcss').Config} */
module.exports = {
  // NativeWind v4: use the preset, target src files and App entry
  presets: [require('nativewind/preset')],
  content: [
    './App.{js,jsx,ts,tsx}',
    './index.{js,ts}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
