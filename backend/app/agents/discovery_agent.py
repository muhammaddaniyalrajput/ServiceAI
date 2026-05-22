"""
Provider Discovery Agent — Agent #2
Filters providers from Firestore (or mock data) based on extracted intent.
Attaches distance estimates for each provider.

Improvements:
  - Uses firebase_db.get_all_providers() with mock fallback
  - Expanded location coordinates (30+ Islamabad sectors)
  - Fuzzy service matching via normalize_service()
"""
import math
from typing import List
from app.core.logger import log_agent
from app.models.schemas import IntentOutput, Provider
from app.data.mock_providers import MOCK_PROVIDERS, normalize_service

# ── Approximate coordinates for known Islamabad/Rawalpindi areas ──────────────
LOCATION_COORDS = {
    # G-sectors
    "g-5":  (33.7113, 73.0588),
    "g-6":  (33.7100, 73.0490),
    "g-7":  (33.7045, 73.0350),
    "g-8":  (33.6999, 72.9933),
    "g-9":  (33.6960, 72.9877),
    "g-10": (33.6900, 72.9800),
    "g-11": (33.6838, 72.9755),
    "g-12": (33.6800, 72.9810),
    "g-13": (33.6762, 72.9856),
    "g-14": (33.6700, 72.9780),
    "g-15": (33.6640, 72.9700),
    # F-sectors
    "f-5":  (33.7230, 73.0580),
    "f-6":  (33.7200, 73.0520),
    "f-7":  (33.7202, 73.0565),
    "f-8":  (33.7127, 73.0481),
    "f-10": (33.7040, 73.0012),
    "f-11": (33.6950, 73.0100),
    # I-sectors
    "i-8":  (33.6612, 73.0345),
    "i-9":  (33.6580, 73.0450),
    "i-10": (33.6560, 73.0550),
    "i-11": (33.6520, 73.0650),
    "i-14": (33.6450, 73.0200),
    # H-sectors
    "h-8":  (33.6890, 73.0400),
    "h-9":  (33.6850, 73.0350),
    "h-10": (33.6810, 73.0300),
    "h-11": (33.6780, 73.0250),
    "h-13": (33.6740, 73.0150),
    # E-sectors
    "e-7":  (33.7290, 73.0630),
    "e-11": (33.7050, 73.0650),
    # D-sectors
    "d-12": (33.6980, 73.0700),
    # Named areas
    "blue area":   (33.7300, 73.0850),
    "bahria town":  (33.5200, 73.0900),
    "dha":          (33.5300, 73.1000),
    "dha phase 1":  (33.5350, 73.1050),
    "dha phase 2":  (33.5280, 73.1100),
    "rawalpindi":   (33.5651, 73.0169),
    "saddar":       (33.5970, 73.0470),
}

DEFAULT_COORDS = (33.6844, 73.0479)  # Islamabad center


def _parse_coords(location: str):
    """Extract coordinates from a location string. Handles various formats."""
    if not location or location.lower() in ("unknown", "not specified"):
        return DEFAULT_COORDS

    raw = location.lower().strip()
    # Strip common suffixes
    for suffix in [", islamabad", ",islamabad", " islamabad", ", pakistan"]:
        raw = raw.replace(suffix, "")
    raw = raw.strip()

    # Direct lookup
    if raw in LOCATION_COORDS:
        return LOCATION_COORDS[raw]

    # Try each key as substring
    for key, coords in LOCATION_COORDS.items():
        if key in raw or raw in key:
            return coords

    return DEFAULT_COORDS


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return round(R * 2 * math.asin(math.sqrt(a)), 2)


def _load_all_providers() -> List[Provider]:
    """Load providers from Firestore if available, else use mock data."""
    try:
        from app.services.firebase_db import get_all_providers
        raw = get_all_providers()
        if raw:
            return [Provider(**p) if isinstance(p, dict) else p for p in raw]
    except Exception:
        pass
    return list(MOCK_PROVIDERS)


def run_discovery_agent(booking_id: str, intent: IntentOutput) -> tuple[List[Provider], list]:
    """
    Returns (list[Provider], list[AgentLog])
    """
    logs = []

    logs.append(log_agent(
        booking_id=booking_id,
        agent="Provider Discovery Agent",
        action="Searching provider database",
        status="processing",
        reasoning=f"Looking for '{intent.service_type}' providers near '{intent.location}'.",
    ))

    canonical_service = normalize_service(intent.service_type)
    user_lat, user_lon = _parse_coords(intent.location)

    from app.services.google_maps import get_distance_km

    all_providers = _load_all_providers()

    matched: List[Provider] = []
    for p in all_providers:
        provider_service = normalize_service(p.service)
        if provider_service.lower() == canonical_service.lower():
            distance = get_distance_km(user_lat, user_lon, p.latitude, p.longitude)
            provider_copy = p.model_copy(update={"distance_km": distance})
            matched.append(provider_copy)

    if not matched:
        # Fallback: return all providers of any service in the same area, sorted by distance
        logs.append(log_agent(
            booking_id=booking_id,
            agent="Provider Discovery Agent",
            action="No exact match — widening search",
            status="processing",
            reasoning=f"No providers found for '{canonical_service}'. Returning nearest alternatives.",
        ))
        all_with_distance = [
            p.model_copy(update={"distance_km": get_distance_km(user_lat, user_lon, p.latitude, p.longitude)})
            for p in all_providers
        ]
        all_with_distance.sort(key=lambda p: p.distance_km or 999)
        matched = all_with_distance[:5]

    logs.append(log_agent(
        booking_id=booking_id,
        agent="Provider Discovery Agent",
        action="Discovery complete",
        status="success",
        reasoning=f"Found {len(matched)} provider(s) matching '{canonical_service}' near '{intent.location}'.",
        data={"count": len(matched), "service": canonical_service},
    ))

    return matched, logs
