/**
 * Earnings Hook
 *
 * Fetches completed jobs and calculates earnings analytics:
 * - Total earnings
 * - Daily/weekly/monthly breakdown
 * - Average job value
 * - Completion statistics
 */

import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase';

export interface CompletedJob {
  booking_id: string;
  service_type: string;
  customer_name: string;
  total_estimated_cost: number;
  actual_earnings?: number;
  completed_at: Date;
  status: 'completed';
  duration_minutes?: number;
  rating?: number;
}

export interface EarningsStats {
  total_earnings: number;
  completed_jobs_count: number;
  average_job_value: number;
  average_rating: number;
  today_earnings: number;
  week_earnings: number;
  month_earnings: number;
  completion_rate: number;
  jobs_completed_today: number;
  jobs_completed_week: number;
  jobs_completed_month: number;
}

/**
 * Hook to fetch completed jobs for a provider
 */
export const useCompletedJobs = (providerId: string | null) => {
  const [jobs, setJobs] = useState<CompletedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!providerId || !db) {
      setLoading(false);
      return;
    }

    try {
      const q = query(
        collection(db, 'bookings'),
        where('provider_id', '==', providerId),
        where('status', '==', 'completed')
      );

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const completedJobs: CompletedJob[] = [];

          snapshot.forEach((doc) => {
            const data = doc.data();
            completedJobs.push({
              booking_id: doc.id,
              service_type: data.intent?.service_type || 'Service',
              customer_name: data.booking?.customer_name || 'Customer',
              total_estimated_cost: data.booking?.total_estimated_cost || 0,
              actual_earnings: data.booking?.actual_payment || data.booking?.total_estimated_cost || 0,
              completed_at: data.booking?.completed_at?.toDate?.() || new Date(),
              status: 'completed' as const,
              duration_minutes: data.booking?.duration_minutes,
              rating: data.booking?.customer_rating,
            });
          });

          setJobs(completedJobs.sort((a, b) => b.completed_at.getTime() - a.completed_at.getTime()));
          setLoading(false);
          setError(null);
        },
        (err) => {
          console.error('Failed to fetch completed jobs:', err);
          setError(err.message);
          setLoading(false);
        }
      );

      return unsubscribe;
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }, [providerId]);

  return { jobs, loading, error };
};

/**
 * Calculate earnings statistics from completed jobs
 */
export const calculateEarningsStats = (
  jobs: CompletedJob[],
  completedCount: number = 0,
  totalJobsOffered: number = 0
): EarningsStats => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1);

  const total_earnings = jobs.reduce((sum, job) => sum + (job.actual_earnings || job.total_estimated_cost), 0);
  const today_earnings = jobs
    .filter((job) => job.completed_at >= today)
    .reduce((sum, job) => sum + (job.actual_earnings || job.total_estimated_cost), 0);
  const week_earnings = jobs
    .filter((job) => job.completed_at >= weekAgo)
    .reduce((sum, job) => sum + (job.actual_earnings || job.total_estimated_cost), 0);
  const month_earnings = jobs
    .filter((job) => job.completed_at >= monthAgo)
    .reduce((sum, job) => sum + (job.actual_earnings || job.total_estimated_cost), 0);

  const jobs_completed_today = jobs.filter((job) => job.completed_at >= today).length;
  const jobs_completed_week = jobs.filter((job) => job.completed_at >= weekAgo).length;
  const jobs_completed_month = jobs.filter((job) => job.completed_at >= monthAgo).length;

  const average_job_value = jobs.length > 0 ? Math.round(total_earnings / jobs.length) : 0;
  const average_rating = jobs.length > 0
    ? jobs.filter((j) => j.rating).reduce((sum, j) => sum + (j.rating || 0), 0) / jobs.filter((j) => j.rating).length
    : 0;

  const completion_rate =
    totalJobsOffered > 0
      ? Math.round((completedCount / totalJobsOffered) * 100)
      : 0;

  return {
    total_earnings: Math.round(total_earnings),
    completed_jobs_count: jobs.length,
    average_job_value,
    average_rating: Math.round(average_rating * 10) / 10,
    today_earnings: Math.round(today_earnings),
    week_earnings: Math.round(week_earnings),
    month_earnings: Math.round(month_earnings),
    completion_rate,
    jobs_completed_today,
    jobs_completed_week,
    jobs_completed_month,
  };
};

/**
 * Hook for complete earnings statistics
 */
export const useEarningsStats = (
  providerId: string | null,
  completedCount: number = 0,
  totalJobsOffered: number = 0
) => {
  const { jobs, loading, error } = useCompletedJobs(providerId);
  const [stats, setStats] = useState<EarningsStats>({
    total_earnings: 0,
    completed_jobs_count: 0,
    average_job_value: 0,
    average_rating: 0,
    today_earnings: 0,
    week_earnings: 0,
    month_earnings: 0,
    completion_rate: 0,
    jobs_completed_today: 0,
    jobs_completed_week: 0,
    jobs_completed_month: 0,
  });

  useEffect(() => {
    const newStats = calculateEarningsStats(jobs, completedCount, totalJobsOffered);
    setStats(newStats);
  }, [jobs, completedCount, totalJobsOffered]);

  return { stats, loading, error, jobs };
};
