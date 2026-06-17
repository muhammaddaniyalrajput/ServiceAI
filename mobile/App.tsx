import './global.css'; // NativeWind v4 — must be first import
import React, { useEffect, useState } from 'react';
import { Platform, LogBox, ActivityIndicator, View } from 'react-native';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './src/firebase';
import { registerForPushNotificationsAsync } from './src/services/pushNotifications';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// ── Auth screens ────────────────────────────────────────────────────────────
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import LocationProfileScreen from './src/screens/LocationProfileScreen';
import EmailVerificationScreen from './src/screens/EmailVerificationScreen';

// ── App screens ─────────────────────────────────────────────────────────────
import MainTabNavigator from './src/navigation/MainTabNavigator';
import ProvidersScreen from './src/screens/ProvidersScreen';
import BookingSuccessScreen from './src/screens/BookingSuccessScreen';
import LiveTrackingScreen from './src/screens/LiveTrackingScreen';
import ChatScreen from './src/screens/ChatScreen';

import { RootStackParamList } from './src/types/navigation';

// Ignore non-fatal push notification server registration warnings (e.g. FIS_AUTH_ERROR in unsigned dev environments)
LogBox.ignoreLogs([
  'Error encountered while updating server registration with latest device push token',
]);

const Stack = createNativeStackNavigator<RootStackParamList>();

// Configure how notifications are displayed when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── App-level auth state ─────────────────────────────────────────────────────
//
// We use a three-value state to correctly handle the initial "unknown" period
// while Firebase resolves the persisted session from AsyncStorage:
//
//   null      → still determining (show splash/spinner)
//   'auth'    → unauthenticated OR profile incomplete (show Login/Signup/LocationProfile)
//   'app'     → authenticated AND profile complete (show main app)
//
// This prevents the Login screen from flashing before the persisted session is loaded.

type AppState = null | 'auth' | 'verification' | 'onboarding' | 'app';

export default function App() {
  const [appState, setAppState] = useState<AppState>(null);

  useEffect(() => {
    // ─── One-time setup tasks (push notifications, etc.) ─────────────────────
    async function setupApp() {
      const isExpoGo =
        Constants.appOwnership === 'expo' ||
        !!Constants.expoVersion ||
        Constants.executionEnvironment === 'storeClient';

      if (isExpoGo && Platform.OS === 'android') {
        try {
          await Notifications.setAutoServerRegistrationEnabledAsync(false);
        } catch {
          // Older SDK versions may not support this — safe to ignore
        }
      }

      try {
        const fcmToken = await registerForPushNotificationsAsync();
        if (fcmToken) {
          console.log('[Push] FCM token ready:', fcmToken);
        }
      } catch (error) {
        console.warn('[Push] Registration error (non-fatal):', error);
      }
    }

    setupApp();

    // ─── Firebase Auth state listener ─────────────────────────────────────────
    let unsubscribeDoc: (() => void) | null = null;

    const handleAuthStateChange = async (user: User | null) => {
      // Clear document snapshot listener on auth change
      if (unsubscribeDoc) {
        unsubscribeDoc();
        unsubscribeDoc = null;
      }

      if (!user) {
        setAppState('auth');
        return;
      }

      // Check email verification first
      if (!user.emailVerified) {
        setAppState('verification');
        return;
      }

      try {
        const userDocRef = doc(db, 'users', user.uid);
        // Start listening for changes in real-time
        unsubscribeDoc = onSnapshot(userDocRef, (snapshot) => {
          if (!auth.currentUser?.emailVerified) {
            setAppState('verification');
          } else if (snapshot.exists() && snapshot.data()?.profileCompleted === true) {
            setAppState('app');
          } else {
            setAppState('onboarding');
          }
        }, (err) => {
          console.warn('[App] Realtime listener error:', err);
          setAppState('auth');
        });
      } catch (error) {
        console.warn('[App] Could not setup user document listener:', error);
        setAppState('auth');
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, handleAuthStateChange);

    // Setup periodic polling check only when state is verification
    let intervalId: any = null;
    if (appState === 'verification') {
      intervalId = setInterval(async () => {
        const user = auth.currentUser;
        if (user) {
          try {
            await user.reload();
            if (user.emailVerified) {
              handleAuthStateChange(user);
            }
          } catch {
            // Ignore reload network errors in background polling
          }
        }
      }, 3000);
    }

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) {
        unsubscribeDoc();
      }
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [appState]);

  // ── Splash / loading state while Firebase resolves the persisted session ──
  if (appState === null) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#0f172a',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color="#6366f1" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: '#1e293b' },
            headerTintColor: '#fff',
            headerShadowVisible: false,
          }}
        >
          {appState === 'auth' ? (
            <>
              {/* ── Auth Screens ──────────────────────────────────────────────────── */}
              <Stack.Screen
                name="Login"
                component={LoginScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Signup"
                component={SignupScreen}
                options={{ headerShown: false }}
              />
            </>
          ) : appState === 'verification' ? (
            <>
              {/* ── Email Verification Screen ──────────────────────────────────────── */}
              <Stack.Screen
                name="EmailVerification"
                component={EmailVerificationScreen}
                options={{ headerShown: false }}
              />
            </>
          ) : appState === 'onboarding' ? (
            <>
              {/* ── Onboarding (Location Setup) Screen ─────────────────────────────── */}
              <Stack.Screen
                name="LocationProfile"
                component={LocationProfileScreen}
                options={{
                  headerShown: false,
                  gestureEnabled: false,
                }}
              />
            </>
          ) : (
            <>
              {/* ── App Screens ───────────────────────────────────────────────────── */}
              <Stack.Screen
                name="MainTabs"
                component={MainTabNavigator}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Providers"
                component={ProvidersScreen}
                options={{ title: 'Available Providers' }}
              />
              <Stack.Screen
                name="BookingSuccess"
                component={BookingSuccessScreen}
                options={{ title: 'Booking Confirmed 🎉', headerBackVisible: false }}
              />
              <Stack.Screen
                name="LiveTracking"
                component={LiveTrackingScreen}
                options={{ title: 'Live Tracking 🗺️' }}
              />
              <Stack.Screen
                name="Chat"
                component={ChatScreen}
                options={{ headerShown: false }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
