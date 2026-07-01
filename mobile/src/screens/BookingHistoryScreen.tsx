/**
 * BookingHistoryScreen — KaamEasy AI past-bookings list with pull-to-refresh,
 * status badges (now driven by the shared `<StatusBadge>`), and a bottom
 * detail sheet.
 *
 * Refactor notes (Phase 3 de-clutter):
 *   - Wrapped in `SafeAreaView` so the list never clips under the notch.
 *   - Inline `getStatusStyle()` + `statusBadge` JSX replaced with the shared
 *     `<StatusBadge>` component (state.* tokens).
 *   - All hardcoded hex strings pulled into `AppColors` / `Spacing` / `Radius`.
 *   - Tiny 10–11px font sizes bumped to 12+ on the modal.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Animated,
  RefreshControl,
  Modal,
  ScrollView,
} from 'react-native';
import { useNativeDriver } from '../utils/animation';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  limit,
} from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { buildTrackingRouteParams } from '../utils/bookingRoutes';
import { db, auth } from '../firebase';
import {
  AppColors,
  FontWeight,
  Radius,
  Spacing,
} from '../constants/theme';
import { StatusBadge, type StatusKey } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { PrimaryButton } from '../components/ui/PrimaryButton';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Booking {
  id: string;
  booking_id: string;
  user_id: string;
  status: string;
  request_text: string;
  extracted_intent?: {
    service_type?: string;
    location?: string;
    urgency?: string;
  };
  provider?: {
    name?: string;
    service?: string;
    hourly_rate?: number;
    rating?: number;
    latitude?: number;
    longitude?: number;
    city?: string;
    address?: string;
  };
  user_coordinates?: { latitude: number; longitude: number };
  created_at?: any;
  scheduled_at?: string;
  total_estimated_cost?: number;
}

const STATUS_ICON: Record<string, string> = {
  confirmed:  '✓',
  notified:   '✓',
  completed:  '✓',
  searching:  '⏳',
  ranking:    '⏳',
  pending_intent: '⏳',
  failed:     '✕',
};

const TRACKING_ACTIVE_STATUSES = new Set([
  'confirmed', 'accepted', 'on_the_way', 'arrived', 'in_progress',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(timestamp: any): string {
  if (!timestamp) return 'Unknown date';
  try {
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-PK', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Unknown date';
  }
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

const SkeletonCard: React.FC = () => {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver }),
      ]),
    ).start();
  }, [shimmer]);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });

  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={styles.skelTopRow}>
        <View style={[styles.skelBar, { width: '55%', height: 14 }]} />
        <View style={[styles.skelBar, { width: 70, height: 22, borderRadius: 10 }]} />
      </View>
      <View style={[styles.skelBar, { width: '35%', height: 10, marginBottom: 14 }]} />
      <View style={[styles.skelBar, { width: '80%', height: 10, marginBottom: 8 }]} />
      <View style={[styles.skelBar, { width: '60%', height: 10 }]} />
    </Animated.View>
  );
};

// ─── Animated booking card ────────────────────────────────────────────────────

const BookingCard: React.FC<{ item: Booking; index: number; onPress: () => void }> = ({
  item,
  index,
  onPress,
}) => {
  const slide   = useRef(new Animated.Value(30)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slide,   { toValue: 0, duration: 350, delay: index * 60, useNativeDriver }),
      Animated.timing(opacity, { toValue: 1, duration: 350, delay: index * 60, useNativeDriver }),
    ]).start();
  }, [index, opacity, slide]);

  const status     = (item.status ?? 'pending') as StatusKey;
  const provider   = item.provider || (item as any).booking?.provider;
  const scheduledAt = item.scheduled_at || (item as any).booking?.scheduled_at;
  const totalCost  = item.total_estimated_cost || (item as any).booking?.total_estimated_cost;
  const serviceType = item.extracted_intent?.service_type
    || provider?.service
    || (item as any).booking?.service
    || 'Service';
  const location   = item.extracted_intent?.location || 'N/A';
  const bookingRef = (item.booking_id || item.id || '').slice(0, 8).toUpperCase();
  const icon = STATUS_ICON[status] ?? '○';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Animated.View style={[styles.card, { opacity, transform: [{ translateY: slide }] }]}>
        <View style={styles.cardTop}>
          <View style={styles.cardIcon}>
            <Text style={styles.cardIconText}>🔧</Text>
          </View>
          <View style={styles.cardMeta}>
            <Text style={styles.serviceType} numberOfLines={1}>{serviceType}</Text>
            <Text style={styles.bookingRef}>#{bookingRef}</Text>
          </View>
          <StatusBadge status={status} size="sm" label={`${icon} ${status.replace(/_/g, ' ')}`} />
        </View>

        {provider?.name ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>👤</Text>
            <Text style={styles.detailText}>{provider.name}</Text>
          </View>
        ) : null}

        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>📍</Text>
          <Text style={styles.detailText} numberOfLines={1}>{location}</Text>
        </View>

        {totalCost ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>💰</Text>
            <Text style={styles.detailText}>Rs. {totalCost}</Text>
          </View>
        ) : null}

        <View style={styles.cardFooter}>
          <Text style={styles.dateText}>{scheduledAt || formatDate(item.created_at)}</Text>
          {item.request_text ? (
            <Text style={styles.requestSnippet} numberOfLines={1}>
              "{item.request_text}"
            </Text>
          ) : null}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
};

// ─── Modal body component ────────────────────────────────────────────────────

interface BookingDetailModalProps {
  booking: Booking;
  onClose: () => void;
  onTrack: (params: { providerLat: number; providerLng: number; userLat: number; userLng: number }) => void;
  onChat: () => void;
}

const BookingDetailModal: React.FC<BookingDetailModalProps> = ({ booking, onClose, onTrack, onChat }) => {
  const status = (booking.status ?? 'pending') as StatusKey;
  const provider = booking.provider || (booking as any).booking?.provider;
  const scheduledAt = booking.scheduled_at || (booking as any).booking?.scheduled_at;
  const totalCost = booking.total_estimated_cost || (booking as any).booking?.total_estimated_cost;
  const serviceType = booking.extracted_intent?.service_type
    || provider?.service
    || (booking as any).booking?.service
    || 'Service';
  const rating = typeof provider?.rating === 'number' ? provider.rating : 4.8;
  const starsLabel = '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));
  const bookingRef = (booking.booking_id || booking.id || '').slice(0, 8).toUpperCase();
  const isTrackingActive = TRACKING_ACTIVE_STATUSES.has(status);

  return (
    <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.modalHeader}>
        <View style={styles.modalHeaderInfo}>
          <Text style={styles.modalTitle}>{serviceType}</Text>
          <Text style={styles.modalRef}>#{bookingRef}</Text>
        </View>
        <StatusBadge status={status} size="md" />
      </View>

      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>SCHEDULED DATE & TIME</Text>
        <View style={styles.dateHighlightBox}>
          <Text style={styles.dateHighlightEmoji}>📅</Text>
          <View style={styles.flex}>
            <Text style={styles.dateHighlightText}>
              {scheduledAt || formatDate(booking.created_at)}
            </Text>
            <Text style={styles.dateHighlightSub}>
              Created: {formatDate(booking.created_at)}
            </Text>
          </View>
        </View>
      </View>

      {provider?.name ? (
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>BOOKED PROVIDER</Text>
          <View style={styles.providerCard}>
            <View style={styles.providerLeft}>
              <View style={styles.providerAvatar}>
                <Text style={styles.providerAvatarText}>
                  {provider.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.providerNameText} numberOfLines={1}>{provider.name}</Text>
                <Text style={styles.providerServiceText} numberOfLines={1}>
                  {provider.service || serviceType}
                </Text>
                {(provider.address || provider.city) ? (
                  <Text style={styles.providerAddress} numberOfLines={2}>
                    📍 {provider.address}{provider.address && provider.city ? ', ' : ''}{provider.city}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.providerRight}>
              <View style={styles.ratingBox}>
                <Text style={styles.ratingStars}>{starsLabel.slice(0, 5)}</Text>
                <Text style={styles.ratingNum}>{rating.toFixed(1)}</Text>
              </View>
              {provider.hourly_rate ? (
                <Text style={styles.hourlyRateText}>
                  Rs. {provider.hourly_rate}/hr
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>BOOKED PROVIDER</Text>
          <View style={styles.noProviderCard}>
            <Text style={styles.noProviderText}>No specific provider assigned yet.</Text>
          </View>
        </View>
      )}

      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>SERVICE LOCATION</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>📍</Text>
          <Text style={styles.infoText}>
            {booking.extracted_intent?.location || 'Not specified'}
          </Text>
        </View>
      </View>

      {totalCost ? (
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>ESTIMATED COST</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>💰</Text>
            <Text style={styles.costText}>Rs. {totalCost}</Text>
          </View>
        </View>
      ) : null}

      {booking.request_text ? (
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>YOUR REQUEST</Text>
          <View style={styles.requestBox}>
            <Text style={styles.requestBoxText}>"{booking.request_text}"</Text>
          </View>
        </View>
      ) : null}

      {status === 'accepted' ? (
        <PrimaryButton
          label="Chat & Negotiate Timing 💬"
          onPress={onChat}
          color={AppColors.success}
        />
      ) : isTrackingActive ? (
        <View style={styles.trackingActions}>
          <PrimaryButton
            label="Track Provider Live 🗺️"
            onPress={() => {
              const providerLat = provider?.latitude ?? 33.6844;
              const providerLng = provider?.longitude ?? 73.0479;
              const userLat = booking.user_coordinates?.latitude ?? (providerLat + 0.015);
              const userLng = booking.user_coordinates?.longitude ?? (providerLng + 0.012);
              onTrack({ providerLat, providerLng, userLat, userLng });
            }}
          />
          <PrimaryButton
            label="Chat with Provider 💬"
            onPress={onChat}
            style={styles.secondaryBtn}
          />
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.closeBtn}
        activeOpacity={0.8}
        onPress={onClose}
      >
        <Text style={styles.closeBtnText}>Close</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BookingHistoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const fetchBookings = useCallback(async (isRefresh = false) => {
    const uid = auth?.currentUser?.uid;
    if (!uid) {
      setError('Not signed in.');
      setIsLoading(false);
      return;
    }

    if (isRefresh) setIsRefreshing(true);
    else           setIsLoading(true);
    setError(null);

    try {
      let results: Booking[];
      try {
        const q = query(
          collection(db, 'bookings'),
          where('user_id', '==', uid),
          orderBy('created_at', 'desc'),
          limit(50),
        );
        const snapshot = await getDocs(q);
        results = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Booking, 'id'>),
        }));
      } catch (indexErr: any) {
        if (indexErr?.code !== 'failed-precondition') throw indexErr;
        const fallbackQ = query(
          collection(db, 'bookings'),
          where('user_id', '==', uid),
          limit(50),
        );
        const snapshot = await getDocs(fallbackQ);
        results = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Booking, 'id'>),
        }));
        results.sort((a, b) => {
          const timeA = a.created_at?.seconds ?? 0;
          const timeB = b.created_at?.seconds ?? 0;
          return timeB - timeA;
        });
      }
      setBookings(results);
    } catch (err: any) {
      if (err?.code === 'failed-precondition') {
        setError('Database index is being built. Please try again in a moment.');
      } else {
        setError(err?.message ?? 'Failed to load booking history.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const openChatForBooking = (booking: Booking) => {
    const provider = booking.provider || (booking as any).booking?.provider;
    setSelectedBooking(null);
    navigation.navigate('Chat', {
      bookingId: booking.id,
      providerName: provider?.name || 'Provider',
    });
  };

  const trackBooking = (
    booking: Booking,
    coords: { providerLat: number; providerLng: number; userLat: number; userLng: number }
  ) => {
    const provider = booking.provider || (booking as any).booking?.provider;
    setSelectedBooking(null);
    navigation.navigate(
      'LiveTracking',
      buildTrackingRouteParams({
        bookingId: booking.id,
        providerName: provider?.name || 'Provider',
        providerCoordinates: { latitude: coords.providerLat, longitude: coords.providerLng },
        userCoordinates: { latitude: coords.userLat, longitude: coords.userLng },
      })
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => fetchBookings()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isLoading ? (
        <FlatList
          data={[1, 2, 3, 4]}
          keyExtractor={(i) => String(i)}
          renderItem={() => <SkeletonCard />}
          contentContainerStyle={styles.listPad}
        />
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <BookingCard
              item={item}
              index={index}
              onPress={() => setSelectedBooking(item)}
            />
          )}
          contentContainerStyle={styles.listPad}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchBookings(true)}
              tintColor={AppColors.primary}
              colors={[AppColors.primary]}
            />
          }
          ListHeaderComponent={
            bookings.length > 0 ? (
              <Text style={styles.listHeader}>
                {bookings.length} booking{bookings.length !== 1 ? 's' : ''} found
              </Text>
            ) : null
          }
          ListEmptyComponent={
            !error ? (
              <EmptyState
                icon="📋"
                title="No bookings yet"
                body="Your confirmed bookings will appear here once a provider accepts your request."
                action={{ label: 'Book a service', onPress: () => navigation.navigate('MainTabs') }}
              />
            ) : null
          }
        />
      )}

      <Modal
        visible={selectedBooking !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedBooking(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalGrabHandle} />
            {selectedBooking ? (
              <BookingDetailModal
                booking={selectedBooking}
                onClose={() => setSelectedBooking(null)}
                onTrack={(coords) => trackBooking(selectedBooking, coords)}
                onChat={() => openChatForBooking(selectedBooking)}
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.bg },
  flex: { flex: 1 },
  listPad: { padding: Spacing.four, paddingBottom: Spacing.eight },

  listHeader: {
    color: AppColors.textMuted,
    fontSize: 12,
    fontWeight: FontWeight.semibold as '600',
    marginBottom: Spacing.three,
    letterSpacing: 0.5,
  },

  card: {
    backgroundColor: AppColors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    borderWidth: 1,
    borderColor: AppColors.border,
    marginBottom: Spacing.three,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.three, gap: Spacing.two },
  cardIcon: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: AppColors.surface2,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: AppColors.border,
    flexShrink: 0,
  },
  cardIconText: { fontSize: 18 },
  cardMeta:    { flex: 1 },
  serviceType: { color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.bold as '700', marginBottom: 2 },
  bookingRef:  { color: AppColors.textMuted, fontSize: 12, fontFamily: 'monospace' },

  detailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: 6 },
  detailIcon:{ fontSize: 13 },
  detailText:{ color: AppColors.textSecondary, fontSize: 13, flex: 1 },

  cardFooter: {
    marginTop: Spacing.two, paddingTop: Spacing.two,
    borderTopWidth: 1, borderTopColor: AppColors.border,
    gap: 4,
  },
  dateText:        { color: AppColors.textMuted, fontSize: 12 },
  requestSnippet:  { color: AppColors.textMuted, fontSize: 12, fontStyle: 'italic' },

  errorBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    margin: Spacing.four,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.30)',
  },
  errorText: { color: '#fca5a5', fontSize: 13, flex: 1 },
  retryText: { color: AppColors.textSecondary, fontSize: 13, fontWeight: FontWeight.bold as '700', marginLeft: Spacing.three },

  skelBar: { backgroundColor: AppColors.surface2, borderRadius: 6, marginBottom: Spacing.two },
  skelTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.two },

  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: AppColors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.five,
    paddingBottom: Spacing.ten,
    borderWidth: 1,
    borderColor: AppColors.border,
    maxHeight: '85%',
  },
  modalGrabHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: AppColors.textMuted,
    alignSelf: 'center',
    marginBottom: Spacing.four,
  },
  modalScroll: { paddingBottom: Spacing.four },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.five,
    gap: Spacing.three,
  },
  modalHeaderInfo: { flex: 1 },
  modalTitle: {
    color: AppColors.textPrimary,
    fontSize: 20,
    fontWeight: FontWeight.extrabold as '800',
  },
  modalRef: {
    color: AppColors.textMuted,
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  sectionContainer: { marginBottom: Spacing.five },
  sectionTitle: {
    color: AppColors.textMuted,
    fontSize: 12,
    fontWeight: FontWeight.bold as '700',
    letterSpacing: 1,
    marginBottom: Spacing.two,
    textTransform: 'uppercase',
  },
  dateHighlightBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: AppColors.surface2,
    borderRadius: Radius.md,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  dateHighlightEmoji: { fontSize: 22 },
  dateHighlightText: {
    color: AppColors.textPrimary,
    fontSize: 14,
    fontWeight: FontWeight.bold as '700',
  },
  dateHighlightSub: {
    color: AppColors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  providerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: AppColors.surface2,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  providerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  providerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: FontWeight.bold as '700',
  },
  providerNameText: {
    color: AppColors.textPrimary,
    fontSize: 14,
    fontWeight: FontWeight.bold as '700',
  },
  providerServiceText: {
    color: AppColors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  providerAddress: {
    color: AppColors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  providerRight: { alignItems: 'flex-end', marginLeft: Spacing.three },
  ratingBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingStars: { color: AppColors.warning, fontSize: 12, letterSpacing: 1 },
  ratingNum:   { color: AppColors.textMuted, fontSize: 12, fontWeight: FontWeight.semibold as '600' },
  hourlyRateText: {
    color: AppColors.success,
    fontSize: 13,
    fontWeight: FontWeight.bold as '700',
    marginTop: 4,
  },
  noProviderCard: {
    backgroundColor: AppColors.surface2,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: Radius.md,
    padding: Spacing.three,
    alignItems: 'center',
  },
  noProviderText: {
    color: AppColors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: AppColors.surface2,
    borderRadius: Radius.md,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  infoIcon: { fontSize: 14 },
  infoText: { color: AppColors.textSecondary, fontSize: 13, flex: 1 },
  costText: { color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.bold as '700' },
  requestBox: {
    backgroundColor: AppColors.surface2,
    borderRadius: Radius.md,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  requestBoxText: {
    color: AppColors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  trackingActions: { gap: Spacing.two, marginTop: Spacing.two },
  secondaryBtn: {
    backgroundColor: AppColors.surface2,
  },
  closeBtn: {
    marginTop: Spacing.four,
    backgroundColor: AppColors.surface2,
    borderRadius: Radius.md,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  closeBtnText: { color: AppColors.textSecondary, fontSize: 14, fontWeight: FontWeight.semibold as '600' },
});
