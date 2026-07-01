/**
 * Push Notifications Service
 *
 * Handles Firebase Cloud Messaging (FCM) for provider app.
 * Manages:
 * - Device token registration
 * - Notification handling
 * - Deep linking from notifications
 */

import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Configure notification handler
// SDK v56 requires shouldShowBanner + shouldShowList in addition to shouldShowAlert
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Get or create FCM token for this device
 */
export const getPushTokenAsync = async (): Promise<string | null> => {
  if (Platform.OS === 'web') {
    return null;
  }

  if (!Device.isDevice) {
    console.warn('Push tokens are only available on physical devices.');
    return null;
  }

  try {
    const token = await Notifications.getDevicePushTokenAsync();
    console.log('Push token:', token.data);
    return token.data;
  } catch (error) {
    console.error('Failed to get push token:', error);
    return null;
  }
};

/**
 * Hook to manage push notifications
 * Must be called once at app startup
 */
export const usePushNotifications = (onJobReceived?: (jobData: any) => void) => {
  // Use Subscription type from expo-notifications
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    // Listen for notifications while app is in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('Notification received:', notification);
        const data = notification.request.content.data;

        // Handle job dispatch notification
        if (data?.['type'] === 'job_dispatch' && onJobReceived) {
          onJobReceived({
            booking_id:     data?.['booking_id'],
            service_type:   data?.['service_type'],
            location:       data?.['location'],
            customer_name:  data?.['customer_name'],
            estimated_cost: data?.['estimated_cost'],
            urgency:        data?.['urgency'],
          });
        }
      }
    );

    // Listen for notification taps (when app is backgrounded)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('Notification response:', response);
        const data = response.notification.request.content.data;

        // Handle deep linking
        if (data?.['type'] === 'job_dispatch' && data?.['booking_id']) {
          // Could navigate to job detail here
          console.log('Deep link to job:', data?.['booking_id']);
        }
      }
    );

    return () => {
      // SDK v56: use .remove() on the subscription object (removeNotificationSubscription removed)
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [onJobReceived]);
};

/**
 * Manually trigger a local notification (for testing)
 */
export const sendLocalNotification = async (
  title: string,
  body: string,
  data?: Record<string, any>
) => {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data || {},
      sound: true,
      badge: 1,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      repeats: false,
    },
  });
};
