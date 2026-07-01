/**
 * HomeScreen — The main AI request interface.
 *
 * UX improvements over original:
 * - Service category quick-picks (tap to prefill input)
 * - Richer intent result card with a confidence percentage ring
 * - Shimmer skeleton placeholder while loading
 * - Animated bottom input bar slides up on mount
 * - User greeting from Firebase auth displayName/email
 * - Subtle gradient header with avatar
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useNativeDriver } from '../utils/animation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { analyzeRequest } from '../services/api';
import { auth } from '../firebase';

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_INPUT_LENGTH = 3;
const MAX_INPUT_LENGTH = 300;

// ─── Service category quick-picks ─────────────────────────────────────────────

const QUICK_SERVICES = [
  { label: 'AC Repair',    emoji: '❄️', prompt: 'Mujhe AC technician chahiye' },
  { label: 'Plumber',      emoji: '🔧', prompt: 'Plumber chahiye ghar mein' },
  { label: 'Electrician',  emoji: '⚡', prompt: 'Electrician chahiye bijli ki problem hai' },
  { label: 'Painter',      emoji: '🎨', prompt: 'Ghar paint karna hai painter chahiye' },
  { label: 'Cleaner',      emoji: '🧹', prompt: 'House cleaning chahiye' },
  { label: 'Carpenter',    emoji: '🪵', prompt: 'Carpenter chahiye furniture repair' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatConfidence(value: unknown): string {
  if (typeof value !== 'number') return 'N/A';
  return `${Math.round(value <= 1 ? value * 100 : value)}%`;
}

function getInputError(text: string): string | null {
  const t = text.trim();
  if (!t.length) return null;
  if (t.length < MIN_INPUT_LENGTH) return `${t.length}/${MIN_INPUT_LENGTH} chars minimum`;
  return null;
}

function getUrgencyColor(urgency: string): string {
  if (urgency === 'high')   return '#ef4444';
  if (urgency === 'medium') return '#f59e0b';
  return '#10b981';
}

// ─── Confidence ring component ────────────────────────────────────────────────

const ConfidenceRing: React.FC<{ value: number }> = ({ value }) => {
  const pct   = Math.round(value <= 1 ? value * 100 : value);
  const color = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <View style={ringStyles.wrapper}>
      <View style={[ringStyles.ring, { borderColor: color }]}>
        <Text style={[ringStyles.pct, { color }]}>{pct}%</Text>
        <Text style={ringStyles.sub}>conf</Text>
      </View>
    </View>
  );
};

const ringStyles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center' },
  ring: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 3, alignItems: 'center', justifyContent: 'center',
  },
  pct:  { color: '#fff', fontSize: 13, fontWeight: '800' },
  sub:  { color: '#64748b', fontSize: 9, fontWeight: '600' },
});

// ─── Shimmer skeleton ─────────────────────────────────────────────────────────

const SkeletonBar: React.FC<{ width: number | `${number}%`; height?: number; marginBottom?: number }> = ({
  width, height = 12, marginBottom = 10,
}) => {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver }),
      ]),
    ).start();
  }, []);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] });
  return (
    <Animated.View
      style={{
        width, height, borderRadius: 6,
        backgroundColor: '#334155',
        marginBottom, opacity,
      }}
    />
  );
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [inputText, setInputText]     = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const [intentResult, setIntentResult] = useState<any>(null);
  const [apiError, setApiError]       = useState<string | null>(null);

  const inputRef = useRef<TextInput>(null);

  const inputError = getInputError(inputText);
  const canSend    = !isLoading && inputText.trim().length >= MIN_INPUT_LENGTH;

  // Bar slide-up entrance
  const barSlide   = useRef(new Animated.Value(60)).current;
  const barOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(barSlide,   { toValue: 0, duration: 450, useNativeDriver }),
      Animated.timing(barOpacity, { toValue: 1, duration: 450, useNativeDriver }),
    ]).start();
  }, []);

  const handleInputChange = useCallback((text: string) => {
    setInputText(text);
    if (apiError) setApiError(null);
  }, [apiError]);

  const handleQuickPick = (prompt: string) => {
    setInputText(prompt);
    setApiError(null);
    inputRef.current?.focus();
  };

  const handleSend = async () => {
    if (!canSend) return;
    const trimmedText = inputText.trim();
    setIsLoading(true);
    setApiError(null);
    setIntentResult(null);

    try {
      const data = await analyzeRequest(auth.currentUser?.uid || 'anonymous', trimmedText);
      setIntentResult(data);
      setInputText('');
    } catch (error: any) {
      setApiError(error.message ?? 'Failed to process request. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Get first letter of user's email for avatar
  const userLetter = auth.currentUser?.email?.charAt(0).toUpperCase() ?? 'U';
  const greeting   = auth.currentUser?.email?.split('@')[0] ?? 'there';

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 56}
      >
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.brandTag}>KaamEasy AI</Text>
          <Text style={styles.greeting}>Hello, {greeting} 👋</Text>
          <Text style={styles.headerSub}>Describe your service need in any language</Text>
        </View>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{userLetter}</Text>
        </View>
      </View>

      {/* ── Quick service picks ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickPicksContainer}
        style={styles.quickPicksRow}
      >
        {QUICK_SERVICES.map((s) => (
          <TouchableOpacity
            key={s.label}
            style={styles.quickChip}
            onPress={() => handleQuickPick(s.prompt)}
            activeOpacity={0.75}
          >
            <Text style={styles.quickChipEmoji}>{s.emoji}</Text>
            <Text style={styles.quickChipLabel}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Content area ── */}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.contentPad}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          /* Skeleton loader while agents work */
          <View style={styles.card}>
            <Text style={styles.cardLabel}>AGENT WORKFLOW</Text>
            <View style={styles.skeletonRow}>
              <SkeletonBar width="30%" height={10} />
              <SkeletonBar width="45%" height={10} />
            </View>
            <SkeletonBar width="80%" />
            <SkeletonBar width="60%" />
            <SkeletonBar width="70%" />
            <SkeletonBar width="50%" marginBottom={0} />
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#6366f1" size="small" />
              <Text style={styles.loadingText}>AI agents are processing…</Text>
            </View>
          </View>
        ) : apiError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTag}>⚠ Error</Text>
            <Text style={styles.errorText}>{apiError}</Text>
            <TouchableOpacity onPress={() => setApiError(null)} style={styles.errorDismiss}>
              <Text style={styles.errorDismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        ) : intentResult ? (
          <View style={styles.resultWrapper}>
            {/* Intent result card */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardLabel}>EXTRACTED INTENT</Text>
                <ConfidenceRing value={intentResult.intent?.confidence ?? 0} />
              </View>

              <View style={styles.intentRow}>
                <Text style={styles.intentKey}>🔧 Service</Text>
                <Text style={styles.intentValue}>{intentResult.intent?.service_type || 'N/A'}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.intentRow}>
                <Text style={styles.intentKey}>📍 Location</Text>
                <Text style={styles.intentValue} numberOfLines={1}>{intentResult.intent?.location || 'N/A'}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.intentRow}>
                <Text style={styles.intentKey}>⚡ Urgency</Text>
                <View style={[styles.urgencyBadge, { borderColor: getUrgencyColor(intentResult.intent?.urgency) }]}>
                  <Text style={[styles.urgencyText, { color: getUrgencyColor(intentResult.intent?.urgency) }]}>
                    {intentResult.intent?.urgency?.toUpperCase() || 'N/A'}
                  </Text>
                </View>
              </View>
              <View style={styles.divider} />
              <View style={styles.intentRow}>
                <Text style={styles.intentKey}>🗣️ Language</Text>
                <Text style={styles.intentValue}>{intentResult.intent?.language?.replace('_', ' ')?.toUpperCase() || 'N/A'}</Text>
              </View>
            </View>

            {/* CTA */}
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={() =>
                navigation.navigate('Providers', {
                  intentResult,
                  bookingId: intentResult.booking_id || `BKG-${Math.floor(Math.random() * 10000)}`,
                })
              }
              activeOpacity={0.85}
            >
              <Text style={styles.ctaText}>Find Providers</Text>
              <Text style={styles.ctaArrow}>→</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setIntentResult(null)} style={styles.resetLink}>
              <Text style={styles.resetLinkText}>Start a new request</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Empty state */
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🤖</Text>
            <Text style={styles.emptyTitle}>AI Assistant Ready</Text>
            <Text style={styles.emptyBody}>
              Type or tap a service above. Works in{' '}
              <Text style={styles.emptyHighlight}>English</Text>,{' '}
              <Text style={styles.emptyHighlight}>Urdu</Text>, or{' '}
              <Text style={styles.emptyHighlight}>Roman Urdu</Text>.
            </Text>
            <Text style={styles.emptyExample}>
              "Mujhe kal subah G-13 mein AC technician chahiye"
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ── Input Bar ── */}
      <Animated.View
        style={[
          styles.inputBar,
          { opacity: barOpacity },
        ]}
      >
        {inputError && (
          <Text style={styles.inputHint}>{inputError}</Text>
        )}
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            placeholder="Describe your service need…"
            placeholderTextColor="#475569"
            value={inputText}
            onChangeText={handleInputChange}
            onSubmitEditing={handleSend}
            multiline
            maxLength={MAX_INPUT_LENGTH}
            returnKeyType="send"
            blurOnSubmit={false}
          />
          <View style={styles.sendCol}>
            <Text style={styles.charCount}>{inputText.trim().length}/{MAX_INPUT_LENGTH}</Text>
            <TouchableOpacity
              style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!canSend}
              accessibilityLabel="Send request"
            >
              {isLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.sendBtnText}>→</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0f172a' },
  flex: { flex: 1, backgroundColor: '#0f172a' },

  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(51,65,85,0.6)',
  },
  headerLeft:  { flex: 1 },
  brandTag:    { color: '#818cf8', fontSize: 10, fontWeight: '700', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 4 },
  greeting:    { color: '#f1f5f9', fontSize: 20, fontWeight: '800', marginBottom: 2 },
  headerSub:   { color: '#64748b', fontSize: 12 },
  avatarCircle:{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  avatarText:  { color: '#fff', fontSize: 16, fontWeight: '800' },

  quickPicksRow:       { maxHeight: 68 },
  quickPicksContainer: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  quickChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(30,41,59,0.9)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(51,65,85,0.8)',
  },
  quickChipEmoji: { fontSize: 14 },
  quickChipLabel: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },

  contentPad: { padding: 16, paddingBottom: 8 },

  card: {
    backgroundColor: 'rgba(30,41,59,0.8)',
    borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: 'rgba(51,65,85,0.7)',
    marginBottom: 12,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  cardLabel:     { color: '#475569', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },

  skeletonRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  loadingRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  loadingText: { color: '#64748b', fontSize: 13 },

  errorCard: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    marginBottom: 12,
  },
  errorTag:      { color: '#f87171', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  errorText:     { color: '#fca5a5', fontSize: 13, lineHeight: 20 },
  errorDismiss:  { marginTop: 10, alignSelf: 'flex-end' },
  errorDismissText: { color: '#f87171', fontSize: 12, fontWeight: '600' },

  resultWrapper: {},
  intentRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  intentKey:  { color: '#64748b', fontSize: 13 },
  intentValue:{ color: '#f1f5f9', fontSize: 13, fontWeight: '700', maxWidth: '60%', textAlign: 'right' },
  divider:    { height: 1, backgroundColor: 'rgba(51,65,85,0.5)' },

  urgencyBadge: {
    borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  urgencyText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },

  ctaButton: {
    backgroundColor: '#6366f1',
    borderRadius: 14, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginBottom: 10,
    boxShadow: '0 8px 16px rgba(99,102,241,0.35)', elevation: 8,
  },
  ctaText:  { color: '#fff', fontSize: 15, fontWeight: '800' },
  ctaArrow: { color: '#fff', fontSize: 18, fontWeight: '800' },
  resetLink:     { alignItems: 'center', paddingVertical: 8 },
  resetLinkText: { color: '#475569', fontSize: 13, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingTop: 32, paddingBottom: 16 },
  emptyIcon:      { fontSize: 44, marginBottom: 14 },
  emptyTitle:     { color: '#94a3b8', fontSize: 17, fontWeight: '700', marginBottom: 8 },
  emptyBody:      { color: '#475569', fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 16 },
  emptyHighlight: { color: '#818cf8', fontWeight: '700' },
  emptyExample: {
    marginTop: 14, color: '#334155', fontSize: 12, fontStyle: 'italic',
    textAlign: 'center',
    backgroundColor: 'rgba(30,41,59,0.6)',
    borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16,
  },

  inputBar: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 8 : 12,
    paddingTop: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(51,65,85,0.6)',
    backgroundColor: '#0f172a',
  },
  inputHint: { color: '#f59e0b', fontSize: 11, marginBottom: 6, marginLeft: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  textInput: {
    flex: 1, backgroundColor: '#1e293b', color: '#f1f5f9',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 14, borderWidth: 1, borderColor: 'rgba(51,65,85,0.8)',
    maxHeight: 100,
  },
  sendCol: { alignItems: 'flex-end', gap: 4 },
  charCount: { color: '#334155', fontSize: 10 },
  sendBtn: {
    backgroundColor: '#6366f1', borderRadius: 12,
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 10px rgba(99,102,241,0.35)', elevation: 6,
  },
  sendBtnDisabled: { backgroundColor: 'rgba(99,102,241,0.3)', boxShadow: 'none', elevation: 0 },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});