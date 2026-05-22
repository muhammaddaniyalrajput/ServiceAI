import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, Persistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

// getReactNativePersistence exists at runtime in Firebase v11 but its type declarations
// are broken — require() bypasses the TS module resolution error safely.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getReactNativePersistence } = require('firebase/auth') as {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
};

// Firebase configuration — uses the WEB app ID (required by the JS/Web SDK).
// The Android-platform app ID (android:...) is only for native SDKs via google-services.json.
//
// ❌ WRONG (causes auth/configuration-not-found):
//    appId: "1:1082565883517:android:6933390ebf41a248236314"
// ✅ CORRECT (web SDK app ID):
//    appId: "1:1082565883517:web:c629be029372aa76236314"
const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY             ?? 'AIzaSyCyCiFUr8JEyGoSjN3uwtiR61NLa6QrixA',
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN          ?? 'serviceflowai-final.firebaseapp.com',
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID           ?? 'serviceflowai-final',
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET       ?? 'serviceflowai-final.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID  ?? '1082565883517',
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID               ?? '1:1082565883517:web:c629be029372aa76236314',
};

let auth: any;

try {
  // Prevent duplicate app initialization on hot-reload
  const app = getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApp();

  // initializeAuth must only be called once per app lifetime.
  // On hot-reload the app already exists, so getAuth() returns the existing instance.
  if (getApps().length > 1) {
    // Multiple apps registered — just get the default auth
    auth = getAuth(app);
  } else {
    try {
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch (alreadyInitError: any) {
      // Auth was already initialized (hot reload) — reuse existing instance
      auth = getAuth(app);
    }
  }
} catch (error) {
  console.warn(
    'Firebase Initialization Warning: Firebase failed to initialize. ' +
    'Check your Firebase configuration in mobile/src/firebase.ts or mobile/.env.\n' +
    'Get correct values from: Firebase Console > Project Settings > General > Your apps (Web app).',
    error
  );
  // Export a mock auth object so the app does not crash on imports
  auth = {
    currentUser: null,
    getIdToken: async () => '',
  };
}

export { auth };
