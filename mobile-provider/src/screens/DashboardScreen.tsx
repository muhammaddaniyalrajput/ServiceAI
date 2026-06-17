/**
 * Provider Dashboard Screen
 *
 * Main screen showing:
 * - Availability toggle (online/offline)
 * - Earnings overview
 * - Jobs count
 * - Quick access to jobs and profile
 * - Real-time status
 *
 * Features:
 * - Real-time Firestore listener for job updates
 * - Job request modal for new jobs
 * - FCM push notification handling
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useProviderStore } from '@/store/providerStore';
import { providerAPI } from '@/services/providerAPI';
import { useProviderJobs } from '@/hooks/useProviderJobs';
import { usePushNotifications } from '@/services/pushNotifications';
import { JobRequestModal } from '@/components/JobRequestModal';
import { ProviderJob } from '@/services/providerAPI';

export default function DashboardScreen() {
  const router = useRouter();
  const profile = useProviderStore((s) => s.profile);
  const providerId = useProviderStore((s) => s.providerId);
  const assignedJobs = useProviderStore((s) => s.assignedJobs) ?? [];
  const setAvailability = useProviderStore((s) => s.setAvailability);
  const removeJob = useProviderStore((s) => s.removeJob);

  const [isAvailable, setIsAvailable] = useState(profile?.is_available ?? false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Job request modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [incomingJob, setIncomingJob] = useState<ProviderJob | null>(null);

  // Start real-time listener for provider's jobs
  useProviderJobs(providerId);

  // Loading guard — show spinner until profile is loaded
  if (!profile) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a' }}>
        <ActivityIndicator size="large" color="#00bfff" />
      </View>
    );
  }

  // Setup FCM notifications
  const handleNewJob = (jobData: any) => {
    // Show the job request modal with incoming job details
    // The real job details will come from Firestore listener
    console.log('New job notification received:', jobData);
    // Modal will show due to Firestore listener updating the jobs
  };

  usePushNotifications(handleNewJob);

  // Check if there's a new pending job (priority)
  useEffect(() => {
    const pendingJobs = (assignedJobs ?? []).filter((j) => j.status === 'pending_acceptance');
    // Auto-show modal for first pending job
    if (pendingJobs.length > 0 && !modalVisible) {
      setIncomingJob(pendingJobs[0]);
      setModalVisible(true);
    }
  }, [assignedJobs, modalVisible]);

  const handleAvailabilityChange = async (value: boolean) => {
    setIsAvailable(value);
    setLoading(true);
    try {
      await providerAPI.updateAvailability(value);
      setAvailability(value);
    } catch (err: any) {
      // Revert on error
      setIsAvailable(!value);
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleJobAccepted = (job: ProviderJob) => {
    setModalVisible(false);
    setIncomingJob(null);
    // Job accepted - navigate to job detail
    router.push({
      pathname: '/job-detail',
      params: { booking_id: job.booking_id },
    });
  };

  const handleJobDeclined = (job: ProviderJob) => {
    setModalVisible(false);
    setIncomingJob(null);
    removeJob(job.booking_id);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const response = await providerAPI.getAssignedJobs();
      useProviderStore.setState({ assignedJobs: response.jobs });
    } catch (err) {
      console.error('Failed to refresh jobs:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const pendingJobs = assignedJobs.filter((j) => j.status === 'pending_acceptance').length;
  const activeJobs = assignedJobs.filter(
    (j) => ['accepted', 'on_the_way', 'arrived', 'in_progress'].includes(j.status)
  ).length;

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header with availability toggle */}
        <View style={styles.headerCard}>
          <View>
            <Text style={styles.greeting}>
              Welcome, {profile?.name}!
            </Text>
            <Text style={styles.statusText}>
              {isAvailable ? '🟢 Ready for jobs' : '🔴 Currently offline'}
            </Text>
          </View>

          <View style={styles.toggleContainer}>
            <Text style={styles.toggleLabel}>{isAvailable ? 'Online' : 'Offline'}</Text>
            <Switch
              value={isAvailable}
              onValueChange={handleAvailabilityChange}
              disabled={loading}
              trackColor={{ false: '#404040', true: '#00ff88' }}
              thumbColor={isAvailable ? '#00bfff' : '#888'}
            />
          </View>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{assignedJobs.filter((j) => j.status === 'pending_acceptance').length}</Text>
            <Text style={styles.statLabel}>Pending Requests</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{assignedJobs.filter((j) => ['accepted', 'on_the_way', 'arrived', 'in_progress'].includes(j.status)).length}</Text>
            <Text style={styles.statLabel}>Active Jobs</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{(profile?.rating ?? 0).toFixed(1)}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActionsContainer}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/jobs')}
          >
            <Text style={styles.actionButtonIcon}>📋</Text>
            <Text style={styles.actionButtonText}>View Jobs</Text>
            {assignedJobs.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{assignedJobs.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/earnings')}
          >
            <Text style={styles.actionButtonIcon}>💰</Text>
            <Text style={styles.actionButtonText}>Earnings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/profile')}
          >
            <Text style={styles.actionButtonIcon}>👤</Text>
            <Text style={styles.actionButtonText}>My Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Service Info */}
        <View style={styles.serviceCard}>
          <Text style={styles.serviceTitle}>Your Service</Text>
          <View style={styles.serviceDetail}>
            <Text style={styles.serviceLabel}>Service:</Text>
            <Text style={styles.serviceValue}>{profile?.service}</Text>
          </View>
          <View style={styles.serviceDetail}>
            <Text style={styles.serviceLabel}>Rate:</Text>
            <Text style={styles.serviceValue}>PKR {profile?.hourly_rate}/hr</Text>
          </View>
          <View style={styles.serviceDetail}>
            <Text style={styles.serviceLabel}>Experience:</Text>
            <Text style={styles.serviceValue}>{profile?.experience_yrs} years</Text>
          </View>
        </View>

        {/* No jobs message */}
        {assignedJobs.length === 0 && (
          <View style={styles.noJobsContainer}>
            <Text style={styles.noJobsText}>
              {isAvailable
                ? 'No jobs yet. Keep waiting for requests!'
                : 'Go online to receive job requests'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Job Request Modal */}
      <JobRequestModal
        visible={modalVisible}
        job={incomingJob}
        onAccept={handleJobAccepted}
        onDecline={handleJobDeclined}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  headerCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderLeftWidth: 4,
    borderLeftColor: '#00bfff',
  },
  greeting: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  statusText: {
    fontSize: 14,
    color: '#aaa',
  },
  toggleContainer: {
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#00bfff',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#aaa',
    textAlign: 'center',
  },
  quickActionsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#003366',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#00bfff',
    position: 'relative',
  },
  actionButtonIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00bfff',
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#ff4444',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  serviceCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  serviceTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  serviceDetail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  serviceLabel: {
    color: '#aaa',
    fontSize: 14,
  },
  serviceValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  noJobsContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#ff8800',
  },
  noJobsText: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
