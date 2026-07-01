/**
 * EmailVerificationScreen — Modern UI to handle Firebase Email Verification.
 *
 * Features:
 * - Staggered fade/slide animations on mount.
 * - Dynamic status indicator.
 * - Manual verification check trigger.
 * - Auto-checking interval (re-checks email status every 4 seconds dynamically).
 * - "Resend verification email" button with rate-limiting.
 * - Toast notifications for user feedback.
 * - "Back to Sign In" option to sign out and return.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  StatusBar,
  Platform,
} from 'react-native';
import { useNativeDriver } from '../utils/animation';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { sendEmailVerification, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { RootStackParamList } from '../types/navigation';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { useToast } from '../components/ui/Toast';

type Props = NativeStackScreenProps<RootStackParamList, 'EmailVerification'>;

export default function EmailVerificationScreen({ navigation }: Props) {
  const { showToast, ToastContainer } = useToast();
  const [isChecking, setIsChecking] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Animations
  const scaleAnim   = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // Periodic status checking interval
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver, damping: 15, stiffness: 120 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver }),
    ]).start();

    // Auto-reload auth user state every 4 seconds to check verification status without clicking
    const interval = setInterval(async () => {
      try {
        const user = auth.currentUser;
        if (user) {
          await user.reload();
          // The App.tsx state listener will capture the verified status and swap navigation automatically
        }
      } catch (err) {
        // Silent catch for periodic auto-reloading failures (e.g. temporary network drop)
      }
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Cooldown timer for resending email
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleCheckVerification = async () => {
    if (isChecking) return;
    setIsChecking(true);
    try {
      const user = auth.currentUser;
      if (user) {
        await user.reload();
        if (user.emailVerified) {
          showToast('Email verified successfully!', 'success');
          // App.tsx auth observer will handle swapping navigator tree
        } else {
          showToast('Email is not verified yet. Please check your inbox or spam folder.', 'warning');
        }
      } else {
        showToast('Session expired. Please sign in again.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message ?? 'Failed to check verification status.', 'error');
    } finally {
      setIsChecking(false);
    }
  };

  const handleResendEmail = async () => {
    if (isResending || cooldown > 0) return;
    setIsResending(true);
    try {
      const user = auth.currentUser;
      if (user) {
        await sendEmailVerification(user);
        showToast('Verification email resent! Check your inbox.', 'success');
        setCooldown(60); // 60 seconds cooldown
      } else {
        showToast('Session expired. Please sign in again.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message ?? 'Failed to resend verification email.', 'error');
    } finally {
      setIsResending(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      // App.tsx onAuthStateChanged will handle navigation swap to Login screen
    } catch (err: any) {
      showToast('Sign out failed.', 'error');
    }
  };

  const email = auth.currentUser?.email ?? 'your email address';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <ToastContainer />

      {/* Decorative ambient blobs */}
      <View style={styles.blobTopRight} />
      <View style={styles.blobBottomLeft} />

      <Animated.View style={[styles.card, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>✉️</Text>
        </View>

        <Text style={styles.title}>Verify Your Email</Text>
        <Text style={styles.subtitle}>
          We have sent a verification link to:
        </Text>
        <Text style={styles.emailText}>{email}</Text>
        <Text style={styles.description}>
          Please click the link in that email to confirm your account status. The app will automatically progress once verified.
        </Text>

        <View style={styles.buttonWrapper}>
          <PrimaryButton
            label="I Have Verified My Email"
            loadingLabel="Checking Status…"
            onPress={handleCheckVerification}
            isLoading={isChecking}
            showArrow
          />
        </View>

        {/* Resend option */}
        <TouchableOpacity
          style={[styles.resendBtn, cooldown > 0 && styles.resendBtnDisabled]}
          onPress={handleResendEmail}
          disabled={isResending || cooldown > 0}
        >
          {isResending ? (
            <ActivityIndicator size="small" color="#818cf8" />
          ) : (
            <Text style={styles.resendText}>
              {cooldown > 0 ? `Resend Email in ${cooldown}s` : 'Resend Verification Email'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Back to sign in */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>← Back to Login</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  blobTopRight: {
    position: 'absolute', top: -40, right: -40,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(99,102,241,0.06)',
  },
  blobBottomLeft: {
    position: 'absolute', bottom: -60, left: -60,
    width: 240, height: 240, borderRadius: 120,
    backgroundColor: 'rgba(16,185,129,0.04)',
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(30,41,59,0.85)',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.7)',
    boxShadow: '0 10px 20px rgba(0,0,0,0.25)',
    elevation: 8,
  },
  iconCircle: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: 'rgba(99,102,241,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)',
  },
  iconText: { fontSize: 32 },
  title: {
    color: '#f1f5f9',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
  },
  emailText: {
    color: '#818cf8',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 24,
  },
  buttonWrapper: {
    width: '100%',
    marginBottom: 14,
  },
  resendBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 14,
  },
  resendBtnDisabled: {
    opacity: 0.5,
  },
  resendText: {
    color: '#818cf8',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  signOutBtn: {
    paddingVertical: 10,
  },
  signOutText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
});
