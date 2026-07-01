/**
 * Job History Screen — KaamEasy Provider.
 *
 * Shows all completed jobs with:
 * - Detailed job information
 * - Customer ratings and feedback
 * - Earnings per job
 * - Filter and sort options
 *
 * Refactor notes (Phase 3 de-clutter):
 *   - All hex strings pulled into `AppColors` / `Spacing` / `Radius` / `FontWeight`.
 *   - Tiny 10–11px fonts bumped to 12+ for legibility.
 *   - Earnings card uses theme tokens.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEarningsStats } from '@/hooks/useEarnings';
import { useProviderStore } from '@/store/providerStore';
import { AppColors, FontWeight, Radius, Spacing } from '@/constants/theme';
import { EmptyState } from '@/components/ui/EmptyState';

type SortBy = 'recent' | 'earnings' | 'rating';

export default function JobHistoryScreen() {
  const router = useRouter();
  const providerId = useProviderStore((s) => s.providerId);
  const assignedJobs = useProviderStore((s) => s.assignedJobs);

  const completedCount = assignedJobs.filter((j) => j.status === 'completed').length;
  const { stats, loading, error, jobs } = useEarningsStats(providerId, completedCount, assignedJobs.length);

  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [filterRating, setFilterRating] = useState<number | null>(null);

  const sortedAndFiltered = useMemo(() => {
    let filtered = [...jobs];

    if (filterRating) {
      filtered = filtered.filter((job) => job.rating && job.rating >= filterRating);
    }

    switch (sortBy) {
      case 'recent':
        filtered.sort((a, b) => b.completed_at.getTime() - a.completed_at.getTime());
        break;
      case 'earnings':
        filtered.sort((a, b) => (b.actual_earnings || b.total_estimated_cost) - (a.actual_earnings || a.total_estimated_cost));
        break;
      case 'rating':
        filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
    }

    return filtered;
  }, [jobs, sortBy, filterRating]);

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={AppColors.primary} />
          <Text style={styles.loadingText}>Loading job history…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backArrow}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Job History</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Summary Stats */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.statsScroll}
        contentContainerStyle={styles.statsContent}
      >
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{stats.completed_jobs_count}</Text>
          <Text style={styles.statName}>Total Jobs</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>PKR {stats.total_earnings.toLocaleString()}</Text>
          <Text style={styles.statName}>Total Earned</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>⭐ {stats.average_rating.toFixed(1)}</Text>
          <Text style={styles.statName}>Avg Rating</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{stats.average_job_value}</Text>
          <Text style={styles.statName}>Avg Value</Text>
        </View>
      </ScrollView>

      {/* Sort & Filter Controls */}
      <View style={styles.controls}>
        <View style={styles.sortContainer}>
          <Text style={styles.controlLabel}>Sort</Text>
          <View style={styles.sortButtons}>
            {(['recent', 'earnings', 'rating'] as const).map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.sortButton, sortBy === option && styles.sortButtonActive]}
                onPress={() => setSortBy(option)}
              >
                <Text style={[styles.sortButtonText, sortBy === option && styles.sortButtonTextActive]}>
                  {option === 'recent' ? 'Recent' : option === 'earnings' ? 'Earnings' : 'Rating'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.filterContainer}>
          <Text style={styles.controlLabel}>Rating</Text>
          <View style={styles.filterButtons}>
            {[null, 3, 3.5, 4, 4.5].map((rating) => (
              <TouchableOpacity
                key={rating ?? 'all'}
                style={[styles.filterButton, filterRating === rating && styles.filterButtonActive]}
                onPress={() => setFilterRating(rating)}
              >
                <Text style={[styles.filterButtonText, filterRating === rating && styles.filterButtonTextActive]}>
                  {rating === null ? 'All' : `${rating}+`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Jobs List */}
      <FlatList
        data={sortedAndFiltered}
        keyExtractor={(item) => item.booking_id}
        contentContainerStyle={styles.listContent}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.jobItem}>
            <View style={styles.jobHeader}>
              <View style={styles.flex}>
                <Text style={styles.jobService}>{item.service_type}</Text>
                <Text style={styles.jobCustomer}>{item.customer_name}</Text>
              </View>
              <View style={styles.earningsBox}>
                <Text style={styles.earningsLabel}>Earned</Text>
                <Text style={styles.earningsValue}>
                  PKR {(item.actual_earnings || item.total_estimated_cost).toLocaleString()}
                </Text>
              </View>
            </View>

            <View style={styles.jobDetails}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Rating</Text>
                {item.rating ? (
                  <View style={styles.ratingContainer}>
                    <Text style={styles.ratingValue}>⭐ {item.rating.toFixed(1)}</Text>
                  </View>
                ) : (
                  <Text style={styles.noRating}>Not rated</Text>
                )}
              </View>

              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Duration</Text>
                <Text style={styles.detailValue}>
                  {item.duration_minutes ? `${item.duration_minutes} min` : 'N/A'}
                </Text>
              </View>

              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Hourly Rate</Text>
                <Text style={styles.detailValue}>
                  {item.duration_minutes
                    ? `PKR ${Math.round(((item.actual_earnings || item.total_estimated_cost) / item.duration_minutes) * 60)}/hr`
                    : 'N/A'}
                </Text>
              </View>
            </View>

            <View style={styles.jobFooter}>
              <Text style={styles.jobDate}>
                {new Intl.DateTimeFormat('en-PK', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(item.completed_at)}
              </Text>
              <TouchableOpacity
                style={styles.detailsButton}
                onPress={() =>
                  router.push({
                    pathname: '/job-detail',
                    params: { booking_id: item.booking_id },
                  })
                }
              >
                <Text style={styles.detailsButtonText}>View Details →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {sortedAndFiltered.length === 0 ? (
        <EmptyState
          icon="📋"
          title={jobs.length === 0 ? 'No jobs completed yet' : 'No matches'}
          body={
            jobs.length === 0
              ? 'Completed jobs and earnings will appear here once you finish your first job.'
              : 'No completed jobs match the current filters.'
          }
        />
      ) : null}

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.bg },
  flex: { flex: 1 },

  loadingContainer: {
    flex: 1,
    backgroundColor: AppColors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { color: AppColors.textSecondary, marginTop: Spacing.three },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.surface2,
  },
  headerSpacer: { width: 60 },
  backArrow: {
    color: AppColors.primary,
    fontSize: 16,
    fontWeight: FontWeight.semibold as '600',
  },
  title: {
    fontSize: 18,
    fontWeight: FontWeight.bold as '700',
    color: AppColors.textPrimary,
  },

  statsScroll: { flexGrow: 0 },
  statsContent: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: Spacing.three,
  },
  statItem: {
    backgroundColor: AppColors.surface,
    borderRadius: Radius.md,
    padding: Spacing.three,
    alignItems: 'center',
    minWidth: 110,
  },
  statNumber: {
    color: AppColors.success,
    fontSize: 15,
    fontWeight: FontWeight.bold as '700',
    marginBottom: 4,
  },
  statName: {
    color: AppColors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },

  controls: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.surface2,
  },
  sortContainer: { marginBottom: Spacing.three },
  filterContainer: {},
  controlLabel: {
    color: AppColors.textSecondary,
    fontSize: 12,
    fontWeight: FontWeight.semibold as '600',
    marginBottom: 6,
  },
  sortButtons: { flexDirection: 'row', gap: Spacing.two },
  sortButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two - 2,
    borderRadius: Radius.md,
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  sortButtonActive: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
  sortButtonText: { color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.semibold as '600' },
  sortButtonTextActive: { color: '#000' },

  filterButtons: { flexDirection: 'row', gap: Spacing.two },
  filterButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two - 2,
    borderRadius: Radius.md,
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  filterButtonActive: { backgroundColor: AppColors.success, borderColor: AppColors.success },
  filterButtonText: { color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.semibold as '600' },
  filterButtonTextActive: { color: '#000' },

  listContent: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  jobItem: {
    backgroundColor: AppColors.surface,
    borderRadius: Radius.md,
    padding: Spacing.three + 2,
    marginBottom: Spacing.three,
    borderLeftWidth: 4,
    borderLeftColor: AppColors.primary,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  jobService: { color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.bold as '700', marginBottom: 4 },
  jobCustomer: { color: AppColors.textSecondary, fontSize: 12 },
  earningsBox: {
    backgroundColor: AppColors.earningsBg,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  earningsLabel: { color: AppColors.textSecondary, fontSize: 12, marginBottom: 2 },
  earningsValue: { color: AppColors.success, fontSize: 12, fontWeight: FontWeight.bold as '700' },

  jobDetails: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginBottom: Spacing.three,
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.borderSubtle,
  },
  detailItem: { flex: 1 },
  detailLabel: { color: AppColors.textMuted, fontSize: 12, marginBottom: 4 },
  detailValue: { color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.semibold as '600' },
  ratingContainer: {
    backgroundColor: AppColors.earningsBg,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  ratingValue: { color: AppColors.primary, fontSize: 12, fontWeight: FontWeight.bold as '700' },
  noRating: { color: AppColors.textMuted, fontSize: 12, fontStyle: 'italic' },

  jobFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  jobDate: { color: AppColors.textMuted, fontSize: 12 },
  detailsButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: AppColors.earningsBg,
  },
  detailsButtonText: { color: AppColors.primary, fontSize: 12, fontWeight: FontWeight.semibold as '600' },

  errorContainer: {
    backgroundColor: 'rgba(255,68,68,0.12)',
    marginHorizontal: Spacing.four,
    marginVertical: Spacing.three,
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  errorText: { color: '#ff8888', fontSize: 13 },
});
