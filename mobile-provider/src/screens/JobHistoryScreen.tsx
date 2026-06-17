/**
 * Job History Screen
 *
 * Shows all completed jobs with:
 * - Detailed job information
 * - Customer ratings and feedback
 * - Earnings per job
 * - Job duration
 * - Filter and sort options
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
import { useRouter } from 'expo-router';
import { useEarningsStats } from '@/hooks/useEarnings';
import { useProviderStore } from '@/store/providerStore';

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

    // Filter by rating
    if (filterRating) {
      filtered = filtered.filter((job) => job.rating && job.rating >= filterRating);
    }

    // Sort
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00bfff" />
        <Text style={styles.loadingText}>Loading job history...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backArrow}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Job History</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Summary Stats */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll}>
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
          <Text style={styles.controlLabel}>Sort:</Text>
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
          <Text style={styles.controlLabel}>Rating:</Text>
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
            {/* Top Row: Service & Earnings */}
            <View style={styles.jobHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.jobService}>{item.service_type}</Text>
                <Text style={styles.jobCustomer}>{item.customer_name}</Text>
              </View>
              <View style={styles.earningsBox}>
                <Text style={styles.earningsLabel}>Earned</Text>
                <Text style={styles.earningsValue}>PKR {(item.actual_earnings || item.total_estimated_cost).toLocaleString()}</Text>
              </View>
            </View>

            {/* Middle Row: Rating & Duration */}
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

            {/* Bottom Row: Date */}
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
              <TouchableOpacity style={styles.detailsButton}>
                <Text style={styles.detailsButtonText}>View Details →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {sortedAndFiltered.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateIcon}>📋</Text>
          <Text style={styles.emptyStateText}>
            {jobs.length === 0 ? 'No jobs completed yet' : 'No jobs match your filters'}
          </Text>
        </View>
      )}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  backArrow: {
    color: '#00bfff',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  statsScroll: {
    flexGrow: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  statItem: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    marginRight: 12,
    alignItems: 'center',
    minWidth: 110,
  },
  statNumber: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  statName: {
    color: '#aaa',
    fontSize: 10,
    textAlign: 'center',
  },
  controls: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  sortContainer: {
    marginBottom: 12,
  },
  filterContainer: {},
  controlLabel: {
    color: '#aaa',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  sortButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  sortButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#404040',
  },
  sortButtonActive: {
    backgroundColor: '#00bfff',
    borderColor: '#00bfff',
  },
  sortButtonText: {
    color: '#aaa',
    fontSize: 11,
    fontWeight: '600',
  },
  sortButtonTextActive: {
    color: '#000',
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#404040',
  },
  filterButtonActive: {
    backgroundColor: '#00ff88',
    borderColor: '#00ff88',
  },
  filterButtonText: {
    color: '#aaa',
    fontSize: 10,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#000',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  jobItem: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#00bfff',
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  jobService: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  jobCustomer: {
    color: '#aaa',
    fontSize: 12,
  },
  earningsBox: {
    backgroundColor: '#003366',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  earningsLabel: {
    color: '#aaa',
    fontSize: 9,
    marginBottom: 2,
  },
  earningsValue: {
    color: '#00ff88',
    fontSize: 12,
    fontWeight: '700',
  },
  jobDetails: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    color: '#666',
    fontSize: 10,
    marginBottom: 4,
  },
  detailValue: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  ratingContainer: {
    backgroundColor: '#003366',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingValue: {
    color: '#00bfff',
    fontSize: 11,
    fontWeight: '700',
  },
  noRating: {
    color: '#666',
    fontSize: 11,
    fontStyle: 'italic',
  },
  jobFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  jobDate: {
    color: '#666',
    fontSize: 11,
  },
  detailsButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#003366',
  },
  detailsButtonText: {
    color: '#00bfff',
    fontSize: 11,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
  },
  errorContainer: {
    backgroundColor: '#ff444420',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    color: '#ff8888',
    fontSize: 12,
  },
});
