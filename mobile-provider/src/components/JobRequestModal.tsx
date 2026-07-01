/**
 * Job Request Modal
 *
 * High-priority overlay modal that appears when a new job is dispatched to the provider.
 * Shows:
 * - Customer details
 * - Service type and location
 * - Estimated cost
 * - Urgency level
 * - Accept/Decline buttons
 *
 * Can override the dashboard and other screens.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { ProviderJob } from '@/services/providerAPI';
import { providerAPI } from '@/services/providerAPI';
import { useNativeDriver } from '@/utils/animation';

interface JobRequestModalProps {
  visible: boolean;
  job: ProviderJob | null;
  onAccept: (job: ProviderJob) => void;
  onDecline: (job: ProviderJob) => void;
}

export const JobRequestModal: React.FC<JobRequestModalProps> = ({
  visible,
  job,
  onAccept,
  onDecline,
}) => {
  const [responding, setResponding] = React.useState(false);
  const slideAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      // Slide in from bottom
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver,
      }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [visible, slideAnim]);

  if (!job) return null;

  const handleAccept = async () => {
    setResponding(true);
    try {
      await providerAPI.respondToJob(job.booking_id, 'accept');
      onAccept(job);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setResponding(false);
    }
  };

  const handleDecline = async () => {
    setResponding(true);
    try {
      await providerAPI.respondToJob(job.booking_id, 'reject');
      onDecline(job);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setResponding(false);
    }
  };

  const urgencyColor = {
    high: '#ff4444',
    medium: '#ff8800',
    low: '#00ff88',
  }[job.urgency] || '#00bfff';

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      statusBarTranslucent={true}
    >
      {/* Dark overlay */}
      <View style={styles.overlayContainer}>
        {/* Animated modal */}
        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [
                {
                  translateY: slideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [Dimensions.get('window').height, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {/* Header with urgency */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>New Job Request</Text>
              <View style={[styles.urgencyBadge, { backgroundColor: urgencyColor }]}>
                <Text style={styles.urgencyText}>
                  {job.urgency.charAt(0).toUpperCase() + job.urgency.slice(1)}
                </Text>
              </View>
            </View>
            <Text style={styles.subtitle}>Quick action required!</Text>
          </View>

          {/* Job Details */}
          <View style={styles.content}>
            {/* Service & Location */}
            <View style={styles.detailCard}>
              <Text style={styles.detailCardTitle}>Service Request</Text>
              <Text style={styles.serviceType}>{job.service_type}</Text>
              <Text style={styles.location}>📍 {job.location_description}</Text>
            </View>

            {/* Customer Info */}
            <View style={styles.detailCard}>
              <Text style={styles.detailCardTitle}>Customer</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Name:</Text>
                <Text style={styles.infoValue}>{job.customer_name}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Phone:</Text>
                <Text style={styles.infoValue}>{job.customer_phone || 'N/A'}</Text>
              </View>
            </View>

            {/* Cost & ETA */}
            <View style={styles.costContainer}>
              <View style={styles.costCard}>
                <Text style={styles.costLabel}>Estimated Cost</Text>
                <Text style={styles.costValue}>PKR {job.total_estimated_cost}</Text>
              </View>
              <View style={styles.costCard}>
                <Text style={styles.costLabel}>ETA</Text>
                <Text style={styles.costValue}>{job.eta_minutes} mins</Text>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionContainer}>
            <TouchableOpacity
              style={styles.declineButton}
              onPress={handleDecline}
              disabled={responding}
            >
              {responding ? (
                <ActivityIndicator size="small" color="#aaa" />
              ) : (
                <>
                  <Text style={styles.declineButtonIcon}>✕</Text>
                  <Text style={styles.declineButtonText}>Decline</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.acceptButton}
              onPress={handleAccept}
              disabled={responding}
            >
              {responding ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={styles.acceptButtonIcon}>✓</Text>
                  <Text style={styles.acceptButtonText}>Accept</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Bottom Safe Area */}
          <View style={styles.bottomSafeArea} />
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    maxHeight: '90%',
  },
  header: {
    marginBottom: 24,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#aaa',
  },
  urgencyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  urgencyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    marginBottom: 24,
  },
  detailCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#00bfff',
  },
  detailCardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#aaa',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  serviceType: {
    fontSize: 18,
    fontWeight: '700',
    color: '#00bfff',
    marginBottom: 8,
  },
  location: {
    fontSize: 14,
    color: '#ccc',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  infoLabel: {
    color: '#aaa',
    fontSize: 13,
  },
  infoValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  costContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  costCard: {
    flex: 1,
    backgroundColor: '#003366',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#00bfff',
  },
  costLabel: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 8,
  },
  costValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#00ff88',
  },
  actionContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: '#00ff88',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  acceptButtonIcon: {
    fontSize: 20,
    color: '#000',
    fontWeight: '700',
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  declineButton: {
    flex: 1,
    backgroundColor: '#404040',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  declineButtonIcon: {
    fontSize: 20,
    color: '#aaa',
    fontWeight: '700',
  },
  declineButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#aaa',
  },
  bottomSafeArea: {
    height: 20,
  },
});
