/**
 * BookingHistoryScreen — displays all past bookings for the signed-in user,
 * fetched directly from Firestore `bookings` collection filtered by uid.
 *
 * Features:
 * - Pull-to-refresh
 * - Status color badges (confirmed / searching / failed)
 * - Animated card entrance
 * - Empty state with CTA back to Home
 * - Shimmer skeleton loading
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
  Platform,
} from 'react-native';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  limit,
} from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from '../firebase';

// ─── Types ─────────────────────────────────────────────────────────────────────

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
  };
  created_at?: any;
  scheduled_at?: string;
  total_estimated_cost?: number;
}

// ─── Status config ─────────────────────────────────────────────────────────────

function getStatusStyle(status: string): { bg: string; text: string; border: string; icon: string } {
  switch (status?.toLowerCase()) {
    case 'confirmed':
    case 'notified':
    case 'completed':
      return { bg: 'rgba(16,185,129,0.1)', text: '#34d399', border: 'rgba(16,185,129,0.3)', icon: '✓' };
    case 'searching':
    case 'ranking':
    case 'pending_intent':
      return { bg: 'rgba(245,158,11,0.1)', text: '#fbbf24', border: 'rgba(245,158,11,0.3)', icon: '⏳' };
    case 'failed':
      return { bg: 'rgba(239,68,68,0.1)', text: '#f87171', border: 'rgba(239,68,68,0.3)', icon: '✕' };
    default:
      return { bg: 'rgba(99,102,241,0.1)', text: '#818cf8', border: 'rgba(99,102,241,0.3)', icon: '○' };
  }
}

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

// ─── Skeleton card ─────────────────────────────────────────────────────────────

const SkeletonCard: React.FC = () => {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, []);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });

  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
        <View style={[styles.skelBar, { width: '55%', height: 14 }]} />
        <View style={[styles.skelBar, { width: 70, height: 22, borderRadius: 10 }]} />
      </View>
      <View style={[styles.skelBar, { width: '35%', height: 10, marginBottom: 14 }]} />
      <View style={[styles.skelBar, { width: '80%', height: 10, marginBottom: 8 }]} />
      <View style={[styles.skelBar, { width: '60%', height: 10 }]} />
    </Animated.View>
  );
};

// ─── Animated booking card ─────────────────────────────────────────────────────

const BookingCard: React.FC<{ item: Booking; index: number }> = ({ item, index }) => {
  const slide   = useRef(new Animated.Value(30)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slide,   { toValue: 0, duration: 350, delay: index * 60, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 350, delay: index * 60, useNativeDriver: true }),
    ]).start();
  }, []);

  const status     = item.status ?? 'unknown';
  const statusStyle = getStatusStyle(status);
  const serviceType = item.extracted_intent?.service_type
    || item.provider?.service
    || 'Service';
  const location   = item.extracted_intent?.location || 'N/A';
  const bookingRef = (item.booking_id || item.id || '').slice(0, 8).toUpperCase();

  return (
    <Animated.View style={[styles.card, { opacity, transform: [{ translateY: slide }] }]}>
      {/* Top row: service + status badge */}
      <View style={styles.cardTop}>
        <View style={styles.cardIcon}>
          <Text style={styles.cardIconText}>🔧</Text>
        </View>
        <View style={styles.cardMeta}>
          <Text style={styles.serviceType} numberOfLines={1}>{serviceType}</Text>
          <Text style={styles.bookingRef}>#{bookingRef}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>
            {statusStyle.icon} {status.replace(/_/g, ' ')}
          </Text>
        </View>
      </View>

      {/* Provider row */}
      {item.provider?.name && (
        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>👤</Text>
          <Text style={styles.detailText}>{item.provider.name}</Text>
        </View>
      )}

      {/* Location row */}
      <View style={styles.detailRow}>
        <Text style={styles.detailIcon}>📍</Text>
        <Text style={styles.detailText} numberOfLines={1}>{location}</Text>
      </View>

      {/* Cost row */}
      {item.total_estimated_cost && (
        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>💰</Text>
          <Text style={styles.detailText}>Rs. {item.total_estimated_cost}</Text>
        </View>
      )}

      {/* Footer: date */}
      <View style={styles.cardFooter}>
        <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
        {item.request_text ? (
          <Text style={styles.requestSnippet} numberOfLines={1}>
            "{item.request_text}"
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BookingHistoryScreen() {
  const navigation          = useNavigation<any>();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError]   = useState<string | null>(null);

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
      const q = query(
        collection(db, 'bookings'),
        where('user_id', '==', uid),
        limit(50),
      );
      const snapshot = await getDocs(q);
      const results: Booking[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Booking, 'id'>),
      }));
      // Sort in-memory descending by created_at
      results.sort((a, b) => {
        const timeA = a.created_at?.seconds ?? 0;
        const timeB = b.created_at?.seconds ?? 0;
        return timeB - timeA;
      });
      setBookings(results);
    } catch (err: any) {
      // Firestore index error — suggest creation
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

  useEffect(() => { fetchBookings(); }, []);

  return (
    <View style={styles.container}>

      {/* Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => fetchBookings()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

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
          renderItem={({ item, index }) => <BookingCard item={item} index={index} />}
          contentContainerStyle={styles.listPad}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchBookings(true)}
              tintColor="#6366f1"
              colors={['#6366f1']}
            />
          }
          ListHeaderComponent={
            bookings.length > 0 ? (
              <Text style={styles.listHeader}>{bookings.length} booking{bookings.length !== 1 ? 's' : ''} found</Text>
            ) : null
          }
          ListEmptyComponent={
            !error ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyTitle}>No Bookings Yet</Text>
                <Text style={styles.emptyBody}>
                  Your confirmed bookings will appear here.
                </Text>
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => navigation.navigate('Home')}
                >
                  <Text style={styles.emptyBtnText}>Book a Service →</Text>
                </TouchableOpacity>
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
  container: { flex: 1, backgroundColor: '#0f172a' },
  listPad:   { padding: 16, paddingBottom: 32 },

  listHeader: {
    color: '#475569', fontSize: 12, fontWeight: '600',
    marginBottom: 12, letterSpacing: 0.5,
  },

  card: {
    backgroundColor: 'rgba(30,41,59,0.85)',
    borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: 'rgba(51,65,85,0.7)',
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  cardIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(99,102,241,0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.25)',
    flexShrink: 0,
  },
  cardIconText: { fontSize: 18 },
  cardMeta:    { flex: 1 },
  serviceType: { color: '#f1f5f9', fontSize: 14, fontWeight: '700', marginBottom: 2 },
  bookingRef:  { color: '#475569', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  statusBadge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, flexShrink: 0,
  },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },

  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  detailIcon:{ fontSize: 13 },
  detailText:{ color: '#94a3b8', fontSize: 13, flex: 1 },

  cardFooter: {
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(51,65,85,0.5)',
    gap: 4,
  },
  dateText:        { color: '#475569', fontSize: 11 },
  requestSnippet:  { color: '#334155', fontSize: 11, fontStyle: 'italic' },

  errorBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    margin: 16, backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
  },
  errorText: { color: '#fca5a5', fontSize: 13, flex: 1 },
  retryText: { color: '#818cf8', fontSize: 13, fontWeight: '700', marginLeft: 12 },

  skelBar: { backgroundColor: '#1e293b', borderRadius: 6, marginBottom: 8 },

  emptyState: { alignItems: 'center', paddingTop: 72 },
  emptyIcon:  { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#64748b', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyBody:  { color: '#475569', fontSize: 14, textAlign: 'center', marginBottom: 28, lineHeight: 20 },
  emptyBtn: {
    backgroundColor: '#6366f1', borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 13,
  },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
