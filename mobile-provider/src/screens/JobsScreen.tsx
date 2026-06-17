/**
 * Provider Jobs Screen
 *
 * Shows all assigned jobs:
 * - Pending acceptance (waiting for provider response)
 * - Active jobs (accepted, on the way, arrived, in progress)
 * - Completed jobs (history)
 *
 * Provider can accept/reject and update job status
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useProviderStore } from '@/store/providerStore';
import { ProviderJob } from '@/services/providerAPI';
import { providerAPI } from '@/services/providerAPI';

export default function JobsScreen() {
  const router = useRouter();
  const assignedJobs = useProviderStore((s) => s.assignedJobs);
  const updateJobStatus = useProviderStore((s) => s.updateJobStatus);
  const removeJob = useProviderStore((s) => s.removeJob);

  const [loading, setLoading] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      fetchJobs();
    }, [])
  );

  const fetchJobs = async () => {
    try {
      const response = await providerAPI.getAssignedJobs();
      useProviderStore.setState({ assignedJobs: response.jobs });
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    }
  };

  const handleAcceptJob = async (booking_id: string) => {
    setRespondingTo(booking_id);
    try {
      await providerAPI.acceptJob(booking_id);
      updateJobStatus(booking_id, 'accepted');
      Alert.alert('Success', 'Job accepted! Opening chat to negotiate timing.', [
        {
          text: 'OK',
          onPress: () => {
            router.push({
              pathname: '/chat' as any,
              params: { booking_id },
            });
          }
        }
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setRespondingTo(null);
    }
  };

  const handleRejectJob = async (booking_id: string) => {
    setRespondingTo(booking_id);
    try {
      await providerAPI.respondToJob(booking_id, 'reject');
      removeJob(booking_id);
      Alert.alert('Job Declined', 'You have declined this job.');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setRespondingTo(null);
    }
  };

  const handleOpenJob = (job: ProviderJob) => {
    if (job.status === 'accepted') {
      router.push({
        pathname: '/chat' as any,
        params: { booking_id: job.booking_id },
      });
    } else {
      router.push({
        pathname: '/job-detail',
        params: { booking_id: job.booking_id },
      });
    }
  };

  const pendingJobs = assignedJobs.filter((j) => ['pending', 'pending_acceptance'].includes(j.status));
  const activeJobs = assignedJobs.filter((j) =>
    ['accepted', 'on_the_way', 'arrived', 'in_progress'].includes(j.status)
  );

  const renderJobCard = (job: ProviderJob) => {
    const isPending = ['pending', 'pending_acceptance'].includes(job.status);

    return (
      <TouchableOpacity
        key={job.booking_id}
        style={styles.jobCard}
        onPress={() => handleOpenJob(job)}
      >
        <View style={styles.jobHeader}>
          <View>
            <Text style={styles.jobService}>{job.service_type}</Text>
            <Text style={styles.jobLocation}>{job.location_description}</Text>
          </View>
          <View style={[styles.statusBadge, styles[`status_${job.status}` as keyof typeof styles] as any]}>
            <Text style={styles.statusBadgeText}>{job.status.replace('_', ' ')}</Text>
          </View>
        </View>

        <View style={styles.jobDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Customer:</Text>
            <Text style={styles.detailValue}>{job.customer_name}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Cost:</Text>
            <Text style={styles.detailValue}>PKR {job.total_estimated_cost}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>ETA:</Text>
            <Text style={styles.detailValue}>{job.eta_minutes} mins</Text>
          </View>
        </View>

        {isPending && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.rejectButton}
              onPress={() => handleRejectJob(job.booking_id)}
              disabled={respondingTo === job.booking_id}
            >
              {respondingTo === job.booking_id ? (
                <ActivityIndicator size="small" color="#aaa" />
              ) : (
                <Text style={styles.rejectButtonText}>Decline</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.acceptButton}
              onPress={() => handleAcceptJob(job.booking_id)}
              disabled={respondingTo === job.booking_id}
            >
              {respondingTo === job.booking_id ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.acceptButtonText}>Accept</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No jobs assigned yet</Text>
      <Text style={styles.emptySubtext}>Go online to receive job requests</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Pending Jobs Section */}
      {pendingJobs.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pending Requests ({pendingJobs.length})</Text>
          <View>
            {pendingJobs.map((job) => renderJobCard(job))}
          </View>
        </View>
      )}

      {/* Active Jobs Section */}
      {activeJobs.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Jobs ({activeJobs.length})</Text>
          <View>
            {activeJobs.map((job) => renderJobCard(job))}
          </View>
        </View>
      )}

      {/* Empty State */}
      {assignedJobs.length === 0 && renderEmpty()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#00bfff',
    marginBottom: 12,
  },
  jobCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#00bfff',
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  jobService: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  jobLocation: {
    fontSize: 14,
    color: '#aaa',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  status_pending_acceptance: {
    backgroundColor: '#ff8800',
  },
  status_accepted: {
    backgroundColor: '#00ff88',
  },
  status_on_the_way: {
    backgroundColor: '#00bfff',
  },
  status_arrived: {
    backgroundColor: '#00ff88',
  },
  status_in_progress: {
    backgroundColor: '#ff8800',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  jobDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  detailLabel: {
    color: '#aaa',
    fontSize: 12,
  },
  detailValue: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: '#00ff88',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  rejectButton: {
    flex: 1,
    backgroundColor: '#404040',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  rejectButtonText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#aaa',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
  },
});
