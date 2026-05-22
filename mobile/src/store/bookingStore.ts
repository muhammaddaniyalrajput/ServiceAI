import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface IntentOutput {
  service_type: string;
  location: string;
  urgency: string;
  language: string;
  confidence: number;
  datetime_hint?: string;
}

export interface Provider {
  provider_id: string;
  name: string;
  service: string;
  location: string;
  latitude: number;
  longitude: number;
  rating: number;
  hourly_rate: number;
  availability: string[];
  experience_yrs: number;
  is_verified: boolean;
  distance_km?: number;
}

export interface RankedProvider {
  provider: Provider;
  score: number;
  score_reason: string;
}

export interface AgentTraceStep {
  agent: string;
  action: string;
  reasoning: string;
  output: any;
  status: 'processing' | 'success' | 'error' | 'skipped';
  timestamp: string;
}

interface BookingState {
  bookingId: string | null;
  intent: IntentOutput | null;
  rankedProviders: RankedProvider[];
  selectedProvider: Provider | null;
  bookingResult: any | null;
  agentLogs: AgentTraceStep[];
  fcmToken: string | null;
  status: 'idle' | 'analyzing' | 'finding' | 'booking' | 'confirmed' | 'error';
  error: string | null;
  
  // Actions
  setAnalysisResult: (bookingId: string, intent: IntentOutput) => void;
  setProviders: (providers: RankedProvider[]) => void;
  setSelectedProvider: (provider: Provider) => void;
  setBookingResult: (result: any) => void;
  setAgentLogs: (logs: AgentTraceStep[]) => void;
  setFcmToken: (token: string) => void;
  setStatus: (status: BookingState['status']) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useBookingStore = create<BookingState>()(
  immer((set) => ({
    bookingId: null,
    intent: null,
    rankedProviders: [],
    selectedProvider: null,
    bookingResult: null,
    agentLogs: [],
    fcmToken: null,
    status: 'idle',
    error: null,

    setAnalysisResult: (bookingId, intent) =>
      set((state) => {
        state.bookingId = bookingId;
        state.intent = intent;
        state.status = 'finding';
        state.error = null;
      }),

    setProviders: (providers) =>
      set((state) => {
        state.rankedProviders = providers;
        state.status = 'idle';
        state.error = null;
      }),

    setSelectedProvider: (provider) =>
      set((state) => {
        state.selectedProvider = provider;
      }),

    setBookingResult: (result) =>
      set((state) => {
        state.bookingResult = result;
        state.status = 'confirmed';
        state.error = null;
      }),

    setAgentLogs: (logs) =>
      set((state) => {
        // Prevent duplicate log steps based on timestamp, agent, and action
        const existingKeys = new Set(
          state.agentLogs.map((l) => `${l.agent}-${l.action}-${l.timestamp}`)
        );
        logs.forEach((log) => {
          const key = `${log.agent}-${log.action}-${log.timestamp}`;
          if (!existingKeys.has(key)) {
            state.agentLogs.push(log);
          }
        });
      }),

    setFcmToken: (token) =>
      set((state) => {
        state.fcmToken = token;
      }),

    setStatus: (status) =>
      set((state) => {
        state.status = status;
      }),

    setError: (error) =>
      set((state) => {
        state.error = error;
        state.status = 'error';
      }),

    reset: () =>
      set((state) => {
        state.bookingId = null;
        state.intent = null;
        state.rankedProviders = [];
        state.selectedProvider = null;
        state.bookingResult = null;
        state.agentLogs = [];
        // Preserve fcmToken across resets — it doesn't change per session
        state.status = 'idle';
        state.error = null;
      }),
  }))
);
