/**
 * LiveTrackingScreen — Real-time provider tracking with map.
 *
 * KaamEasy AI customer view: status progress, ETA banner, dark map with both
 * pins, live agent reasoning trace, and a FAB to reopen the negotiation chat.
 *
 * Refactor notes (Phase 3 de-clutter):
 *   - Wrapped in `SafeAreaView` so the top header / progress never clip.
 *   - Inline `StatusProgressBar` replaced with the shared `<ProgressSteps>`.
 *   - Status colors pulled from theme tokens (no hardcoded hex).
 *   - `etaBanner` color pulled from `state.*` token when relevant.
 *   - Dropped the hardcoded `paddingTop: Platform.OS === 'ios' ? 70 : 50` hack.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  StatusBar,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useNativeDriver } from '../utils/animation';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from '../components/MapViewWrapper';
import { useRoute } from '@react-navigation/native';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { getBookingTracking } from '../services/api';
import { AgentLogViewer } from '../components/AgentLogViewer';
import { useBookingStore } from '../store/bookingStore';
import NegotiationChatSheet from '../components/ui/NegotiationChatSheet';
import { AppColors, FontWeight, Radius, Spacing } from '../constants/theme';
import { ProgressSteps, type ProgressStep } from '../components/ui/ProgressSteps';
import { StatusBadge, type StatusKey } from '../components/ui/StatusBadge';

// ─── Status step configuration ────────────────────────────────────────────────

const STATUS_STEPS: ProgressStep[] = [
  { key: 'accepted',    label: 'Accepted',  glyph: '✓' },
  { key: 'confirmed',   label: 'Confirmed', glyph: '✓' },
  { key: 'on_the_way',  label: 'On the Way', glyph: '🚗' },
  { key: 'arrived',     label: 'Arrived',   glyph: '📍' },
  { key: 'in_progress', label: 'Working',   glyph: '🔧' },
  { key: 'completed',   label: 'Completed', glyph: '🎉' },
];

function getStatusIndex(status: string): number {
  const idx = STATUS_STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

function getStatusToken(status: string): keyof typeof AppColors.state {
  if (status === 'completed') return 'success';
  if (status === 'arrived' || status === 'in_progress') return 'warning';
  if (status === 'on_the_way') return 'info';
  if (status === 'accepted') return 'info';
  return 'info';
}

function getStatusColor(status: string): string {
  return AppColors.state[getStatusToken(status)].text;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LiveTrackingScreen() {
  const route = useRoute<any>();
  const {
    bookingId,
    providerCoordinates,
    userCoordinates,
    providerName,
  } = route.params || {};

  const { setStatus } = useBookingStore();

  const safeProviderCoords = (providerCoordinates && typeof providerCoordinates.latitude === 'number')
    ? providerCoordinates
    : { latitude: 33.6844, longitude: 73.0479 };

  const safeUserCoords = (userCoordinates && typeof userCoordinates.latitude === 'number')
    ? userCoordinates
    : { latitude: safeProviderCoords.latitude + 0.015, longitude: safeProviderCoords.longitude + 0.012 };

  const [providerPos, setProviderPos] = useState(safeProviderCoords);
  const [currentStatus, setCurrentStatus] = useState('confirmed');
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [chatVisible, setChatVisible] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver }),
    ]).start();
  }, []);

  const pollTracking = useCallback(async () => {
    if (!bookingId) return;
    try {
      const data = await getBookingTracking(bookingId);
      if (data) {
        if (data.provider_live_coordinates) {
          setProviderPos(data.provider_live_coordinates);
        }
        if (data.status) {
          setCurrentStatus(data.status);
          if (data.status === 'completed') {
            setStatus('confirmed');
          }
        }
        if (data.eta_minutes != null || data.simulation_eta_minutes != null) {
          setEtaMinutes(data.simulation_eta_minutes ?? data.eta_minutes);
        }
      }
    } catch (err) {
      console.warn('[LiveTracking] Poll error:', err);
    }
  }, [bookingId, setStatus]);

  useEffect(() => {
    if (!bookingId) return;

    if (db) {
      const docRef = doc(db, 'bookings', bookingId);
      const unsubscribe = onSnapshot(
        docRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            if (data) {
              if (data.provider_live_coordinates) {
                setProviderPos(data.provider_live_coordinates);
              }
              if (data.status) {
                setCurrentStatus(data.status);
                if (data.status === 'completed') {
                  setStatus('confirmed');
                }
              }
              if (data.simulation_eta_minutes != null || data.eta_minutes != null) {
                setEtaMinutes(data.simulation_eta_minutes ?? data.eta_minutes);
              }
            }
          }
        },
        (error) => {
          console.warn('[LiveTracking] Firestore onSnapshot error:', error);
        }
      );
      return () => unsubscribe();
    } else {
      pollTracking();
      const interval = setInterval(pollTracking, 3000);
      return () => clearInterval(interval);
    }
  }, [bookingId, pollTracking, setStatus]);

  const midLat = (safeUserCoords.latitude + providerPos.latitude) / 2;
  const midLng = (safeUserCoords.longitude + providerPos.longitude) / 2;
  const latDelta = Math.abs(safeUserCoords.latitude - providerPos.latitude) * 2.2 + 0.008;
  const lngDelta = Math.abs(safeUserCoords.longitude - providerPos.longitude) * 2.2 + 0.008;

  const isCompleted = currentStatus === 'completed';
  const statusColor = getStatusColor(currentStatus);
  const statusToken = getStatusToken(currentStatus);

  const openChat = () => setChatVisible(true);
  const closeChat = () => setChatVisible(false);

  const statusKey = (currentStatus as StatusKey);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={AppColors.bg} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Status card ── */}
        <Animated.View style={[styles.statusCard, { opacity: fadeAnim }]}>
          <ProgressSteps
            steps={STATUS_STEPS}
            current={getStatusIndex(currentStatus)}
            color={statusColor}
          />

          <View style={[styles.etaBanner, { borderColor: AppColors.state[statusToken].border }]}>
            <Text style={styles.etaEmoji}>
              {isCompleted ? '🎉' : currentStatus === 'on_the_way' ? '🚗' : '⏱'}
            </Text>
            <View style={styles.flex}>
              <Text style={[styles.etaTitle, { color: statusColor }]}>
                {isCompleted
                  ? 'Service Completed!'
                  : currentStatus === 'arrived'
                  ? `${providerName} has arrived`
                  : currentStatus === 'in_progress'
                  ? `${providerName} is working...`
                  : currentStatus === 'on_the_way'
                  ? `${providerName} is on the way`
                  : currentStatus === 'accepted'
                  ? `${providerName} accepted!`
                  : currentStatus === 'confirmed'
                  ? 'Booking Confirmed! Provider preparing...'
                  : 'Processing booking...'}
              </Text>
              {etaMinutes != null && !isCompleted && currentStatus === 'on_the_way' ? (
                <Text style={styles.etaSub}>
                  Estimated arrival: ~{etaMinutes} min
                </Text>
              ) : null}
            </View>
            <StatusBadge status={statusKey} size="sm" />
          </View>
        </Animated.View>

        {/* ── Map ── */}
        <Animated.View
          style={[
            styles.mapCard,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.mapHeader}>
            <Text style={styles.sectionLabel}>LIVE TRACKING</Text>
            <StatusBadge status={statusKey} size="sm" />
          </View>
          <View style={[styles.mapWrapper, { pointerEvents: 'box-none' }]}>
            <MapView
              style={styles.map}
              provider={PROVIDER_GOOGLE}
              initialRegion={{
                latitude: midLat,
                longitude: midLng,
                latitudeDelta: latDelta,
                longitudeDelta: lngDelta,
              }}
              region={{
                latitude: midLat,
                longitude: midLng,
                latitudeDelta: latDelta,
                longitudeDelta: lngDelta,
              }}
              customMapStyle={darkMapStyle}
              scrollEnabled
              zoomEnabled
              rotateEnabled={false}
            >
              <Marker
                coordinate={safeUserCoords}
                title="Your Location"
                pinColor={AppColors.primary}
              />
              <Marker
                key={`provider-${providerPos.latitude}-${providerPos.longitude}`}
                coordinate={providerPos}
                title={providerName || 'Provider'}
                description={currentStatus === 'on_the_way' ? 'En route to you' : currentStatus}
                pinColor={AppColors.success}
              />
            </MapView>

            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: AppColors.primary }]} />
                <Text style={styles.legendText}>You</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: AppColors.success }]} />
                <Text style={styles.legendText}>{providerName || 'Provider'}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.chatFab} activeOpacity={0.88} onPress={openChat}>
              <Text style={styles.chatFabIcon}>💬</Text>
              <Text style={styles.chatFabText}>Open Live Chat</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ── Agent Reasoning Trace ── */}
        <Animated.View style={[styles.logsSection, { opacity: fadeAnim }]}>
          <AgentLogViewer bookingId={bookingId} />
        </Animated.View>
      </ScrollView>

      <NegotiationChatSheet
        visible={chatVisible}
        bookingId={bookingId}
        providerName={providerName}
        currentStatus={currentStatus}
        onClose={closeChat}
      />
    </SafeAreaView>
  );
}

// ─── Dark map style ───────────────────────────────────────────────────────────

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#255763' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2c6675' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#283d6a' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f3948' }] },
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.bg },
  flex: { flex: 1 },
  scrollContent: { paddingBottom: Spacing.eight },

  statusCard: {
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
    backgroundColor: AppColors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: AppColors.border,
    overflow: 'hidden',
  },
  etaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
  },
  etaEmoji: { fontSize: 24 },
  etaTitle: { fontSize: 14, fontWeight: FontWeight.bold as '700' },
  etaSub:   { color: AppColors.textMuted, fontSize: 12, marginTop: 2 },

  mapCard: {
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
    backgroundColor: AppColors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: AppColors.border,
    overflow: 'hidden',
    padding: Spacing.three,
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  sectionLabel: {
    color: AppColors.textMuted,
    fontSize: 11,
    fontWeight: FontWeight.bold as '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  mapWrapper: { borderRadius: Radius.md, overflow: 'hidden', position: 'relative' },
  map: { width: '100%', height: 280 },

  legendRow: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    flexDirection: 'row',
    gap: Spacing.three,
    backgroundColor: AppColors.bg,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: AppColors.textMuted, fontSize: 12, fontWeight: FontWeight.semibold as '600' },

  chatFab: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: AppColors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    boxShadow: '0 8px 16px rgba(0,0,0,0.24)',
    elevation: 8,
  },
  chatFabIcon: { fontSize: 15 },
  chatFabText: { color: '#fff', fontSize: 12, fontWeight: FontWeight.extrabold as '800' },

  logsSection: {
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
  },
});
