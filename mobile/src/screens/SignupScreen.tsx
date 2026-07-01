/**
 * SignupScreen — Modernized registration form.
 *
 * UX improvements over original:
 * - Staggered field entrance animations
 * - Password strength indicator bar (weak/fair/strong)
 * - Eye-toggle on password field
 * - Toast replaces Alert.alert()
 * - Tab keyboard navigation across all 4 fields
 * - Progress stepper (Step 1 of 3)
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
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useNativeDriver } from '../utils/animation';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { RootStackParamList } from '../types/navigation';
import { FormInput } from '../components/ui/FormInput';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { useToast } from '../components/ui/Toast';

// ─── Types ─────────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'Signup'>;

// ─── Validation ────────────────────────────────────────────────────────────────

const validateEmail    = (v: string) => !v.trim() ? 'Email is required.' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? 'Enter a valid email address.' : null;
const validatePassword = (v: string) => !v ? 'Password is required.' : v.length < 6 ? 'At least 6 characters required.' : null;
const validatePhone    = (v: string) => !v.trim() ? 'Phone is required.' : !/^(\+?92|0)?3[0-9]{9}$/.test(v.trim().replace(/\s/g, '')) ? 'Enter a valid Pakistani number (e.g. 03001234567).' : null;
const validateName     = (v: string) => !v.trim() ? 'Full name is required.' : v.trim().length < 2 ? 'Name must be at least 2 characters.' : null;

// ─── Password strength ─────────────────────────────────────────────────────────

function getPasswordStrength(password: string): { level: 0 | 1 | 2 | 3; label: string; color: string } {
  if (!password) return { level: 0, label: '', color: 'transparent' };
  let score = 0;
  if (password.length >= 8)            score++;
  if (/[A-Z]/.test(password))          score++;
  if (/[0-9]/.test(password))          score++;
  if (/[^a-zA-Z0-9]/.test(password))  score++;

  if (password.length < 6)   return { level: 1, label: 'Weak',   color: '#ef4444' };
  if (score <= 1)             return { level: 1, label: 'Weak',   color: '#ef4444' };
  if (score === 2)            return { level: 2, label: 'Fair',   color: '#f59e0b' };
  return                             { level: 3, label: 'Strong', color: '#10b981' };
}

// ─── Firebase error mapper ─────────────────────────────────────────────────────

function getFriendlyAuthError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/email-already-in-use':   return 'This email is already registered. Log in instead.';
      case 'auth/invalid-email':          return 'The email address is not valid.';
      case 'auth/weak-password':          return 'Password is too weak.';
      case 'auth/network-request-failed': return 'Network error. Check your internet connection.';
      case 'auth/too-many-requests':      return 'Too many attempts. Please wait a moment.';
      default:                            return (error as FirebaseError).message || 'Sign-up failed.';
    }
  }
  return 'An unexpected error occurred.';
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SignupScreen({ navigation }: Props) {
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone]       = useState('');
  const [errors, setErrors]     = useState<{ name?: string | null; email?: string | null; password?: string | null; phone?: string | null }>({});
  const [isLoading, setIsLoading] = useState(false);

  const { showToast, ToastContainer } = useToast();

  // Refs for keyboard tab navigation
  const emailRef    = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const phoneRef    = useRef<TextInput>(null);

  // Entrance animations
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerSlide   = useRef(new Animated.Value(-20)).current;
  const cardOpacity   = useRef(new Animated.Value(0)).current;
  const cardSlide     = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.stagger(100, [
      Animated.parallel([
        Animated.timing(headerOpacity, { toValue: 1, duration: 400, useNativeDriver }),
        Animated.timing(headerSlide,   { toValue: 0, duration: 400, useNativeDriver }),
      ]),
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: 420, useNativeDriver }),
        Animated.timing(cardSlide,   { toValue: 0, duration: 420, useNativeDriver }),
      ]),
    ]).start();
  }, []);

  const strength = getPasswordStrength(password);

  const validateAll = () => {
    const e = { name: validateName(name), email: validateEmail(email), password: validatePassword(password), phone: validatePhone(phone) };
    setErrors(e);
    return Object.values(e).every((v) => v === null);
  };

  const handleSignup = async () => {
    if (isLoading || !validateAll()) return;
    setIsLoading(true);

    try {
      const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
      
      // Write profile draft immediately
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        profileCompleted: false,
        createdAt: serverTimestamp(),
      });

      // Send confirmation/verification email
      await sendEmailVerification(user);
      
      showToast('Verification email sent! Please check your inbox.', 'success', 5000);
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
      <ToastContainer />

      {/* Decorative blobs */}
      <View style={styles.blobTop} />
      <View style={styles.blobBottom} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <Animated.View
          style={[
            styles.header,
            { opacity: headerOpacity, transform: [{ translateY: headerSlide }] },
          ]}
        >
          {/* Step indicator */}
          <View style={styles.stepRow}>
            {[1, 2, 3].map((n) => (
              <View
                key={n}
                style={[styles.stepDot, n === 1 ? styles.stepDotActive : styles.stepDotInactive]}
              />
            ))}
          </View>
          <Text style={styles.stepLabel}>Step 1 of 3</Text>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join thousands booking smarter services.</Text>
        </Animated.View>

        {/* ── Form card ── */}
        <Animated.View
          style={[styles.card, { opacity: cardOpacity, transform: [{ translateY: cardSlide }] }]}
        >
          <FormInput
            label="Full Name"
            leftIcon="👤"
            value={name}
            onChangeText={(v) => { setName(v); if (errors.name) setErrors((p) => ({ ...p, name: validateName(v) })); }}
            placeholder="Muhammad Daniyal"
            error={errors.name}
            keyboardType="default"
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            blurOnSubmit={false}
          />

          <FormInput
            ref={emailRef}
            label="Email Address"
            leftIcon="✉️"
            value={email}
            onChangeText={(v) => { setEmail(v); if (errors.email) setErrors((p) => ({ ...p, email: validateEmail(v) })); }}
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
            onChangeText={(v) => { setPassword(v); if (errors.password) setErrors((p) => ({ ...p, password: validatePassword(v) })); }}
            placeholder="Min. 6 characters"
            error={errors.password}
            isPassword
            returnKeyType="next"
            onSubmitEditing={() => phoneRef.current?.focus()}
            blurOnSubmit={false}
          />

          {/* Password strength bar */}
          {password.length > 0 && (
            <View style={styles.strengthWrapper}>
              <View style={styles.strengthBarRow}>
                {[1, 2, 3].map((n) => (
                  <View
                    key={n}
                    style={[
                      styles.strengthBar,
                      { backgroundColor: n <= strength.level ? strength.color : '#1e293b' },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
            </View>
          )}

          <FormInput
            ref={phoneRef}
            label="Phone Number"
            leftIcon="📱"
            value={phone}
            onChangeText={(v) => { setPhone(v); if (errors.phone) setErrors((p) => ({ ...p, phone: validatePhone(v) })); }}
            placeholder="03001234567"
            error={errors.phone}
            keyboardType="phone-pad"
            returnKeyType="done"
            onSubmitEditing={handleSignup}
          />

          <View style={styles.buttonWrapper}>
            <PrimaryButton
              label="Create Account"
              loadingLabel="Creating Account…"
              onPress={handleSignup}
              isLoading={isLoading}
              showArrow
            />
          </View>

          {/* Link to Login */}
          <View style={styles.linkRow}>
            <Text style={styles.linkTextMuted}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')} disabled={isLoading}>
              <Text style={styles.linkTextActive}>Log In</Text>
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

  blobTop: {
    position: 'absolute', top: -60, left: -80,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(99,102,241,0.07)',
  },
  blobBottom: {
    position: 'absolute', bottom: 60, right: -80,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(16,185,129,0.05)',
  },

  header: {
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 70 : 50,
    paddingBottom: 28,
  },
  stepRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  stepDot: { width: 24, height: 5, borderRadius: 3 },
  stepDotActive:   { backgroundColor: '#6366f1' },
  stepDotInactive: { backgroundColor: '#1e293b' },
  stepLabel: { color: '#818cf8', fontSize: 11, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 },
  title:    { color: '#f1f5f9', fontSize: 30, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: '#64748b', fontSize: 14 },

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

  strengthWrapper:  { flexDirection: 'row', alignItems: 'center', marginTop: -8, marginBottom: 16, gap: 8 },
  strengthBarRow:   { flexDirection: 'row', flex: 1, gap: 4 },
  strengthBar:      { flex: 1, height: 3, borderRadius: 2 },
  strengthLabel:    { fontSize: 11, fontWeight: '700', minWidth: 40 },

  buttonWrapper: { marginTop: 8 },
  linkRow:       { flexDirection: 'row', justifyContent: 'center', marginTop: 22, alignItems: 'center' },
  linkTextMuted:  { color: '#64748b', fontSize: 14 },
  linkTextActive: { color: '#818cf8', fontSize: 14, fontWeight: '700' },
});
