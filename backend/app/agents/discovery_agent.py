"""
Provider Discovery Agent — Agent #2
Fetches real-time service providers from Google Places API based on
extracted intent (service type + location). Falls back to MOCK_PROVIDERS
if Google is unavailable or returns no results.
"""
import math
from typing import List
from app.core.logger import log_agent
from app.models.schemas import IntentOutput, Provider
from app.data.providers import MOCK_PROVIDERS, normalize_service, get_providers_from_google

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


def run_discovery_agent(booking_id: str, intent: IntentOutput) -> tuple[List[Provider], list]:
    """
    Returns (list[Provider], list[AgentLog]).
    Combines two data sources:
      1. Real registered providers from Firestore (matching service + city)
      2. Google Places API results
    Falls back to MOCK_PROVIDERS if both sources yield nothing.
    """
    logs = []
    from app.services.google_maps import get_distance_km
    from app.services import firebase_db as db

    canonical_service = normalize_service(intent.service_type)
    location_text = intent.location if intent.location.lower() not in ("unknown", "not specified", "") else "Islamabad"
    user_lat, user_lon = _parse_coords(intent.location)

    # ── Override with exact coordinates if saved in the booking document ──
    booking = db.get_booking(booking_id)
    if booking:
        user_coords = booking.get("user_coordinates")
        if isinstance(user_coords, dict):
            lat = user_coords.get("latitude")
            lon = user_coords.get("longitude")
            if lat is not None and lon is not None:
                user_lat, user_lon = lat, lon
                logs.append(log_agent(
                    booking_id=booking_id,
                    agent="Provider Discovery Agent",
                    action="Resolved exact GPS coordinates",
                    status="processing",
                    reasoning=f"Using saved coordinates ({user_lat:.6f}, {user_lon:.6f}) from user's profile for distance calculations.",
                ))

    # ── Extract city from location text for Firestore matching ────────────
    # Try to extract city name from location_text (e.g., "G-13, Islamabad" → "Islamabad")
    city_hint = None
    location_lower = location_text.lower().strip()
    known_cities = ["nawabshah", "karachi", "lahore", "islamabad", "rawalpindi",
                    "peshawar", "quetta", "multan", "faisalabad", "sialkot", "hyderabad"]
    for city in known_cities:
        if city in location_lower:
            city_hint = city.title()
            break

    # ══════════════════════════════════════════════════════════════════════
    # SOURCE 1: Real Registered Providers from Firestore
    # ══════════════════════════════════════════════════════════════════════
    registered_dicts = []
    try:
        # First try exact service + city match
        registered_raw = db.get_registered_providers_by_service(canonical_service, city=city_hint)

        # If no city match, try service-only (all cities)
        if not registered_raw and city_hint:
            registered_raw = db.get_registered_providers_by_service(canonical_service, city=None)

        if registered_raw:
            logs.append(log_agent(
                booking_id=booking_id,
                agent="Provider Discovery Agent",
                action="Found registered providers in database",
                status="processing",
                reasoning=f"Found {len(registered_raw)} registered provider(s) for '{canonical_service}'"
                          + (f" in {city_hint}" if city_hint else "") + " from Firestore.",
                data={"count": len(registered_raw), "source": "Firestore"},
            ))
            for rp in registered_raw:
                # Normalize Firestore provider doc to match Provider schema
                registered_dicts.append({
                    "provider_id":    rp.get("provider_id"),
                    "name":           rp.get("name", "Unknown"),
                    "service":        rp.get("service", canonical_service),
                    "location":       f"{rp.get('address', '')}, {rp.get('city', '')}".strip(", "),
                    "latitude":       rp.get("latitude") or rp.get("current_coordinates", {}).get("latitude", 0.0),
                    "longitude":      rp.get("longitude") or rp.get("current_coordinates", {}).get("longitude", 0.0),
                    "rating":         rp.get("rating", 4.5),
                    "hourly_rate":    rp.get("hourly_rate", 1500),
                    "experience_yrs": rp.get("experience_yrs", 1),
                    "is_verified":    rp.get("is_verified", False),
                    "availability":   ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
                    "city":           rp.get("city"),
                    "address":        rp.get("address"),
                })
    except Exception as e:
        import logging
        logging.getLogger("serviceflow").warning("Firestore registered provider lookup failed: %s", e)

    # ══════════════════════════════════════════════════════════════════════
    # SOURCE 2: Google Places API
    # ══════════════════════════════════════════════════════════════════════
    logs.append(log_agent(
        booking_id=booking_id,
        agent="Provider Discovery Agent",
        action="Querying Google Places API",
        status="processing",
        reasoning=f"Searching Google Places for '{canonical_service}' near '{location_text}'.",
    ))

    google_dicts = get_providers_from_google(canonical_service, location_text)

    # ══════════════════════════════════════════════════════════════════════
    # MERGE: Registered providers first, then Google Places results
    # ══════════════════════════════════════════════════════════════════════
    seen_ids = set()
    merged_dicts = []

    # Registered providers get priority (placed first)
    for d in registered_dicts:
        pid = d.get("provider_id")
        if pid and pid not in seen_ids:
            seen_ids.add(pid)
            merged_dicts.append(d)

    # Then Google Places results
    for d in google_dicts:
        pid = d.get("provider_id")
        if pid and pid not in seen_ids:
            seen_ids.add(pid)
            merged_dicts.append(d)

    source = "Firestore + Google Places API"
    if not registered_dicts and google_dicts:
        source = "Google Places API"
    elif registered_dicts and not google_dicts:
        source = "Firestore registered providers"

    # ── Fallback: MOCK_PROVIDERS ───────────────────────────────────────────────
    if not merged_dicts:
        logs.append(log_agent(
            booking_id=booking_id,
            agent="Provider Discovery Agent",
            action="No results from any source — using mock fallback",
            status="processing",
            reasoning="Neither Firestore nor Google Places returned results. Falling back to static mock providers.",
        ))
        merged_dicts = [p.model_dump() for p in MOCK_PROVIDERS
                     if normalize_service(p.service).lower() == canonical_service.lower()]
        source = "mock fallback"

    # ── Convert raw dicts → Provider objects + attach distances ───────────────
    matched: List[Provider] = []
    for raw in merged_dicts:
        try:
            p = Provider(**raw) if isinstance(raw, dict) else raw
            distance = get_distance_km(user_lat, user_lon, p.latitude, p.longitude)
            
            # Keep if within 50km, OR if it is a real registered provider (PROV-)
            if distance <= 50.0 or p.provider_id.startswith("PROV-"):
                matched.append(p.model_copy(update={"distance_km": distance}))
        except Exception as e:
            # Skip malformed entries without crashing the pipeline
            import logging
            logging.getLogger("serviceflow").warning("Skipping malformed provider entry: %s", e)

    if not matched:
        # Last resort: return closest mock providers of any service
        logs.append(log_agent(
            booking_id=booking_id,
            agent="Provider Discovery Agent",
            action="No match found — widening to nearest providers",
            status="processing",
            reasoning=f"No providers found within 50km for '{canonical_service}'. Returning nearest alternatives.",
        ))
        all_with_dist = [
            p.model_copy(update={"distance_km": get_distance_km(user_lat, user_lon, p.latitude, p.longitude)})
            for p in MOCK_PROVIDERS
        ]
        all_with_dist.sort(key=lambda p: p.distance_km or 999)
        matched = all_with_dist[:5]
        source = "mock fallback (widened)"

    logs.append(log_agent(
        booking_id=booking_id,
        agent="Provider Discovery Agent",
        action="Discovery complete",
        status="success",
        reasoning=f"Found {len(matched)} provider(s) for '{canonical_service}' near '{location_text}' via {source}.",
        data={"count": len(matched), "service": canonical_service, "source": source},
    ))

    return matched, logs
