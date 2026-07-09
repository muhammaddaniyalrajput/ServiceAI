/**
 * app.config.js — Customer app
 *
 * Dynamic Expo config that picks the Firebase client files from an
 * EAS file environment variable when building in the cloud, and
 * falls back to the local filesystem path during `expo start` /
 * `expo run:*`.
 *
 * Why this file exists
 * --------------------
 * `app.json`'s ``android.googleServicesFile`` and ``ios.googleServicesFile``
 * are *hardcoded filesystem paths*. EAS Build clones the repo and
 * then evaluates the config — but the Firebase config files are
 * deliberately gitignored (they're a public-but-rotatable credential
 * that teams usually keep out of source control). So the build
 * server can't find them and the build fails with:
 *
 *     "google-services.json" is missing, make sure that the file exists.
 *
 * The fix: declare the file paths as env-var lookups. EAS file
 * env vars (created with ``eas env:create --type file``) inject a
 * server-local path that Expo CLI can resolve. Local dev keeps
 * working unchanged because the env var is unset locally and we
 * fall back to the on-disk file.
 *
 * Setup
 * -----
 *     eas env:create --name GOOGLE_SERVICES_JSON \
 *         --type file --value ./google-services.json \
 *         --environment preview,production --non-interactive
 *     eas env:create --name GOOGLE_SERVICE_INFO_PLIST \
 *         --type file --value ./GoogleService-Info.plist \
 *         --environment preview,production --non-interactive
 *
 * Reference
 * ---------
 * https://docs.expo.dev/eas/environment-variables/#file-environment-variables
 */
const path = require('path');

// Pull the static base config out of app.json so we keep a single
// source of truth for everything that doesn't need to be dynamic.
const appJson = require('./app.json');

/**
 * @param {{ config: any }} ctx — Expo CLI passes an object that
 *   contains the existing resolved config. We extend it.
 */
module.exports = ({ config } = {}) => {
  const base = (config && config.expo) ? config.expo : (appJson.expo || {});
  const android = base.android || {};
  const ios = base.ios || {};

  return {
    ...base,
    android: {
      ...android,
      // Prefer the EAS file env var (set on the build server), fall
      // back to the local file path for `expo start` / `expo run:*`.
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON
        || android.googleServicesFile
        || './google-services.json',
    },
    ios: {
      ...ios,
      googleServicesFile:
        process.env.GOOGLE_SERVICE_INFO_PLIST
        || ios.googleServicesFile
        || './GoogleService-Info.plist',
    },
  };
};
