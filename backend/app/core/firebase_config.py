"""
Firebase Admin SDK — centralised singleton.

Every miniservice (auth, bookings, chat, providers) talks to Firestore through
this module. Initialisation is lazy: the first call to ``get_db()`` verifies
connectivity with a lightweight ``test_connection/test`` document read.

If the SDK cannot initialise (no credentials file, network down, project
disabled, etc.) the function returns ``None`` and every miniservice falls
back to its in-memory mock store. This lets the app boot in dev mode
without any Firebase setup.
"""
from __future__ import annotations

import os
import logging
from typing import Optional

import firebase_admin
from firebase_admin import credentials, firestore

from app.core.config import settings

logger = logging.getLogger("kaameasy")

# ── Module-level singleton ────────────────────────────────────────────────────
_db: Optional[firestore.Client] = None
_initialised: bool = False


def _initialise() -> Optional[firestore.Client]:
    """Initialise the Firebase Admin SDK and return a Firestore client.

    Returns ``None`` if Firebase is unavailable. The caller must handle the
    ``None`` return gracefully (every miniservice keeps an in-memory mock
    store for exactly this case).
    """
    global _db, _initialised

    if _initialised:
        return _db

    cred_path = settings.FIREBASE_CREDENTIALS_JSON_PATH

    try:
        if firebase_admin._apps:
            client = firestore.client()
        elif os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            client = firestore.client()
            logger.info(
                "✅ Firebase initialised (project=%s)", cred.project_id
            )
        else:
            logger.warning(
                "Firebase credentials not found at '%s' — running in mock mode.",
                cred_path,
            )
            _initialised = True
            return None

        # Lightweight read to confirm we can talk to Firestore. If this
        # fails (revoked key, billing off, network blocked) we drop into
        # mock mode rather than crashing the app.
        try:
            client.collection("test_connection").document("test").get()
        except Exception as exc:
            logger.warning(
                "Firestore reachability check failed: %s — running in mock mode.",
                exc,
            )
            _db = None
            _initialised = True
            return None

        _db = client
        _initialised = True
        return _db

    except Exception as exc:
        logger.warning(
            "Firebase initialisation failed: %s — running in mock mode.", exc
        )
        _db = None
        _initialised = True
        return None


def get_db() -> Optional[firestore.Client]:
    """Return the Firestore client, initialising on first call."""
    if _initialised:
        return _db
    return _initialise()


def is_mock_mode() -> bool:
    """True if Firebase is not available — callers should use the mock store."""
    return get_db() is None


def reset_for_tests() -> None:
    """Test helper: forget the cached client. Never call in production."""
    global _db, _initialised
    _db = None
    _initialised = False
