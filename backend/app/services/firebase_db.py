"""
Firebase Firestore service layer.
Handles all DB reads/writes for bookings and agent logs.
Falls back gracefully (mock mode) when no credentials are provided,
so the app can run without Firebase during local dev.
"""
import firebase_admin
from firebase_admin import credentials, firestore
from app.core.config import settings
from app.core.logger import log_agent as _log
import logging
import os

logger = logging.getLogger("serviceflow")

_db = None

def _get_db():
    global _db
    if _db is not None:
        return _db
    if firebase_admin._apps:
        _db = firestore.client()
        return _db

    cred_path = settings.FIREBASE_CREDENTIALS_JSON_PATH
    if os.path.exists(cred_path):
        try:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            _db = firestore.client()
            logger.info("Firebase initialized successfully.")
        except Exception as exc:
            logger.warning("Firebase init failed: %s — running in mock mode.", exc)
    else:
        logger.warning("Firebase credentials not found at '%s' — running in mock mode.", cred_path)
    return _db


# ── In-memory fallback store (mock mode) ─────────────────────────────────────

_mock_store: dict = {}


# ── Public API ────────────────────────────────────────────────────────────────

def create_booking_doc(booking_id: str, user_id: str, text: str) -> None:
    db = _get_db()
    data = {
        "user_id": user_id,
        "original_request": text,
        "status": "pending_intent",
        "logs": [],
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


def save_agent_logs(booking_id: str, logs: list) -> None:
    db = _get_db()
    if db:
        col = db.collection("bookings").document(booking_id).collection("logs")
        for entry in logs:
            col.add(entry)
    else:
        booking = _mock_store.get(booking_id, {})
        existing = booking.get("logs", [])
        existing.extend(logs)
        booking["logs"] = existing
        _mock_store[booking_id] = booking


def get_agent_logs(booking_id: str) -> list:
    db = _get_db()
    if db:
        docs = db.collection("bookings").document(booking_id).collection("logs").order_by("timestamp").stream()
        return [d.to_dict() for d in docs]
    booking = _mock_store.get(booking_id, {})
    return booking.get("logs", [])
