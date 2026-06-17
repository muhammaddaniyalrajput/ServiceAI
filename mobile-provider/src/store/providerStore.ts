/**
 * Provider Store — Zustand state management for the provider app
 *
 * Manages:
 * - Provider authentication and profile
 * - Assigned jobs and job state
 * - Location tracking
 * - Availability status
 */

import { create } from 'zustand';
import { ProviderProfile, ProviderJob } from '@/services/providerAPI';

export interface ProviderState {
  // Authentication
  isAuthenticated: boolean;
  user: {
    email: string;
    uid: string;
  } | null;

  // Provider Profile
  profile: ProviderProfile | null;
  providerId: string | null;
  isAvailable: boolean;

  // Jobs
  assignedJobs: ProviderJob[];
  activeJob: ProviderJob | null;
  isLoadingJobs: boolean;

  // Location
  currentLocation: {
    latitude: number;
    longitude: number;
  } | null;
  isTrackingLocation: boolean;

  // Loading and error states
  isLoading: boolean;
  error: string | null;

  // Actions
  setAuthenticated: (isAuth: boolean, user?: { email: string; uid: string }) => void;
  setProfile: (profile: ProviderProfile) => void;
  setProviderId: (id: string) => void;
  setAvailability: (available: boolean) => void;
  setAssignedJobs: (jobs: ProviderJob[]) => void;
  setActiveJob: (job: ProviderJob | null) => void;
  addJob: (job: ProviderJob) => void;
  removeJob: (booking_id: string) => void;
  updateJobStatus: (booking_id: string, status: string) => void;
  setCurrentLocation: (lat: number, lng: number) => void;
  setLocationTracking: (tracking: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  logout: () => void;
}

export const useProviderStore = create<ProviderState>((set) => ({
  // Initial state
  isAuthenticated: false,
  user: null,
  profile: null,
  providerId: null,
  isAvailable: false,
  assignedJobs: [],
  activeJob: null,
  isLoadingJobs: false,
  currentLocation: null,
  isTrackingLocation: false,
  isLoading: false,
  error: null,

  // Actions
  setAuthenticated: (isAuth, user) =>
    set({ isAuthenticated: isAuth, user: user || null }),

  setProfile: (profile) =>
    set({ profile, providerId: profile.provider_id, isAvailable: profile.is_available }),

  setProviderId: (id) =>
    set({ providerId: id }),

  setAvailability: (available) =>
    set({ isAvailable: available }),

  setAssignedJobs: (jobs) =>
    set({ assignedJobs: jobs }),

  setActiveJob: (job) =>
    set({ activeJob: job }),

  addJob: (job) =>
    set((state) => ({
      assignedJobs: [job, ...state.assignedJobs],
    })),

  removeJob: (booking_id) =>
    set((state) => ({
      assignedJobs: state.assignedJobs.filter((j) => j.booking_id !== booking_id),
      activeJob: state.activeJob?.booking_id === booking_id ? null : state.activeJob,
    })),

  updateJobStatus: (booking_id, status) =>
    set((state) => ({
      assignedJobs: state.assignedJobs.map((j) =>
        j.booking_id === booking_id ? { ...j, status: status as any } : j
      ),
      activeJob:
        state.activeJob?.booking_id === booking_id
          ? { ...state.activeJob, status: status as any }
          : state.activeJob,
    })),

  setCurrentLocation: (lat, lng) =>
    set({ currentLocation: { latitude: lat, longitude: lng } }),

  setLocationTracking: (tracking) =>
    set({ isTrackingLocation: tracking }),

  setLoading: (loading) =>
    set({ isLoading: loading }),

  setError: (error) =>
    set({ error }),

  clearError: () =>
    set({ error: null }),

  logout: () =>
    set({
      isAuthenticated: false,
      user: null,
      profile: null,
      providerId: null,
      isAvailable: false,
      assignedJobs: [],
      activeJob: null,
      currentLocation: null,
      isTrackingLocation: false,
      error: null,
    }),
}));
