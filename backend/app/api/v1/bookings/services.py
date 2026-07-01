"""
Bookings domain — service layer.

All Firestore reads/writes for the ``bookings`` collection live here. The
HTTP layer (``router.py``) never talks to Firestore directly; it calls
into the functions in this module.

Key behaviours
--------------
* Every booking document records a server ``created_at`` (UTC ISO 8601).
* Customer profile fields are embedded under ``customer_details`` at
  creation time and re-joined on every retrieval — so the provider
  never sees ``None`` for ``name`` / ``phone`` / ``avatar``.
* The provider-side list query uses ``order_by("created_at",
  direction=firestore.Query.DESCENDING)`` so the inbox is always
  recent-first.
* Firestore ``where(...)`` calls always use keyword arguments (the
  modern style required by firebase-admin >= 6.5).
* When Firebase is unavailable, every function falls back to the
  in-memory ``mock_store`` so the dev server keeps working.
"""
from __future__ import annotations

import logging
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from firebase_admin import firestore

from app.core.firebase_config import get_db, is_mock_mode
from app.core.mock_store import mock_store
from app.core.time_utils import format_created_at, now_iso
from app.models.schemas import IntentOutput, RankedProvider, BookingStatus
from app.api.v1.bookings.schemas import (
    CustomerDetails,
    ProviderJob,
)

logger = logging.getLogger("kaameasy")


# ─────────────────────────────────────────────────────────────────────────────
# LRU cache for ranked provider lists (Stage 2 → Stage 3 hand-off)
# ─────────────────────────────────────────────────────────────────────────────

class LRUCacheWithTTL:
    """Thread-safe LRU + TTL cache. Used for ranked providers & agent logs."""

    def __init__(self, maxsize: int = 1000, ttl_seconds: int = 3600):
        self.maxsize = maxsize
        self.ttl_seconds = ttl_seconds
        self.cache: Dict[str, tuple] = {}
        self.lock = threading.Lock()

    def get(self, key):
        with self.lock:
            self._cleanup_unlocked()
            if key in self.cache:
                value, creation, expiry, _ = self.cache[key]
                if expiry > time.time():
                    self.cache[key] = (value, creation, expiry, time.time())
                    return value
                else:
                    del self.cache[key]
            return None

    def set(self, key, value):
        with self.lock:
            self._cleanup_unlocked()
            if len(self.cache) >= self.maxsize:
                lru_key = min(
                    self.cache.keys(),
                    key=lambda k: self.cache[k][3],
                )
                del self.cache[lru_key]
            now = time.time()
            self.cache[key] = (value, now, now + self.ttl_seconds, now)

    def invalidate(self, key):
        with self.lock:
            if key in self.cache:
                del self.cache[key]

    def _cleanup_unlocked(self):
        now = time.time()
        keys_to_remove = [
            k for k, v in self.cache.items()
            if v[2] < now or (now - v[1]) > 7200
        ]
        for k in keys_to_remove:
            del self.cache[k]


_ranked_cache = LRUCacheWithTTL(maxsize=1000, ttl_seconds=3600)
_agent_logs_cache = LRUCacheWithTTL(maxsize=1000, ttl_seconds=3)


def invalidate_agent_logs(booking_id: str) -> None:
    _agent_logs_cache.invalidate(booking_id)


def cache_ranked(booking_id: str, ranked: list) -> None:
    _ranked_cache.set(booking_id, ranked)


def get_cached_ranked(booking_id: str) -> list:
    cached = _ranked_cache.get(booking_id)
    if cached:
        return cached
    raw_list = load_ranked_providers(booking_id)
    if raw_list:
        restored = [RankedProvider(**item) for item in raw_list]
        _ranked_cache.set(booking_id, restored)
        return restored
    return []


# ─────────────────────────────────────────────────────────────────────────────
# User profile → Customer snapshot (Fix #1: backend-side join)
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_user_profile(uid: str) -> Dict[str, Any]:
    """Return the user's profile document, or an empty dict in mock mode."""
    db = get_db()
    if db:
        try:
            snap = db.collection("users").document(uid).get()
            return snap.to_dict() if snap.exists else {}
        except Exception as exc:
            logger.warning("Failed to fetch user profile for uid=%s: %s", uid, exc)
            return {}
    # In mock mode we just return the uid as a stand-in name; this lets
    # the dev server return *something* useful without crashing.
    return {"name": uid, "phone": "", "address": "", "city": ""}


def build_customer_details(
    uid: str,
    name: Optional[str] = None,
    phone: Optional[str] = None,
    address: Optional[str] = None,
    city: Optional[str] = None,
    avatar: Optional[str] = None,
) -> CustomerDetails:
    """
    Resolve the canonical CustomerDetails payload.

    Order of precedence:
      1. Explicit values passed in by the caller (most recent write wins).
      2. The user's profile document in the ``users`` collection.
      3. None — the field will be omitted from the booking document.
    """
    profile = _fetch_user_profile(uid) if uid else {}
    return CustomerDetails(
        name=name or profile.get("name") or profile.get("displayName"),
        phone=phone or profile.get("phone") or profile.get("phoneNumber"),
        address=address or profile.get("address"),
        city=city or profile.get("city"),
        avatar=avatar or profile.get("avatar") or profile.get("photoURL"),
        uid=uid,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Bookings CRUD
# ─────────────────────────────────────────────────────────────────────────────

def create_booking_doc(booking_id: str, user_id: str, text: str) -> None:
    """Create the bare booking document in the ``pending_intent`` state."""
    db = get_db()
    now = now_iso()
    data = {
        "booking_id":       booking_id,
        "user_id":          user_id,
        "original_request": text,
        "status":           "pending_intent",
        "ranked_snapshot":  [],
        "created_at":       now,    # Fix #2: every booking records this
        "updated_at":       now,
    }
    if db:
        db.collection("bookings").document(booking_id).set(data)
    else:
        mock_store[booking_id] = data


def update_booking(booking_id: str, updates: dict) -> None:
    """Merge ``updates`` into the booking document, always bumping updated_at."""
    if not isinstance(updates, dict):
        return
    updates = dict(updates)  # don't mutate caller's dict
    updates["updated_at"] = now_iso()
    db = get_db()
    if db:
        db.collection("bookings").document(booking_id).update(updates)
    elif booking_id in mock_store:
        mock_store[booking_id].update(updates)


def get_booking(booking_id: str) -> Optional[Dict[str, Any]]:
    """Return the raw booking document, or ``None`` if it doesn't exist."""
    db = get_db()
    if db:
        snap = db.collection("bookings").document(booking_id).get()
        return snap.to_dict() if snap.exists else None
    return mock_store.get(booking_id)


def get_booking_with_customer(booking_id: str) -> Optional[Dict[str, Any]]:
    """
    Return the booking document with ``customer_details`` always populated.

    Fix #1: if the doc doesn't have an embedded customer snapshot, the
    function transparently does a backend-side join against the ``users``
    collection so the provider never sees ``None`` for name / phone.
    """
    doc = get_booking(booking_id)
    if not doc:
        return None

    if not doc.get("customer_details"):
        # Legacy doc without an embedded snapshot — backfill on the fly.
        uid = doc.get("user_id")
        if uid:
            details = build_customer_details(uid)
            if details.name or details.phone:
                doc["customer_details"] = details.model_dump(exclude_none=True)

    return doc


# ─────────────────────────────────────────────────────────────────────────────
# Ranked provider persistence
# ─────────────────────────────────────────────────────────────────────────────

def save_ranked_providers(booking_id: str, ranked_list: list) -> None:
    serialised = [r.model_dump() if hasattr(r, "model_dump") else r for r in ranked_list]
    db = get_db()
    if db:
        db.collection("bookings").document(booking_id).update(
            {"ranked_snapshot": serialised, "updated_at": now_iso()}
        )
    else:
        if booking_id not in mock_store:
            mock_store[booking_id] = {}
        mock_store[booking_id]["ranked_snapshot"] = serialised
        mock_store[booking_id]["updated_at"] = now_iso()


def load_ranked_providers(booking_id: str) -> list:
    db = get_db()
    if db:
        snap = db.collection("bookings").document(booking_id).get()
        if snap.exists:
            return snap.to_dict().get("ranked_snapshot", [])
        return []
    return mock_store.get(booking_id, {}).get("ranked_snapshot", [])


# ─────────────────────────────────────────────────────────────────────────────
# Provider-side job list (Fix #2: recent-first + Fix #1: never-null customer)
# ─────────────────────────────────────────────────────────────────────────────

# Active statuses that are visible on a provider's dashboard
_ACTIVE_STATUSES = {
    BookingStatus.accepted.value,
    BookingStatus.confirmed.value,
    BookingStatus.on_the_way.value,
    BookingStatus.arrived.value,
    BookingStatus.in_progress.value,
    BookingStatus.pending.value,
    BookingStatus.pending_acceptance.value,
}


def _intent_dict(booking: Dict[str, Any]) -> Dict[str, Any]:
    return booking.get("extracted_intent") or booking.get("intent") or {}


def _customer_name(booking: Dict[str, Any]) -> str:
    """Resolve a non-empty display name, falling back through every field."""
    details = booking.get("customer_details") or {}
    for key in ("name",):
        val = details.get(key)
        if val:
            return val
    for key in ("customer_name", "user_name"):
        val = booking.get(key)
        if val:
            return val
    uid = booking.get("user_id")
    return uid or "Customer"


def _customer_phone(booking: Dict[str, Any]) -> str:
    details = booking.get("customer_details") or {}
    for key in ("phone",):
        val = details.get(key)
        if val:
            return val
    for key in ("customer_phone", "user_phone"):
        val = booking.get(key)
        if val:
            return val
    return "Not provided"


def _customer_address(booking: Dict[str, Any]) -> Optional[str]:
    details = booking.get("customer_details") or {}
    return (
        details.get("address")
        or booking.get("customer_address")
        or booking.get("user_address")
    )


def _customer_coordinates(booking: Dict[str, Any]) -> Dict[str, float]:
    for key in ("customer_coordinates", "user_coordinates"):
        coords = booking.get(key)
        if isinstance(coords, dict) and "latitude" in coords and "longitude" in coords:
            return {
                "latitude": float(coords.get("latitude", 0)),
                "longitude": float(coords.get("longitude", 0)),
            }
    return {"latitude": 0.0, "longitude": 0.0}


def _booking_to_provider_job(booking: Dict[str, Any]) -> ProviderJob:
    intent = _intent_dict(booking)
    booking_data = booking.get("booking") or {}
    provider_data = booking_data.get("provider") or booking.get("provider") or {}

    requested_at = (
        booking.get("requested_at")
        or booking.get("created_at")
        or now_iso()
    )

    return ProviderJob(
        booking_id=booking.get("booking_id", ""),
        user_id=booking.get("user_id", ""),
        status=BookingStatus(booking.get("status", BookingStatus.pending_intent.value)),
        service_type=intent.get("service_type", ""),
        customer_name=_customer_name(booking),
        customer_phone=_customer_phone(booking),
        customer_address=_customer_address(booking),
        customer_coordinates=_customer_coordinates(booking),
        location_description=intent.get("location", ""),
        requested_at=requested_at,
        requested_at_formatted=format_created_at(requested_at),
        urgency=intent.get("urgency", "medium"),
        total_estimated_cost=booking_data.get("total_estimated_cost", 0),
        eta_minutes=booking_data.get("eta_minutes", 0),
    )


def get_provider_assigned_jobs(provider_id: str) -> List[ProviderJob]:
    """
    Get all jobs visible to a provider.

    Includes:
      1. Broadcast jobs: status == 'pending' AND service/city match.
      2. Assigned jobs: status in [_ACTIVE_STATUSES] AND provider_id match.

    Sorted by ``created_at`` DESC (recent first), and the customer
    snapshot is guaranteed non-null via ``_customer_*`` resolvers.
    """
    provider = get_provider_by_id(provider_id) if provider_id else None
    if not provider:
        return []

    provider_service = (provider.get("service") or "").lower().strip()
    provider_city = (provider.get("city") or "").lower().strip()

    raw_jobs: List[Dict[str, Any]] = []
    db = get_db()

    if db:
        # ── Broadcast (pending) jobs ────────────────────────────────────────
        pending_docs = (
            db.collection("bookings")
            .where(filter=firestore.FieldFilter("status", "==", "pending"))
            .stream()
        )
        for snap in pending_docs:
            job = snap.to_dict() or {}
            intent = _intent_dict(job)
            job_service = (intent.get("service_type") or "").lower().strip()
            if not _services_match(provider_service, job_service):
                continue
            if not _city_matches(provider_city, intent.get("location") or ""):
                continue
            raw_jobs.append(job)

        # ── Explicitly assigned active jobs ────────────────────────────────
        assigned_docs = (
            db.collection("bookings")
            .where(filter=firestore.FieldFilter("provider_id", "==", provider_id))
            .stream()
        )
        for snap in assigned_docs:
            job = snap.to_dict() or {}
            if job.get("status") in _ACTIVE_STATUSES:
                # de-dupe
                if not any(j.get("booking_id") == job.get("booking_id") for j in raw_jobs):
                    raw_jobs.append(job)
    else:
        # ── Mock-mode fallback ──────────────────────────────────────────────
        for b in mock_store.values():
            if b.get("status") == "pending":
                intent = _intent_dict(b)
                job_service = (intent.get("service_type") or "").lower().strip()
                if _services_match(provider_service, job_service):
                    raw_jobs.append(b)
            elif b.get("provider_id") == provider_id and b.get("status") in _ACTIVE_STATUSES:
                if not any(j.get("booking_id") == b.get("booking_id") for j in raw_jobs):
                    raw_jobs.append(b)

    # ── Fix #2: recent-first sort ────────────────────────────────────────
    raw_jobs.sort(key=_created_at_key, reverse=True)

    return [_booking_to_provider_job(j) for j in raw_jobs]


def _services_match(provider_service: str, job_service: str) -> bool:
    if not provider_service:
        return True
    return provider_service in job_service or job_service in provider_service


def _city_matches(provider_city: str, job_location: str) -> bool:
    if not provider_city:
        return True
    return provider_city in (job_location or "").lower()


def _created_at_key(booking: Dict[str, Any]) -> str:
    """Sort key that always returns a string (empty string sorts last)."""
    return (
        booking.get("created_at")
        or booking.get("requested_at")
        or booking.get("updated_at")
        or ""
    )


# ─────────────────────────────────────────────────────────────────────────────
# Provider accept/reject + status progression
# ─────────────────────────────────────────────────────────────────────────────

def respond_to_job(booking_id: str, action: str, provider_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    if action == "accept":
        status = "accepted"
    elif action == "reject":
        status = "failed"
    else:
        return None

    updates: Dict[str, Any] = {"status": status, "updated_at": now_iso()}
    if action == "accept" and provider_id:
        updates["provider_id"] = provider_id

    db = get_db()
    updated_doc: Optional[Dict[str, Any]] = None
    if db:
        db.collection("bookings").document(booking_id).update(updates)
        updated_doc = db.collection("bookings").document(booking_id).get().to_dict()
    elif booking_id in mock_store:
        mock_store[booking_id].update(updates)
        updated_doc = mock_store[booking_id]

    # ── Feature: open the chat conversation on accept ────────────────────
    if action == "accept" and updated_doc:
        try:
            from app.api.v1.chat.services import initialise_conversation
            customer_id = updated_doc.get("user_id", "")
            intent = updated_doc.get("extracted_intent") or updated_doc.get("intent") or {}
            initialise_conversation(
                booking_id=booking_id,
                customer_id=customer_id,
                provider_id=provider_id or updated_doc.get("provider_id", ""),
                customer_name=(
                    (updated_doc.get("customer_details") or {}).get("name")
                    or updated_doc.get("customer_name")
                    or ""
                ),
                provider_name=(
                    (updated_doc.get("booking") or {}).get("provider", {}).get("name")
                    or (updated_doc.get("provider") or {}).get("name")
                    or ""
                ),
                service_type=intent.get("service_type", ""),
            )
        except Exception as exc:
            # Conversation creation is best-effort — don't fail the
            # accept if the chat layer is temporarily unavailable.
            logger.warning("Could not initialise conversation for %s: %s", booking_id, exc)

    return updated_doc


def update_job_status(booking_id: str, status: str) -> Optional[Dict[str, Any]]:
    updates = {"status": status, "updated_at": now_iso()}
    db = get_db()
    updated: Optional[Dict[str, Any]] = None
    if db:
        db.collection("bookings").document(booking_id).update(updates)
        updated = db.collection("bookings").document(booking_id).get().to_dict()
    elif booking_id in mock_store:
        mock_store[booking_id].update(updates)
        updated = mock_store[booking_id]

    # Archive the conversation when the job is terminal so it drops off
    # the customer's / provider's active-inbox listing.
    if status in ("completed", "failed", "cancelled", "rejected"):
        try:
            from app.api.v1.chat.services import archive_conversation
            archive_conversation(booking_id)
        except Exception as exc:
            logger.warning("Could not archive conversation for %s: %s", booking_id, exc)

    return updated


# ─────────────────────────────────────────────────────────────────────────────
# Confirm (post-negotiation)
# ─────────────────────────────────────────────────────────────────────────────

def confirm_booking(booking_id: str, scheduled_time: str) -> Optional[Dict[str, Any]]:
    updates = {
        "status":         "confirmed",
        "scheduled_time": scheduled_time,
        "updated_at":     now_iso(),
    }
    db = get_db()
    if db:
        db.collection("bookings").document(booking_id).update(updates)

        # Drop a system message in the chat subcollection
        db.collection("bookings").document(booking_id).collection("messages").add({
            "text":       f"Booking confirmed for {scheduled_time}.",
            "senderId":   "system",
            "senderType": "system",
            "createdAt":  firestore.SERVER_TIMESTAMP,
        })
        return db.collection("bookings").document(booking_id).get().to_dict()

    if booking_id in mock_store:
        mock_store[booking_id].update(updates)
        mock_store[booking_id].setdefault("messages", []).append({
            "text":       f"Booking confirmed for {scheduled_time}.",
            "senderId":   "system",
            "senderType": "system",
            "createdAt":  now_iso(),
        })
        return mock_store[booking_id]
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Live tracking
# ─────────────────────────────────────────────────────────────────────────────

def update_provider_coordinates(booking_id: str, lat: float, lng: float) -> None:
    update = {"provider_live_coordinates": {"latitude": lat, "longitude": lng}}
    db = get_db()
    if db:
        db.collection("bookings").document(booking_id).update(update)
    elif booking_id in mock_store:
        mock_store[booking_id].update(update)


def get_booking_tracking(booking_id: str) -> Dict[str, Any]:
    data = get_booking(booking_id)
    if not data:
        return {}
    booking_block = data.get("booking") if isinstance(data.get("booking"), dict) else {}
    return {
        "booking_id":               booking_id,
        "status":                   data.get("status", "confirmed"),
        "provider_live_coordinates": data.get("provider_live_coordinates"),
        "user_coordinates":         data.get("user_coordinates"),
        "eta_minutes":              booking_block.get("eta_minutes"),
        "provider_name":            booking_block.get("provider", {}).get("name"),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Provider profile (delegated; lives in the providers miniservice but the
# bookings router needs it for ownership checks)
# ─────────────────────────────────────────────────────────────────────────────

def get_provider_by_id(provider_id: str) -> Optional[Dict[str, Any]]:
    """Lookup a provider by its ``provider_id`` (PROV-XXXXXX)."""
    # Lazy import to avoid a hard dependency on the providers package at
    # module-load time. Same behaviour as before — fall through if the
    # package isn't importable for any reason.
    try:
        from app.api.v1.providers.services import get_provider_by_id as _get
    except Exception:
        _get = None

    if _get is not None:
        return _get(provider_id)

    # Inline fallback so the bookings domain works even if the providers
    # package isn't importable.
    from app.core.mock_store import mock_providers
    for p in mock_providers:
        if p.get("provider_id") == provider_id:
            return p
    db = get_db()
    if db:
        snap = db.collection("providers").document(provider_id).get()
        return snap.to_dict() if snap.exists else None
    return None
