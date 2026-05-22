"""
Firebase Auth dependency for FastAPI.

Usage in a route:
    from app.core.auth import get_verified_uid

    @router.post("/some-route")
    async def my_route(uid: str = Depends(get_verified_uid), ...):
        ...

Behaviour:
  - If Firebase is initialised (real mode):
      Reads the `Authorization: Bearer <token>` header.
      Calls firebase_admin.auth.verify_id_token() and returns the uid.
      Raises HTTP 401 if token is missing or invalid.
  - If Firebase is NOT initialised (mock / dev mode):
      Falls back gracefully — uses the Authorization header value as-is (or
      returns "dev_user" if no header present). This lets you develop without
      setting up a real auth token.
"""
import logging
from fastapi import Header, HTTPException, Depends
from typing import Optional
import firebase_admin
from firebase_admin import auth as firebase_auth

logger = logging.getLogger("serviceflow")


def get_verified_uid(authorization: Optional[str] = Header(None)) -> str:
    """
    FastAPI dependency that verifies a Firebase ID token.

    Returns the verified Firebase UID (str).
    In mock/dev mode returns 'dev_user' or the raw header value.
    """
    # ── Mock / dev mode (Firebase not initialised or Firestore disabled) ──
    from app.services.firebase_db import _get_db
    if _get_db() is None:
        if authorization:
            # Treat whatever was passed as the uid — useful for manual testing
            token = authorization.removeprefix("Bearer ").strip()
            logger.debug("Auth mock mode: using token value as uid='%s'", token[:12])
            return token or "dev_user"
        logger.debug("Auth mock mode: no Authorization header — returning 'dev_user'.")
        return "dev_user"

    # ── Real Firebase mode ────────────────────────────────────────────────────
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Authorization header missing. Expected: 'Bearer <firebase_id_token>'",
        )

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Bearer token is empty.")

    try:
        decoded = firebase_auth.verify_id_token(token)
        uid: str = decoded["uid"]
        logger.debug("Auth verified: uid='%s'", uid)
        return uid
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Firebase ID token has expired.")
    except firebase_auth.InvalidIdTokenError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid Firebase ID token: {exc}")
    except Exception as exc:
        logger.error("Unexpected auth error: %s", exc)
        raise HTTPException(status_code=500, detail=f"Auth error: {exc}")
