"""
Pydantic request / response schemas.
Every API surface should use these types — never raw dicts.
"""
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict
from enum import Enum


# ──────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────

class BookingStatus(str, Enum):
    pending_intent   = "pending_intent"
    searching        = "searching"
    ranking          = "ranking"
    confirmed        = "confirmed"
    notified         = "notified"
    completed        = "completed"
    failed           = "failed"


class Urgency(str, Enum):
    high   = "high"
    medium = "medium"
    low    = "low"


class AgentStatus(str, Enum):
    processing = "processing"
    success    = "success"
    error      = "error"
    skipped    = "skipped"


# ──────────────────────────────────────────────
# Intent
# ──────────────────────────────────────────────

class IntentOutput(BaseModel):
    service_type:  str            = Field(..., description="Extracted service, e.g. 'AC Technician'")
    location:      str            = Field(..., description="Location string, e.g. 'G-13, Islamabad'")
    datetime_hint: Optional[str]  = Field(None, description="Time hint, e.g. 'kal subah' / 'tomorrow morning'")
    urgency:       Urgency        = Field(Urgency.medium, description="Urgency level")
    language:      str            = Field("en", description="Detected language: en | ur | roman_ur")
    confidence:    float          = Field(1.0, ge=0.0, le=1.0)


# ──────────────────────────────────────────────
# Provider
# ──────────────────────────────────────────────

class Provider(BaseModel):
    provider_id:   str
    name:          str
    service:       str
    location:      str
    latitude:      float
    longitude:     float
    rating:        float          = Field(..., ge=0.0, le=5.0)
    hourly_rate:   int            = Field(..., description="PKR per hour")
    availability:  List[str]      = Field(default_factory=list)
    experience_yrs: int           = Field(1)
    is_verified:   bool           = False
    distance_km:   Optional[float] = None


class RankedProvider(BaseModel):
    provider:     Provider
    score:        float
    score_reason: str


# ──────────────────────────────────────────────
# Booking
# ──────────────────────────────────────────────

class BookingResult(BaseModel):
    booking_id:   str
    provider:     Provider
    status:       BookingStatus
    scheduled_at: str
    eta_minutes:  int
    total_estimated_cost: int
    confirmation_code: str


# ──────────────────────────────────────────────
# Agent Log
# ──────────────────────────────────────────────

class AgentLog(BaseModel):
    timestamp:  str
    booking_id: str
    agent:      str
    action:     str
    status:     AgentStatus
    reasoning:  str = ""
    data:       dict = Field(default_factory=dict)


# ──────────────────────────────────────────────
# Agent Trace Step (clean shape for the showcase)
# ──────────────────────────────────────────────

class AgentTraceStep(BaseModel):
    agent:     str
    action:    str
    reasoning: str = ""
    output:    dict = Field(default_factory=dict)
    status:    str = ""
    timestamp: str = ""


# ──────────────────────────────────────────────
# API Request / Response Wrappers
# ──────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    user_id: str
    text:    str = Field(..., min_length=3, description="Natural language request")
    coordinates: Optional[Dict[str, float]] = None


class AnalyzeResponse(BaseModel):
    success:    bool = True
    booking_id: str
    intent:     IntentOutput
    logs:       List[AgentLog]


class FindProvidersRequest(BaseModel):
    booking_id: str
    intent:     IntentOutput


class FindProvidersResponse(BaseModel):
    success:   bool = True
    providers: List[Provider]
    ranked:    List[RankedProvider]
    logs:      List[AgentLog]


class BookServiceRequest(BaseModel):
    booking_id:   str
    provider_id:  str
    intent:       IntentOutput
    device_token: Optional[str] = Field(
        None,
        description="Optional FCM device token. If provided, a real push notification is sent.",
    )


class BookServiceResponse(BaseModel):
    success:        bool = True
    booking:        BookingResult
    notification:   dict
    follow_up:      dict
    logs:           List[AgentLog]


class BookingStatusResponse(BaseModel):
    success:    bool = True
    booking_id: str
    status:     BookingStatus
    details:    dict = Field(default_factory=dict)


class AgentLogsResponse(BaseModel):
    success:    bool = True
    booking_id: str
    logs:       List[AgentLog]


# ──────────────────────────────────────────────
# Agent Trace (dedicated collection response)
# ──────────────────────────────────────────────

class AgentTraceResponse(BaseModel):
    success:    bool = True
    booking_id: str
    steps:      List[AgentTraceStep]


# ──────────────────────────────────────────────
# Providers List (GET /providers)
# ──────────────────────────────────────────────

class ServiceCategory(BaseModel):
    """A group of providers under one service type."""
    service:   str
    count:     int
    providers: List[Provider]


class ProvidersListResponse(BaseModel):
    success:    bool = True
    total:      int
    categories: List[ServiceCategory]
