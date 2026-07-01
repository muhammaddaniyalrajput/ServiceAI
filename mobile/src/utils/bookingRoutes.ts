export interface BookingCoordinates {
  latitude: number;
  longitude: number;
}

export interface TrackingRouteParams {
  bookingId: string;
  providerName?: string;
  providerCoordinates?: BookingCoordinates | null;
  userCoordinates?: BookingCoordinates | null;
}

export function buildTrackingRouteParams({
  bookingId,
  providerName,
  providerCoordinates,
  userCoordinates,
}: TrackingRouteParams) {
  const safeProviderCoordinates = providerCoordinates ?? {
    latitude: 33.6844,
    longitude: 73.0479,
  };

  const safeUserCoordinates = userCoordinates ?? {
    latitude: safeProviderCoordinates.latitude + 0.015,
    longitude: safeProviderCoordinates.longitude + 0.012,
  };

  return {
    bookingId,
    providerName: providerName || 'Provider',
    providerCoordinates: safeProviderCoordinates,
    userCoordinates: safeUserCoordinates,
  };
}