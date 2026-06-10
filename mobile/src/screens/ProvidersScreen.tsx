/**
 * ProvidersScreen — Premium provider discovery list.
 *
 * UX improvements over original:
 * - Gradient-accent provider cards with verified badge
 * - Experience chip, rating stars, distance & rate in icon pills
 * - AI score reason displayed as styled quote
 * - Spring-animated "Book Now" button with per-card loading state
 * - Skeleton loader replaces plain spinner
 * - Error banner with retry CTA
 * - Service type displayed in header subtitle for context
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Animated,
  Platform,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { findProviders, bookService } from '../services/api';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { useBookingStore } from '../store/bookingStore';

// ─── Skeleton card ─────────────────────────────────────────────────────────────

const SkeletonCard: React.FC<{ index: number }> = ({ index }) => {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const delayTimer = setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
        ]),
      ).start();
    }, index * 150); // Stagger start times
    return () => clearTimeout(delayTimer);
  }, [index]);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });

  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={[styles.skelBar, { width: '60%', height: 14, marginBottom: 8 }]} />
      <View style={[styles.skelBar, { width: '40%', height: 10, marginBottom: 16 }]} />
      <View style={styles.skelRow}>
        <View style={[styles.skelBar, { width: 70, height: 28, borderRadius: 10 }]} />
        <View style={[styles.skelBar, { width: 70, height: 28, borderRadius: 10 }]} />
        <View style={[styles.skelBar, { width: 70, height: 28, borderRadius: 10 }]} />
      </View>
      <View style={[styles.skelBar, { width: '100%', height: 42, borderRadius: 12, marginTop: 14 }]} />
    </Animated.View>
  );
};

// ─── Animated provider card ────────────────────────────────────────────────────

const ProviderCard: React.FC<{
  item: any;
  index: number;
  isBookingThis: boolean;
  isAnyBooking: boolean;
  onBook: (item: any) => void;
  serviceType: string;
}> = ({ item, index, isBookingThis, isAnyBooking, onBook, serviceType }) => {
  const slideAnim   = useRef(new Animated.Value(40)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim,   { toValue: 0, duration: 380, delay: index * 70, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 380, delay: index * 70, useNativeDriver: true }),
    ]).start();
  }, []);

  const rating     = typeof item.rating === 'number' ? item.rating : 4.5;
  const starsLabel = '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));
  const isVerified = item.is_verified ?? false;

  return (
    <Animated.View
      style={[styles.card, { opacity: opacityAnim, transform: [{ translateY: slideAnim }] }]}
    >
      {/* Top row: name + rating */}
      <View style={styles.cardTop}>
        <View style={styles.cardTopLeft}>
          {/* Avatar initial */}
          <View style={styles.providerAvatar}>
            <Text style={styles.providerAvatarText}>
              {(item.name || 'P').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <View style={styles.nameRow}>
              <Text style={styles.providerName}>{item.name || 'Provider'}</Text>
              {isVerified && (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>✓ Verified</Text>
                </View>
              )}
            </View>
            <Text style={styles.providerService}>
              {item.service || item.service_type || serviceType || 'Service'}
            </Text>
          </View>
        </View>
        {/* Star rating */}
        <View style={styles.ratingBox}>
          <Text style={styles.ratingStars} numberOfLines={1}>
            {starsLabel.slice(0, 5)}
          </Text>
          <Text style={styles.ratingNum}>{rating.toFixed(1)}</Text>
        </View>
      </View>

      {/* AI score reason */}
      {item.score_reason ? (
        <View style={styles.scoreReasonBox}>
          <Text style={styles.scoreReasonText}>" {item.score_reason} "</Text>
        </View>
      ) : null}

      {/* Info pills */}
      <View style={styles.pillsRow}>
        <View style={styles.pill}>
          <Text style={styles.pillIcon}>📍</Text>
          <Text style={styles.pillText}>
            {item.distance_km != null ? `${item.distance_km.toFixed(1)} km` : 'N/A'}
          </Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillIcon}>💰</Text>
          <Text style={styles.pillText}>
            {item.hourly_rate ? `Rs. ${item.hourly_rate}/hr` : 'N/A'}
          </Text>
        </View>
        {item.experience_yrs != null && (
          <View style={styles.pill}>
            <Text style={styles.pillIcon}>🏅</Text>
            <Text style={styles.pillText}>{item.experience_yrs}yr exp</Text>
          </View>
        )}
      </View>

      {/* Book button */}
      <PrimaryButton
        label="Book Now"
        loadingLabel="Booking…"
        onPress={() => onBook(item)}
        isLoading={isBookingThis}
        disabled={isAnyBooking && !isBookingThis}
        style={styles.bookBtn}
        showArrow={!isBookingThis}
      />
    </Animated.View>
  );
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProvidersScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const { intentResult, bookingId } = route.params || {};

  const {
    rankedProviders,
    setProviders,
    setSelectedProvider,
    setBookingResult,
    setStatus,
    setError,
  } = useBookingStore();

  const [isLoading, setIsLoading]           = useState(true);
  const [bookingLoadingId, setBookingLoadingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage]     = useState<string | null>(null);

  const serviceType = intentResult?.intent?.service_type || '';

  const providers = rankedProviders.map((r) => ({
    ...r.provider,
    score_reason: r.score_reason,
  }));

  const fetchProviders = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setStatus('finding');
    try {
      const intentPayload = intentResult?.intent || intentResult;
      const data          = await findProviders(bookingId, intentPayload);
      if (data?.ranked?.length > 0) {
        setProviders(data.ranked);
      } else if (data?.providers?.length > 0) {
        // Fallback for mock/non-ranked format
        const fallbackRanked = data.providers.map((p: any) => ({
          provider: p,
          score: 100,
          score_reason: 'Discovered provider candidate'
        }));
        setProviders(fallbackRanked);
      } else {
        setProviders([]);
      }
    } catch (error: any) {
      setErrorMessage(error.message);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [bookingId, intentResult, setProviders, setStatus, setError]);

  useEffect(() => {
    if (bookingId && intentResult) {
      fetchProviders();
    } else {
      setErrorMessage('Missing booking details.');
      setIsLoading(false);
    }
  }, []);

  const handleBookNow = async (provider: any) => {
    const provId = provider.provider_id || provider.id;
    setBookingLoadingId(provId);
    setErrorMessage(null);
    setStatus('booking');
    setSelectedProvider(provider);
    try {
      const intentPayload  = intentResult?.intent || intentResult;
      const confirmation   = await bookService(bookingId, provId, intentPayload);
      setBookingResult(confirmation);
      navigation.reset({
        index: 0,
        routes: [{
          name:   'BookingSuccess',
          params: {
            confirmation: confirmation?.booking?.booking_id
              ? confirmation
              : {
                  provider_name:   provider.name,
                  service_type:    intentPayload.service_type,
                  scheduled_time:  'As soon as possible',
                  estimated_price: provider.hourly_rate,
                  booking_id:      bookingId,
                },
          },
        }],
      });
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to book service. Please retry.');
      setError(error.message || 'Failed to book service.');
      setBookingLoadingId(null);
    }
  };

  return (
    <View style={styles.flex}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Error banner */}
      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity onPress={fetchProviders}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Service context bar */}
      {serviceType ? (
        <View style={styles.serviceBar}>
          <Text style={styles.serviceBarLabel}>Showing results for</Text>
          <View style={styles.serviceBarBadge}>
            <Text style={styles.serviceBarBadgeText}>{serviceType}</Text>
          </View>
          <Text style={styles.serviceBarCount}>
            {!isLoading && `${providers.length} providers found`}
          </Text>
        </View>
      ) : null}

      {isLoading ? (
        <FlatList
          data={[0, 1, 2]}
          keyExtractor={(item) => String(item)}
          renderItem={({ index }) => <SkeletonCard index={index} />}
          contentContainerStyle={styles.listPad}
        />
      ) : (
        <FlatList
          data={providers}
          keyExtractor={(item, idx) => item.provider_id?.toString() || String(idx)}
          renderItem={({ item, index }) => (
            <ProviderCard
              item={item}
              index={index}
              isBookingThis={bookingLoadingId === item.provider_id}
              isAnyBooking={bookingLoadingId !== null}
              onBook={handleBookNow}
              serviceType={serviceType}
            />
          )}
          contentContainerStyle={styles.listPad}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            !errorMessage ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyTitle}>No providers found</Text>
                <Text style={styles.emptyBody}>Try a different service or location.</Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0f172a' },
  listPad: { padding: 16, paddingBottom: 24 },

  errorBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    margin: 16, backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
  },
  errorText: { color: '#fca5a5', fontSize: 13, flex: 1 },
  retryText: { color: '#818cf8', fontSize: 13, fontWeight: '700', marginLeft: 12 },

  serviceBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(51,65,85,0.6)',
  },
  serviceBarLabel:     { color: '#475569', fontSize: 12 },
  serviceBarBadge:     { backgroundColor: 'rgba(99,102,241,0.15)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)' },
  serviceBarBadgeText: { color: '#818cf8', fontSize: 12, fontWeight: '700' },
  serviceBarCount:     { color: '#334155', fontSize: 11, marginLeft: 'auto' },

  // Card
  card: {
    backgroundColor: 'rgba(30,41,59,0.85)',
    borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: 'rgba(51,65,85,0.7)',
    marginBottom: 14,
  },
  cardTop:     { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },

  providerAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(99,102,241,0.25)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(99,102,241,0.4)',
    flexShrink: 0,
  },
  providerAvatarText: { color: '#818cf8', fontSize: 20, fontWeight: '800' },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  providerName:    { color: '#f1f5f9', fontSize: 15, fontWeight: '800' },
  providerService: { color: '#64748b', fontSize: 12, marginTop: 2, textTransform: 'capitalize' },

  verifiedBadge: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)',
  },
  verifiedText: { color: '#34d399', fontSize: 9, fontWeight: '700' },

  ratingBox:  { alignItems: 'flex-end' },
  ratingStars:{ color: '#fbbf24', fontSize: 12, letterSpacing: 1 },
  ratingNum:  { color: '#f1f5f9', fontSize: 13, fontWeight: '700' },

  scoreReasonBox: {
    backgroundColor: 'rgba(99,102,241,0.07)',
    borderRadius: 10, padding: 10, marginBottom: 12,
    borderLeftWidth: 2, borderLeftColor: 'rgba(99,102,241,0.5)',
  },
  scoreReasonText: { color: '#818cf8', fontSize: 11, fontStyle: 'italic', lineHeight: 16 },

  pillsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(15,23,42,0.7)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(51,65,85,0.8)',
  },
  pillIcon: { fontSize: 12 },
  pillText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },

  bookBtn: { borderRadius: 13 },

  // Skeleton
  skelBar: { backgroundColor: '#1e293b', borderRadius: 6 },
  skelRow: { flexDirection: 'row', gap: 8 },

  // Empty
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyIcon:  { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: '#64748b', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  emptyBody:  { color: '#475569', fontSize: 13 },
});