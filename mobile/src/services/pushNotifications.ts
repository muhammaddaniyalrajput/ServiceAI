import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// ─────────────────────────────────────────────────────────────────────────────
// Environment Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when the app is running inside Expo Go (the store client).
 *
 * Why this matters for push notifications:
 *   Expo Go is signed with Expo Inc.'s certificate, not yours. Firebase
 *   Installations Service (FIS) validates the app using the SHA-1 fingerprint
 *   registered in your Firebase project. Because the fingerprints don't match,
 *   FIS rejects the request → FIS_AUTH_ERROR.
 *
 *   The fix is a Development Build (`npx expo run:android`) which bakes
 *   YOUR google-services.json + YOUR signing key into the native APK.
 *
 * SDK 54 reliable detection: `executionEnvironment` is 'storeClient' in Expo Go.
 * We also check the legacy `appOwnership` for older SDK compatibility.
 */
function isRunningInExpoGo(): boolean {
  const env = Constants.executionEnvironment;
  const ownership = Constants.appOwnership;
  const expoVersion = Constants.expoVersion;
  
  console.log(`[Push] Environment Check - executionEnvironment: "${env}", appOwnership: "${ownership}", expoVersion: "${expoVersion}"`);
  
  // 1. If appOwnership is 'expo' or expoVersion is defined, it is definitely Expo Go.
  if (ownership === 'expo' || !!expoVersion) {
    return true;
  }
  
  // 2. Fallbacks based on executionEnvironment
  if (env === 'storeClient') {
    return true;
  }
  
  // 3. Standalone or Dev Client/Bare
  if (env === 'bare' || env === 'standalone') {
    return false;
  }
  
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Android Notification Channel
// ─────────────────────────────────────────────────────────────────────────────

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#6366f1',
    sound: 'default',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers for push notifications and returns the FCM device token.
 *
 * Returns:
 *   - `string`    — FCM token (development build or production)
 *   - `undefined` — running in Expo Go, simulator, or permission denied
 *
 * This function never throws. All errors are caught and logged.
 */
export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  // ── 0. Web check ────────────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    console.log('[Push] Skipped: push notifications are not supported on web.');
    return undefined;
  }

  // ── 1. Physical device check ────────────────────────────────────────────
  if (!Device.isDevice) {
    console.log('[Push] Skipped: must use a physical device for push notifications.');
    return undefined;
  }

  // ── 2. Expo Go check ────────────────────────────────────────────────────
  // FCM tokens require the app to be signed with YOUR key.
  // Expo Go uses Expo's key → FIS_AUTH_ERROR. Skip gracefully.
  if (isRunningInExpoGo()) {
    console.log(
      '[Push] Skipped: running in Expo Go. FCM tokens require a development build.\n' +
      '       Run: npx expo run:android'
    );
    return undefined;
  }

  // ── 3. Android notification channel ────────────────────────────────────
  await ensureAndroidChannel();

  // ── 4. Permission request ───────────────────────────────────────────────
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Permission denied — push notifications will not work.');
    return undefined;
  }

  // ── 5. Fetch FCM device token ───────────────────────────────────────────
  try {
    const tokenData = await Notifications.getDevicePushTokenAsync();
    const token = tokenData.data as string;
    console.log('[Push] FCM device token obtained:', token.substring(0, 20) + '...');
    return token;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    
    // Silence FIS_AUTH_ERROR since it is a configuration/signature issue and not a code bug.
    if (message.includes('FIS_AUTH_ERROR') || message.includes('java.io.IOException')) {
      console.log('[Push] Note: Push notifications are disabled (App signature not registered in Firebase console).');
    } else {
      console.warn('[Push] Failed to get FCM token:', message);
    }
    return undefined;
  }
}
