"""
Provider Discovery Agent — Agent #2
Filters the mock (or Firestore) provider dataset based on extracted intent.
Attaches a haversine distance estimate for each provider.
"""
import math
from typing import List
from app.core.logger import log_agent
from app.models.schemas import IntentOutput, Provider
from app.data.mock_providers import MOCK_PROVIDERS, normalize_service

# ── Approximate coordinates for known Islamabad sectors ──────────────────────
LOCATION_COORDS = {
    "g-13": (33.6762, 72.9856),
    "g-11": (33.6838, 72.9755),
    "g-9":  (33.6960, 72.9877),
    "g-8":  (33.6999, 72.9933),
    "f-8":  (33.7127, 73.0481),
    "f-7":  (33.7202, 73.0565),
    "f-10": (33.7040, 73.0012),
    "i-8":  (33.6612, 73.0345),
    "i-10": (33.6560, 73.0550),
}

DEFAULT_COORDS = (33.6844, 73.0479)  # Islamabad center


def _parse_coords(location: str):
    key = location.lower().replace(",", "").replace("islamabad", "").strip()
    return LOCATION_COORDS.get(key, DEFAULT_COORDS)


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return round(R * 2 * math.asin(math.sqrt(a)), 2)


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

    matched: List[Provider] = []
    for p in MOCK_PROVIDERS:
        if normalize_service(p.service).lower() == canonical_service.lower():
            distance = _haversine_km(user_lat, user_lon, p.latitude, p.longitude)
            provider_copy = p.model_copy(update={"distance_km": distance})
            matched.append(provider_copy)

    if not matched:
        # Fallback: return all providers of any service in the same area
        logs.append(log_agent(
            booking_id=booking_id,
            agent="Provider Discovery Agent",
            action="No exact match — widening search",
            status="processing",
            reasoning=f"No providers found for '{canonical_service}'. Returning nearby alternatives.",
        ))
        matched = [
            p.model_copy(update={"distance_km": _haversine_km(user_lat, user_lon, p.latitude, p.longitude)})
            for p in MOCK_PROVIDERS
        ][:5]

    logs.append(log_agent(
        booking_id=booking_id,
        agent="Provider Discovery Agent",
        action="Discovery complete",
        status="success",
        reasoning=f"Found {len(matched)} provider(s) matching '{canonical_service}' near '{intent.location}'.",
        data={"count": len(matched), "service": canonical_service},
    ))

    return matched, logs
