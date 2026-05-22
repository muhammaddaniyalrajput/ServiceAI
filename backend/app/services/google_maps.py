"""
Google Maps service layer.

Provides:
  - get_distance_km() — driving distance between two coordinate pairs
  - geocode_location() — convert location string to (lat, lon) coordinates
  - get_eta_minutes() — estimated driving time in minutes

All functions fall back gracefully when USE_MOCK_MAPS=true or API errors occur.
"""
import math
import logging
import googlemaps
from app.core.config import settings

logger = logging.getLogger("serviceflow")

_gmaps_client = None

def _get_gmaps_client():
    global _gmaps_client
    if _gmaps_client is None:
        if settings.GOOGLE_MAPS_API_KEY:
            try:
                _gmaps_client = googlemaps.Client(key=settings.GOOGLE_MAPS_API_KEY)
                logger.info("Google Maps Client initialized successfully.")
            except Exception as e:
                logger.error(f"Failed to initialize Google Maps client: {e}")
        else:
            logger.warning("GOOGLE_MAPS_API_KEY is not configured.")
    return _gmaps_client


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Fallback Haversine formula to compute distance in km between coordinates."""
    R = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2 +
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
        math.sin(dlon / 2) ** 2
    )
    c = 2 * math.asin(math.sqrt(a))
    return round(R * c, 2)


def get_distance_km(origin_lat: float, origin_lon: float, dest_lat: float, dest_lon: float) -> float:
    """
    Get driving distance in kilometers between origin and destination.
    Falls back to straight-line haversine distance in mock mode or on error.
    """
    if not settings.USE_MOCK_MAPS:
        client = _get_gmaps_client()
        if client:
            try:
                matrix = client.distance_matrix(
                    origins=(origin_lat, origin_lon),
                    destinations=(dest_lat, dest_lon),
                    mode="driving"
                )
                if matrix and matrix.get("status") == "OK":
                    rows = matrix.get("rows", [])
                    if rows:
                        elements = rows[0].get("elements", [])
                        if elements and elements[0].get("status") == "OK":
                            distance_meters = elements[0]["distance"]["value"]
                            distance_km = round(distance_meters / 1000.0, 2)
                            logger.info(f"Google Maps Matrix: distance resolved as {distance_km} km")
                            return distance_km
            except Exception as e:
                logger.error(f"Google Maps API request error: {e}. Falling back to haversine.")
        else:
            logger.warning("Google Maps client not available. Falling back to haversine.")

    # Fallback to haversine
    return _haversine_km(origin_lat, origin_lon, dest_lat, dest_lon)


def geocode_location(location_str: str) -> tuple[float, float] | None:
    """
    Convert a location string (e.g., "G-13, Islamabad") to (lat, lon) coordinates.
    Returns None if geocoding fails or is in mock mode.
    """
    if settings.USE_MOCK_MAPS:
        return None

    client = _get_gmaps_client()
    if not client:
        return None

    try:
        results = client.geocode(location_str)
        if results:
            loc = results[0]["geometry"]["location"]
            lat, lon = loc["lat"], loc["lng"]
            logger.info(f"Geocoded '{location_str}' → ({lat}, {lon})")
            return (lat, lon)
    except Exception as e:
        logger.error(f"Geocoding error for '{location_str}': {e}")

    return None


def get_eta_minutes(
    origin_lat: float, origin_lon: float,
    dest_lat: float, dest_lon: float,
) -> int | None:
    """
    Get estimated driving time in minutes between origin and destination.
    Uses Google Maps Directions API. Returns None in mock mode or on error.
    """
    if settings.USE_MOCK_MAPS:
        # Simple estimate: 3 minutes per km (city driving)
        dist_km = _haversine_km(origin_lat, origin_lon, dest_lat, dest_lon)
        return max(5, round(dist_km * 3))

    client = _get_gmaps_client()
    if not client:
        return None

    try:
        directions = client.directions(
            origin=(origin_lat, origin_lon),
            destination=(dest_lat, dest_lon),
            mode="driving",
        )
        if directions:
            leg = directions[0]["legs"][0]
            duration_seconds = leg["duration"]["value"]
            eta_minutes = round(duration_seconds / 60)
            logger.info(f"Google Maps Directions: ETA = {eta_minutes} minutes")
            return eta_minutes
    except Exception as e:
        logger.error(f"Google Maps Directions error: {e}")

    return None
