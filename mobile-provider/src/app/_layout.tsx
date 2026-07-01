/**
 * Root Layout — Main entry point for the provider app
 *
 * Handles:
 * - Auth state checking
 * - Conditional routing (auth vs app navigation)
 * - Loading splash screen
 * - FCM setup on app start
 */

import React, { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/firebase';
import { useProviderStore } from '@/store/providerStore';
import { ActivityIndicator, View, Platform } from 'react-native';
import { getPushTokenAsync } from '@/services/pushNotifications';
import { providerAPI } from '@/services/providerAPI';

function RootLayoutNav() {
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  // Use a ref so the auth listener can read the latest segments
  // WITHOUT re-subscribing on every navigation change.
  const segmentsRef = useRef(segments);
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  const setAuthenticated = useProviderStore((s) => s.setAuthenticated);
  const logout = useProviderStore((s) => s.logout);
  const providerId = useProviderStore((s) => s.providerId);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    // Setup FCM token on app start (native only)
    const setupFCM = async () => {
      try {
        const token = await getPushTokenAsync();
        if (token && providerId) {
          // Register the device token with the backend so job-dispatch
          // push notifications can actually reach this provider.
          await providerAPI.registerFcmToken(token);
          console.log('FCM token registered with backend for provider', providerId);
        }
      } catch (err) {
        console.warn('FCM setup failed:', err);
      }
    };

    setupFCM();
  }, [providerId]);

  // Auth listener — runs ONCE on mount only (empty dependency array).
  // Reads segments via ref to avoid re-subscribing on every navigation.
  useEffect(() => {
    // Guard: if Firebase failed to initialize, auth will be undefined
    if (!auth) {
      console.warn('Firebase auth is not initialized — redirecting to auth screen.');
      setIsLoading(false);
      router.replace('/auth/register');
      return;
    }

    // Listen to auth state changes — subscribes ONCE
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setIsLoading(true);
      const currentSegments = segmentsRef.current;

      if (user) {
        // User is signed in
        setAuthenticated(true, {
          email: user.email || '',
          uid: user.uid,
        });

        // Step 1: Check if email is verified
        if (!user.emailVerified) {
          if (currentSegments[0] !== 'auth' || currentSegments[1] !== 'verify-email') {
            router.replace({
              pathname: '/auth/verify-email',
              params: { email: user.email },
            });
          }
          setIsLoading(false);
          return;
        }

        // Step 2: Fetch provider profile (called ONCE per auth state change)
        try {
          const profile = await providerAPI.getCurrentProviderProfile();
          // Profile exists and is fetched successfully
          useProviderStore.setState({
            profile,
            providerId: profile.provider_id,
          });

          // Redirect to dashboard if in auth or on initial load
          if (currentSegments[0] === 'auth' || !currentSegments[0]) {
            router.replace('/dashboard');
          }
        } catch (err: any) {
          // If profile setup is not completed (404), go to profile setup
          const isProfileNotFound = 
            err.status === 404 || 
            err.message?.toLowerCase().includes('404') || 
            err.message?.toLowerCase().includes('not found');

          if (isProfileNotFound) {
            if (currentSegments[0] !== 'auth' || currentSegments[1] !== 'profile-setup') {
              router.replace('/auth/profile-setup');
            }
          } else {
            console.error('Failed to fetch provider profile:', err);
          }
        }
      } else {
        // User is signed out
        logout();

        // Redirect to auth screens
        if (currentSegments[0] !== 'auth') {
          router.replace('/auth/register');
        }
      }
      setIsLoading(false);
    });

    return unsubscribe;
  }, []); // ← Empty array: subscribe ONCE, never re-trigger

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a' }}>
        <ActivityIndicator size="large" color="#00bfff" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#1a1a1a' },
        animation: 'default',
      }}
    >
      {/* Auth Stack */}
      <Stack.Screen name="auth" options={{ animation: 'none' }} />

      {/* App Stack */}
      <Stack.Screen name="dashboard" options={{ animation: 'default' }} />
      <Stack.Screen name="jobs" options={{ animation: 'default' }} />
      <Stack.Screen name="profile" options={{ animation: 'default' }} />
      <Stack.Screen name="job-detail" options={{ animation: 'default' }} />
      <Stack.Screen name="live-tracking" options={{ animation: 'default' }} />
      <Stack.Screen name="chat" options={{ animation: 'default' }} />
      <Stack.Screen name="earnings" options={{ animation: 'default' }} />
      <Stack.Screen name="job-history" options={{ animation: 'default' }} />
    </Stack>
  );
}

export default RootLayoutNav;
