/**
 * Job Detail Screen
 *
 * Shows full details of a single job:
 * - Customer information
 * - Service details
 * - Location with map (stub for now)
 * - Status progression
 * - Action buttons to update status
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSingleJobListener } from '@/hooks/useProviderJobs';
import { providerAPI } from '@/services/providerAPI';
import { useProviderStore } from '@/store/providerStore';

export default function JobDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const booking_id = typeof params.booking_id === 'string' ? params.booking_id : '';
  
  const { job, loading } = useSingleJobListener(booking_id);
  const updateJobStatus = useProviderStore((s) => s.updateJobStatus);

  const [updating, setUpdating] = useState(false);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00bfff" />
        <Text style={styles.loadingText}>Loading job details...</Text>
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Job not found</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleStatusUpdate = async (newStatus: 'on_the_way' | 'arrived' | 'in_progress' | 'completed') => {
    setUpdating(true);
    try {
      await providerAPI.updateJobStatus(booking_id, newStatus);
      updateJobStatus(booking_id, newStatus);
      
      const statusLabels = {
        on_the_way: 'Started journey',
        arrived: 'Arrived at location',
        in_progress: 'Started work',
        completed: 'Completed job',
      };
      
      Alert.alert('Success', statusLabels[newStatus]);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setUpdating(false);
    }
  };

  const getNextStatus = () => {
    const transitions = {
      confirmed: 'on_the_way',
      on_the_way: 'arrived',
      arrived: 'in_progress',
      in_progress: 'completed',
    };
    return transitions[job.status as keyof typeof transitions];
  };

  const nextStatus = getNextStatus();
  const statusLabels = {
    on_the_way: '▶️ Start Journey',
    arrived: '📍 I Have Arrived',
    in_progress: '🔧 Start Work',
    completed: '✓ Complete Job',
  };

  const urgencyColor = {
    high: '#ff4444',
    medium: '#ff8800',
    low: '#00ff88',
  }[job.urgency] || '#00bfff';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header with Job ID */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backArrow}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.jobId}>{job.booking_id}</Text>
        <View style={[styles.statusBadge, { backgroundColor: urgencyColor }]}>
          <Text style={styles.statusBadgeText}>{job.status.replace(/_/g, ' ')}</Text>
        </View>
      </View>

      {/* Service Overview */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Service</Text>
        <View style={styles.serviceCard}>
          <Text style={styles.serviceTitle}>{job.service_type}</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>📍</Text>
            <Text style={styles.detailValue}>{job.location_description}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>⏰</Text>
            <Text style={styles.detailValue}>ETA: {job.eta_minutes} minutes</Text>
          </View>
        </View>
      </View>

      {/* Customer Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Customer Information</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name</Text>
            <Text style={styles.infoValue}>{job.customer_name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone</Text>
            <Text style={styles.infoValue}>{job.customer_phone || 'Not provided'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Urgency</Text>
            <View style={[styles.urgencyPill, { backgroundColor: urgencyColor }]}>
              <Text style={styles.urgencyText}>
                {job.urgency.charAt(0).toUpperCase() + job.urgency.slice(1)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Coordinates */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location Coordinates</Text>
        <View style={styles.coordinatesCard}>
          <View style={styles.coordRow}>
            <Text style={styles.coordLabel}>Latitude</Text>
            <Text style={styles.coordValue}>{job.customer_coordinates.latitude.toFixed(4)}</Text>
          </View>
          <View style={styles.coordRow}>
            <Text style={styles.coordLabel}>Longitude</Text>
            <Text style={styles.coordValue}>{job.customer_coordinates.longitude.toFixed(4)}</Text>
          </View>
        </View>
        <Text style={styles.mapStub}>🗺️ Map view coming in Phase 4</Text>
      </View>

      {/* Cost Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cost Information</Text>
        <View style={styles.costCard}>
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Estimated Cost</Text>
            <Text style={styles.costValue}>PKR {job.total_estimated_cost}</Text>
          </View>
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Request Time</Text>
            <Text style={styles.costValue}>{new Date(job.requested_at).toLocaleTimeString()}</Text>
          </View>
        </View>
      </View>

      {/* Status Progression */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Job Status</Text>
        <View style={styles.statusFlow}>
          <View style={styles.statusItem}>
            <View style={[styles.statusDot, job.status !== 'pending_acceptance' && styles.statusDotActive]}>
              <Text style={styles.statusDotText}>1</Text>
            </View>
            <Text style={styles.statusLabel}>Pending</Text>
          </View>

          <View style={styles.statusConnector} />

          <View style={styles.statusItem}>
            <View style={[styles.statusDot, ['accepted', 'on_the_way', 'arrived', 'in_progress', 'completed'].includes(job.status) && styles.statusDotActive]}>
              <Text style={styles.statusDotText}>2</Text>
            </View>
            <Text style={styles.statusLabel}>Accepted</Text>
          </View>

          <View style={styles.statusConnector} />

          <View style={styles.statusItem}>
            <View style={[styles.statusDot, ['on_the_way', 'arrived', 'in_progress', 'completed'].includes(job.status) && styles.statusDotActive]}>
              <Text style={styles.statusDotText}>3</Text>
            </View>
            <Text style={styles.statusLabel}>On Way</Text>
          </View>

          <View style={styles.statusConnector} />

          <View style={styles.statusItem}>
            <View style={[styles.statusDot, ['arrived', 'in_progress', 'completed'].includes(job.status) && styles.statusDotActive]}>
              <Text style={styles.statusDotText}>4</Text>
            </View>
            <Text style={styles.statusLabel}>Arrived</Text>
          </View>

          <View style={styles.statusConnector} />

          <View style={styles.statusItem}>
            <View style={[styles.statusDot, job.status === 'completed' && styles.statusDotActive]}>
              <Text style={styles.statusDotText}>5</Text>
            </View>
            <Text style={styles.statusLabel}>Done</Text>
          </View>
        </View>
      </View>

      {/* Navigation Button (for on_the_way and arrived status) */}
      {['on_the_way', 'arrived'].includes(job.status) && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.navigationButton}
            onPress={() => router.push({
              pathname: '/live-tracking',
              params: { booking_id }
            })}
          >
            <Text style={styles.navigationButtonText}>🗺️ View Live Tracking</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Chat & Negotiation Button (for accepted status) */}
      {job.status === 'accepted' && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.chatButton}
            onPress={() => router.push({
              pathname: '/chat' as any,
              params: { booking_id }
            })}
          >
            <Text style={styles.chatButtonText}>💬 Chat & Negotiate Timing</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Action Buttons */}
      {job.status !== 'completed' && nextStatus && (
        <View style={styles.actionSection}>
          <TouchableOpacity
            style={[styles.actionButton, updating && styles.buttonDisabled]}
            onPress={() => handleStatusUpdate(nextStatus as any)}
            disabled={updating}
          >
            {updating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.actionButtonText}>
                  {statusLabels[nextStatus as keyof typeof statusLabels] || 'Update Status'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {job.status === 'completed' && (
        <View style={styles.completedContainer}>
          <Text style={styles.completedIcon}>✓</Text>
          <Text style={styles.completedText}>Job Completed!</Text>
          <Text style={styles.completedSubtext}>Customer will receive feedback request</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 20,
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
    fontSize: 18,
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  backArrow: {
    color: '#00bfff',
    fontSize: 16,
    fontWeight: '600',
  },
  jobId: {
    color: '#aaa',
    fontSize: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  serviceCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#00bfff',
  },
  serviceTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#00bfff',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  detailIcon: {
    fontSize: 16,
  },
  detailValue: {
    color: '#ccc',
    fontSize: 14,
  },
  infoCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  infoLabel: {
    color: '#aaa',
    fontSize: 14,
  },
  infoValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  urgencyPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  urgencyText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  coordinatesCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  coordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  coordLabel: {
    color: '#aaa',
    fontSize: 13,
  },
  coordValue: {
    color: '#00bfff',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  mapStub: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 12,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
  },
  costCard: {
    backgroundColor: '#003366',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#00bfff',
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#004488',
  },
  costLabel: {
    color: '#aaa',
    fontSize: 14,
  },
  costValue: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: '700',
  },
  statusFlow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
  },
  statusItem: {
    alignItems: 'center',
  },
  statusDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#404040',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  statusDotActive: {
    backgroundColor: '#00bfff',
  },
  statusDotText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  statusLabel: {
    color: '#aaa',
    fontSize: 11,
    textAlign: 'center',
  },
  statusConnector: {
    flex: 1,
    height: 2,
    backgroundColor: '#404040',
    marginHorizontal: -8,
  },
  actionSection: {
    marginBottom: 24,
  },
  actionButton: {
    backgroundColor: '#00ff88',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  completedContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#00ff88',
  },
  completedIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  completedText: {
    color: '#00ff88',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  completedSubtext: {
    color: '#aaa',
    fontSize: 14,
  },
  navigationButton: {
    backgroundColor: '#003366',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#00bfff',
  },
  navigationButtonText: {
    color: '#00bfff',
    fontSize: 16,
    fontWeight: '700',
  },
  chatButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  chatButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
