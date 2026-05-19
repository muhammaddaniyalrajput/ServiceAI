import axios from 'axios';

// Use the environment variable, fallback to localhost for safety
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const analyzeRequest = async (userId: string, text: string) => {
  try {
    const response = await apiClient.post('/analyze-request', { user_id: userId, text });
    return response.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || error.message || 'Failed to analyze request');
  }
};

export const findProviders = async (bookingId: string, intent: any) => {
  try {
    const response = await apiClient.post('/find-providers', { booking_id: bookingId, intent });
    return response.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || error.message || 'Failed to find providers');
  }
};

export const bookService = async (bookingId: string, providerId: string, intent: any) => {
  try {
    const response = await apiClient.post('/book-service', { booking_id: bookingId, provider_id: providerId, intent });
    return response.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || error.message || 'Failed to book service');
  }
};
