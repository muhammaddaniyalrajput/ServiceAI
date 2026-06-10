/**
 * BookingSuccessScreen — Celebratory confirmation screen.
 *
 * UX improvements over original:
 * - Scale+fade entrance animation on the success icon
 * - Staggered detail rows fade in sequentially
 * - Pulsing green glow ring behind the checkmark
 * - Decorative accent dots
 * - "Go Home" button with spring animation via PrimaryButton
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  Platform,
  StatusBar,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { PrimaryButton } from '../components/ui/PrimaryButton';

// ─── Animated detail row ──────────────────────────────────────────────────────

const DetailRow: React.FC<{
  label: string;
  value: string;
  index: number;
  accent?: boolean;
}> = ({ label, value, index, accent = false }) => {
  const slideAnim   = useRef(new Animated.Value(20)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim,   { toValue: 0, duration: 360, delay: 600 + index * 80, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 360, delay: 600 + index * 80, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[rowStyles.row, { opacity: opacityAnim, transform: [{ translateY: slideAnim }] }]}
    >
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={[rowStyles.value, accent && rowStyles.valueAccent]}>{value || 'N/A'}</Text>
    </Animated.View>
  );
};

const rowStyles = StyleSheet.create({
  row:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  label:       { color: '#64748b', fontSize: 13 },
  value:       { color: '#f1f5f9', fontSize: 13, fontWeight: '700', maxWidth: '60%', textAlign: 'right' },
  valueAccent: { color: '#818cf8', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 11 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BookingSuccessScreen() {
  const navigation  = useNavigation<any>();
  const route       = useRoute<any>();
  const { confirmation } = route.params || {};

  // ── Entrance animations ──
  const iconScale   = useRef(new Animated.Value(0)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const ringScale   = useRef(new Animated.Value(0.5)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity= useRef(new Animated.Value(0)).current;
  const titleSlide  = useRef(new Animated.Value(16)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardSlide   = useRef(new Animated.Value(24)).current;

  // Continuous pulse on the ring
  const pulseScale  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Staggered entrance
    Animated.sequence([
      Animated.parallel([
        Animated.spring(iconScale,   { toValue: 1, useNativeDriver: true, damping: 10, stiffness: 100 }),
        Animated.timing(iconOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(ringScale,   { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 80 }),
        Animated.timing(ringOpacity, { toValue: 0.25, duration: 400, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.timing(titleSlide,   { toValue: 0, duration: 320, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: 340, useNativeDriver: true }),
        Animated.timing(cardSlide,   { toValue: 0, duration: 340, useNativeDriver: true }),
      ]),
    ]).start(() => {
      // Start pulse after entrance completes
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseScale, { toValue: 1.12, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1,    duration: 1200, useNativeDriver: true }),
        ]),
      ).start();
    });
  }, []);

  // Resolve booking data from either full booking object or flat params
  const bookingData = confirmation?.booking ?? confirmation ?? {};
  const providerName   = bookingData.provider?.name   ?? confirmation?.provider_name   ?? 'N/A';
  const serviceType    = bookingData.provider?.service ?? confirmation?.service_type    ?? 'N/A';
  const scheduledAt    = bookingData.scheduled_at      ?? confirmation?.scheduled_time  ?? 'ASAP';
  const estimatedCost  = bookingData.total_estimated_cost
    ? `Rs. ${bookingData.total_estimated_cost}`
    : (confirmation?.estimated_price ? `Rs. ${confirmation.estimated_price}` : 'N/A');
  const confirmationCode = bookingData.confirmation_code ?? null;
  const bookingIdStr   = bookingData.booking_id ?? confirmation?.booking_id ?? 'N/A';
  const etaMinutes     = bookingData.eta_minutes ?? confirmation?.eta_minutes ?? null;

  return (
    <View style={styles.flex}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Decorative blobs */}
      <View style={styles.blobTop} />
      <View style={styles.blobBottom} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Success icon ── */}
        <View style={styles.iconWrapper}>
          {/* Pulsing glow ring */}
          <Animated.View
            style={[
              styles.glowRing,
              { opacity: ringOpacity, transform: [{ scale: Animated.multiply(ringScale, pulseScale) }] },
            ]}
          />
          {/* Icon */}
          <Animated.View
            style={[
              styles.iconCircle,
              { opacity: iconOpacity, transform: [{ scale: iconScale }] },
            ]}
          >
            <Text style={styles.iconEmoji}>✓</Text>
          </Animated.View>
        </View>

        {/* ── Title ── */}
        <Animated.View
          style={[styles.titleBlock, { opacity: titleOpacity, transform: [{ translateY: titleSlide }] }]}
        >
          <Text style={styles.title}>Booking Confirmed!</Text>
          <Text style={styles.subtitle}>
            Your service professional has been notified and is on the way.
          </Text>
        </Animated.View>

        {/* ── Details card ── */}
        <Animated.View
          style={[styles.card, { opacity: cardOpacity, transform: [{ translateY: cardSlide }] }]}
        >
          <Text style={styles.cardLabel}>BOOKING DETAILS</Text>

          <DetailRow label="Provider"    value={providerName}  index={0} />
          <View style={styles.divider} />
          <DetailRow label="Service"     value={serviceType}   index={1} />
          <View style={styles.divider} />
          <DetailRow label="Scheduled"   value={scheduledAt}   index={2} />
          <View style={styles.divider} />
          <DetailRow label="Est. Cost"   value={estimatedCost} index={3} />

          {etaMinutes != null && (
            <>
              <View style={styles.divider} />
              <DetailRow label="Est. Arrival (ETA)" value={`${etaMinutes} mins`} index={4} />
            </>
          )}

          {confirmationCode && (
            <>
              <View style={styles.divider} />
              <DetailRow label="Conf. Code" value={confirmationCode} index={etaMinutes != null ? 5 : 4} accent />
            </>
          )}

          <View style={[styles.divider, styles.dividerStrong]} />
          <DetailRow label="Booking ID"  value={bookingIdStr} index={etaMinutes != null ? (confirmationCode ? 6 : 5) : (confirmationCode ? 5 : 4)} accent />
        </Animated.View>

        {/* ── Status pills ── */}
        <Animated.View
          style={[styles.pillsRow, { opacity: cardOpacity }]}
        >
          <View style={[styles.pill, styles.pillGreen]}>
            <Text style={styles.pillText}>✓ Confirmed</Text>
          </View>
          <View style={[styles.pill, styles.pillBlue]}>
            <Text style={styles.pillText}>📱 Notified</Text>
          </View>
          <View style={[styles.pill, styles.pillPurple]}>
            <Text style={styles.pillText}>⏱ On the way</Text>
          </View>
        </Animated.View>

        {/* ── CTA ── */}
        <Animated.View style={[styles.ctaWrapper, { opacity: cardOpacity }]}>
          <PrimaryButton
            label="Back to Home"
            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] })}
            showArrow
          />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0f172a' },
  scrollContent: {
    flexGrow: 1, alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 70 : 50,
    paddingBottom: 40,
  },

  blobTop: {
    position: 'absolute', top: -80, right: -80,
    width: 240, height: 240, borderRadius: 120,
    backgroundColor: 'rgba(16,185,129,0.06)',
  },
  blobBottom: {
    position: 'absolute', bottom: 40, left: -80,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(99,102,241,0.05)',
  },

  iconWrapper: { position: 'relative', width: 100, height: 100, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  glowRing: {
    position: 'absolute',
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: '#10b981',
  },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#10b981',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#10b981', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6, shadowRadius: 20, elevation: 12,
  },
  iconEmoji: { color: '#fff', fontSize: 36, fontWeight: '900' },

  titleBlock: { alignItems: 'center', marginBottom: 28 },
  title:      { color: '#f1f5f9', fontSize: 28, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  subtitle:   { color: '#64748b', fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },

  card: {
    width: '100%',
    backgroundColor: 'rgba(30,41,59,0.85)',
    borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: 'rgba(51,65,85,0.7)',
    marginBottom: 16,
  },
  cardLabel: { color: '#334155', fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center', marginBottom: 4 },

  divider:       { height: 1, backgroundColor: 'rgba(51,65,85,0.5)' },
  dividerStrong: { backgroundColor: 'rgba(51,65,85,0.9)', marginVertical: 4 },

  pillsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 24 },
  pill:     { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1 },
  pillGreen:  { backgroundColor: 'rgba(16,185,129,0.1)',  borderColor: 'rgba(16,185,129,0.35)' },
  pillBlue:   { backgroundColor: 'rgba(99,102,241,0.1)',  borderColor: 'rgba(99,102,241,0.35)' },
  pillPurple: { backgroundColor: 'rgba(168,85,247,0.1)',  borderColor: 'rgba(168,85,247,0.35)' },
  pillText:   { fontSize: 11, fontWeight: '700', color: '#94a3b8' },

  ctaWrapper: { width: '100%' },
});