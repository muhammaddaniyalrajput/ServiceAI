/**
 * Provider Dashboard Screen — KaamEasy Provider.
 *
 * Refactor notes (Phase 3 de-clutter):
 *   - All hardcoded hex strings replaced with `AppColors` / `Spacing` / `Radius` /
 *     `FontWeight` tokens from `@/constants/theme`.
 *   - The "no jobs" state uses the shared `<EmptyState>` component.
 *   - 10–11px fonts bumped to 12+ for legibility.
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useProviderStore } from '@/store/providerStore';
import { providerAPI } from '@/services/providerAPI';
import { useProviderJobs } from '@/hooks/useProviderJobs';
import { usePushNotifications } from '@/services/pushNotifications';
import { JobRequestModal } from '@/components/JobRequestModal';
import { ProviderJob } from '@/services/providerAPI';
import { AppColors, FontWeight, Radius, Spacing } from '@/constants/theme';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge, type StatusKey } from '@/components/ui/StatusBadge';

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
  const [statsLoaded, setStatsLoaded] = useState(assignedJobs.length > 0);

  const [modalVisible, setModalVisible] = useState(false);
  const [incomingJob, setIncomingJob] = useState<ProviderJob | null>(null);

  useProviderJobs(providerId);

  const handleNewJob = (jobData: any) => {
    console.log('New job notification received:', jobData);
  };

  usePushNotifications(handleNewJob);

  useEffect(() => {
    const pendingJobs = (assignedJobs ?? []).filter((j) => j.status === 'pending_acceptance');
    if (pendingJobs.length > 0 && !modalVisible) {
      setIncomingJob(pendingJobs[0]);
      setModalVisible(true);
    }
  }, [assignedJobs, modalVisible]);

  useEffect(() => {
    if (assignedJobs.length > 0 && !statsLoaded) {
      setStatsLoaded(true);
    }
  }, [assignedJobs, statsLoaded]);

  if (!profile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={AppColors.primary} />
      </View>
    );
  }

  const handleAvailabilityChange = async (value: boolean) => {
    setIsAvailable(value);
    setLoading(true);
    try {
      await providerAPI.updateAvailability(value);
      setAvailability(value);
    } catch (err: any) {
      setIsAvailable(!value);
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleJobAccepted = (job: ProviderJob) => {
    setModalVisible(false);
    setIncomingJob(null);
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

  const availabilityStatusKey: StatusKey = isAvailable ? 'accepted' : 'cancelled';

  return (
    <>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={AppColors.primary}
              colors={[AppColors.primary]}
            />
          }
        >
          {/* Header with availability toggle */}
          <View style={styles.headerCard}>
            <View style={styles.flex}>
              <Text style={styles.greeting}>Welcome, {profile?.name}!</Text>
              <View style={styles.statusRow}>
                <StatusBadge
                  status={availabilityStatusKey}
                  size="sm"
                  label={isAvailable ? '🟢 Ready for jobs' : '🔴 Currently offline'}
                />
              </View>
            </View>

            <View style={styles.toggleContainer}>
              <Text style={styles.toggleLabel}>{isAvailable ? 'Online' : 'Offline'}</Text>
              <Switch
                value={isAvailable}
                onValueChange={handleAvailabilityChange}
                disabled={loading}
                trackColor={{ false: AppColors.overlay, true: AppColors.success }}
                thumbColor={isAvailable ? AppColors.primary : AppColors.textMuted}
              />
            </View>
          </View>

          {/* Stats Cards */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              {statsLoaded ? (
                <Text style={styles.statNumber}>
                  {assignedJobs.filter((j) => j.status === 'pending_acceptance').length}
                </Text>
              ) : (
                <ActivityIndicator size="small" color={AppColors.primary} />
              )}
              <Text style={styles.statLabel}>Pending Requests</Text>
            </View>

            <View style={styles.statCard}>
              {statsLoaded ? (
                <Text style={styles.statNumber}>
                  {assignedJobs.filter((j) =>
                    ['accepted', 'on_the_way', 'arrived', 'in_progress'].includes(j.status)
                  ).length}
                </Text>
              ) : (
                <ActivityIndicator size="small" color={AppColors.primary} />
              )}
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
              {assignedJobs.length > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{assignedJobs.length}</Text>
                </View>
              ) : null}
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
          {assignedJobs.length === 0 ? (
            <EmptyState
              icon="📭"
              title={isAvailable ? 'No jobs yet' : 'You are offline'}
              body={
                isAvailable
                  ? 'Keep this screen open — new requests will pop up here as they come in.'
                  : 'Go online to start receiving job requests from customers nearby.'
              }
            />
          ) : null}
        </ScrollView>
      </SafeAreaView>
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
  root: { flex: 1, backgroundColor: AppColors.bg },
  container: { flex: 1, backgroundColor: AppColors.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.six },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: AppColors.bg,
  },

  headerCard: {
    backgroundColor: AppColors.surface,
    borderRadius: Radius.md,
    padding: Spacing.five,
    marginBottom: Spacing.six,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderLeftWidth: 4,
    borderLeftColor: AppColors.primary,
  },
  greeting: {
    fontSize: 20,
    fontWeight: FontWeight.bold as '700',
    color: AppColors.textPrimary,
    marginBottom: 6,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  toggleContainer: { alignItems: 'center' },
  toggleLabel: {
    fontSize: 12,
    color: AppColors.textSecondary,
    marginBottom: Spacing.two,
  },

  statsContainer: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginBottom: Spacing.six,
  },
  statCard: {
    flex: 1,
    backgroundColor: AppColors.surface,
    borderRadius: Radius.md,
    padding: Spacing.four,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: FontWeight.bold as '700',
    color: AppColors.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: AppColors.textSecondary,
    textAlign: 'center',
  },

  quickActionsContainer: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginBottom: Spacing.six,
  },
  actionButton: {
    flex: 1,
    backgroundColor: AppColors.earningsBg,
    borderRadius: Radius.md,
    padding: Spacing.four,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppColors.primary,
    position: 'relative',
  },
  actionButtonIcon: { fontSize: 32, marginBottom: Spacing.two },
  actionButtonText: {
    fontSize: 14,
    fontWeight: FontWeight.semibold as '600',
    color: AppColors.primary,
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: AppColors.danger,
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: FontWeight.bold as '700',
  },

  serviceCard: {
    backgroundColor: AppColors.surface,
    borderRadius: Radius.md,
    padding: Spacing.four,
    marginBottom: Spacing.six,
  },
  serviceTitle: {
    fontSize: 16,
    fontWeight: FontWeight.bold as '700',
    color: AppColors.textPrimary,
    marginBottom: Spacing.three,
  },
  serviceDetail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.borderSubtle,
  },
  serviceLabel: { color: AppColors.textSecondary, fontSize: 14 },
  serviceValue: { color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.semibold as '600' },
});
