/**
 * Provider Jobs Screen — KaamEasy Provider.
 *
 * Refactor notes (Phase 3 de-clutter):
 *   - Six hardcoded `status_*` style objects replaced with the shared
 *     `<StatusBadge>` (state.* tokens).
 *   - The raw "Coords" row dropped from the per-job card (lat/lng belongs in
 *     the detail view, not the list).
 *   - All hex strings pulled into `AppColors` / `Spacing` / `Radius` / `FontWeight`.
 *   - Tiny 10–11px fonts bumped to 12+ for legibility.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useProviderStore } from '@/store/providerStore';
import { ProviderJob } from '@/services/providerAPI';
import { providerAPI } from '@/services/providerAPI';
import { AppColors, FontWeight, Radius, Spacing } from '@/constants/theme';
import { StatusBadge, type StatusKey } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';

// ─── Per-job countdown hook ──────────────────────────────────────────────────

const JOB_TIMEOUT_SECONDS = 60;

function useJobCountdown(jobId: string, isPending: boolean) {
  const [secondsLeft, setSecondsLeft] = useState(JOB_TIMEOUT_SECONDS);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!isPending) return;
    startRef.current = Date.now();
    setSecondsLeft(JOB_TIMEOUT_SECONDS);

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
      const remaining = Math.max(JOB_TIMEOUT_SECONDS - elapsed, 0);
      setSecondsLeft(remaining);
    }, 1000);

    return () => clearInterval(interval);
  }, [jobId, isPending]);

  return secondsLeft;
}

// ─── Job countdown badge ─────────────────────────────────────────────────────

const CountdownBadge = ({ jobId, isPending }: { jobId: string; isPending: boolean }) => {
  const seconds = useJobCountdown(jobId, isPending);
  if (!isPending) return null;
  const isUrgent = seconds <= 15;
  return (
    <View style={[styles.countdownBadge, isUrgent && styles.countdownBadgeUrgent]}>
      <Text style={[styles.countdownText, isUrgent && styles.countdownTextUrgent]}>
        ⏱ {seconds}s
      </Text>
    </View>
  );
};

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function JobsScreen() {
  const router = useRouter();
  const assignedJobs = useProviderStore((s) => s.assignedJobs);
  const updateJobStatus = useProviderStore((s) => s.updateJobStatus);
  const removeJob = useProviderStore((s) => s.removeJob);

  const [refreshing, setRefreshing] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  const fetchJobs = async () => {
    try {
      const response = await providerAPI.getAssignedJobs();
      useProviderStore.setState({ assignedJobs: response.jobs });
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchJobs();
    }, [])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  };

  const handleAcceptJob = async (booking_id: string) => {
    setRespondingTo(booking_id);
    try {
      await providerAPI.respondToJob(booking_id, 'accept');
      updateJobStatus(booking_id, 'accepted');
      Alert.alert('Success', 'Job accepted! Opening chat to negotiate timing.', [
        {
          text: 'OK',
          onPress: () => {
            router.push({
              pathname: '/chat' as any,
              params: { booking_id },
            });
          },
        },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setRespondingTo(null);
    }
  };

  const handleRejectJob = (booking_id: string) => {
    Alert.alert(
      'Decline Job?',
      'Are you sure you want to decline this job request? It will be offered to another provider.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setRespondingTo(booking_id);
            try {
              await providerAPI.respondToJob(booking_id, 'reject');
              removeJob(booking_id);
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setRespondingTo(null);
            }
          },
        },
      ]
    );
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

  const pendingJobs = assignedJobs.filter((j) =>
    ['pending', 'pending_acceptance'].includes(j.status)
  );
  const activeJobs = assignedJobs.filter((j) =>
    ['accepted', 'confirmed', 'on_the_way', 'arrived', 'in_progress'].includes(j.status)
  );

  const renderJobCard = (job: ProviderJob) => {
    const isPending = ['pending', 'pending_acceptance'].includes(job.status);
    const statusKey = (job.status as StatusKey);

    return (
      <TouchableOpacity
        key={job.booking_id}
        style={styles.jobCard}
        onPress={() => handleOpenJob(job)}
      >
        <View style={styles.jobHeader}>
          <View style={styles.flex}>
            <Text style={styles.jobService}>{job.service_type}</Text>
            <Text style={styles.jobLocation}>{job.location_description}</Text>
          </View>
          <View style={styles.jobHeaderRight}>
            <CountdownBadge jobId={job.booking_id} isPending={isPending} />
            <StatusBadge status={statusKey} size="sm" />
          </View>
        </View>

        <View style={styles.jobDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Customer</Text>
            <Text style={styles.detailValue}>{job.customer_name}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Phone</Text>
            <Text style={styles.detailValue}>{job.customer_phone || 'Not provided'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Address</Text>
            <Text style={styles.detailValue} numberOfLines={2}>
              {job.customer_address || 'Not provided'}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Cost</Text>
            <Text style={styles.detailValue}>PKR {job.total_estimated_cost}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>ETA</Text>
            <Text style={styles.detailValue}>{job.eta_minutes} mins</Text>
          </View>
        </View>

        {isPending ? (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.rejectButton, respondingTo !== null && styles.buttonDisabled]}
              onPress={() => handleRejectJob(job.booking_id)}
              disabled={respondingTo !== null}
            >
              {respondingTo === job.booking_id ? (
                <ActivityIndicator size="small" color={AppColors.textSecondary} />
              ) : (
                <Text style={styles.rejectButtonText}>Decline</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.acceptButton, respondingTo !== null && styles.buttonDisabled]}
              onPress={() => handleAcceptJob(job.booking_id)}
              disabled={respondingTo !== null}
            >
              {respondingTo === job.booking_id ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.acceptButtonText}>Accept</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={AppColors.primary}
            colors={[AppColors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {pendingJobs.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Pending Requests ({pendingJobs.length})
            </Text>
            {pendingJobs.map((job) => renderJobCard(job))}
          </View>
        ) : null}

        {activeJobs.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active Jobs ({activeJobs.length})</Text>
            {activeJobs.map((job) => renderJobCard(job))}
          </View>
        ) : null}

        {assignedJobs.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No jobs assigned yet"
            body="Pull down to refresh, or go online to receive job requests."
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.bg },
  container: { flex: 1, backgroundColor: AppColors.bg },
  flex: { flex: 1 },
  contentContainer: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    paddingBottom: Spacing.eight,
  },
  section: { marginBottom: Spacing.six },
  sectionTitle: {
    fontSize: 16,
    fontWeight: FontWeight.bold as '700',
    color: AppColors.primary,
    marginBottom: Spacing.three,
  },

  jobCard: {
    backgroundColor: AppColors.surface,
    borderRadius: Radius.md,
    padding: Spacing.four,
    marginBottom: Spacing.three,
    borderLeftWidth: 4,
    borderLeftColor: AppColors.primary,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.three,
  },
  jobHeaderRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  jobService: {
    fontSize: 16,
    fontWeight: FontWeight.bold as '700',
    color: AppColors.textPrimary,
    marginBottom: 4,
  },
  jobLocation: {
    fontSize: 14,
    color: AppColors.textSecondary,
  },

  jobDetails: { marginBottom: Spacing.three },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one + 2,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.borderSubtle,
  },
  detailLabel: { color: AppColors.textSecondary, fontSize: 13 },
  detailValue: {
    color: AppColors.textPrimary,
    fontSize: 13,
    fontWeight: FontWeight.semibold as '600',
    maxWidth: '60%',
    textAlign: 'right',
  },

  countdownBadge: {
    backgroundColor: AppColors.surface2,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  countdownBadgeUrgent: {
    backgroundColor: 'rgba(255,68,68,0.15)',
    borderColor: AppColors.danger,
  },
  countdownText: {
    color: AppColors.textSecondary,
    fontSize: 12,
    fontWeight: FontWeight.bold as '700',
  },
  countdownTextUrgent: { color: AppColors.danger },

  actionButtons: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: AppColors.success,
    borderRadius: Radius.md,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: FontWeight.semibold as '600',
  },
  rejectButton: {
    flex: 1,
    backgroundColor: AppColors.overlay,
    borderRadius: Radius.md,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
  },
  rejectButtonText: {
    color: AppColors.textSecondary,
    fontSize: 14,
    fontWeight: FontWeight.semibold as '600',
  },
  buttonDisabled: { opacity: 0.6 },
});
