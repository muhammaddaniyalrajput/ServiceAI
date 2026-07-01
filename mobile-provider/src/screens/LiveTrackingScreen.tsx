/**
 * Live Tracking Screen
 *
 * Shows real-time map tracking for active jobs:
 * - Customer location (destination)
 * - Provider current location (moving marker)
 * - Route visualization
 * - Distance and ETA
 * - Status controls
 *
 * Used when job is in 'on_the_way' or 'arrived' status
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from '@/components/MapViewWrapper';
import { useGPSTracking } from '@/hooks/useGPSTracking';
import { useSingleJobListener } from '@/hooks/useProviderJobs';
import { useProviderStore } from '@/store/providerStore';
import { providerAPI } from '@/services/providerAPI';

export default function LiveTrackingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const booking_id = typeof params.booking_id === 'string' ? params.booking_id : '';
  const insets = useSafeAreaInsets();

  const { job, loading: jobLoading } = useSingleJobListener(booking_id);
  const currentLocation = useProviderStore((s) => s.currentLocation);
  const updateJobStatus = useProviderStore((s) => s.updateJobStatus);
  const [updating, setUpdating] = useState(false);

  // Start GPS tracking for this job
  const { isTracking, error: trackingError } = useGPSTracking({
    bookingId: booking_id,
    enabled: !!booking_id,
    interval: 10000, // Update every 10 seconds
  });

  const mapRef = useRef<any>(null);

  const customerCoords = job?.customer_coordinates ?? { latitude: 0, longitude: 0 };
  const fallbackProviderCoords = {
    latitude: customerCoords.latitude + 0.01,
    longitude: customerCoords.longitude + 0.01,
  };
  const providerCoords = currentLocation ?? fallbackProviderCoords;

  // Calculate distance (simple Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  };

  const distance = job
    ? calculateDistance(
        providerCoords.latitude,
        providerCoords.longitude,
        customerCoords.latitude,
        customerCoords.longitude
      )
    : null;

  // Estimate arrival time (assume 30 km/h average speed)
  const eta = distance ? Math.ceil((distance / 30) * 60) : job?.eta_minutes || 0;

  // Zoom to show both provider and customer
  useEffect(() => {
    if (mapRef.current && job) {
      // The web fallback wrapper exposes a no-op `fitToCoordinates`,
      // but we still guard with `typeof === 'function'` so the screen
      // never crashes if a future wrapper variant forgets to stub it.
      if (typeof mapRef.current.fitToCoordinates === 'function') {
        mapRef.current.fitToCoordinates(
          [
            {
              latitude: providerCoords.latitude,
              longitude: providerCoords.longitude,
            },
            {
              latitude: customerCoords.latitude,
              longitude: customerCoords.longitude,
            },
          ],
          {
            edgePadding: { top: 100, right: 100, bottom: 100, left: 100 },
            animated: true,
          }
        );
      }
    }
  }, [currentLocation, job]);

  const handleStatusUpdate = async (newStatus: 'on_the_way' | 'arrived' | 'in_progress' | 'completed') => {
    setUpdating(true);
    try {
      await providerAPI.updateJobStatus(booking_id, newStatus);
      updateJobStatus(booking_id, newStatus);
      
      const successMessages = {
        on_the_way: 'Started journey!',
        arrived: 'Marked as arrived!',
        in_progress: 'Work started!',
        completed: 'Job completed!',
      };
      
      Alert.alert('Success', successMessages[newStatus]);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setUpdating(false);
    }
  };

  if (jobLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00bfff" />
        <Text style={styles.loadingText}>Loading tracking data...</Text>
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Unable to load tracking data</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getNextStatus = () => {
    const transitions = {
      confirmed: 'on_the_way',
      on_the_way: 'arrived',
      arrived: 'in_progress',
      in_progress: 'completed',
    };
    return transitions[job.status as keyof typeof transitions];
  };

  const nextAction = getNextStatus();
  const statusLabels = {
    on_the_way: '▶️ Start Journey',
    arrived: '📍 I Have Arrived',
    in_progress: '🔧 Start Work',
    completed: '✓ Complete Job',
  };
  const actionLabel = statusLabels[nextAction as keyof typeof statusLabels] || 'Update Status';

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: providerCoords.latitude,
          longitude: providerCoords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {/* Provider location (blue marker) */}
        <Marker
          coordinate={{
            latitude: providerCoords.latitude,
            longitude: providerCoords.longitude,
          }}
          title="Your Location"
          description="You are here"
          pinColor="#00bfff"
        />

        {/* Customer location (destination marker) */}
        <Marker
          coordinate={{
            latitude: customerCoords.latitude,
            longitude: customerCoords.longitude,
          }}
          title={job.customer_name}
          description={job.location_description}
          pinColor="#ff4444"
        />

        {/* Route line between provider and customer */}
        <Polyline
          coordinates={[
            {
              latitude: providerCoords.latitude,
              longitude: providerCoords.longitude,
            },
            {
              latitude: customerCoords.latitude,
              longitude: customerCoords.longitude,
            },
          ]}
          strokeColor="#00bfff"
          strokeWidth={3}
          lineDashPattern={[10, 5]}
        />
      </MapView>

      {/* Tracking Status Bar — X1: positioned below notch via insets */}
      <View style={[styles.statusBar, { top: insets.top + 8 }]}>
        <View style={styles.statusContent}>
          <Text style={styles.statusLabel}>Status: {job.status.replace(/_/g, ' ')}</Text>
          <Text style={styles.trackingStatus}>
            {isTracking ? '🟢 Tracking' : '⚪ Not Tracking'}
          </Text>
        </View>
        {!currentLocation && !trackingError && (
          <Text style={styles.locationHint}>Waiting for GPS fix...</Text>
        )}
        {trackingError && <Text style={styles.errorText}>{trackingError}</Text>}
      </View>

      {/* Distance and ETA Info */}
      <View style={styles.infoPanel}>
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Distance</Text>
            <Text style={styles.infoValue}>{distance?.toFixed(1)} km</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>ETA</Text>
            <Text style={styles.infoValue}>{eta} min</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Customer</Text>
            <Text style={styles.infoValue}>{job.customer_name}</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={styles.backNavigationButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backNavigationText}>← Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, updating && styles.buttonDisabled]}
            onPress={() => handleStatusUpdate(nextAction as any)}
            disabled={updating}
          >
            {updating ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.actionButtonText}>{actionLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Call Customer Button — X3: wired to phone dialer */}
      <TouchableOpacity
        style={styles.callButton}
        onPress={() => {
          const phone = job?.customer_phone;
          if (phone) {
            Linking.openURL(`tel:${phone}`).catch(() =>
              Alert.alert('Error', 'Unable to open the phone dialer.')
            );
          } else {
            Alert.alert('No Phone Number', 'Customer phone number is not available.');
          }
        }}
      >
        <Text style={styles.callButtonText}>📞 Call Customer</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#aaa',
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 16,
    marginBottom: 24,
  },
  locationHint: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 4,
  },
  backButton: {
    backgroundColor: '#00bfff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  statusBar: {
    position: 'absolute',
    top: 0,         // will be overridden inline with insets.top
    left: 16,
    right: 16,
    backgroundColor: 'rgba(42, 42, 42, 0.95)',
    borderRadius: 12,
    padding: 12,
    zIndex: 10,
  },
  statusContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    color: '#00bfff',
    fontSize: 13,
    fontWeight: '600',
  },
  trackingStatus: {
    fontSize: 13,
    fontWeight: '600',
  },
  infoPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#2a2a2a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoItem: {
    flex: 1,
    alignItems: 'center',
  },
  infoLabel: {
    color: '#aaa',
    fontSize: 11,
    marginBottom: 4,
  },
  infoValue: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: '700',
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: '#404040',
    marginHorizontal: 8,
  },
  actionContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  backNavigationButton: {
    flex: 1,
    backgroundColor: '#404040',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  backNavigationText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButton: {
    flex: 2,
    backgroundColor: '#00ff88',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
  callButton: {
    position: 'absolute',
    bottom: 160,
    right: 16,
    backgroundColor: '#00bfff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 10,
  },
  callButtonText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 13,
  },
});
