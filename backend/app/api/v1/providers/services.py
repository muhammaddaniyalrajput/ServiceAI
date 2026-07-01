"""
Providers domain — service layer.

All Firestore reads/writes for the ``providers`` collection live here.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

from firebase_admin import firestore

from app.core.firebase_config import get_db
from app.core.mock_store import mock_providers
from app.core.time_utils import now_iso
from app.data.providers import MOCK_PROVIDERS

logger = logging.getLogger("kaameasy")


# ─────────────────────────────────────────────────────────────────────────────
# CRUD
# ─────────────────────────────────────────────────────────────────────────────

def create_provider(provider_data: Dict[str, Any]) -> str:
    """
    Register a new service provider. Generates a stable ``provider_id``
    in the ``PROV-XXXXXX`` format and persists both to the ``providers``
    collection and to the in-memory mock store (in mock mode).
    """
    provider_id = f"PROV-{uuid.uuid4().hex[:6].upper()}"
    now = now_iso()
    data = {
        "provider_id":   provider_id,
        "uid":           provider_data.get("uid"),
        "name":          provider_data.get("name"),
        "phone":         provider_data.get("phone"),
        "service":       provider_data.get("service"),
        "hourly_rate":   provider_data.get("hourly_rate"),
        "experience_yrs": provider_data.get("experience_yrs", 1),
        "rating":        4.5,
        "is_verified":   False,
        "is_available":  True,
        "city":          provider_data.get("city"),
        "address":       provider_data.get("address"),
        "latitude":      provider_data.get("latitude") or 0.0,
        "longitude":     provider_data.get("longitude") or 0.0,
        "current_coordinates": {
            "latitude":  provider_data.get("latitude") or 0.0,
            "longitude": provider_data.get("longitude") or 0.0,
        },
        "fcm_token":  provider_data.get("fcm_token"),
        "created_at": now,
        "updated_at": now,
    }

    db = get_db()
    if db:
        db.collection("providers").document(provider_id).set(data)
    else:
        mock_providers.append(data)
    return provider_id


def get_provider_by_id(provider_id: str) -> Optional[Dict[str, Any]]:
    db = get_db()
    if db:
        snap = db.collection("providers").document(provider_id).get()
        return snap.to_dict() if snap.exists else None
    for p in mock_providers:
        if p.get("provider_id") == provider_id:
            return p
    return None


def get_provider_by_uid(uid: str) -> Optional[Dict[str, Any]]:
    """Lookup a provider by the Firebase ``uid`` of the owning user."""
    db = get_db()
    if db:
        # Modern keyword-argument where()
        query = (
            db.collection("providers")
            .where(filter=firestore.FieldFilter("uid", "==", uid))
            .limit(1)
        )
        for snap in query.stream():
            return snap.to_dict()
        return None
    for p in mock_providers:
        if p.get("uid") == uid:
            return p
    return None


def get_all_providers() -> List[Dict[str, Any]]:
    db = get_db()
    if db:
        results = [d.to_dict() for d in db.collection("providers").stream()]
        if results:
            return results
        logger.warning("providers collection is empty — falling back to MOCK_PROVIDERS.")
    return [p.model_dump() for p in MOCK_PROVIDERS]


def update_provider_profile(provider_id: str, profile_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    updates: Dict[str, Any] = {
        "name":           profile_data.get("name"),
        "phone":          profile_data.get("phone"),
        "service":        profile_data.get("service"),
        "hourly_rate":    profile_data.get("hourly_rate"),
        "experience_yrs": profile_data.get("experience_yrs"),
        "city":           profile_data.get("city"),
        "address":        profile_data.get("address"),
        "updated_at":     now_iso(),
    }
    if "latitude" in profile_data:
        updates["latitude"] = profile_data.get("latitude")
    if "longitude" in profile_data:
        updates["longitude"] = profile_data.get("longitude")
    if "latitude" in profile_data or "longitude" in profile_data:
        updates["current_coordinates"] = {
            "latitude":  profile_data.get("latitude") or 0.0,
            "longitude": profile_data.get("longitude") or 0.0,
        }
    # Drop any explicit None so Firestore doesn't error
    updates = {k: v for k, v in updates.items() if v is not None}

    db = get_db()
    if db:
        db.collection("providers").document(provider_id).update(updates)
        return db.collection("providers").document(provider_id).get().to_dict()
    for p in mock_providers:
        if p.get("provider_id") == provider_id:
            p.update(updates)
            return p
    return None


def update_provider_availability(provider_id: str, is_available: bool) -> None:
    updates = {"is_available": is_available, "updated_at": now_iso()}
    db = get_db()
    if db:
        db.collection("providers").document(provider_id).update(updates)
    else:
        for p in mock_providers:
            if p.get("provider_id") == provider_id:
                p.update(updates)


def update_provider_location(
    provider_id: str,
    latitude: float,
    longitude: float,
    booking_id: Optional[str] = None,
) -> None:
    coordinates = {"latitude": latitude, "longitude": longitude}
    updates = {
        "current_coordinates": coordinates,
        "updated_at": now_iso(),
    }
    db = get_db()
    if db:
        db.collection("providers").document(provider_id).update(updates)
        if booking_id:
            db.collection("bookings").document(booking_id).update(
                {"provider_live_coordinates": coordinates}
            )
    else:
        for p in mock_providers:
            if p.get("provider_id") == provider_id:
                p.update(updates)
        if booking_id:
            from app.core.mock_store import mock_store
            if booking_id in mock_store:
                mock_store[booking_id]["provider_live_coordinates"] = coordinates


def get_registered_providers_by_service(
    service_type: str, city: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Fetch providers by service (and optional city), with city+availability filters."""
    db = get_db()
    if not db:
        results = [p for p in mock_providers if (p.get("service") or "").lower() == service_type.lower()]
        if city:
            results = [r for r in results if (r.get("city") or "").lower() == city.lower()]
        return results

    try:
        # Modern keyword-argument where()
        query = (
            db.collection("providers")
            .where(filter=firestore.FieldFilter("service", "==", service_type))
        )
        results = []
        for snap in query.stream():
            data = snap.to_dict() or {}
            if city:
                pc = (data.get("city") or "").lower().strip()
                target = city.lower().strip()
                if pc != target:
                    continue
            if data.get("is_available", True):
                results.append(data)
        return results
    except Exception as exc:
        logger.warning("Failed to query registered providers: %s", exc)
        return []


# ─────────────────────────────────────────────────────────────────────────────
# Performance aggregation (for the dashboard card)
# ─────────────────────────────────────────────────────────────────────────────

def get_provider_performance(provider_id: str) -> Dict[str, Any]:
    """
    Aggregate the metrics that show on the provider's home dashboard:
    total jobs, completed, in-progress, rating, earnings, response rate.
    """
    db = get_db()
    if not db:
        # Mock-mode fallback — return a plausible starter profile
        provider = get_provider_by_id(provider_id) or {}
        return {
            "provider_id":         provider_id,
            "total_jobs":          provider.get("total_jobs", 0),
            "completed_jobs":      provider.get("completed_jobs", 0),
            "in_progress_jobs":    0,
            "average_rating":      provider.get("rating", 4.5),
            "total_earnings_pkr":  provider.get("total_earnings", 0),
            "todays_earnings_pkr": 0,
            "response_rate_pct":   100.0,
            "updated_at":          now_iso(),
        }

    # Real Firestore aggregation
    # We do this client-side because Firestore doesn't support sum/avg.
    # For a small provider this is fine; for a very busy one we'd
    # maintain a denormalised counter in the provider doc instead.
    try:
        completed = 0
        in_progress = 0
        total = 0
        rating_sum = 0.0
        rating_count = 0
        earnings = 0
        todays = 0
        accepted = 0
        responded = 0

        from datetime import datetime, timezone
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        for snap in (
            db.collection("bookings")
            .where(filter=firestore.FieldFilter("provider_id", "==", provider_id))
            .stream()
        ):
            data = snap.to_dict() or {}
            total += 1
            status = data.get("status")
            if status == "completed":
                completed += 1
                cost = int(data.get("total_estimated_cost") or 0)
                earnings += cost
                # The booking timestamp is in created_at; today buckets
                # by an explicit completed_at field if it exists, else
                # fall back to created_at.
                stamp = data.get("completed_at") or data.get("created_at") or ""
                if stamp.startswith(today_str):
                    todays += cost
            elif status in ("in_progress", "on_the_way", "arrived", "accepted"):
                in_progress += 1

            rating = data.get("rating") or data.get("customer_rating")
            if isinstance(rating, (int, float)) and rating > 0:
                rating_sum += float(rating)
                rating_count += 1

            if status in ("accepted", "on_the_way", "arrived", "in_progress", "completed"):
                responded += 1
            if status != "pending":
                accepted += 1

        avg_rating = (rating_sum / rating_count) if rating_count else 0.0
        response_rate = (responded / accepted * 100.0) if accepted else 100.0

        return {
            "provider_id":         provider_id,
            "total_jobs":          total,
            "completed_jobs":      completed,
            "in_progress_jobs":    in_progress,
            "average_rating":      round(avg_rating, 2),
            "total_earnings_pkr":  earnings,
            "todays_earnings_pkr": todays,
            "response_rate_pct":   round(response_rate, 1),
            "updated_at":          now_iso(),
        }
    except Exception as exc:
        logger.warning("Failed to compute performance for provider %s: %s", provider_id, exc)
        return {
            "provider_id":         provider_id,
            "total_jobs":          0,
            "completed_jobs":      0,
            "in_progress_jobs":    0,
            "average_rating":      0.0,
            "total_earnings_pkr":  0,
            "todays_earnings_pkr": 0,
            "response_rate_pct":   0.0,
            "updated_at":          now_iso(),
        }
