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

logger = logging.getLogger("kaameasy")

# Firebase tokens can arrive a few seconds before the verifier's clock catches up.
FIREBASE_CLOCK_SKEW_SECONDS = 30


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
        decoded = firebase_auth.verify_id_token(
            token,
            clock_skew_seconds=FIREBASE_CLOCK_SKEW_SECONDS,
        )
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


def verify_provider_owner(
    provider_id: str = Header(..., description="Provider ID"),
    authorization: Optional[str] = Header(None),
) -> str:
    """
    FastAPI dependency for provider routes.

    Verifies the Firebase ID token AND that the authenticated user actually
    owns the `provider_id` passed in the header — preventing a client from
    spoofing another provider's id. Returns the verified provider_id.

    In mock/dev mode (Firebase/Firestore disabled) ownership is not enforced
    so local testing keeps working; the provider_id is returned as-is.
    """
    from app.services.firebase_db import _get_db, get_provider_by_id

    # ── Mock / dev mode — skip ownership enforcement ──────────────────────────
    if _get_db() is None:
        return provider_id

    # ── Real mode — verify token, then ownership ──────────────────────────────
    uid = get_verified_uid(authorization)

    provider = get_provider_by_id(provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail=f"Provider {provider_id} not found.")

    if provider.get("uid") != uid:
        logger.warning(
            "Ownership check failed: uid='%s' tried to act as provider_id='%s' (owner uid='%s')",
            uid, provider_id, provider.get("uid"),
        )
        raise HTTPException(
            status_code=403,
            detail="You are not authorized to act on behalf of this provider.",
        )

    return provider_id
