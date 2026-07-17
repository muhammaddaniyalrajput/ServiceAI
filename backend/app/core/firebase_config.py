"""
Firebase Admin SDK — centralised singleton.

Every miniservice (auth, bookings, chat, providers) talks to Firestore through
this module. Initialisation is lazy: the first call to ``get_db()`` verifies
connectivity with a lightweight ``test_connection/test`` document read.

If the SDK cannot initialise (no credentials file, network down, project
disabled, etc.) the function returns ``None`` and every miniservice falls
back to its in-memory mock store. This lets the app boot in dev mode
without any Firebase setup.

Credential sources (tried in order)
-----------------------------------
1. ``FIREBASE_CREDENTIALS_JSON`` env var — the entire JSON document as a
   string. This is the recommended way to ship credentials to
   production (Render, Railway, App Platform, Kubernetes, etc.) where
   you can't easily upload a binary file.
2. ``FIREBASE_CREDENTIALS_JSON_PATH`` env var (default
   ``./firebase-admin.json``) — path to a JSON file on disk. Used for
   local dev.
3. Application Default Credentials (``firebase_admin._apps``) — the
   Firebase emulator / Google Cloud runtime, when neither of the above
   is set.
"""
from __future__ import annotations

import json
import os
import logging
import tempfile
from typing import Optional

import firebase_admin
from firebase_admin import credentials, firestore

from app.core.config import settings

logger = logging.getLogger("kaameasy")

# ── Module-level singleton ────────────────────────────────────────────────────
_db: Optional[firestore.Client] = None
_initialised: bool = False


def _load_credential():
    """
    Resolve a Firebase ``credentials.Certificate`` from one of:
      1. ``FIREBASE_CREDENTIALS_JSON`` env var (string of JSON)
      2. ``FIREBASE_CREDENTIALS_JSON_PATH`` file on disk
    Returns ``None`` if neither is available — caller falls back to ADC.
    """
    # 1. Inline JSON env var (production / cloud-native)
    inline_json = os.environ.get("FIREBASE_CREDENTIALS_JSON", "").strip()
    if inline_json:
        try:
            return credentials.Certificate(json.loads(inline_json))
        except json.JSONDecodeError as exc:
            logger.warning(
                "FIREBASE_CREDENTIALS_JSON is set but is not valid JSON: %s",
                exc,
            )
            return None

    # 2. Path to JSON file (local dev)
    cred_path = settings.FIREBASE_CREDENTIALS_JSON_PATH
    if os.path.exists(cred_path):
        return credentials.Certificate(cred_path)

    return None


def _initialise() -> Optional[firestore.Client]:
    """Initialise the Firebase Admin SDK and return a Firestore client.

    Returns ``None`` if Firebase is unavailable. The caller must handle the
    ``None`` return gracefully (every miniservice keeps an in-memory mock
    store for exactly this case).
    """
    global _db, _initialised

    if _initialised:
        return _db

    try:
        if firebase_admin._apps:
            # Application default credentials — typically the emulator.
            client = firestore.client()
            logger.info("✅ Firebase initialised via Application Default Credentials.")
        else:
            cred = _load_credential()
            if cred is None:
                logger.warning(
                    "Firebase credentials not configured (set "
                    "FIREBASE_CREDENTIALS_JSON or "
                    "FIREBASE_CREDENTIALS_JSON_PATH) — running in mock mode."
                )
                _initialised = True
                return None
            firebase_admin.initialize_app(cred)
            client = firestore.client()
            logger.info("✅ Firebase initialised (project=%s).", cred.project_id)

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
