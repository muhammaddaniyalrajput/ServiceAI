"""
providers.py
============
Two responsibilities:
  1. MOCK_PROVIDERS / normalize_service() — static emergency fallback data
     (used ONLY if Google Places raises an exception mid-request).
  2. get_providers_from_google() — live Google Places lookup.
     PRIMARY data source. Raises RuntimeError if API key is not configured.
"""
import os
import random
import googlemaps
from typing import List, Dict, Any
from app.models.schemas import Provider
from dotenv import load_dotenv
load_dotenv()

# ── Google Maps client (lazy-initialised) ─────────────────────────────────────
_gmaps = None

def _get_gmaps() -> googlemaps.Client:
    """Return the Google Maps client. Raises RuntimeError if key is missing."""
    global _gmaps
    if _gmaps is None:
        key = os.getenv("GOOGLE_MAPS_API_KEY")
        if not key or key.startswith("YOUR"):
            raise RuntimeError(
                "GOOGLE_MAPS_API_KEY is not set. "
                "Add it to your .env file and restart the server."
            )
        _gmaps = googlemaps.Client(key=key)
        print("✅ Google Maps client initialised successfully.")
    return _gmaps


# ── Service normalisation ──────────────────────────────────────────────────────

SERVICE_ALIASES: Dict[str, str] = {
    # AC / HVAC
    "ac technician":    "AC Technician",
    "ac repair":        "AC Technician",
    "ac mechanic":      "AC Technician",
    "hvac":             "AC Technician",
    "air conditioning": "AC Technician",
    # Plumber
    "plumber":          "Plumber",
    "plumbing":         "Plumber",
    # Electrician
    "electrician":      "Electrician",
    "electric":         "Electrician",
    "electrical":       "Electrician",
    # Carpenter
    "carpenter":        "Carpenter",
    "carpentry":        "Carpenter",
    "furniture repair": "Carpenter",
    "mistri":           "Carpenter",
    "mistry":           "Carpenter",
    # Painter
    "painter":          "Painter",
    "painting":         "Painter",
    "rangsaz":          "Painter",
    "rangswaz":         "Painter",
    # Cleaner
    "cleaner":          "Cleaner",
    "cleaning":         "Cleaner",
    "deep clean":       "Cleaner",
    "house cleaner":    "Cleaner",
    "safai":            "Cleaner",
    "safai wala":       "Cleaner",
    # Plumber additional Urdu alias
    "plumbing wala":    "Plumber",
}

def normalize_service(raw: str) -> str:
    """Map a raw service string to a canonical category name."""
    key = raw.lower().strip()
    return SERVICE_ALIASES.get(key, raw.title())


# ── Static MOCK_PROVIDERS (canonical Provider objects) ────────────────────────
# These are used as:
#   • Fallback when Firestore is empty / unreachable
#   • Fallback when Google Places returns no results
# Field names MUST match app.models.schemas.Provider exactly.

MOCK_PROVIDERS: List[Provider] = [
    # ── AC Technicians ──────────────────────────────────────────────────────
    Provider(
        provider_id="prov_001",
        name="FastCool Tech",
        service="AC Technician",
        location="G-13, Islamabad",
        latitude=33.6762,
        longitude=72.9856,
        rating=4.5,
        hourly_rate=2400,
        experience_yrs=8,
        is_verified=True,
        availability=["Mon", "Tue", "Wed", "Thu", "Fri"],
    ),
    Provider(
        provider_id="prov_002",
        name="ProChill HVAC",
        service="AC Technician",
        location="G-11, Islamabad",
        latitude=33.6838,
        longitude=72.9755,
        rating=4.2,
        hourly_rate=2100,
        experience_yrs=5,
        is_verified=True,
        availability=["Mon", "Wed", "Fri", "Sat"],
    ),
    Provider(
        provider_id="prov_003",
        name="CoolBreeze Technicians",
        service="AC Technician",
        location="I-8, Islamabad",
        latitude=33.6612,
        longitude=73.0345,
        rating=3.9,
        hourly_rate=1800,
        experience_yrs=4,
        is_verified=False,
        availability=["Tue", "Thu", "Sat"],
    ),
    Provider(
        provider_id="prov_004",
        name="Ali AC Repair & Services",
        service="AC Technician",
        location="F-8, Islamabad",
        latitude=33.7127,
        longitude=73.0481,
        rating=4.0,
        hourly_rate=1500,
        experience_yrs=3,
        is_verified=False,
        availability=["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    ),
    # ── Plumbers ────────────────────────────────────────────────────────────
    Provider(
        provider_id="prov_005",
        name="AquaFix Plumbing",
        service="Plumber",
        location="G-9, Islamabad",
        latitude=33.6960,
        longitude=72.9877,
        rating=4.6,
        hourly_rate=1800,
        experience_yrs=10,
        is_verified=True,
        availability=["Mon", "Tue", "Wed", "Thu", "Fri"],
    ),
    Provider(
        provider_id="prov_006",
        name="PipeKing Services",
        service="Plumber",
        location="G-10, Islamabad",
        latitude=33.6900,
        longitude=72.9800,
        rating=4.1,
        hourly_rate=1600,
        experience_yrs=6,
        is_verified=True,
        availability=["Mon", "Wed", "Fri"],
    ),
    # ── Electricians ────────────────────────────────────────────────────────
    Provider(
        provider_id="prov_007",
        name="VoltMaster Electricals",
        service="Electrician",
        location="F-7, Islamabad",
        latitude=33.7202,
        longitude=73.0565,
        rating=4.7,
        hourly_rate=2000,
        experience_yrs=12,
        is_verified=True,
        availability=["Mon", "Tue", "Wed", "Thu", "Fri"],
    ),
    Provider(
        provider_id="prov_008",
        name="Spark Pro Electric",
        service="Electrician",
        location="H-13, Islamabad",
        latitude=33.6740,
        longitude=73.0150,
        rating=4.3,
        hourly_rate=1700,
        experience_yrs=7,
        is_verified=True,
        availability=["Mon", "Wed", "Thu", "Sat"],
    ),
    # ── Carpenters ──────────────────────────────────────────────────────────
    Provider(
        provider_id="prov_009",
        name="WoodCraft Masters",
        service="Carpenter",
        location="Blue Area, Islamabad",
        latitude=33.7300,
        longitude=73.0850,
        rating=4.4,
        hourly_rate=2200,
        experience_yrs=9,
        is_verified=True,
        availability=["Mon", "Tue", "Thu", "Fri"],
    ),
    # ── Cleaners ────────────────────────────────────────────────────────────
    Provider(
        provider_id="prov_010",
        name="SparkleClean Pro",
        service="Cleaner",
        location="G-14, Islamabad",
        latitude=33.6700,
        longitude=72.9780,
        rating=4.5,
        hourly_rate=1400,
        experience_yrs=5,
        is_verified=True,
        availability=["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    ),
]


# ── Google Places live-fetch (optional / enhancement) ─────────────────────────

def get_providers_from_google(service_type: str, location_text: str) -> List[Dict[str, Any]]:
    """
    Fetch real-time businesses from Google Places API.
    Returns a list of provider dicts matching the Provider schema.
    Raises RuntimeError if GOOGLE_MAPS_API_KEY is missing.
    Returns [] if Google finds no matching businesses (caller handles fallback).
    """
    client = _get_gmaps()   # raises RuntimeError if key is missing

    query = f"{service_type} near {location_text}"
    print(f"🔍 Google Places query: '{query}'")

    places_result = client.places(query=query)
    results = places_result.get("results", [])

    real_providers = []
    for i, place in enumerate(results[:5], start=1):
        place_id    = place.get("place_id", f"gmap_{i}")
        name        = place.get("name", "Unknown")
        rating      = float(place.get("rating", 4.0))
        num_ratings = place.get("user_ratings_total", 0)
        address     = place.get("formatted_address", location_text)
        lat         = place.get("geometry", {}).get("location", {}).get("lat", 33.6844)
        lng         = place.get("geometry", {}).get("location", {}).get("lng", 73.0479)

        # Google doesn't expose price or experience — derive realistic values
        mock_price      = random.choice([1200, 1500, 1800, 2200, 2500])
        mock_experience = random.randint(3, 10)
        is_verified     = rating >= 4.2 and num_ratings > 5

        real_providers.append({
            "provider_id":    place_id,
            "name":           name,
            "service":        normalize_service(service_type),
            "location":       address,
            "latitude":       lat,
            "longitude":      lng,
            "rating":         rating,
            "hourly_rate":    mock_price,
            "experience_yrs": mock_experience,
            "is_verified":    is_verified,
            "availability":   ["Mon", "Tue", "Wed", "Thu", "Fri"],
        })

    print(f"✅ Google Places returned {len(real_providers)} result(s) for '{query}'.")
    return real_providers


def get_mock_fallback_data() -> List[Dict[str, Any]]:
    """Return MOCK_PROVIDERS serialised as plain dicts (schema-compatible)."""
    return [p.model_dump() for p in MOCK_PROVIDERS]