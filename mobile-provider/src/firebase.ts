import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, Persistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// getReactNativePersistence exists at runtime in Firebase but its type declarations
// are broken in the default web typings. Using require('firebase/auth') bypasses
// the TS module resolution error safely and ensures we load from the same package instance.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getReactNativePersistence } = require('firebase/auth') as {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
};

// Firebase configuration for Provider App
const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let auth: any;
let db: any;

try {
  // Prevent duplicate app initialization on hot-reload
  const firebaseApp = getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApp();

  // initializeAuth must only be called once per app lifetime.
  try {
    auth = initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (alreadyInitError: any) {
    auth = getAuth(firebaseApp);
  }

  // Firestore is idempotent
  db = getFirestore(firebaseApp);
  console.log('Firebase initialized successfully.');
} catch (error) {
  console.warn(
    'Firebase Initialization Warning: Firebase failed to initialize. ' +
    'Check your Firebase configuration in mobile-provider/src/firebase.ts or .env file.',
    error
  );
  auth = undefined;
  db = null;
}

export { auth, db };
