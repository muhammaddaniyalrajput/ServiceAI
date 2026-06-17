/**
 * LiveTrackingScreen — Real-time provider tracking with map.
 *
 * Features:
 * - MapView with two markers (customer pin + animated provider pin)
 * - Real-time Firestore polling for provider coordinates
 * - Status progress bar (accepted → on the way → arrived → in progress → completed)
 * - Integrated AgentLogViewer for live AI reasoning traces
 * - Premium dark-mode styling
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useRoute } from '@react-navigation/native';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { getBookingTracking } from '../services/api';
import { AgentLogViewer } from '../components/AgentLogViewer';
import { useBookingStore } from '../store/bookingStore';

// ─── Status step configuration ────────────────────────────────────────────────

const STATUS_STEPS = [
  { key: 'confirmed',   label: 'Confirmed',   emoji: '✓' },
  { key: 'accepted',    label: 'Accepted',     emoji: '👤' },
  { key: 'on_the_way',  label: 'On the Way',   emoji: '🚗' },
  { key: 'arrived',     label: 'Arrived',       emoji: '📍' },
  { key: 'in_progress', label: 'Working',       emoji: '🔧' },
  { key: 'completed',   label: 'Completed',     emoji: '🎉' },
];

function getStatusIndex(status: string): number {
  const idx = STATUS_STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':   return '#10b981';
    case 'arrived':
    case 'in_progress': return '#f59e0b';
    case 'on_the_way':  return '#3b82f6';
    case 'accepted':    return '#8b5cf6';
    default:            return '#6366f1';
  }
}

// ─── Status progress bar component ────────────────────────────────────────────

const StatusProgressBar: React.FC<{ currentStatus: string }> = ({ currentStatus }) => {
  const currentIdx = getStatusIndex(currentStatus);
  const color = getStatusColor(currentStatus);

  return (
    <View style={progressStyles.container}>
      <View style={progressStyles.stepsRow}>
        {STATUS_STEPS.map((step, idx) => {
          const isCompleted = idx <= currentIdx;
          const isCurrent = idx === currentIdx;
          return (
            <View key={step.key} style={progressStyles.stepWrapper}>
              <View
                style={[
                  progressStyles.dot,
                  isCompleted && { backgroundColor: color, borderColor: color },
                  isCurrent && progressStyles.dotCurrent,
                ]}
              >
                <Text style={[progressStyles.dotEmoji, !isCompleted && { opacity: 0.3 }]}>
                  {step.emoji}
                </Text>
              </View>
              <Text
                style={[
                  progressStyles.label,
                  isCompleted && { color: '#e2e8f0' },
                  isCurrent && { color, fontWeight: '800' },
                ]}
                numberOfLines={1}
              >
                {step.label}
              </Text>
              {idx < STATUS_STEPS.length - 1 && (
                <View
                  style={[
                    progressStyles.connector,
                    isCompleted && { backgroundColor: color },
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
};

const progressStyles = StyleSheet.create({
  container: { paddingHorizontal: 12, paddingVertical: 14 },
  stepsRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  stepWrapper: { alignItems: 'center', flex: 1, position: 'relative' },
  dot: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#1e293b', borderWidth: 2, borderColor: '#334155',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  dotCurrent: {
    shadowColor: '#6366f1', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 8, elevation: 6,
  },
  dotEmoji: { fontSize: 13 },
  label: { color: '#475569', fontSize: 9, fontWeight: '600', textAlign: 'center' },
  connector: {
    position: 'absolute', top: 15, left: '65%', right: '-35%',
    height: 2, backgroundColor: '#1e293b', zIndex: -1,
  },
});

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

  // Entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  // Poll backend for tracking updates
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
            setStatus('confirmed'); // Reset store status
          }
        }
        if (data.eta_minutes != null || data.simulation_eta_minutes != null) {
          setEtaMinutes(data.simulation_eta_minutes ?? data.eta_minutes);
        }
      }
    } catch (err) {
      console.warn('[LiveTracking] Poll error:', err);
    }
  }, [bookingId]);

  useEffect(() => {
    if (!bookingId) return;

    if (db) {
      // Use Firestore real-time listener for instant status/coordinate updates
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
                  setStatus('confirmed'); // Reset store status
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
      // Fallback to active polling if Firestore configuration is mocked/unavailable
      pollTracking(); // Initial fetch
      const interval = setInterval(pollTracking, 3000);
      return () => clearInterval(interval);
    }
  }, [bookingId, pollTracking, setStatus]);

  // Calculate map region to fit both markers
  const midLat = (safeUserCoords.latitude + providerPos.latitude) / 2;
  const midLng = (safeUserCoords.longitude + providerPos.longitude) / 2;
  const latDelta = Math.abs(safeUserCoords.latitude - providerPos.latitude) * 2.2 + 0.008;
  const lngDelta = Math.abs(safeUserCoords.longitude - providerPos.longitude) * 2.2 + 0.008;

  const isCompleted = currentStatus === 'completed';
  const statusColor = getStatusColor(currentStatus);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Status Bar ── */}
        <Animated.View style={[styles.statusCard, { opacity: fadeAnim }]}>
          <StatusProgressBar currentStatus={currentStatus} />

          {/* ETA / Status message */}
          <View style={[styles.etaBanner, { borderColor: statusColor + '40' }]}>
            <Text style={[styles.etaEmoji]}>
              {isCompleted ? '🎉' : currentStatus === 'on_the_way' ? '🚗' : '⏱'}
            </Text>
            <View>
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
                  : 'Processing booking...'}
              </Text>
              {etaMinutes != null && !isCompleted && currentStatus === 'on_the_way' && (
                <Text style={styles.etaSub}>
                  Estimated arrival: ~{etaMinutes} min
                </Text>
              )}
            </View>
          </View>
        </Animated.View>

        {/* ── Map ── */}
        <Animated.View
          style={[
            styles.mapCard,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <Text style={styles.sectionLabel}>LIVE TRACKING</Text>
          <View style={styles.mapWrapper}>
            <MapView
              style={styles.map}
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
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
              scrollEnabled={true}
              zoomEnabled={true}
              rotateEnabled={false}
            >
              {/* Customer marker */}
              <Marker
                coordinate={safeUserCoords}
                title="Your Location"
                pinColor="#6366f1"
              />

              {/* Provider marker */}
              <Marker
                key={`provider-${providerPos.latitude}-${providerPos.longitude}`}
                coordinate={providerPos}
                title={providerName || 'Provider'}
                description={currentStatus === 'on_the_way' ? 'En route to you' : currentStatus}
                pinColor="#10b981"
              />
            </MapView>

            {/* Map overlay legend */}
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#6366f1' }]} />
                <Text style={styles.legendText}>You</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
                <Text style={styles.legendText}>{providerName || 'Provider'}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* ── Agent Reasoning Trace ── */}
        <Animated.View
          style={[styles.logsSection, { opacity: fadeAnim }]}
        >
          <AgentLogViewer bookingId={bookingId} />
        </Animated.View>
      </ScrollView>
    </View>
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
  container: { flex: 1, backgroundColor: '#0f172a' },
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  statusCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: 'rgba(30,41,59,0.85)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.7)',
    overflow: 'hidden',
  },

  etaBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(51,65,85,0.5)',
  },
  etaEmoji: { fontSize: 26 },
  etaTitle: { color: '#e2e8f0', fontSize: 14, fontWeight: '700' },
  etaSub:   { color: '#64748b', fontSize: 12, marginTop: 2 },

  mapCard: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: 'rgba(30,41,59,0.85)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.7)',
    overflow: 'hidden',
    padding: 14,
  },
  sectionLabel: {
    color: '#475569', fontSize: 10, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase',
    marginBottom: 10,
  },
  mapWrapper: { borderRadius: 14, overflow: 'hidden', position: 'relative' },
  map: { width: '100%', height: 280 },

  legendRow: {
    position: 'absolute', bottom: 10, left: 10,
    flexDirection: 'row', gap: 12,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(51,65,85,0.6)',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },

  logsSection: {
    marginHorizontal: 16,
    marginTop: 14,
  },
});
