"""
Firebase Firestore service layer.
Handles all DB reads/writes for:
  - bookings            (collection)
  - agent_logs          (top-level collection — dedicated trace store)
  - providers           (collection, seeded separately)
  - ranked_cache        (persisted inside bookings doc — survives restarts)

Falls back gracefully (mock mode) when no credentials are provided,
so the app can run without Firebase during local dev.
"""
import firebase_admin
from firebase_admin import credentials, firestore
from app.core.config import settings
from app.core.logger import log_agent as _log
import logging
import os
from typing import List, Optional

logger = logging.getLogger("kaameasy")

_db = None


def _get_db():
    global _db
    if _db is not None:
        return _db
    
    # Try initializing and verifying the connection
    if firebase_admin._apps:
        try:
            client = firestore.client()
            # Perform a lightweight document get to verify API authorization/status
            client.collection("test_connection").document("test").get()
            _db = client
            return _db
        except Exception as e:
            logger.warning("Firebase app exists but Firestore is unreachable or disabled: %s. Using mock mode.", e)
            _db = None
            return None

    cred_path = settings.FIREBASE_CREDENTIALS_JSON_PATH
    if os.path.exists(cred_path):
        try:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            client = firestore.client()
            # Perform a lightweight document get to verify API authorization/status
            client.collection("test_connection").document("test").get()
            _db = client
            logger.info("✅ Firebase initialized successfully (project: %s).", cred.project_id)
        except Exception as exc:
            logger.warning("Firebase initialization or API verification failed: %s — running in mock mode.", exc)
            _db = None
    else:
        logger.warning(
            "Firebase credentials not found at '%s' — running in mock mode.", cred_path
        )
    return _db


# ── In-memory fallback store (mock mode) ─────────────────────────────────────

_mock_store: dict = {}           # bookings
_mock_agent_logs: dict = {}      # agent_logs   { booking_id: [step, ...] }
_mock_providers: list = []       # providers


# ══════════════════════════════════════════════════════════════════════════════
# BOOKINGS
# ══════════════════════════════════════════════════════════════════════════════

def create_booking_doc(booking_id: str, user_id: str, text: str) -> None:
    db = _get_db()
    data = {
        "booking_id":       booking_id,
        "user_id":          user_id,
        "original_request": text,
        "status":           "pending_intent",
        "ranked_snapshot":  [],   # persisted provider cache
    }
    if db:
        db.collection("bookings").document(booking_id).set(data)
    else:
        _mock_store[booking_id] = data


def update_booking(booking_id: str, updates: dict) -> None:
    db = _get_db()
    if db:
        db.collection("bookings").document(booking_id).update(updates)
    elif booking_id in _mock_store:
        _mock_store[booking_id].update(updates)


def get_booking(booking_id: str) -> dict | None:
    db = _get_db()
    if db:
        doc = db.collection("bookings").document(booking_id).get()
        return doc.to_dict() if doc.exists else None
    return _mock_store.get(booking_id)


# ══════════════════════════════════════════════════════════════════════════════
# RANKED PROVIDER CACHE  (persisted in bookings doc — survives restarts)
# ══════════════════════════════════════════════════════════════════════════════

def save_ranked_providers(booking_id: str, ranked_list: list) -> None:
    """
    Serialise a list[RankedProvider] and store in the bookings document.
    Falls back to the in-memory mock store.
    """
    serialised = [r.model_dump() for r in ranked_list]
    db = _get_db()
    if db:
        db.collection("bookings").document(booking_id).update(
            {"ranked_snapshot": serialised}
        )
    else:
        if booking_id not in _mock_store:
            _mock_store[booking_id] = {}
        _mock_store[booking_id]["ranked_snapshot"] = serialised


def load_ranked_providers(booking_id: str) -> list:
    """
    Return the raw serialised ranked_snapshot list for a booking.
    The caller (bookings.py) is responsible for deserialising into RankedProvider objects.
    Returns [] if nothing stored yet.
    """
    db = _get_db()
    if db:
        doc = db.collection("bookings").document(booking_id).get()
        if doc.exists:
            return doc.to_dict().get("ranked_snapshot", [])
        return []
    return _mock_store.get(booking_id, {}).get("ranked_snapshot", [])


# ══════════════════════════════════════════════════════════════════════════════
# AGENT LOGS  (legacy subcollection — kept for backward compat)
# ══════════════════════════════════════════════════════════════════════════════

def save_agent_logs(booking_id: str, logs: list) -> None:
    db = _get_db()
    if db:
        col = db.collection("bookings").document(booking_id).collection("logs")
        for entry in logs:
            data = entry.model_dump() if hasattr(entry, "model_dump") else entry
            col.add(data)
    else:
        booking = _mock_store.setdefault(booking_id, {})
        booking.setdefault("logs", []).extend(
            [e.model_dump() if hasattr(e, "model_dump") else e for e in logs]
        )


def get_agent_logs(booking_id: str) -> list:
    db = _get_db()
    if db:
        docs = (
            db.collection("bookings")
            .document(booking_id)
            .collection("logs")
            .order_by("timestamp")
            .stream()
        )
        return [d.to_dict() for d in docs]
    return _mock_store.get(booking_id, {}).get("logs", [])


# ══════════════════════════════════════════════════════════════════════════════
# AGENT TRACE  (top-level agent_logs collection — the showcase feature)
# ══════════════════════════════════════════════════════════════════════════════
# Structure:
#   agent_logs/{booking_id}  →  { booking_id, steps: [ { agent, action, output/reasoning, timestamp }, ... ] }

def save_agent_trace(booking_id: str, steps: list) -> None:
    """
    Append a batch of agent steps to agent_logs/{booking_id}.
    Each step is a serialised AgentLog dict transformed into the clean trace shape:
      { agent, action, output (= data), reasoning, timestamp }
    """
    clean_steps = []
    for s in steps:
        raw = s.model_dump() if hasattr(s, "model_dump") else s
        clean_steps.append({
            "agent":     raw.get("agent", ""),
            "action":    raw.get("action", ""),
            "reasoning": raw.get("reasoning", ""),
            "output":    raw.get("data", {}),
            "status":    raw.get("status", ""),
            "timestamp": raw.get("timestamp", ""),
        })

    db = _get_db()
    if db:
        ref = db.collection("agent_logs").document(booking_id)
        # Use set with merge so the booking_id field is always present
        ref.set({"booking_id": booking_id}, merge=True)
        # ArrayUnion appends without duplicates
        ref.update({"steps": firestore.ArrayUnion(clean_steps)})
    else:
        trace = _mock_agent_logs.setdefault(booking_id, {"booking_id": booking_id, "steps": []})
        trace["steps"].extend(clean_steps)

    try:
        from app.api.v1.bookings import invalidate_agent_logs
        invalidate_agent_logs(booking_id)
    except Exception:
        pass


def get_agent_trace(booking_id: str) -> dict:
    """
    Return the full agent_logs document for a booking.
    Shape: { booking_id, steps: [ ... ] }
    """
    db = _get_db()
    if db:
        doc = db.collection("agent_logs").document(booking_id).get()
        if doc.exists:
            return doc.to_dict()
        return {"booking_id": booking_id, "steps": []}
    return _mock_agent_logs.get(booking_id, {"booking_id": booking_id, "steps": []})


# ══════════════════════════════════════════════════════════════════════════════
# PROVIDERS  (Firestore collection, seeded via seed_firestore.py)
# ══════════════════════════════════════════════════════════════════════════════

def get_all_providers() -> list:
    """
    Return all providers from Firestore providers collection.
    Falls back to MOCK_PROVIDERS if Firestore is unavailable or collection is empty.
    """
    from app.data.providers import MOCK_PROVIDERS  # local import avoids circular

    db = _get_db()
    if db:
        docs = db.collection("providers").stream()
        results = [d.to_dict() for d in docs]
        if results:
            return results
        logger.warning("providers collection is empty — falling back to MOCK_PROVIDERS.")

    return [p.model_dump() for p in MOCK_PROVIDERS]


# ══════════════════════════════════════════════════════════════════════════════
# USERS
# ══════════════════════════════════════════════════════════════════════════════

def get_user_profile(user_id: str) -> Optional[dict]:
    """
    Fetch user profile document from Firestore 'users' collection.
    Returns None if the document does not exist or Firestore is in mock mode.
    """
    db = _get_db()
    if db:
        try:
            doc_ref = db.collection("users").document(user_id).get()
            return doc_ref.to_dict() if doc_ref.exists else None
        except Exception as e:
            logger.warning("Failed to fetch user profile for user %s: %s", user_id, e)
            return None
    return None


# ══════════════════════════════════════════════════════════════════════════════
# PROVIDER LIVE TRACKING  (real-time coordinate streaming for simulation)
# ══════════════════════════════════════════════════════════════════════════════

def update_provider_coordinates(booking_id: str, lat: float, lng: float) -> None:
    """
    Write the provider's current simulated GPS position into the booking document.
    The mobile client listens to this field via Firestore onSnapshot.
    """
    update = {
        "provider_live_coordinates": {"latitude": lat, "longitude": lng},
    }
    db = _get_db()
    if db:
        db.collection("bookings").document(booking_id).update(update)
    elif booking_id in _mock_store:
        _mock_store[booking_id].update(update)


def get_booking_tracking(booking_id: str) -> dict:
    """
    Return tracking-relevant fields for a booking: status, coordinates, and ETA.
    Used by the /booking-tracking/{booking_id} polling endpoint.
    """
    data = get_booking(booking_id)
    if not data:
        return {}
    return {
        "booking_id": booking_id,
        "status": data.get("status", "confirmed"),
        "provider_live_coordinates": data.get("provider_live_coordinates"),
        "user_coordinates": data.get("user_coordinates"),
        "eta_minutes": data.get("booking", {}).get("eta_minutes") if isinstance(data.get("booking"), dict) else None,
        "provider_name": data.get("booking", {}).get("provider", {}).get("name") if isinstance(data.get("booking"), dict) else None,
    }


# ══════════════════════════════════════════════════════════════════════════════
# PROVIDER OPERATIONS  (for the new provider mobile app)
# ══════════════════════════════════════════════════════════════════════════════

def create_provider(provider_data: dict) -> str:
    """
    Register a new service provider.
    Generates a unique provider_id (PROV-XXXXXX format).
    Returns the provider_id.
    """
    import uuid
    from datetime import datetime, timezone
    
    provider_id = f"PROV-{uuid.uuid4().hex[:6].upper()}"
    _now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    data = {
        "provider_id": provider_id,
        "uid": provider_data.get("uid"),
        "name": provider_data.get("name"),
        "phone": provider_data.get("phone"),
        "service": provider_data.get("service"),
        "hourly_rate": provider_data.get("hourly_rate"),
        "experience_yrs": provider_data.get("experience_yrs", 1),
        "rating": 4.5,  # Default new provider rating
        "is_verified": False,
        "is_available": True,
        "city": provider_data.get("city"),
        "address": provider_data.get("address"),
        "latitude": provider_data.get("latitude") or 0.0,
        "longitude": provider_data.get("longitude") or 0.0,
        "current_coordinates": {
            "latitude": provider_data.get("latitude") or 0.0,
            "longitude": provider_data.get("longitude") or 0.0
        },
        "fcm_token": provider_data.get("fcm_token"),
        "created_at": _now,
        "updated_at": _now,
    }
    
    db = _get_db()
    if db:
        db.collection("providers").document(provider_id).set(data)
    else:
        _mock_providers.append(data)
    
    return provider_id


def get_provider_by_id(provider_id: str) -> Optional[dict]:
    """
    Fetch a provider profile by provider_id.
    """
    db = _get_db()
    if db:
        doc = db.collection("providers").document(provider_id).get()
        return doc.to_dict() if doc.exists else None
    
    for p in _mock_providers:
        if p.get("provider_id") == provider_id:
            return p
    return None


def update_provider_profile(provider_id: str, profile_data: dict) -> Optional[dict]:
    """
    Update a provider's profile data (name, phone, service, hourly_rate, experience_yrs).
    """
    from datetime import datetime, timezone
    
    updates = {
        "name": profile_data.get("name"),
        "phone": profile_data.get("phone"),
        "service": profile_data.get("service"),
        "hourly_rate": profile_data.get("hourly_rate"),
        "experience_yrs": profile_data.get("experience_yrs"),
        "city": profile_data.get("city"),
        "address": profile_data.get("address"),
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    
    if "latitude" in profile_data:
        updates["latitude"] = profile_data.get("latitude")
    if "longitude" in profile_data:
        updates["longitude"] = profile_data.get("longitude")
        
    if "latitude" in profile_data or "longitude" in profile_data:
        updates["current_coordinates"] = {
            "latitude": profile_data.get("latitude") or 0.0,
            "longitude": profile_data.get("longitude") or 0.0
        }
        
    # Remove None values
    updates = {k: v for k, v in updates.items() if v is not None}
    
    db = _get_db()
    if db:
        db.collection("providers").document(provider_id).update(updates)
        return db.collection("providers").document(provider_id).get().to_dict()
    else:
        for p in _mock_providers:
            if p.get("provider_id") == provider_id:
                p.update(updates)
                return p
    return None


def update_provider_availability(provider_id: str, is_available: bool) -> None:
    """
    Toggle provider's availability status.
    """
    from datetime import datetime, timezone
    
    updates = {
        "is_available": is_available,
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    
    db = _get_db()
    if db:
        db.collection("providers").document(provider_id).update(updates)
    else:
        for p in _mock_providers:
            if p.get("provider_id") == provider_id:
                p.update(updates)


def update_provider_location(provider_id: str, latitude: float, longitude: float, booking_id: Optional[str] = None) -> None:
    """
    Stream provider's current GPS coordinates.
    Also updates coordinates in the active booking's provider_live_coordinates if booking_id provided.
    """
    from datetime import datetime, timezone
    
    coordinates = {"latitude": latitude, "longitude": longitude}
    updates = {
        "current_coordinates": coordinates,
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    
    db = _get_db()
    if db:
        db.collection("providers").document(provider_id).update(updates)
        
        # Also update the booking's live coordinates if booking_id provided
        if booking_id:
            db.collection("bookings").document(booking_id).update(
                {"provider_live_coordinates": coordinates}
            )
    else:
        for p in _mock_providers:
            if p.get("provider_id") == provider_id:
                p.update(updates)
        
        if booking_id and booking_id in _mock_store:
            _mock_store[booking_id]["provider_live_coordinates"] = coordinates


def get_registered_providers_by_service(service_type: str, city: str = None) -> list:
    """
    Fetch all registered providers from Firestore whose service matches
    the requested service_type. Optionally filter by city.
    Returns a list of provider dicts (Firestore documents).
    """
    db = _get_db()
    if not db:
        # Mock fallback — return any _mock_providers matching service
        results = [p for p in _mock_providers if p.get("service", "").lower() == service_type.lower()]
        if city:
            results = [p for p in results if (p.get("city") or "").lower() == city.lower()]
        return results

    try:
        # Query by service field
        providers_ref = db.collection("providers")
        query = providers_ref.where("service", "==", service_type)

        docs = query.stream()
        results = []
        for doc in docs:
            data = doc.to_dict()
            if not data:
                continue
            # If city filter is requested, match case-insensitively
            if city:
                provider_city = (data.get("city") or "").lower().strip()
                target_city = city.lower().strip()
                if provider_city != target_city:
                    continue
            # Only include providers that are available
            if data.get("is_available", True):
                results.append(data)
        return results
    except Exception as e:
        import logging
        logging.getLogger("kaameasy").warning("Failed to query registered providers: %s", e)
        return []


def get_provider_assigned_jobs(provider_id: str) -> list:
    """
    Get all jobs visible to a provider.
    Includes:
    1. Broadcast jobs: status == 'pending' AND service/city match the provider.
    2. Assigned jobs: status in ['accepted', 'confirmed', 'on_the_way', 'arrived', 'in_progress'] AND provider_id == provider_id.
    """
    db = _get_db()
    
    # 1. Get provider details
    provider = get_provider_by_id(provider_id)
    if not provider:
        return []
        
    provider_service = (provider.get("service") or "").lower().strip()
    provider_city = (provider.get("city") or "").lower().strip()
    
    all_jobs = []
    
    if db:
        # Get pending broadcast jobs
        pending_docs = db.collection("bookings").where("status", "==", "pending").stream()
        for doc in pending_docs:
            job = doc.to_dict()
            job_intent = job.get("extracted_intent") or job.get("intent") or {}
                
            job_service = (job_intent.get("service_type") or "").lower().strip()
            # Basic matching (can be improved with canonical normalization)
            if provider_service and provider_service in job_service or job_service in provider_service:
                # City check: if provider has a city, job location must contain it
                if provider_city:
                    job_loc = (job_intent.get("location") or "").lower().strip()
                    if provider_city in job_loc:
                        all_jobs.append(job)
                else:
                    all_jobs.append(job)
                    
        # Get explicitly assigned active jobs
        active_statuses = ["accepted", "confirmed", "on_the_way", "arrived", "in_progress"]
        assigned_docs = db.collection("bookings").where("provider_id", "==", provider_id).stream()
        for doc in assigned_docs:
            job = doc.to_dict()
            if job.get("status") in active_statuses:
                # Avoid duplicates just in case
                if not any(j.get("booking_id") == job.get("booking_id") for j in all_jobs):
                    all_jobs.append(job)
    else:
        # Mock behavior
        for b in _mock_store.values():
            if b.get("status") == "pending":
                job_intent = b.get("extracted_intent") or b.get("intent") or {}
                job_service = (job_intent.get("service_type") or "").lower().strip()
                if provider_service and provider_service in job_service or job_service in provider_service:
                    all_jobs.append(b)
            elif b.get("provider_id") == provider_id and b.get("status") in ["accepted", "confirmed", "on_the_way", "arrived", "in_progress"]:
                if not any(j.get("booking_id") == b.get("booking_id") for j in all_jobs):
                    all_jobs.append(b)
                    
    return all_jobs


def respond_to_job(booking_id: str, action: str, provider_id: str = None) -> Optional[dict]:
    """
    Provider accepts or rejects a job.
    action: 'accept' or 'reject'
    Updates booking status accordingly.
    Returns updated booking doc.
    """
    from datetime import datetime, timezone
    
    if action == "accept":
        status = "accepted"
    elif action == "reject":
        status = "failed"  # or "rejected" — use same as failed
    else:
        return None
    
    updates = {
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    if action == "accept" and provider_id:
        updates["provider_id"] = provider_id
    
    db = _get_db()
    if db:
        db.collection("bookings").document(booking_id).update(updates)
        return db.collection("bookings").document(booking_id).get().to_dict()
    else:
        if booking_id in _mock_store:
            _mock_store[booking_id].update(updates)
            return _mock_store[booking_id]
    
    return None


def add_chat_message(booking_id: str, sender: str, text: str) -> Optional[dict]:
    """
    Appends a message to the chat_messages array in the booking document.
    """
    from datetime import datetime, timezone
    import firebase_admin
    from firebase_admin import firestore
    
    _now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    msg = {
        "sender": sender,
        "text": text,
        "timestamp": _now,
    }
    
    db = _get_db()
    if db:
        booking_ref = db.collection("bookings").document(booking_id)
        booking_ref.update({
            "chat_messages": firestore.ArrayUnion([msg]),
            "updated_at": _now,
        })
        return booking_ref.get().to_dict()
    else:
        if booking_id in _mock_store:
            if "chat_messages" not in _mock_store[booking_id]:
                _mock_store[booking_id]["chat_messages"] = []
            _mock_store[booking_id]["chat_messages"].append(msg)
            return _mock_store[booking_id]
    return None


def update_job_status(booking_id: str, status: str) -> Optional[dict]:
    """
    Update a job's status.
    status: 'on_the_way' | 'arrived' | 'in_progress' | 'completed'
    """
    from datetime import datetime, timezone
    
    updates = {
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    
    db = _get_db()
    if db:
        db.collection("bookings").document(booking_id).update(updates)
        return db.collection("bookings").document(booking_id).get().to_dict()
    else:
        if booking_id in _mock_store:
            _mock_store[booking_id].update(updates)
            return _mock_store[booking_id]
    
    return None

