"""
Auth domain — HTTP routes.

This miniservice is intentionally small: Firebase token verification is
done in ``app.core.auth`` (where it always lived). The router here
exposes the auxiliary routes the mobile apps use to introspect a token
or check the current user.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel

from app.core.auth import get_verified_uid

logger = logging.getLogger("kaameasy")

router = APIRouter()


class WhoAmIResponse(BaseModel):
    uid:  str
    mock: bool = False


@router.get(
    "/whoami",
    response_model=WhoAmIResponse,
    summary="Return the verified Firebase UID for the current request",
)
async def whoami(uid: str = Depends(get_verified_uid)) -> WhoAmIResponse:
    """The simplest possible healthcheck-style endpoint to confirm auth works."""
    return WhoAmIResponse(uid=uid, mock=uid in ("dev_user", "anonymous"))
