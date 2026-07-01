"""
Chat domain — HTTP routes.

Exposes:

* ``GET    /api/v1/chat/inbox``              — list the user's active chats
* ``GET    /api/v1/chat/inbox/{role}``       — explicit-role variant
* ``GET    /api/v1/chat/{booking_id}/messages`` — fetch a thread
* ``POST   /api/v1/chat/{booking_id}/messages`` — send a message
* ``POST   /api/v1/chat/{booking_id}/init``  — initialise a conversation
                                                (called by the bookings
                                                domain on accept)
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import get_verified_uid

from app.api.v1.chat.schemas import (
    ChatMessageListResponse,
    ChatMessageRequest,
    ChatMessageResponse,
    ConversationListResponse,
    ConversationStatus,
)
from app.api.v1.chat import services as svc

logger = logging.getLogger("kaameasy")

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# Inbox
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/inbox",
    response_model=ConversationListResponse,
    summary="List the authenticated user's active chats",
)
async def list_inbox(
    role: str = Query("customer", description="'customer' or 'provider'"),
    status_filter: ConversationStatus = Query(
        ConversationStatus.active,
        alias="status",
        description="'active' or 'archived'",
    ),
    uid: str = Depends(get_verified_uid),
) -> ConversationListResponse:
    if role not in ("customer", "provider"):
        raise HTTPException(status_code=400, detail="role must be 'customer' or 'provider'")
    try:
        conversations = await asyncio.to_thread(
            svc.list_conversations_for_user, uid, role, status_filter
        )
        return ConversationListResponse(
            conversations=conversations, total=len(conversations)
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to list inbox for uid=%s role=%s", uid, role)
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")


# ─────────────────────────────────────────────────────────────────────────────
# Initialise a conversation (called by the bookings side on accept)
# ─────────────────────────────────────────────────────────────────────────────

class InitConversationRequest(BaseModel):
    booking_id:    str
    customer_id:   str
    provider_id:   str
    customer_name: str = ""
    provider_name: str = ""
    service_type:  str = ""


@router.post(
    "/init",
    response_model=ConversationListResponse,
    summary="Initialise or no-op fetch a conversation row",
)
async def init_conversation(payload: InitConversationRequest) -> ConversationListResponse:
    conv = await asyncio.to_thread(
        svc.initialise_conversation,
        payload.booking_id,
        payload.customer_id,
        payload.provider_id,
        customer_name=payload.customer_name,
        provider_name=payload.provider_name,
        service_type=payload.service_type,
    )
    return ConversationListResponse(conversations=[conv], total=1)


# ─────────────────────────────────────────────────────────────────────────────
# Messages
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/{booking_id}/messages",
    response_model=ChatMessageListResponse,
    summary="Fetch a booking's chat history",
)
async def list_messages(
    booking_id: str,
    limit: int = Query(100, ge=1, le=500),
    uid: str = Depends(get_verified_uid),
) -> ChatMessageListResponse:
    try:
        messages = await asyncio.to_thread(svc.list_messages, booking_id, limit)
        return ChatMessageListResponse(
            booking_id=booking_id, messages=messages, total=len(messages)
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to list messages for booking %s", booking_id)
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")


@router.post(
    "/{booking_id}/messages",
    response_model=ChatMessageResponse,
    summary="Send a chat message",
)
async def send_message(
    booking_id: str,
    payload: ChatMessageRequest,
    uid: str = Depends(get_verified_uid),
) -> ChatMessageResponse:
    if not payload.text or not payload.text.strip():
        raise HTTPException(status_code=422, detail="Message text is required.")
    try:
        result = await asyncio.to_thread(
            svc.send_message,
            booking_id,
            payload.sender,
            payload.text.strip(),
            payload.sender_type,
        )
        return ChatMessageResponse(**result)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to send message for booking %s", booking_id)
        raise HTTPException(status_code=500, detail="Failed to send chat message.")
