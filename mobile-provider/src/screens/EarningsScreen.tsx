/**
 * Earnings Screen
 *
 * Displays comprehensive earnings analytics:
 * - Total earnings and daily breakdown
 * - Completed jobs count
 * - Average job value
 * - Performance rating
 * - Income trends (today, week, month)
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useEarningsStats } from '@/hooks/useEarnings';
import { useProviderStore } from '@/store/providerStore';

export default function EarningsScreen() {
  const router = useRouter();
  const providerId = useProviderStore((s) => s.providerId);
  const assignedJobs = useProviderStore((s) => s.assignedJobs);

  const completedCount = assignedJobs.filter((j) => j.status === 'completed').length;
  const totalJobsOffered = assignedJobs.length;

  const { stats, loading, error, jobs } = useEarningsStats(providerId, completedCount, totalJobsOffered);

  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('month');

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00bfff" />
        <Text style={styles.loadingText}>Loading earnings data...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backArrow}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Earnings & Performance</Text>
      </View>

      {/* Total Earnings Card */}
      <View style={styles.totalEarningsCard}>
        <Text style={styles.totalLabel}>Total Earnings</Text>
        <Text style={styles.totalAmount}>PKR {stats.total_earnings.toLocaleString()}</Text>
        <Text style={styles.totalSubtext}>{stats.completed_jobs_count} jobs completed</Text>
      </View>

      {/* Period Selector */}
      <View style={styles.periodSelector}>
        <TouchableOpacity
          style={[styles.periodButton, selectedPeriod === 'today' && styles.periodButtonActive]}
          onPress={() => setSelectedPeriod('today')}
        >
          <Text style={[styles.periodButtonText, selectedPeriod === 'today' && styles.periodButtonTextActive]}>
            Today
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.periodButton, selectedPeriod === 'week' && styles.periodButtonActive]}
          onPress={() => setSelectedPeriod('week')}
        >
          <Text style={[styles.periodButtonText, selectedPeriod === 'week' && styles.periodButtonTextActive]}>
            This Week
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.periodButton, selectedPeriod === 'month' && styles.periodButtonActive]}
          onPress={() => setSelectedPeriod('month')}
        >
          <Text style={[styles.periodButtonText, selectedPeriod === 'month' && styles.periodButtonTextActive]}>
            This Month
          </Text>
        </TouchableOpacity>
      </View>

      {/* Period Earnings */}
      <View style={styles.periodEarningsCard}>
        <View style={styles.periodRow}>
          <Text style={styles.periodLabel}>
            {selectedPeriod === 'today'
              ? 'Today'
              : selectedPeriod === 'week'
                ? 'This Week'
                : 'This Month'}
          </Text>
          <Text style={styles.periodValue}>
            PKR {
              selectedPeriod === 'today'
                ? stats.today_earnings.toLocaleString()
                : selectedPeriod === 'week'
                  ? stats.week_earnings.toLocaleString()
                  : stats.month_earnings.toLocaleString()
            }
          </Text>
        </View>
        <View style={styles.periodRow}>
          <Text style={styles.periodLabel}>Jobs Completed</Text>
          <Text style={styles.periodValue}>
            {selectedPeriod === 'today'
              ? stats.jobs_completed_today
              : selectedPeriod === 'week'
                ? stats.jobs_completed_week
                : stats.jobs_completed_month}
          </Text>
        </View>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.average_job_value}</Text>
          <Text style={styles.statLabel}>Avg Job Value</Text>
          <Text style={styles.statUnit}>PKR</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.average_rating.toFixed(1)}</Text>
          <Text style={styles.statLabel}>Avg Rating</Text>
          <Text style={styles.statUnit}>⭐</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.completion_rate}%</Text>
          <Text style={styles.statLabel}>Completion Rate</Text>
          <Text style={styles.statUnit}>Success</Text>
        </View>
      </View>

      {/* Income Projection */}
      <View style={styles.projectionCard}>
        <Text style={styles.projectionTitle}>📈 Income Projections</Text>
        <View style={styles.projectionRow}>
          <Text style={styles.projectionLabel}>At current rate:</Text>
          <Text style={styles.projectionValue}>
            PKR {Math.round((stats.month_earnings / 30) * 365).toLocaleString()} / year
          </Text>
        </View>
        <View style={styles.projectionRow}>
          <Text style={styles.projectionLabel}>If +25% busy:</Text>
          <Text style={styles.projectionValue}>
            PKR {Math.round((stats.month_earnings / 30) * 365 * 1.25).toLocaleString()} / year
          </Text>
        </View>
        <View style={styles.projectionRow}>
          <Text style={styles.projectionLabel}>If +50% busy:</Text>
          <Text style={styles.projectionValue}>
            PKR {Math.round((stats.month_earnings / 30) * 365 * 1.5).toLocaleString()} / year
          </Text>
        </View>
      </View>

      {/* Recent Completed Jobs */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Completed Jobs</Text>
          <TouchableOpacity onPress={() => router.push('/job-history')}>
            <Text style={styles.viewAllLink}>View All</Text>
          </TouchableOpacity>
        </View>

        {jobs.slice(0, 5).map((job) => (
          <View key={job.booking_id} style={styles.jobCard}>
            <View style={styles.jobCardHeader}>
              <Text style={styles.jobService}>{job.service_type}</Text>
              <Text style={styles.jobEarnings}>+PKR {job.actual_earnings || job.total_estimated_cost}</Text>
            </View>
            <View style={styles.jobCardFooter}>
              <Text style={styles.jobCustomer}>{job.customer_name}</Text>
              {job.rating && (
                <View style={styles.ratingBadge}>
                  <Text style={styles.ratingText}>⭐ {job.rating.toFixed(1)}</Text>
                </View>
              )}
            </View>
            <Text style={styles.jobDate}>
              {new Intl.DateTimeFormat('en-PK', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }).format(job.completed_at)}
            </Text>
          </View>
        ))}

        {jobs.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No completed jobs yet. Keep accepting jobs to build your earnings!</Text>
          </View>
        )}
      </View>

      {/* Performance Tips */}
      <View style={styles.tipsCard}>
        <Text style={styles.tipsTitle}>💡 Tips to Increase Earnings</Text>
        <Text style={styles.tipItem}>• Maintain a 4.5+ rating for job priority</Text>
        <Text style={styles.tipItem}>• Complete jobs faster to handle more per day</Text>
        <Text style={styles.tipItem}>• Accept urgent jobs for 10% bonus pay</Text>
        <Text style={styles.tipItem}>• Build regular customers for steady income</Text>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>⚠️ Failed to load earnings: {error}</Text>
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
    paddingBottom: 40,
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
    marginBottom: 24,
  },
  backArrow: {
    color: '#00bfff',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  totalEarningsCard: {
    backgroundColor: 'linear-gradient(135deg, #003366 0%, #00bfff20 100%)',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#00ff88',
    alignItems: 'center',
  },
  totalLabel: {
    color: '#aaa',
    fontSize: 13,
    marginBottom: 8,
  },
  totalAmount: {
    fontSize: 42,
    fontWeight: '700',
    color: '#00ff88',
    marginBottom: 4,
  },
  totalSubtext: {
    color: '#888',
    fontSize: 12,
  },
  periodSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
    borderWidth: 2,
    borderColor: '#404040',
  },
  periodButtonActive: {
    backgroundColor: '#00bfff',
    borderColor: '#00bfff',
  },
  periodButtonText: {
    textAlign: 'center',
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
  },
  periodButtonTextActive: {
    color: '#000',
  },
  periodEarningsCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  periodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  periodLabel: {
    color: '#aaa',
    fontSize: 13,
  },
  periodValue: {
    color: '#00ff88',
    fontSize: 13,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#00bfff',
    marginBottom: 4,
  },
  statLabel: {
    color: '#aaa',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 4,
  },
  statUnit: {
    color: '#666',
    fontSize: 10,
  },
  projectionCard: {
    backgroundColor: '#1a3a4a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#00ff88',
  },
  projectionTitle: {
    color: '#00bfff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  projectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a3a4a',
  },
  projectionLabel: {
    color: '#aaa',
    fontSize: 12,
  },
  projectionValue: {
    color: '#00ff88',
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  viewAllLink: {
    color: '#00bfff',
    fontSize: 13,
    fontWeight: '600',
  },
  jobCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  jobCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  jobService: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  jobEarnings: {
    color: '#00ff88',
    fontSize: 13,
    fontWeight: '700',
  },
  jobCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  jobCustomer: {
    color: '#aaa',
    fontSize: 12,
  },
  ratingBadge: {
    backgroundColor: '#00bfff20',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingText: {
    color: '#00bfff',
    fontSize: 11,
    fontWeight: '600',
  },
  jobDate: {
    color: '#666',
    fontSize: 11,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyStateText: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
  },
  tipsCard: {
    backgroundColor: '#1a3a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#00ff88',
  },
  tipsTitle: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  tipItem: {
    color: '#aaa',
    fontSize: 12,
    marginBottom: 6,
    lineHeight: 18,
  },
  errorContainer: {
    backgroundColor: '#ff444420',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  errorText: {
    color: '#ff8888',
    fontSize: 12,
  },
});
