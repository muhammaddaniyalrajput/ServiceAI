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
    pending_intent     = "pending_intent"
    searching          = "searching"
    ranking            = "ranking"
    confirmed          = "confirmed"
    pending            = "pending"
    pending_acceptance = "pending_acceptance"
    accepted           = "accepted"
    on_the_way         = "on_the_way"
    arrived            = "arrived"
    in_progress        = "in_progress"
    notified           = "notified"
    completed          = "completed"
    failed             = "failed"


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
    city:          Optional[str] = None
    address:       Optional[str] = None


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


class CustomerSnapshot(BaseModel):
    customer_name:         str
    customer_phone:        str
    customer_address:      str
    customer_coordinates:  Dict[str, float] = Field(..., description="{latitude, longitude}")


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
    customer_name:        str = Field(..., min_length=2)
    customer_phone:       str = Field(..., min_length=7)
    customer_address:     str = Field(..., min_length=3)
    customer_coordinates: Dict[str, float] = Field(..., description="{latitude, longitude}")
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


# ──────────────────────────────────────────────
# Provider Operations (for provider mobile app)
# ──────────────────────────────────────────────

class ProviderProfile(BaseModel):
    """Detailed provider profile with full state."""
    provider_id:       str
    name:              str
    phone:             str
    service:           str
    hourly_rate:       int
    experience_yrs:    int
    rating:            float
    is_verified:       bool
    is_available:      bool
    current_coordinates: Dict[str, float] = Field(default_factory=dict)  # {"latitude": 33.6844, "longitude": 73.0479}
    fcm_token:         Optional[str] = None
    updated_at:        str
    city:              Optional[str] = None
    address:           Optional[str] = None


class ProviderRegisterRequest(BaseModel):
    """Register a new service provider."""
    name:           str = Field(..., min_length=2, max_length=100)
    phone:          str = Field(..., min_length=10, max_length=20)
    service:        str = Field(..., description="Service type e.g. 'AC Technician', 'Plumber'")
    hourly_rate:    int = Field(..., gt=0, description="PKR per hour")
    experience_yrs: int = Field(default=1, ge=0)
    fcm_token:      Optional[str] = None
    city:           Optional[str] = None
    address:        Optional[str] = None
    latitude:       Optional[float] = 0.0
    longitude:      Optional[float] = 0.0


class ProviderRegisterResponse(BaseModel):
    """Response after provider registration."""
    success:       bool = True
    provider_id:   str
    profile:       ProviderProfile
    message:       str


class ProviderStatusRequest(BaseModel):
    """Toggle provider availability status."""
    is_available: bool


class ProviderStatusResponse(BaseModel):
    success:      bool = True
    provider_id:  str
    is_available: bool
    updated_at:   str


class ProviderLocationUpdate(BaseModel):
    """Stream provider's current coordinates."""
    latitude:  float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    booking_id: Optional[str] = None  # Optional: associated active job


class ProviderLocationResponse(BaseModel):
    success:    bool = True
    provider_id: str
    message:    str


class ProviderJob(BaseModel):
    """A job assigned to the provider."""
    booking_id:            str
    user_id:               str
    status:                BookingStatus
    service_type:          str
    customer_name:         str
    customer_phone:        str
    customer_coordinates:  Dict[str, float]  # {"latitude": 33.6515, "longitude": 73.0812}
    location_description:  str  # e.g. "G-13, Islamabad"
    requested_at:          str  # ISO timestamp
    urgency:               str
    total_estimated_cost:  int  # in PKR
    eta_minutes:           int


class ProviderJobsResponse(BaseModel):
    success:  bool = True
    jobs:     List[ProviderJob]
    total:    int


class ProviderJobRespondRequest(BaseModel):
    """Accept or reject a job offer."""
    action: str = Field(..., description="'accept' or 'reject'")


class ProviderJobRespondResponse(BaseModel):
    success:    bool = True
    booking_id: str
    action:     str
    status:     BookingStatus
    message:    str


class ProviderJobStatusUpdateRequest(BaseModel):
    """Update job progress status."""
    status: BookingStatus = Field(..., description="on_the_way | arrived | in_progress | completed")


class ProviderJobStatusUpdateResponse(BaseModel):
    success:    bool = True
    booking_id: str
    status:     BookingStatus
    updated_at: str
