"""
Chat domain — Pydantic schemas for the inbox + message APIs.
"""
from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class ConversationStatus(str, Enum):
    active  = "active"
    archived = "archived"


# ─────────────────────────────────────────────────────────────────────────────
# Conversations (the inbox)
# ─────────────────────────────────────────────────────────────────────────────

class Conversation(BaseModel):
    """
    A single inbox card. Stored in the ``conversations`` collection.
    One row per (customer, provider, booking) — created when the
    provider accepts a job and removed/archived when the booking is
    completed or rejected.
    """
    conversation_id: str
    booking_id:      str
    customer_id:     str
    provider_id:     str
    last_message:    str       = ""
    last_sender_type: str      = "system"
    updated_at:      str       = Field(..., description="ISO 8601 UTC, used for sort")
    created_at:      str       = ""
    status:          ConversationStatus = ConversationStatus.active

    # Denormalised — render-time hints for the inbox UI
    customer_name:   Optional[str] = None
    provider_name:   Optional[str] = None
    service_type:    Optional[str] = None


class ConversationListResponse(BaseModel):
    success: bool = True
    conversations: List[Conversation]
    total:   int


# ─────────────────────────────────────────────────────────────────────────────
# Messages (the per-booking chat subcollection)
# ─────────────────────────────────────────────────────────────────────────────

class ChatMessageRequest(BaseModel):
    sender:      str
    text:        str
    sender_type: str = "system"


class ChatMessageResponse(BaseModel):
    success:    bool = True
    booking_id: str
    message_id: Optional[str] = None
    created_at: str


class ChatMessage(BaseModel):
    id:         str
    text:       str
    senderId:   str
    senderType: str = "system"
    createdAt:  Optional[str] = None
    clientTime: Optional[str] = None


class ChatMessageListResponse(BaseModel):
    success:    bool = True
    booking_id: str
    messages:   List[ChatMessage]
    total:      int
