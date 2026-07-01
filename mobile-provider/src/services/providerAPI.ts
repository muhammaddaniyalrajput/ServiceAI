/**
 * Provider API Service Layer
 *
 * Handles all HTTP calls to the KaamEasy AI backend provider endpoints.
 * Uses the provider's Firebase ID token for authorization.
 *
 * Endpoints:
 * - POST /api/v1/provider/register
 * - POST /api/v1/provider/status
 * - POST /api/v1/provider/location
 * - GET  /api/v1/provider/jobs
 * - POST /api/v1/provider/jobs/{id}/respond
 * - POST /api/v1/provider/jobs/{id}/status
 */

import axios, { AxiosInstance } from 'axios';
import { auth } from '@/firebase';

// Backend base URL — configure per environment
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// Types matching backend schemas
export interface ProviderProfile {
  provider_id: string;
  name: string;
  phone: string;
  service: string;
  hourly_rate: number;
  experience_yrs: number;
  rating: number;
  is_verified: boolean;
  is_available: boolean;
  current_coordinates: { latitude: number; longitude: number };
  fcm_token?: string;
  updated_at: string;
  city?: string;
  address?: string;
}

export interface ProviderRegisterRequest {
  name: string;
  phone: string;
  service: string;
  hourly_rate: number;
  experience_yrs?: number;
  fcm_token?: string;
  city?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

export interface ProviderRegisterResponse {
  success: boolean;
  provider_id: string;
  profile: ProviderProfile;
  message: string;
}

export interface ProviderStatusRequest {
  is_available: boolean;
}

export interface ProviderStatusResponse {
  success: boolean;
  provider_id: string;
  is_available: boolean;
  updated_at: string;
}

export interface ProviderLocationUpdate {
  latitude: number;
  longitude: number;
  booking_id?: string;
}

export interface ProviderLocationResponse {
  success: boolean;
  provider_id: string;
  message: string;
}

export interface ProviderJob {
  booking_id: string;
  user_id: string;
  status: 'pending_acceptance' | 'accepted' | 'on_the_way' | 'arrived' | 'in_progress' | 'completed' | 'failed';
  service_type: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_coordinates: { latitude: number; longitude: number };
  location_description: string;
  requested_at: string;
  urgency: 'low' | 'medium' | 'high';
  total_estimated_cost: number;
  eta_minutes: number;
}

export interface ProviderJobsResponse {
  success: boolean;
  jobs: ProviderJob[];
  total: number;
}

export interface ProviderJobRespondResponse {
  success: boolean;
  booking_id: string;
  action: 'accept' | 'reject';
  status: string;
  message: string;
}

export interface ProviderJobStatusUpdateResponse {
  success: boolean;
  booking_id: string;
  status: string;
  updated_at: string;
}

export class APIError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

function handleAPIError(error: any, defaultMessage: string): never {
  const message =
    error.response?.data?.error ||
    error.response?.data?.detail ||
    error.message ||
    defaultMessage;
  const status = error.response?.status;
  throw new APIError(message, status);
}

/**
 * ProviderAPIService — Singleton instance for all provider API calls
 */
class ProviderAPIService {
  private axiosInstance: AxiosInstance;
  private providerId: string | null = null;

  constructor() {
    const normalizedBaseURL = API_BASE_URL.endsWith('/api/v1')
      ? API_BASE_URL
      : `${API_BASE_URL}/api/v1`;

    this.axiosInstance = axios.create({
      baseURL: normalizedBaseURL,
      timeout: 30000,
    });

    // Interceptor to add provider_id and Authorization headers to all requests
    this.axiosInstance.interceptors.request.use(async (config) => {
      if (this.providerId) {
        config.headers['X-Provider-ID'] = this.providerId;
        config.headers['X-Provider-Id'] = this.providerId;
        config.headers['provider-id'] = this.providerId;
        config.headers['provider_id'] = this.providerId;
      }
      try {
        const user = auth?.currentUser;
        if (user && typeof user.getIdToken === 'function') {
          const token = await user.getIdToken();
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (err) {
        console.warn('Failed to attach Firebase auth token:', err);
      }
      return config;
    });
  }

  /**
   * Fetch current provider profile using the Firebase Auth token
   */
  async getCurrentProviderProfile(): Promise<ProviderProfile> {
    try {
      const response = await this.axiosInstance.get<ProviderProfile>('/provider/me');
      if (response.data.provider_id) {
        this.setProviderId(response.data.provider_id);
      }
      return response.data;
    } catch (error: any) {
      handleAPIError(error, 'Failed to fetch provider profile');
    }
  }

  /**
   * Set the provider ID for subsequent requests
   */
  setProviderId(id: string) {
    this.providerId = id;
  }

  /**
   * Get current provider ID
   */
  getProviderId(): string | null {
    return this.providerId;
  }

  /**
   * Clear provider ID (on logout)
   */
  clearProviderId() {
    this.providerId = null;
  }

  /**
   * 1. POST /provider/register
   * Register a new service provider
   */
  async registerProvider(
    data: ProviderRegisterRequest
  ): Promise<ProviderRegisterResponse> {
    try {
      const response = await this.axiosInstance.post<ProviderRegisterResponse>(
        '/provider/register',
        data
      );
      if (response.data.provider_id) {
        this.setProviderId(response.data.provider_id);
      }
      return response.data;
    } catch (error: any) {
      handleAPIError(error, 'Provider registration failed');
    }
  }

  /**
   * Update provider profile details
   */
  async updateProfile(
    data: ProviderRegisterRequest
  ): Promise<ProviderProfile> {
    try {
      const response = await this.axiosInstance.put<ProviderProfile>(
        '/provider/profile',
        data
      );
      return response.data;
    } catch (error: any) {
      handleAPIError(error, 'Failed to update provider profile');
    }
  }

  /**
   * 1c. POST /provider/fcm-token
   * Register this device's push token so the backend can deliver job alerts.
   */
  async registerFcmToken(fcm_token: string): Promise<void> {
    try {
      await this.axiosInstance.post('/provider/fcm-token', { fcm_token });
    } catch (error: any) {
      handleAPIError(error, 'Failed to register device token');
    }
  }

  /**
   * 2. POST /provider/status
   * Toggle provider availability
   */
  async updateAvailability(
    is_available: boolean
  ): Promise<ProviderStatusResponse> {
    try {
      const response = await this.axiosInstance.post<ProviderStatusResponse>(
        '/provider/status',
        { is_available }
      );
      return response.data;
    } catch (error: any) {
      handleAPIError(error, 'Failed to update availability');
    }
  }

  /**
   * 3. POST /provider/location
   * Stream provider's current GPS coordinates
   * Called frequently (every 10-30 seconds) while provider is on the way
   */
  async updateLocation(
    latitude: number,
    longitude: number,
    booking_id?: string
  ): Promise<ProviderLocationResponse> {
    try {
      const response = await this.axiosInstance.post<ProviderLocationResponse>(
        '/provider/location',
        {
          latitude,
          longitude,
          booking_id,
        }
      );
      return response.data;
    } catch (error: any) {
      handleAPIError(error, 'Failed to update location');
    }
  }

  /**
   * 4. GET /provider/jobs
   * Retrieve all active/pending jobs assigned to the provider
   */
  async getAssignedJobs(): Promise<ProviderJobsResponse> {
    try {
      const response = await this.axiosInstance.get<ProviderJobsResponse>(
        '/provider/jobs'
      );
      return response.data;
    } catch (error: any) {
      handleAPIError(error, 'Failed to fetch jobs');
    }
  }

  /**
   * 5. POST /provider/jobs/{booking_id}/respond
   * Accept or reject a job offer
   */
  async respondToJob(
    booking_id: string,
    action: 'accept' | 'reject'
  ): Promise<ProviderJobRespondResponse> {
    try {
      const response = await this.axiosInstance.post<ProviderJobRespondResponse>(
        `/provider/jobs/${booking_id}/respond`,
        { action }
      );
      return response.data;
    } catch (error: any) {
      handleAPIError(error, `Failed to ${action} job`);
    }
  }

  /**
   * 6. POST /provider/jobs/{booking_id}/status
   * Update job status as provider works on it
   * status: 'on_the_way' | 'arrived' | 'in_progress' | 'completed'
   */
  async updateJobStatus(
    booking_id: string,
    status: 'on_the_way' | 'arrived' | 'in_progress' | 'completed'
  ): Promise<ProviderJobStatusUpdateResponse> {
    try {
      const response = await this.axiosInstance.post<ProviderJobStatusUpdateResponse>(
        `/provider/jobs/${booking_id}/status`,
        { status }
      );
      return response.data;
    } catch (error: any) {
      handleAPIError(error, 'Failed to update job status');
    }
  }

  /**
   * 7. Accept a pending broadcast job.
   * @deprecated Use respondToJob(booking_id, 'accept'). Kept as a thin alias
   * so all accepts flow through the single, race-safe /respond endpoint.
   */
  async acceptJob(booking_id: string): Promise<ProviderJobRespondResponse> {
    return this.respondToJob(booking_id, 'accept');
  }

  /**
   * 8. POST /{booking_id}/chat
   *
   * Send a negotiation chat message. The backend Pydantic model
   * (`ChatMessageRequest` in `backend/app/api/v1/bookings.py`) requires three
   * fields:
   *   - `sender`:      the caller's Firebase UID — the server validates this
   *                    against the bearer token in the Authorization header.
   *   - `text`:        the message body
   *   - `sender_type`: 'customer' | 'provider' | 'system'
   *
   * Missing the `sender` field returns HTTP 422 "Field required".
   */
  async sendChatMessage(
    booking_id: string,
    sender: string,
    text: string,
    sender_type: 'customer' | 'provider' | 'system' = 'provider'
  ): Promise<any> {
    if (!booking_id) {
      throw new APIError('Booking id is required to send a chat message.');
    }
    if (!sender) {
      throw new APIError('You must be signed in to send a chat message.');
    }
    if (!text || !text.trim()) {
      throw new APIError('Message text cannot be empty.');
    }

    try {
      const response = await this.axiosInstance.post(
        `/${booking_id}/chat`,
        { sender, sender_type, text: text.trim() }
      );
      return response.data;
    } catch (error: any) {
      handleAPIError(error, 'Failed to send chat message');
    }
  }

  /**
   * 9. POST /{booking_id}/confirm
   * Confirm the booking with negotiated timing
   */
  async confirmBooking(booking_id: string, scheduled_time: string): Promise<any> {
    try {
      const response = await this.axiosInstance.post(
        `/${booking_id}/confirm`,
        { scheduled_time }
      );
      return response.data;
    } catch (error: any) {
      handleAPIError(error, 'Failed to confirm booking');
    }
  }
}

export const providerAPI = new ProviderAPIService();
