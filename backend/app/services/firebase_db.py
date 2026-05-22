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

logger = logging.getLogger("serviceflow")

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
    from app.data.mock_providers import MOCK_PROVIDERS  # local import avoids circular

    db = _get_db()
    if db:
        docs = db.collection("providers").stream()
        results = [d.to_dict() for d in docs]
        if results:
            return results
        logger.warning("providers collection is empty — falling back to MOCK_PROVIDERS.")

    return [p.model_dump() for p in MOCK_PROVIDERS]
