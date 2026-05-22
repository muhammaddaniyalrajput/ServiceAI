import axios from 'axios';
import { auth } from '../firebase';

// Use the environment variable, fallback to localhost for safety
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';

console.log('[API] Base URL:', API_BASE_URL);

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30-second timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Firebase Auth Token request interceptor
apiClient.interceptors.request.use(async (config) => {
  try {
    const user = auth && auth.currentUser;
    if (user && typeof user.getIdToken === 'function') {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    console.warn("Failed to attach Firebase Auth token:", error);
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Retry interceptor for 5xx errors (max 2 retries with exponential backoff)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (!config) return Promise.reject(error);

    // Only retry on 5xx server errors or network errors (not 4xx)
    const status = error.response?.status;
    const isRetryable = !status || status >= 500;

    config.__retryCount = config.__retryCount || 0;
    if (isRetryable && config.__retryCount < 2) {
      config.__retryCount += 1;
      const delay = Math.pow(2, config.__retryCount) * 1000; // 2s, 4s
      console.log(`[API] Retrying request (attempt ${config.__retryCount}) after ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return apiClient(config);
    }

    return Promise.reject(error);
  }
);

// Error mapper to meet specific error message requirements
const mapError = (error: any): Error => {
  let message = 'Failed to communicate with backend';

  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    message = 'Request timed out — please try again.';
  } else if (error.response) {
    const status = error.response.status;
    if (status === 404) {
      message = 'Service not found';
    } else if (status === 422) {
      // Extract Pydantic validation details
      const detail = error.response.data?.detail || error.response.data?.error;
      if (Array.isArray(detail)) {
        message = detail.map((d: any) => `${d.loc?.join('.')}: ${d.msg}`).join('; ');
      } else {
        message = typeof detail === 'string' ? detail : 'Validation error — check your input.';
      }
    } else if (status === 429) {
      message = 'Too many requests — please wait a moment.';
    } else if (status === 500) {
      message = 'AI processing error — please retry';
    } else {
      message = error.response.data?.detail || error.response.data?.message || `Server error (${status})`;
    }
  } else if (error.request) {
    message = 'Network error — please check if backend is running.';
  } else {
    message = error.message || message;
  }

  return new Error(message);
};

export const analyzeRequest = async (userId: string, text: string) => {
  try {
    const response = await apiClient.post('/analyze-request', { user_id: userId, text });
    return response.data;
  } catch (error: any) {
    throw mapError(error);
  }
};

export const findProviders = async (bookingId: string, intent: any) => {
  try {
    const response = await apiClient.post('/find-providers', { booking_id: bookingId, intent });
    return response.data;
  } catch (error: any) {
    throw mapError(error);
  }
};

export const bookService = async (bookingId: string, providerId: string, intent: any, deviceToken?: string) => {
  try {
    const response = await apiClient.post('/book-service', {
      booking_id: bookingId,
      provider_id: providerId,
      intent,
      device_token: deviceToken || null,  // Always send the field so backend receives it
    });
    return response.data;
  } catch (error: any) {
    throw mapError(error);
  }
};

export const getAgentLogs = async (bookingId: string) => {
  try {
    const response = await apiClient.get(`/agent-logs/${bookingId}`);
    return response.data;
  } catch (error: any) {
    throw mapError(error);
  }
};
