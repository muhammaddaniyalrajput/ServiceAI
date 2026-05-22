"""
Mock provider dataset for hackathon demo.
In production this would come from Firestore.
Each provider covers a few areas in Islamabad / Rawalpindi.
"""
from app.models.schemas import Provider
from typing import List

MOCK_PROVIDERS: List[Provider] = [
    # ── AC Technicians ──────────────────────────────────────────────────
    Provider(
        provider_id="prov_001",
        name="Ali AC Repair & Services",
        service="AC Technician",
        location="G-13, Islamabad",
        latitude=33.6762,
        longitude=72.9856,
        rating=4.9,
        hourly_rate=1800,
        availability=["morning", "afternoon"],
        experience_yrs=8,
        is_verified=True,
    ),
    Provider(
        provider_id="prov_002",
        name="FastCool Tech",
        service="AC Technician",
        location="G-11, Islamabad",
        latitude=33.6838,
        longitude=72.9755,
        rating=4.4,
        hourly_rate=1200,
        availability=["morning", "evening"],
        experience_yrs=4,
        is_verified=True,
    ),
    Provider(
        provider_id="prov_003",
        name="CoolBreeze Technicians",
        service="AC Technician",
        location="I-8, Islamabad",
        latitude=33.6612,
        longitude=73.0345,
        rating=4.2,
        hourly_rate=1000,
        availability=["afternoon", "evening"],
        experience_yrs=3,
        is_verified=False,
    ),
    Provider(
        provider_id="prov_004",
        name="ProChill HVAC",
        service="AC Technician",
        location="F-8, Islamabad",
        latitude=33.7127,
        longitude=73.0481,
        rating=4.7,
        hourly_rate=2200,
        availability=["morning"],
        experience_yrs=10,
        is_verified=True,
    ),

    # ── Plumbers ─────────────────────────────────────────────────────────
    Provider(
        provider_id="prov_005",
        name="Ustad Jameel Plumbing",
        service="Plumber",
        location="G-13, Islamabad",
        latitude=33.6758,
        longitude=72.9860,
        rating=4.8,
        hourly_rate=1500,
        availability=["morning", "afternoon", "evening"],
        experience_yrs=12,
        is_verified=True,
    ),
    Provider(
        provider_id="prov_006",
        name="Rapid Fix Plumbers",
        service="Plumber",
        location="G-9, Islamabad",
        latitude=33.6960,
        longitude=72.9877,
        rating=4.3,
        hourly_rate=900,
        availability=["morning", "afternoon"],
        experience_yrs=5,
        is_verified=False,
    ),
    Provider(
        provider_id="prov_007",
        name="AquaPro Services",
        service="Plumber",
        location="F-10, Islamabad",
        latitude=33.7040,
        longitude=73.0012,
        rating=4.6,
        hourly_rate=1300,
        availability=["afternoon"],
        experience_yrs=7,
        is_verified=True,
    ),

    # ── Electricians ─────────────────────────────────────────────────────
    Provider(
        provider_id="prov_008",
        name="Bijli Wala Bhai",
        service="Electrician",
        location="G-13, Islamabad",
        latitude=33.6770,
        longitude=72.9845,
        rating=4.7,
        hourly_rate=1400,
        availability=["morning", "evening"],
        experience_yrs=9,
        is_verified=True,
    ),
    Provider(
        provider_id="prov_009",
        name="PowerLine Electric Co.",
        service="Electrician",
        location="I-10, Islamabad",
        latitude=33.6560,
        longitude=73.0550,
        rating=4.5,
        hourly_rate=1600,
        availability=["morning", "afternoon"],
        experience_yrs=6,
        is_verified=True,
    ),

    # ── Painters ─────────────────────────────────────────────────────────
    Provider(
        provider_id="prov_010",
        name="RangSaaz Pro",
        service="Painter",
        location="G-13, Islamabad",
        latitude=33.6751,
        longitude=72.9863,
        rating=4.5,
        hourly_rate=800,
        availability=["morning", "afternoon"],
        experience_yrs=5,
        is_verified=False,
    ),
    Provider(
        provider_id="prov_011",
        name="ColorCraft Painters",
        service="Painter",
        location="G-8, Islamabad",
        latitude=33.6999,
        longitude=72.9933,
        rating=4.8,
        hourly_rate=1100,
        availability=["morning"],
        experience_yrs=8,
        is_verified=True,
    ),

    # ── Carpenters ───────────────────────────────────────────────────────
    Provider(
        provider_id="prov_012",
        name="Master Carpenter Nadeem",
        service="Carpenter",
        location="G-13, Islamabad",
        latitude=33.6766,
        longitude=72.9854,
        rating=4.9,
        hourly_rate=1700,
        availability=["morning", "afternoon"],
        experience_yrs=15,
        is_verified=True,
    ),

    # ── Cleaners ─────────────────────────────────────────────────────────
    Provider(
        provider_id="prov_013",
        name="SparkClean Services",
        service="House Cleaner",
        location="G-13, Islamabad",
        latitude=33.6754,
        longitude=72.9858,
        rating=4.6,
        hourly_rate=600,
        availability=["morning", "afternoon", "evening"],
        experience_yrs=3,
        is_verified=True,
    ),
    Provider(
        provider_id="prov_014",
        name="CleanMate Islamabad",
        service="House Cleaner",
        location="F-7, Islamabad",
        latitude=33.7202,
        longitude=73.0565,
        rating=4.4,
        hourly_rate=550,
        availability=["morning"],
        experience_yrs=2,
        is_verified=False,
    ),
]


SERVICE_ALIASES = {
    # ── English variants ──
    "ac repair": "AC Technician",
    "ac service": "AC Technician",
    "ac maintenance": "AC Technician",
    "air conditioner": "AC Technician",
    "air conditioning": "AC Technician",
    "ac technician": "AC Technician",
    "hvac": "AC Technician",
    "plumbing": "Plumber",
    "plumber": "Plumber",
    "pipe": "Plumber",
    "pipe fitting": "Plumber",
    "water leak": "Plumber",
    "electrical": "Electrician",
    "electrician": "Electrician",
    "light": "Electrician",
    "wiring": "Electrician",
    "electric": "Electrician",
    "painting": "Painter",
    "painter": "Painter",
    "paint": "Painter",
    "wall painting": "Painter",
    "carpentry": "Carpenter",
    "carpenter": "Carpenter",
    "woodwork": "Carpenter",
    "furniture repair": "Carpenter",
    "cleaning": "House Cleaner",
    "cleaner": "House Cleaner",
    "house cleaning": "House Cleaner",
    "home cleaning": "House Cleaner",
    "deep cleaning": "House Cleaner",
    # ── Urdu / Roman Urdu ──
    "ac": "AC Technician",
    "ac wala": "AC Technician",
    "ac theek": "AC Technician",
    "naali": "Plumber",
    "pani wala": "Plumber",
    "plumbing wala": "Plumber",
    "nalkay wala": "Plumber",
    "bijli": "Electrician",
    "bijli wala": "Electrician",
    "rang": "Painter",
    "rangsaz": "Painter",
    "paint wala": "Painter",
    "safai": "House Cleaner",
    "safai wala": "House Cleaner",
    "ghar ki safai": "House Cleaner",
    "barhai": "Carpenter",
    "mistri": "Carpenter",
    "mistry": "Carpenter",
    "lakri wala": "Carpenter",
    "general service": "General Service",
}

# Canonical service names (used for reverse lookup)
_CANONICAL_SERVICES = set(SERVICE_ALIASES.values())


def normalize_service(raw: str) -> str:
    """Map raw extracted service string to a canonical service name.
    Uses exact match first, then substring matching for fuzzy resolution."""
    key = raw.lower().strip()

    # 1. Exact match
    if key in SERVICE_ALIASES:
        return SERVICE_ALIASES[key]

    # 2. Check if the raw value is already a canonical name
    titled = raw.strip().title()
    if titled in _CANONICAL_SERVICES:
        return titled

    # 3. Substring match — check if any alias key is contained in the raw text
    for alias_key, canonical in SERVICE_ALIASES.items():
        if alias_key in key or key in alias_key:
            return canonical

    # 4. Give up — return title-cased original
    return titled
