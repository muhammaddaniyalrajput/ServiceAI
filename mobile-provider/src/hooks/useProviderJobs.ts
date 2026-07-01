/**
 * useProviderJobs Hook
 *
 * Real-time Firestore listener for provider's assigned jobs.
 * Automatically updates Zustand store when jobs change in Firestore.
 *
 * Usage:
 *   useProviderJobs(provider_id) - starts listening to jobs for the provider
 */

import React, { useEffect } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  QueryConstraint,
  doc,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { useProviderStore } from '@/store/providerStore';
import { ProviderJob } from '@/services/providerAPI';

export const useProviderJobs = (providerId: string | null) => {
  const setAssignedJobs = useProviderStore((s) => s.setAssignedJobs);
  const addJob = useProviderStore((s) => s.addJob);
  const updateJobStatus = useProviderStore((s) => s.updateJobStatus);
  const removeJob = useProviderStore((s) => s.removeJob);

  useEffect(() => {
    if (!providerId || !db) return;

    // Query: all bookings where provider_id matches AND status is pending/active
    const constraints: QueryConstraint[] = [
      where('provider_id', '==', providerId),
      // Filter to only active/pending jobs
      where('status', 'in', [
        'pending_acceptance',
        'accepted',
        'on_the_way',
        'arrived',
        'in_progress',
      ]),
    ];

    const q = query(collection(db, 'bookings'), ...constraints);

    // Set up real-time listener
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const jobs: ProviderJob[] = [];

        snapshot.forEach((docSnapshot) => {
          const data = docSnapshot.data();
          const job: ProviderJob = {
            booking_id: data.booking_id || docSnapshot.id,
            user_id: data.user_id || '',
            status: data.status || 'pending_acceptance',
            service_type: data.intent?.service_type || 'Service',
            customer_name: data.customer_name || data.user_name || 'Customer',
            customer_phone: data.customer_phone || data.user_phone || '',
            customer_address: data.customer_address || data.intent?.location || 'Location',
            customer_coordinates: data.customer_coordinates || data.user_coordinates || {
              latitude: 0,
              longitude: 0,
            },
            location_description: data.intent?.location || 'Location',
            requested_at: data.created_at || new Date().toISOString(),
            urgency: data.intent?.urgency || 'medium',
            total_estimated_cost: data.booking?.total_estimated_cost || 0,
            eta_minutes: data.booking?.eta_minutes || 0,
          };
          jobs.push(job);
        });

        // Update store with all jobs
        setAssignedJobs(jobs);
      },
      (error) => {
        console.error('Error listening to provider jobs:', error);
      }
    );

    // Cleanup listener on unmount
    return () => unsubscribe();
  }, [providerId, db, setAssignedJobs]);
};

/**
 * useSingleJobListener Hook
 *
 * Real-time listener for a single booking document.
 * Updates when job status changes.
 *
 * Usage:
 *   const job = useSingleJobListener(booking_id)
 */
export const useSingleJobListener = (bookingId: string | null) => {
  const [job, setJob] = React.useState<ProviderJob | null>(null);
  const [loading, setLoading] = React.useState(true);

  useEffect(() => {
    if (!bookingId || !db) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'bookings', bookingId),
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          const job: ProviderJob = {
            booking_id: data.booking_id || bookingId,
            user_id: data.user_id || '',
            status: data.status || 'pending_acceptance',
            service_type: data.intent?.service_type || 'Service',
            customer_name: data.customer_name || data.user_name || 'Customer',
            customer_phone: data.customer_phone || data.user_phone || '',
            customer_address: data.customer_address || data.intent?.location || 'Location',
            customer_coordinates: data.customer_coordinates || data.user_coordinates || {
              latitude: 0,
              longitude: 0,
            },
            location_description: data.intent?.location || 'Location',
            requested_at: data.created_at || new Date().toISOString(),
            urgency: data.intent?.urgency || 'medium',
            total_estimated_cost: data.booking?.total_estimated_cost || 0,
            eta_minutes: data.booking?.eta_minutes || 0,
          };
          setJob(job);
        } else {
          setJob(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to booking:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [bookingId, db]);

  return { job, loading };
};
