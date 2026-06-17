/**
 * GPS Tracking Hook
 *
 * Manages real-time location tracking for active jobs:
 * - Requests location permissions
 * - Streams coordinates every 10 seconds
 * - Sends updates to backend
 * - Stores current location in Zustand
 */

import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useProviderStore } from '@/store/providerStore';
import { providerAPI } from '@/services/providerAPI';

interface UseGPSTrackingOptions {
  bookingId?: string; // For live job tracking
  enabled?: boolean; // Enable/disable tracking
  interval?: number; // Update interval in ms (default: 10000)
}

export const useGPSTracking = (options: UseGPSTrackingOptions = {}) => {
  const {
    bookingId,
    enabled = true,
    interval = 10000, // 10 seconds
  } = options;

  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trackingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchTaskRef = useRef<string | null>(null);

  const setCurrentLocation = useProviderStore((s) => s.setCurrentLocation);
  const setLocationTracking = useProviderStore((s) => s.setLocationTracking);

  /**
   * Request location permissions
   */
  const requestPermissions = async (): Promise<boolean> => {
    try {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        setError('Foreground location permission denied');
        return false;
      }

      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== 'granted') {
        // Not critical - continue with foreground only
        console.warn('Background location permission denied, using foreground only');
      }

      setError(null);
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  /**
   * Get current location once
   */
  const getCurrentLocation = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (err: any) {
      setError(`Failed to get location: ${err.message}`);
      return null;
    }
  };

  /**
   * Send location update to backend
   */
  const sendLocationUpdate = async (coords: { latitude: number; longitude: number }) => {
    try {
      await providerAPI.updateLocation(coords.latitude, coords.longitude, bookingId);
      setCurrentLocation(coords.latitude, coords.longitude);
    } catch (err: any) {
      console.warn('Failed to send location update:', err.message);
      // Don't stop tracking on API failure - location still updated locally
    }
  };

  /**
   * Start continuous location tracking
   */
  const startTracking = async () => {
    if (!enabled) return;

    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      setIsTracking(true);
      setLocationTracking(true);

      // Get initial location
      const initialLocation = await getCurrentLocation();
      if (initialLocation) {
        await sendLocationUpdate(initialLocation);
      }

      // Setup interval-based tracking (more battery efficient than continuous)
      trackingIntervalRef.current = setInterval(async () => {
        const location = await getCurrentLocation();
        if (location) {
          await sendLocationUpdate(location);
        }
      }, interval);

      // Optional: Setup background location tracking task
      // This allows location updates even when app is closed
      try {
        await Location.startLocationUpdatesAsync('location-tracking', {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: interval,
          deferredUpdatesInterval: 1000,
          showsBackgroundLocationIndicator: true, // iOS: shows blue bar at top
        });
        watchTaskRef.current = 'location-tracking';
      } catch (err) {
        console.warn('Background location task not supported:', err);
      }
    } catch (err: any) {
      setError(err.message);
      setIsTracking(false);
      setLocationTracking(false);
    }
  };

  /**
   * Stop location tracking
   */
  const stopTracking = async () => {
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = null;
    }

    if (watchTaskRef.current) {
      try {
        await Location.stopLocationUpdatesAsync(watchTaskRef.current);
        watchTaskRef.current = null;
      } catch (err) {
        console.warn('Failed to stop background location task:', err);
      }
    }

    setIsTracking(false);
    setLocationTracking(false);
  };

  // Auto-start/stop based on enabled flag
  useEffect(() => {
    if (enabled) {
      startTracking();
    } else {
      stopTracking();
    }

    return () => {
      stopTracking();
    };
  }, [enabled]);

  return {
    isTracking,
    error,
    startTracking,
    stopTracking,
    getCurrentLocation,
  };
};
