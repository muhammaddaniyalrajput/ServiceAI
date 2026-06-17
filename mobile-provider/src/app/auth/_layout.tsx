/**
 * Auth Layout — Stack for authentication screens
 *
 * Handles:
 * - Register screen
 * - Email verification screen
 * - Profile setup screen
 * - Login screen
 */

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#1a1a1a' },
        animation: 'default',
      }}
    >
      <Stack.Screen name="register" options={{ animation: 'none' }} />
      <Stack.Screen name="verify-email" options={{ animation: 'default' }} />
      <Stack.Screen name="profile-setup" options={{ animation: 'default' }} />
      <Stack.Screen name="login" options={{ animation: 'none' }} />
    </Stack>
  );
}
