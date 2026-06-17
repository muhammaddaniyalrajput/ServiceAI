/**
 * Email Verification Screen
 *
 * Second step of provider onboarding:
 * - Polls Firebase to check if user verified email
 * - Shows countdown timer and resend email button
 * - Redirects to profile setup on verification
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth } from '@/firebase';
import { sendEmailVerification, reload } from 'firebase/auth';

export default function EmailVerificationScreen() {
  const router = useLocalSearchParams();
  const navigation = useRouter();
  const [isVerified, setIsVerified] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState('');

  const email = typeof router.email === 'string' ? router.email : '';

  // Poll for email verification every 3 seconds
  useEffect(() => {
    let pollingInterval: ReturnType<typeof setInterval> | null = null;
    let isSubscribed = true;

    const checkVerification = async () => {
      setIsChecking(true);
      try {
        const user = auth?.currentUser;
        if (user) {
          await reload(user);
          if (user.emailVerified && isSubscribed) {
            setIsVerified(true);
            if (pollingInterval) {
              clearInterval(pollingInterval);
              pollingInterval = null;
            }
            // Navigate to profile setup after a short delay
            setTimeout(() => {
              if (isSubscribed) {
                navigation.replace('/auth/profile-setup');
              }
            }, 500);
          }
        }
      } catch (err) {
        console.error('Verification check failed:', err);
      } finally {
        if (isSubscribed) {
          setIsChecking(false);
        }
      }
    };

    // Check immediately, then every 3 seconds
    checkVerification();
    pollingInterval = setInterval(checkVerification, 3000);

    return () => {
      isSubscribed = false;
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, []);

  // Cooldown timer for resend button
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleResendEmail = async () => {
    setError('');
    try {
      const user = auth?.currentUser;
      if (user) {
        await sendEmailVerification(user);
        setResendCooldown(60); // 60 second cooldown
        Alert.alert('Success', 'Verification email sent! Check your inbox.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resend email');
      Alert.alert('Error', error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          {isVerified ? (
            <Text style={styles.checkmark}>✓</Text>
          ) : (
            <ActivityIndicator size="large" color="#00bfff" />
          )}
        </View>

        <Text style={styles.title}>
          {isVerified ? 'Email Verified!' : 'Verify Your Email'}
        </Text>

        <Text style={styles.subtitle}>
          {isVerified
            ? 'Your email has been verified. Setting up your profile...'
            : `We've sent a verification link to ${email}`}
        </Text>

        {!isVerified && (
          <View style={styles.instructions}>
            <Text style={styles.instructionText}>
              Click the link in the email to verify your account.
            </Text>
            <Text style={styles.instructionText}>
              Checking automatically... (refreshes every 3 seconds)
            </Text>
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!isVerified && (
          <TouchableOpacity
            style={[
              styles.resendButton,
              resendCooldown > 0 && styles.buttonDisabled,
            ]}
            onPress={handleResendEmail}
            disabled={resendCooldown > 0}
          >
            <Text style={styles.resendButtonText}>
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Email'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  content: {
    alignItems: 'center',
    width: '100%',
  },
  iconContainer: {
    marginBottom: 32,
  },
  checkmark: {
    fontSize: 80,
    color: '#00ff88',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 24,
  },
  instructions: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 16,
    marginBottom: 32,
    borderLeftWidth: 4,
    borderLeftColor: '#00bfff',
  },
  instructionText: {
    color: '#ccc',
    fontSize: 14,
    marginVertical: 4,
    lineHeight: 20,
  },
  error: {
    color: '#ff4444',
    fontSize: 14,
    marginBottom: 16,
  },
  resendButton: {
    backgroundColor: '#404040',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  resendButtonText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '600',
  },
});
