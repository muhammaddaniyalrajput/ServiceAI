import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { auth } from '../firebase';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AnalyzeRequestPayload {
  user_id: string;
  text: string;
}

export interface FindProvidersPayload {
  booking_id: string;
  intent: Record<string, unknown>;
}

export interface BookServicePayload {
  booking_id: string;
  provider_id: string;
  intent: Record<string, unknown>;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_coordinates: { latitude: number; longitude: number };
  device_token: string | null;
}

/**
 * Chat message payload. The backend derives the sender UID from the Firebase
 * bearer token in the Authorization header (set by the request interceptor above)
 * — the client must NOT claim a UID it does not own. We only declare the
 * `sender_type` (which side of the chat is sending) and the `text`.
 */
export interface ChatMessagePayload {
  sender_type: 'customer' | 'provider' | 'system';
  text: string;
}

/** Pydantic field error shape returned by FastAPI 422 responses */
interface PydanticFieldError {
  loc: (string | number)[];
  msg: string;
  type: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Axios Instance
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000/api/v1';

console.log('[API] Base URL:', API_BASE_URL);

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Request Interceptor — attach Firebase Auth token
// ─────────────────────────────────────────────────────────────────────────────

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const user = auth?.currentUser;
      if (user && typeof user.getIdToken === 'function') {
        const token = await user.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.warn('[API] Failed to attach Firebase auth token:', error);
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ─────────────────────────────────────────────────────────────────────────────
// Response Interceptor — retry on network / 5xx only
// ─────────────────────────────────────────────────────────────────────────────

interface RetryConfig extends InternalAxiosRequestConfig {
  __retryCount?: number;
}

const MAX_RETRIES = 2;

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;
    if (!config) return Promise.reject(error);

    const status = error.response?.status;

    // ❌ Do NOT retry client errors (4xx) — they won't be fixed by retrying.
    // Specifically: 422 Validation errors will always fail again with the same payload.
    const isClientError = status !== undefined && status >= 400 && status < 500;
    if (isClientError) return Promise.reject(error);

    // ✅ Retry on network errors and 5xx server errors
    config.__retryCount = config.__retryCount ?? 0;
    if (config.__retryCount < MAX_RETRIES) {
      config.__retryCount += 1;
      const delayMs = Math.pow(2, config.__retryCount) * 1000; // 2s, 4s
      console.log(`[API] Retrying request (attempt ${config.__retryCount}/${MAX_RETRIES}) after ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return apiClient(config);
    }

    return Promise.reject(error);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Error Mapper — converts Axios errors to user-friendly Error objects
// ─────────────────────────────────────────────────────────────────────────────

function mapError(error: unknown): Error {
  if (!(error instanceof AxiosError)) {
    return new Error(error instanceof Error ? error.message : 'An unexpected error occurred.');
  }

  // Network error — no response received
  if (!error.response) {
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return new Error('Request timed out — please try again.');
    }
    return new Error('Network error — please check your connection and ensure the backend is running.');
  }

  const status = error.response.status;
  const data = error.response.data as Record<string, unknown> | undefined;

  switch (status) {
    case 400:
      return new Error(
        typeof data?.error === 'string' ? data.error : 'Bad request — please check your input.'
      );

    case 401:
      return new Error('Authentication failed — please restart the app.');

    case 404:
      return new Error('Service not found — the endpoint may be unavailable.');

    case 422: {
      // FastAPI returns validation errors in two possible shapes:
      // Shape A (Pydantic RequestValidationError): { detail: PydanticFieldError[] }
      // Shape B (custom handler):                  { error: string, details: [...] }
      const detail = data?.detail;
      const customError = data?.error;
      const customDetails = data?.details;

      if (Array.isArray(detail)) {
        // Extract the most relevant human-readable error from Pydantic errors
        const userMessage = (detail as PydanticFieldError[])
          .map((d) => {
            // Get the field name (skip 'body' wrapper, take the last meaningful part)
            const fieldParts = d.loc.filter((p) => p !== 'body');
            const field = fieldParts.length > 0
              ? String(fieldParts[fieldParts.length - 1])
              : 'input';
            const msg = d.msg
              .replace('String should have at least', 'Please enter at least')
              .replace('characters', 'characters for')
              .replace('Value error,', '');
            return `${msg} "${field}"`.trim();
          })
          .join('\n');
        return new Error(userMessage || 'Please check your input and try again.');
      }

      if (typeof customError === 'string') {
        // Custom validation_exception_handler response
        if (Array.isArray(customDetails)) {
          const msgs = (customDetails as Array<{ field: string; message: string }>)
            .map((d) => d.message)
            .join('\n');
          return new Error(msgs || customError);
        }
        return new Error(customError);
      }

      return new Error('Validation error — please check your input and try again.');
    }

    case 429:
      return new Error('Too many requests — please wait a moment and try again.');

    case 500:
      return new Error('The AI service encountered an error — please retry.');

    default: {
      const serverMsg = typeof data?.detail === 'string'
        ? data.detail
        : typeof data?.error === 'string'
          ? data.error
          : `Server error (${status})`;
      return new Error(serverMsg);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────────────────────

export async function analyzeRequest(userId: string, text: string) {
  try {
    const payload: AnalyzeRequestPayload = { user_id: userId, text };
    const response = await apiClient.post('/analyze-request', payload);
    return response.data;
  } catch (error) {
    throw mapError(error);
  }
}

export async function findProviders(bookingId: string, intent: Record<string, unknown>) {
  try {
    const payload: FindProvidersPayload = { booking_id: bookingId, intent };
    const response = await apiClient.post('/find-providers', payload);
    return response.data;
  } catch (error) {
    throw mapError(error);
  }
}

export async function bookService(
  bookingId: string,
  providerId: string,
  intent: Record<string, unknown>,
  customer: {
    name: string;
    phone: string;
    address: string;
    coordinates: { latitude: number; longitude: number };
  },
  deviceToken?: string,
) {
  try {
    const payload: BookServicePayload = {
      booking_id: bookingId,
      provider_id: providerId,
      intent,
      customer_name: customer.name,
      customer_phone: customer.phone,
      customer_address: customer.address,
      customer_coordinates: customer.coordinates,
      device_token: deviceToken ?? null,
    };
    const response = await apiClient.post('/book-service', payload);
    return response.data;
  } catch (error) {
    throw mapError(error);
  }
}

export async function getAgentLogs(bookingId: string) {
  try {
    const response = await apiClient.get(`/agent-logs/${bookingId}`);
    return response.data;
  } catch (error) {
    throw mapError(error);
  }
}

export async function getBookingTracking(bookingId: string) {
  try {
    const response = await apiClient.get(`/booking-tracking/${bookingId}`);
    return response.data;
  } catch (error) {
    throw mapError(error);
  }
}

/**
 * Send a chat message for a booking.
 *
 * The backend derives the sender UID from the Firebase bearer token in the
 * Authorization header. The body `sender_type` field identifies whether the
 * message originated from the customer, the provider, or the system.
 */
export async function sendChatMessage(
  bookingId: string,
  text: string,
  senderType: 'customer' | 'provider' | 'system' = 'customer',
) {
  try {
    const payload: ChatMessagePayload = { sender_type: senderType, text };
    const response = await apiClient.post(`/${bookingId}/chat`, payload);
    return response.data;
  } catch (error) {
    throw mapError(error);
  }
}

