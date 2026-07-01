/**
 * BookingSuccessScreen — KaamEasy AI celebratory confirmation screen.
 *
 * Refactor notes (Phase 3 de-clutter):
 *   - Wrapped in `SafeAreaView` so content never clips under the notch.
 *   - Removed the hardcoded `paddingTop: Platform.OS === 'ios' ? 70 : 50` hack
 *     (SafeAreaView insets handle it).
 *   - Replaced the 4 `pillX` style objects (pillGreen/Blue/Purple/Amber) with
 *     a single `<StatusBadge>` render driven by live `currentStatus`.
 *   - Pulled all hardcoded hex strings into `AppColors` / `Spacing` / `Radius`.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { buildTrackingRouteParams } from '../utils/bookingRoutes';
import { AppColors, FontWeight, Radius, Spacing } from '../constants/theme';
import { StatusBadge, type StatusKey } from '../components/ui/StatusBadge';

const ACTIVE_STATUSES: ReadonlySet<StatusKey> = new Set([
  'accepted',
  'confirmed',
  'on_the_way',
  'arrived',
  'in_progress',
  'completed',
]);

// ─── Animated detail row ─────────────────────────────────────────────────────

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
  }, [opacityAnim, slideAnim]);

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
  row:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.three },
  label:       { color: AppColors.textMuted, fontSize: 13 },
  value:       { color: AppColors.textPrimary, fontSize: 13, fontWeight: FontWeight.bold as '700', maxWidth: '60%', textAlign: 'right' },
  valueAccent: { color: AppColors.textSecondary, fontFamily: 'monospace', fontSize: 11 },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function BookingSuccessScreen() {
  const navigation  = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route       = useRoute<RouteProp<RootStackParamList, 'BookingSuccess'>>();
  const { confirmation } = route.params || {};

  const iconScale   = useRef(new Animated.Value(0)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const ringScale   = useRef(new Animated.Value(0.5)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity= useRef(new Animated.Value(0)).current;
  const titleSlide  = useRef(new Animated.Value(16)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardSlide   = useRef(new Animated.Value(24)).current;
  const pulseScale  = useRef(new Animated.Value(1)).current;

  const [currentStatus, setCurrentStatus] = React.useState('pending');
  const [providerDetails, setProviderDetails] = React.useState<any>(null);

  useEffect(() => {
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
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseScale, { toValue: 1.12, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1,    duration: 1200, useNativeDriver: true }),
        ]),
      ).start();
    });
  }, [cardOpacity, cardSlide, iconOpacity, iconScale, pulseScale, ringOpacity, ringScale, titleOpacity, titleSlide]);

  const bookingData = confirmation?.booking ?? confirmation ?? {};
  const initialProvider = bookingData.provider ?? confirmation?.provider;
  const serviceType    = bookingData.provider?.service ?? confirmation?.service_type    ?? 'N/A';
  const scheduledAt    = bookingData.scheduled_at      ?? confirmation?.scheduled_time  ?? 'Negotiating...';
  const estimatedCost  = bookingData.total_estimated_cost
    ? `Rs. ${bookingData.total_estimated_cost}`
    : (confirmation?.estimated_price ? `Rs. ${confirmation.estimated_price}` : 'N/A');
  const confirmationCode = bookingData.confirmation_code ?? null;
  const bookingIdStr   = bookingData.booking_id ?? confirmation?.booking_id ?? 'N/A';
  const etaMinutes     = bookingData.eta_minutes ?? confirmation?.eta_minutes ?? null;

  useEffect(() => {
    if (!bookingIdStr || bookingIdStr === 'N/A' || !db) return;

    const docRef = doc(db, 'bookings', bookingIdStr);
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.status) {
          setCurrentStatus(data.status);
        }
        if (data.provider) {
          setProviderDetails(data.provider);
        }
      }
    });
    return () => unsubscribe();
  }, [bookingIdStr]);

  const resolvedProvider = providerDetails || initialProvider;
  const providerName = resolvedProvider?.name ?? confirmation?.provider_name ?? 'Waiting for provider...';

  const isAccepted = currentStatus === 'accepted';
  const isConfirmed = currentStatus === 'confirmed';
  const statusKey = (currentStatus as StatusKey);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={AppColors.bg} />

      <View style={styles.blobTop} />
      <View style={styles.blobBottom} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconWrapper}>
          <Animated.View
            style={[
              styles.glowRing,
              { opacity: ringOpacity, transform: [{ scale: Animated.multiply(ringScale, pulseScale) }] },
            ]}
          />
          <Animated.View
            style={[
              styles.iconCircle,
              { opacity: iconOpacity, transform: [{ scale: iconScale }] },
            ]}
          >
            <Text style={styles.iconEmoji}>✓</Text>
          </Animated.View>
        </View>

        <Animated.View
          style={[styles.titleBlock, { opacity: titleOpacity, transform: [{ translateY: titleSlide }] }]}
        >
          <Text style={styles.title}>
            {isConfirmed ? 'Booking Confirmed!' : isAccepted ? 'Provider Accepted!' : 'Job Requested!'}
          </Text>
          <Text style={styles.subtitle}>
            {isConfirmed
              ? 'Your service professional has been notified and is on the way.'
              : isAccepted
              ? 'The provider has accepted your request. Please chat to negotiate timing.'
              : 'Broadcasting your request to nearby professionals. Awaiting acceptance...'}
          </Text>
        </Animated.View>

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

          {etaMinutes != null ? (
            <>
              <View style={styles.divider} />
              <DetailRow label="Est. Arrival (ETA)" value={`${etaMinutes} mins`} index={4} />
            </>
          ) : null}

          {confirmationCode ? (
            <>
              <View style={styles.divider} />
              <DetailRow label="Conf. Code" value={confirmationCode} index={etaMinutes != null ? 5 : 4} accent />
            </>
          ) : null}

          <View style={[styles.divider, styles.dividerStrong]} />
          <DetailRow
            label="Booking ID"
            value={bookingIdStr}
            index={etaMinutes != null ? (confirmationCode ? 6 : 5) : (confirmationCode ? 5 : 4)}
            accent
          />
        </Animated.View>

        {/* Live status pill — driven by real currentStatus, not static */}
        <Animated.View style={[styles.statusRow, { opacity: cardOpacity }]}>
          <StatusBadge status={statusKey} size="md" />
          {ACTIVE_STATUSES.has(statusKey) ? (
            <Text style={styles.statusHint}>
              {isConfirmed
                ? 'Your provider is on the way'
                : isAccepted
                ? 'Tap below to chat and lock in a time'
                : 'Status updates in real time'}
            </Text>
          ) : null}
        </Animated.View>

        <Animated.View style={[styles.ctaWrapper, { opacity: cardOpacity }]}>
          {(isAccepted || isConfirmed) ? (
            <PrimaryButton
              label={isConfirmed ? 'Track Provider Live 🗺️' : 'Chat & Negotiate Timing 💬'}
              onPress={() => {
                if (isConfirmed) {
                  navigation.navigate(
                    'LiveTracking',
                    buildTrackingRouteParams({
                      bookingId: bookingIdStr,
                      providerName,
                      providerCoordinates: resolvedProvider
                        ? { latitude: resolvedProvider.latitude, longitude: resolvedProvider.longitude }
                        : null,
                      userCoordinates: confirmation?.user_coordinates,
                    })
                  );
                } else {
                  navigation.navigate('Chat', {
                    bookingId: bookingIdStr,
                    providerName,
                  });
                }
              }}
              showArrow
            />
          ) : (
            <View style={styles.waitingBtn}>
              <Text style={styles.waitingText}>Waiting for acceptance…</Text>
            </View>
          )}
          <PrimaryButton
            label="Back to Home"
            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] })}
            style={styles.secondaryBtn}
          />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.bg },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.six,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.ten,
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

  iconWrapper: {
    position: 'relative', width: 100, height: 100,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.six,
  },
  glowRing: {
    position: 'absolute',
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: AppColors.success,
  },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: AppColors.success,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: AppColors.success, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6, shadowRadius: 20, elevation: 12,
  },
  iconEmoji: { color: '#fff', fontSize: 36, fontWeight: '900' as const },

  titleBlock: { alignItems: 'center', marginBottom: Spacing.six },
  title:      { color: AppColors.textPrimary, fontSize: 28, fontWeight: FontWeight.extrabold as '800', textAlign: 'center', marginBottom: Spacing.two },
  subtitle:   { color: AppColors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: Spacing.two },

  card: {
    width: '100%',
    backgroundColor: AppColors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.five,
    borderWidth: 1,
    borderColor: AppColors.border,
    marginBottom: Spacing.four,
  },
  cardLabel: {
    color: AppColors.textDisabled,
    fontSize: 11,
    fontWeight: FontWeight.bold as '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: Spacing.one,
  },

  divider:       { height: 1, backgroundColor: AppColors.border },
  dividerStrong: { backgroundColor: AppColors.overlay, marginVertical: 2 },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: Spacing.six,
  },
  statusHint: {
    color: AppColors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 220,
  },

  ctaWrapper: { width: '100%', gap: Spacing.two },
  secondaryBtn: {
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  waitingBtn: {
    backgroundColor: AppColors.surface,
    paddingVertical: Spacing.four,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  waitingText: {
    color: AppColors.textMuted,
    fontWeight: FontWeight.bold as '700',
    fontSize: 15,
  },
});
