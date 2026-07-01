/**
 * Central type definitions for the React Navigation stack.
 * Use these param types in every screen to get full TypeScript safety.
 */

export type RootStackParamList = {
  /** Authentication entry — no params */
  Login: undefined;

  /** Sign-up — no params */
  Signup: undefined;

  /**
   * Location/profile setup screen.
   * Receives the freshly-created user's minimal info so we can save it to Firestore.
   */
  LocationProfile: {
    uid: string;
    name: string;
    email: string;
    phone: string;
  };

  /** Main tab container */
  MainTabs: undefined;

  /** Provider search results */
  Providers: {
    intentResult: any;
    bookingId: string;
  };

  /** Post-booking confirmation */
  BookingSuccess: {
    confirmation: any;
  };

  /** Real-time provider tracking map */
  LiveTracking: {
    bookingId: string;
    providerCoordinates: { latitude: number; longitude: number };
    userCoordinates: { latitude: number; longitude: number };
    providerName: string;
  };

  /** Real-time provider chat negotiation */
  Chat: {
    bookingId: string;
    providerName: string;
  };

  /** Email Verification Screen */
  EmailVerification: undefined;
};

/** Bottom tab navigator param list */
export type MainTabParamList = {
  Home:           undefined;
  BookingHistory: undefined;
  ChatInbox:      undefined;
  Profile:        undefined;
};
