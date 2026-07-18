"""
Debug endpoints — temporary, for diagnosing the location auto-populate issue.
Safe to delete after the bug is fixed.

Routes:
  GET /api/v1/debug/profile     — returns the caller's Firestore profile doc
  GET /api/v1/debug/firebase    — returns Firebase connection state
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import get_verified_uid
from app.core.firebase_config import get_db
from app.services import firebase_db as db

logger = logging.getLogger("kaameasy")

router = APIRouter()


class FirebaseState(BaseModel):
    connected: bool
    is_mock: bool
    project_id: str | None = None


@router.get("/firebase", response_model=FirebaseState, summary="Check Firebase connection state")
async def firebase_state() -> FirebaseState:
    """Returns whether Firebase is connected (real mode) or in mock mode."""
    client = get_db()
    return FirebaseState(
        connected=client is not None,
        is_mock=client is None,
    )


@router.get("/profile", summary="Return caller's Firestore profile (DEBUG)")
async def debug_profile(uid: str = Depends(get_verified_uid)) -> dict:
    """Returns the caller's Firestore profile document so we can see what
    the backend's ``get_user_profile()`` is actually returning."""
    if uid in ("dev_user", "anonymous"):
        raise HTTPException(
            status_code=400,
            detail=(
                "Caller is not authenticated (uid="
                f"{uid!r}). Sign in via the app first, then re-call."
            ),
        )
    profile = db.get_user_profile(uid)
    return {
        "uid": uid,
        "profile_exists": profile is not None,
        "profile": profile,
    }
