"""
Providers domain — Pydantic schemas.

Provider profile, status, location, and the per-provider inbox response
(used by the Dashboard and Job screens).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.api.v1.bookings.schemas import ProviderJob


# ─────────────────────────────────────────────────────────────────────────────
# Provider profile
# ─────────────────────────────────────────────────────────────────────────────

class ProviderProfile(BaseModel):
    """Detailed provider profile with full state."""
    provider_id:        str
    name:               str
    phone:              str
    service:            str
    hourly_rate:        int
    experience_yrs:     int
    rating:             float
    is_verified:        bool
    is_available:       bool
    current_coordinates: Dict[str, float] = Field(default_factory=dict)
    fcm_token:          Optional[str] = None
    updated_at:         str
    city:               Optional[str] = None
    address:            Optional[str] = None


class ProviderRegisterRequest(BaseModel):
    name:           str = Field(..., min_length=2, max_length=100)
    phone:          str = Field(..., min_length=10, max_length=20)
    service:        str = Field(..., description="Service type e.g. 'AC Technician'")
    hourly_rate:    int = Field(..., gt=0)
    experience_yrs: int = Field(default=1, ge=0)
    fcm_token:      Optional[str] = None
    city:           Optional[str] = None
    address:        Optional[str] = None
    latitude:       Optional[float] = 0.0
    longitude:      Optional[float] = 0.0


class ProviderRegisterResponse(BaseModel):
    success:     bool = True
    provider_id: str
    profile:     ProviderProfile
    message:     str


# ─────────────────────────────────────────────────────────────────────────────
# Status / location
# ─────────────────────────────────────────────────────────────────────────────

class ProviderStatusRequest(BaseModel):
    is_available: bool


class ProviderStatusResponse(BaseModel):
    success:      bool = True
    provider_id:  str
    is_available: bool
    updated_at:   str


class ProviderLocationUpdate(BaseModel):
    latitude:  float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    booking_id: Optional[str] = None


class ProviderLocationResponse(BaseModel):
    success:     bool = True
    provider_id: str
    message:     str


# ─────────────────────────────────────────────────────────────────────────────
# Performance metrics (Ref: image_0a88f0.png — earnings/performance card)
# ─────────────────────────────────────────────────────────────────────────────

class ProviderPerformance(BaseModel):
    """Aggregated performance metrics for the provider's dashboard."""
    provider_id:           str
    total_jobs:            int = 0
    completed_jobs:        int = 0
    in_progress_jobs:      int = 0
    average_rating:        float = 0.0
    total_earnings_pkr:    int = 0
    todays_earnings_pkr:   int = 0
    response_rate_pct:     float = 0.0
    updated_at:            str
