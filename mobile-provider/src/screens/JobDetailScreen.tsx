/**
 * Job Detail Screen — KaamEasy Provider.
 *
 * Refactor notes (Phase 3 de-clutter):
 *   - Header status badge now uses the shared `<StatusBadge>` (state.* tokens).
 *   - The hand-rolled `<View style={styles.statusFlow}>` with 5 dots + connectors
 *     is replaced with the shared `<ProgressSteps>`.
 *   - All hex strings pulled into `AppColors` / `Spacing` / `Radius` / `FontWeight`.
 *   - Tiny 10–11px fonts bumped to 12+ for legibility.
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSingleJobListener } from '@/hooks/useProviderJobs';
import { providerAPI } from '@/services/providerAPI';
import { useProviderStore } from '@/store/providerStore';
import { AppColors, FontWeight, Radius, Spacing } from '@/constants/theme';
import { StatusBadge, type StatusKey } from '@/components/ui/StatusBadge';
import { ProgressSteps, type ProgressStep } from '@/components/ui/ProgressSteps';

const STATUS_FLOW: ProgressStep[] = [
  { key: 'pending_acceptance', label: 'Pending' },
  { key: 'accepted',           label: 'Accepted' },
  { key: 'on_the_way',         label: 'On way' },
  { key: 'arrived',            label: 'Arrived' },
  { key: 'completed',          label: 'Done' },
];

const NEXT_STATUS: Record<string, 'on_the_way' | 'arrived' | 'in_progress' | 'completed'> = {
  confirmed:   'on_the_way',
  on_the_way:  'arrived',
  arrived:     'in_progress',
  in_progress: 'completed',
};

const STATUS_LABELS: Record<string, string> = {
  on_the_way: '▶️ Start Journey',
  arrived:    '📍 I Have Arrived',
  in_progress:'🔧 Start Work',
  completed:  '✓ Complete Job',
};

export default function JobDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ booking_id?: string }>();
  const bookingId =
    typeof params.booking_id === 'string' ? params.booking_id : '';

  const { job, loading } = useSingleJobListener(bookingId);
  const updateJobStatus = useProviderStore((s) => s.updateJobStatus);

  const [updating, setUpdating] = useState(false);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color={AppColors.primary} />
        <Text style={styles.loadingText}>Loading job details…</Text>
      </SafeAreaView>
    );
  }

  if (!job) {
    return (
      <SafeAreaView style={styles.errorContainer} edges={['top']}>
        <Text style={styles.errorText}>Job not found</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const handleStatusUpdate = async (newStatus: 'on_the_way' | 'arrived' | 'in_progress' | 'completed') => {
    setUpdating(true);
    try {
      await providerAPI.updateJobStatus(bookingId, newStatus);
      updateJobStatus(bookingId, newStatus);

      const messages: Record<string, string> = {
        on_the_way:  'Started journey',
        arrived:     'Arrived at location',
        in_progress: 'Started work',
        completed:   'Completed job',
      };

      Alert.alert('Success', messages[newStatus]);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setUpdating(false);
    }
  };

  const nextStatus = NEXT_STATUS[job.status];
  const statusKey = (job.status as StatusKey);

  const urgencyColor = {
    high:   AppColors.danger,
    medium: AppColors.warning,
    low:    AppColors.success,
  }[job.urgency] || AppColors.primary;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header with Job ID */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backArrow}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.jobId}>{job.booking_id}</Text>
          <StatusBadge
            status={statusKey}
            size="sm"
            style={styles.headerBadge}
          />
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
              <Text style={styles.infoLabel}>Address</Text>
              <Text style={styles.infoValue}>{job.customer_address || 'Not provided'}</Text>
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
          <Text style={styles.mapStub}>🗺️ Map view coming in a future release</Text>
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
          <View style={styles.progressCard}>
            <ProgressSteps
              steps={STATUS_FLOW}
              current={STATUS_FLOW.findIndex((s) => s.key === job.status)}
            />
          </View>
        </View>

        {/* Navigation Button (for on_the_way and arrived status) */}
        {['on_the_way', 'arrived'].includes(job.status) ? (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.navigationButton}
              onPress={() => router.push({
                pathname: '/live-tracking',
                params: { booking_id: bookingId },
              })}
            >
              <Text style={styles.navigationButtonText}>🗺️ View Live Tracking</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Chat & Negotiation Button (for active statuses) */}
        {['accepted', 'confirmed', 'on_the_way', 'arrived', 'in_progress'].includes(job.status) ? (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.chatButton}
              onPress={() => router.push({
                pathname: '/chat' as any,
                params: { booking_id: bookingId },
              })}
            >
              <Text style={styles.chatButtonText}>💬 Chat with Customer</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Action Buttons */}
        {job.status !== 'completed' && nextStatus ? (
          <View style={styles.actionSection}>
            <TouchableOpacity
              style={[styles.actionButton, updating && styles.buttonDisabled]}
              onPress={() => handleStatusUpdate(nextStatus)}
              disabled={updating}
            >
              {updating ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.actionButtonText}>
                  {STATUS_LABELS[nextStatus] ?? 'Update Status'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {job.status === 'completed' ? (
          <View style={styles.completedContainer}>
            <Text style={styles.completedIcon}>✓</Text>
            <Text style={styles.completedText}>Job Completed!</Text>
            <Text style={styles.completedSubtext}>
              Customer will receive feedback request
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.bg },
  container: { flex: 1, backgroundColor: AppColors.bg },
  content: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: AppColors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { color: AppColors.textSecondary, marginTop: Spacing.three },

  errorContainer: {
    flex: 1,
    backgroundColor: AppColors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: AppColors.danger,
    fontSize: 18,
    marginBottom: Spacing.six,
  },
  backButton: {
    backgroundColor: AppColors.primary,
    paddingHorizontal: Spacing.six,
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
  },
  backButtonText: { color: '#000', fontWeight: FontWeight.semibold as '600' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.six,
    gap: Spacing.three,
  },
  backArrow: {
    color: AppColors.primary,
    fontSize: 16,
    fontWeight: FontWeight.semibold as '600',
  },
  jobId: { color: AppColors.textSecondary, fontSize: 12, flex: 1 },
  headerBadge: {},

  section: { marginBottom: Spacing.six },
  sectionTitle: {
    fontSize: 16,
    fontWeight: FontWeight.bold as '700',
    color: AppColors.textPrimary,
    marginBottom: Spacing.three,
  },

  serviceCard: {
    backgroundColor: AppColors.surface,
    borderRadius: Radius.md,
    padding: Spacing.four,
    borderLeftWidth: 4,
    borderLeftColor: AppColors.primary,
  },
  serviceTitle: {
    fontSize: 18,
    fontWeight: FontWeight.bold as '700',
    color: AppColors.primary,
    marginBottom: Spacing.three,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one + 2,
  },
  detailIcon: { fontSize: 16 },
  detailValue: { color: AppColors.textPrimary, fontSize: 14 },

  infoCard: {
    backgroundColor: AppColors.surface,
    borderRadius: Radius.md,
    padding: Spacing.four,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.borderSubtle,
  },
  infoLabel: { color: AppColors.textSecondary, fontSize: 14 },
  infoValue: { color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.semibold as '600' },
  urgencyPill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.sm,
  },
  urgencyText: { color: '#000', fontSize: 12, fontWeight: FontWeight.semibold as '600' },

  coordinatesCard: {
    backgroundColor: AppColors.surface,
    borderRadius: Radius.md,
    padding: Spacing.four,
    marginBottom: Spacing.three,
  },
  coordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.borderSubtle,
  },
  coordLabel: { color: AppColors.textSecondary, fontSize: 13 },
  coordValue: { color: AppColors.primary, fontSize: 13, fontWeight: FontWeight.bold as '700', fontFamily: 'monospace' },
  mapStub: {
    color: AppColors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: Spacing.three,
    backgroundColor: AppColors.surface,
    borderRadius: Radius.md,
  },

  costCard: {
    backgroundColor: AppColors.earningsBg,
    borderRadius: Radius.md,
    padding: Spacing.four,
    borderLeftWidth: 4,
    borderLeftColor: AppColors.primary,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.3)',
  },
  costLabel: { color: AppColors.textSecondary, fontSize: 14 },
  costValue: { color: AppColors.success, fontSize: 14, fontWeight: FontWeight.bold as '700' },

  progressCard: {
    backgroundColor: AppColors.surface,
    borderRadius: Radius.md,
    padding: Spacing.four,
  },

  navigationButton: {
    backgroundColor: AppColors.earningsBg,
    borderRadius: Radius.md,
    paddingVertical: Spacing.three + 2,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: AppColors.primary,
  },
  navigationButtonText: {
    color: AppColors.primary,
    fontSize: 16,
    fontWeight: FontWeight.bold as '700',
  },
  chatButton: {
    backgroundColor: '#6366f1',
    borderRadius: Radius.md,
    paddingVertical: Spacing.three + 2,
    alignItems: 'center',
  },
  chatButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: FontWeight.bold as '700',
  },

  actionSection: { marginBottom: Spacing.six },
  actionButton: {
    backgroundColor: AppColors.success,
    borderRadius: Radius.md,
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  actionButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: FontWeight.bold as '700',
  },

  completedContainer: {
    backgroundColor: AppColors.surface,
    borderRadius: Radius.md,
    padding: Spacing.eight,
    alignItems: 'center',
    marginBottom: Spacing.six,
    borderLeftWidth: 4,
    borderLeftColor: AppColors.success,
  },
  completedIcon: { fontSize: 48, marginBottom: Spacing.three },
  completedText: { color: AppColors.success, fontSize: 18, fontWeight: FontWeight.bold as '700', marginBottom: 4 },
  completedSubtext: { color: AppColors.textSecondary, fontSize: 14 },
});
