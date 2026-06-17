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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useGPSTracking } from '@/hooks/useGPSTracking';
import { useSingleJobListener } from '@/hooks/useProviderJobs';
import { useProviderStore } from '@/store/providerStore';
import { providerAPI } from '@/services/providerAPI';

export default function LiveTrackingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const booking_id = typeof params.booking_id === 'string' ? params.booking_id : '';

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

  const mapRef = useRef<MapView>(null);

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

  const distance = currentLocation && job
    ? calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        job.customer_coordinates.latitude,
        job.customer_coordinates.longitude
      )
    : null;

  // Estimate arrival time (assume 30 km/h average speed)
  const eta = distance ? Math.ceil((distance / 30) * 60) : job?.eta_minutes || 0;

  // Zoom to show both provider and customer
  useEffect(() => {
    if (mapRef.current && currentLocation && job) {
      mapRef.current.fitToCoordinates(
        [
          {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          },
          {
            latitude: job.customer_coordinates.latitude,
            longitude: job.customer_coordinates.longitude,
          },
        ],
        {
          edgePadding: { top: 100, right: 100, bottom: 100, left: 100 },
          animated: true,
        }
      );
    }
  }, [currentLocation, job]);

  const handleStatusUpdate = async (newStatus: 'arrived' | 'in_progress') => {
    setUpdating(true);
    try {
      await providerAPI.updateJobStatus(booking_id, newStatus);
      updateJobStatus(booking_id, newStatus);
      Alert.alert('Success', newStatus === 'arrived' ? 'Marked as arrived!' : 'Work started!');
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

  if (!job || !currentLocation) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Unable to load tracking data</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const nextAction = job.status === 'on_the_way' ? 'arrived' : 'in_progress';
  const actionLabel = job.status === 'on_the_way' ? '📍 I Have Arrived' : '🔧 Start Work';

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {/* Provider location (blue marker) */}
        <Marker
          coordinate={{
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          }}
          title="Your Location"
          description="You are here"
          pinColor="#00bfff"
        />

        {/* Customer location (destination marker) */}
        <Marker
          coordinate={{
            latitude: job.customer_coordinates.latitude,
            longitude: job.customer_coordinates.longitude,
          }}
          title={job.customer_name}
          description={job.location_description}
          pinColor="#ff4444"
        />

        {/* Route line between provider and customer */}
        <Polyline
          coordinates={[
            {
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
            },
            {
              latitude: job.customer_coordinates.latitude,
              longitude: job.customer_coordinates.longitude,
            },
          ]}
          strokeColor="#00bfff"
          strokeWidth={3}
          lineDashPattern={[10, 5]}
        />
      </MapView>

      {/* Tracking Status Bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusContent}>
          <Text style={styles.statusLabel}>Status: {job.status.replace(/_/g, ' ')}</Text>
          <Text style={styles.trackingStatus}>
            {isTracking ? '🟢 Tracking' : '⚪ Not Tracking'}
          </Text>
        </View>
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

      {/* Call Customer Button */}
      <TouchableOpacity style={styles.callButton}>
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
    top: 50,
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
