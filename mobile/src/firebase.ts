import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// TODO: Replace with your actual Firebase Web config from the Firebase Console
// Project Settings -> General -> Your apps -> Web app
const firebaseConfig = {
  apiKey: "AIzaSy_YOUR_API_KEY",
  authDomain: "serviceflowai-4181f.firebaseapp.com",
  projectId: "serviceflowai-4181f",
  storageBucket: "serviceflowai-4181f.appspot.com",
  messagingSenderId: "1021164008949",
  appId: "1:1021164008949:web:YOUR_APP_ID",
  measurementId: "G-YOUR_MEASUREMENT_ID"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
