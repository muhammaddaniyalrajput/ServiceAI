/**
 * LoginScreen — Modern dark-glass login form.
 *
 * UX improvements over the original:
 * - Animated logo scale-in on mount
 * - Password eye-toggle (no more guessing)
 * - Inline toast replaces Alert.alert()
 * - Spring-animated submit button via PrimaryButton
 * - Animated focus rings on inputs via FormInput
 * - Tab-style keyboard navigation (email → password → submit)
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Animated,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useNativeDriver } from '../utils/animation';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { RootStackParamList } from '../types/navigation';
import { FormInput } from '../components/ui/FormInput';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { useToast } from '../components/ui/Toast';
import { TouchableOpacity } from 'react-native';

// ─── Types ─────────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

// ─── Error mapping ─────────────────────────────────────────────────────────────

function getFriendlyAuthError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/user-not-found':
      case 'auth/invalid-credential':
        return 'No account found with these credentials.';
      case 'auth/wrong-password':
        return 'Incorrect password. Please try again.';
      case 'auth/invalid-email':
        return 'The email address is not valid.';
      case 'auth/user-disabled':
        return 'Your account has been disabled.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a moment.';
      case 'auth/network-request-failed':
        return 'Network error. Check your internet connection.';
      default:
        return (error as FirebaseError).message || 'Login failed. Please try again.';
    }
  }
  return 'An unexpected error occurred.';
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors]     = useState<{ email?: string | null; password?: string | null }>({});
  const [isLoading, setIsLoading] = useState(false);

  const { showToast, ToastContainer } = useToast();
  const passwordRef = useRef<TextInput>(null);

  // ── Entrance animation ──
  const logoScale   = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const formSlide   = useRef(new Animated.Value(40)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(120, [
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, useNativeDriver, damping: 14, stiffness: 120 }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 350, useNativeDriver }),
      ]),
      Animated.parallel([
        Animated.timing(formSlide, { toValue: 0, duration: 380, useNativeDriver }),
        Animated.timing(formOpacity, { toValue: 1, duration: 380, useNativeDriver }),
      ]),
    ]).start();
  }, []);

  // ── Validation ──
  const validateAll = (): boolean => {
    const emailErr    = !email.trim() ? 'Email is required.' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Enter a valid email.' : null;
    const passwordErr = !password ? 'Password is required.' : null;
    setErrors({ email: emailErr, password: passwordErr });
    return !emailErr && !passwordErr;
  };

  // ── Login handler ──
  const handleLogin = async () => {
    if (isLoading || !validateAll()) return;
    setIsLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const { uid }    = credential.user;

      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists() && userDoc.data()?.profileCompleted) {
        // App.tsx onSnapshot listener will transition appState to 'app'
        return;
      } else {
        const data = userDoc.data();
        navigation.navigate('LocationProfile', {
          uid,
          name:  data?.name  ?? '',
          email: email.trim(),
          phone: data?.phone ?? '',
        });
      }
    } catch (error: unknown) {
      showToast(getFriendlyAuthError(error), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Floating toast */}
      <ToastContainer />

      {/* Decorative gradient blobs */}
      <View style={styles.blobTopRight} />
      <View style={styles.blobBottomLeft} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Logo & heading ── */}
        <Animated.View
          style={[
            styles.header,
            { opacity: logoOpacity, transform: [{ scale: logoScale }] },
          ]}
        >
          <View style={styles.logoBadge}>
            <Text style={styles.logoLetter}>S</Text>
          </View>
          <Text style={styles.brand}>KaamEasy AI</Text>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to manage your bookings.</Text>
        </Animated.View>

        {/* ── Form card ── */}
        <Animated.View
          style={[
            styles.card,
            { opacity: formOpacity, transform: [{ translateY: formSlide }] },
          ]}
        >
          <FormInput
            label="Email Address"
            leftIcon="✉️"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (errors.email) setErrors((p) => ({ ...p, email: null }));
            }}
            placeholder="you@example.com"
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            blurOnSubmit={false}
          />

          <FormInput
            ref={passwordRef}
            label="Password"
            leftIcon="🔒"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (errors.password) setErrors((p) => ({ ...p, password: null }));
            }}
            placeholder="Your password"
            error={errors.password}
            isPassword
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <View style={styles.buttonWrapper}>
            <PrimaryButton
              label="Log In"
              loadingLabel="Signing In…"
              onPress={handleLogin}
              isLoading={isLoading}
              showArrow
            />
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Sign up link */}
          <View style={styles.linkRow}>
            <Text style={styles.linkTextMuted}>Don't have an account? </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Signup')}
              disabled={isLoading}
            >
              <Text style={styles.linkTextActive}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0f172a' },
  scrollContent: { flexGrow: 1 },

  // Decorative ambient blobs
  blobTopRight: {
    position: 'absolute', top: -80, right: -80,
    width: 240, height: 240, borderRadius: 120,
    backgroundColor: 'rgba(99,102,241,0.08)',
  },
  blobBottomLeft: {
    position: 'absolute', bottom: 40, left: -100,
    width: 280, height: 280, borderRadius: 140,
    backgroundColor: 'rgba(16,185,129,0.05)',
  },

  header: {
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
    paddingBottom: 36,
  },
  logoBadge: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: '#6366f1',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
    boxShadow: '0 8px 16px rgba(99,102,241,0.45)',
    elevation: 12,
  },
  logoLetter: { color: '#fff', fontSize: 26, fontWeight: '900' },
  brand: { color: '#818cf8', fontSize: 11, fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 },
  title: { color: '#f1f5f9', fontSize: 30, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: '#64748b', fontSize: 14, lineHeight: 20 },

  card: {
    flex: 1,
    backgroundColor: 'rgba(30,41,59,0.7)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(51,65,85,0.8)',
  },
  buttonWrapper: { marginTop: 8 },

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 22 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#1e293b' },
  dividerText: { color: '#475569', marginHorizontal: 12, fontSize: 13 },

  linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  linkTextMuted:   { color: '#64748b', fontSize: 14 },
  linkTextActive:  { color: '#818cf8', fontSize: 14, fontWeight: '700' },
});
