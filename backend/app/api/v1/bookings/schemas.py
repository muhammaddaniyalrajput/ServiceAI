"""
Bookings domain — Pydantic request / response schemas.

This module is the single source of truth for the booking API surface.
Pydantic v2 conventions are used throughout (``model_config``,
``model_dump``, ``Annotated[...]``).
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.schemas import (
    AgentLog,
    BookingStatus,
    IntentOutput,
    RankedProvider,
)


# ─────────────────────────────────────────────────────────────────────────────
# Re-exported base schemas (kept for backward-compat with /book-service)
# ─────────────────────────────────────────────────────────────────────────────

class CustomerDetails(BaseModel):
    """
    Snapshot of the customer profile embedded into every booking doc so the
    provider never has to do a separate Firestore round-trip to see the
    name, phone, or avatar.
    """
    model_config = ConfigDict(populate_by_name=True)

    name:    Optional[str]   = None
    phone:   Optional[str]   = None
    avatar:  Optional[str]   = None
    address: Optional[str]   = None
    city:    Optional[str]   = None
    uid:     Optional[str]   = Field(None, description="Firebase UID of the customer")


# ─────────────────────────────────────────────────────────────────────────────
# /bookings (Stage 3) — confirmed by the orchestrator
# ─────────────────────────────────────────────────────────────────────────────

class BookServiceRequest(BaseModel):
    booking_id:   str
    provider_id:  str
    intent:       IntentOutput
    customer_name:        str = Field(..., min_length=2)
    customer_phone:       str = Field(..., min_length=7)
    customer_address:     str = Field(..., min_length=3)
    customer_coordinates: Dict[str, float]
    device_token: Optional[str] = None


class BookingResult(BaseModel):
    booking_id:   str
    provider:     Any  # Provider — see app.models.schemas
    status:       BookingStatus
    scheduled_at: str
    eta_minutes:  int
    total_estimated_cost: int
    confirmation_code: str


class BookServiceResponse(BaseModel):
    success:      bool = True
    booking:      BookingResult
    notification: dict
    follow_up:    dict
    logs:         List[AgentLog]


# ─────────────────────────────────────────────────────────────────────────────
# /booking-status/{id}
# ─────────────────────────────────────────────────────────────────────────────

class BookingStatusResponse(BaseModel):
    success:    bool = True
    booking_id: str
    status:     BookingStatus
    details:    dict = Field(default_factory=dict)
    formatted_created_at: str = Field(
        ..., description="Booking created_at rendered as YYYY-MM-DD HH:mm"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Agent trace
# ─────────────────────────────────────────────────────────────────────────────

class AgentTraceStep(BaseModel):
    agent:     str
    action:    str
    reasoning: str = ""
    output:    dict = Field(default_factory=dict)
    status:    str = ""
    timestamp: str = ""


class AgentTraceResponse(BaseModel):
    success:    bool = True
    booking_id: str
    steps:      List[AgentTraceStep]


# ─────────────────────────────────────────────────────────────────────────────
# Provider-side job list
# ─────────────────────────────────────────────────────────────────────────────

class ProviderJob(BaseModel):
    """A booking, denormalised with the embedded customer snapshot."""
    booking_id:           str
    user_id:              str
    status:               BookingStatus
    service_type:         str
    # The whole point of Fix #1 — these fields are never null because the
    # backend has either embedded them in the booking doc or joined them in
    # at read time.
    customer_name:        str
    customer_phone:       str
    customer_address:     Optional[str] = None
    customer_coordinates: Dict[str, float]
    location_description: str
    requested_at:         str
    requested_at_formatted: str = Field(
        ..., description="requested_at rendered as YYYY-MM-DD HH:mm"
    )
    urgency:              str
    total_estimated_cost: int
    eta_minutes:          int


class ProviderJobsResponse(BaseModel):
    success: bool = True
    jobs:    List[ProviderJob]
    total:   int


# ─────────────────────────────────────────────────────────────────────────────
# Provider action requests / responses
# ─────────────────────────────────────────────────────────────────────────────

class ProviderJobRespondRequest(BaseModel):
    action: str = Field(..., description="'accept' or 'reject'")


class ProviderJobRespondResponse(BaseModel):
    success:    bool = True
    booking_id: str
    action:     str
    status:     BookingStatus
    message:    str


class ProviderJobStatusUpdateRequest(BaseModel):
    status: BookingStatus = Field(
        ..., description="on_the_way | arrived | in_progress | completed"
    )


class ProviderJobStatusUpdateResponse(BaseModel):
    success:    bool = True
    booking_id: str
    status:     BookingStatus
    updated_at: str


# ─────────────────────────────────────────────────────────────────────────────
# Confirm (after chat negotiation)
# ─────────────────────────────────────────────────────────────────────────────

class ConfirmBookingRequest(BaseModel):
    scheduled_time: str
