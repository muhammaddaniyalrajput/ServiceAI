"""
Providers domain — HTTP routes.

The mobile provider app talks to these endpoints for profile,
availability, location, and dashboard performance.
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, Header, HTTPException

from app.core.auth import get_verified_uid

from app.api.v1.providers.schemas import (
    ProviderLocationResponse,
    ProviderLocationUpdate,
    ProviderPerformance,
    ProviderProfile,
    ProviderRegisterRequest,
    ProviderRegisterResponse,
    ProviderStatusRequest,
    ProviderStatusResponse,
)
from app.api.v1.providers import services as svc

logger = logging.getLogger("kaameasy")

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# Conversions (Firestore document → Pydantic response)
# ─────────────────────────────────────────────────────────────────────────────

def _to_profile(doc: dict) -> ProviderProfile:
    return ProviderProfile(
        provider_id=doc.get("provider_id", ""),
        name=doc.get("name", ""),
        phone=doc.get("phone", ""),
        service=doc.get("service", ""),
        hourly_rate=int(doc.get("hourly_rate") or 0),
        experience_yrs=int(doc.get("experience_yrs") or 1),
        rating=float(doc.get("rating") or 0),
        is_verified=bool(doc.get("is_verified", False)),
        is_available=bool(doc.get("is_available", True)),
        current_coordinates=doc.get("current_coordinates", {}) or {},
        fcm_token=doc.get("fcm_token"),
        updated_at=doc.get("updated_at", svc.now_iso()),
        city=doc.get("city"),
        address=doc.get("address"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Registration / profile
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/register",
    response_model=ProviderRegisterResponse,
    summary="Register a new service provider",
)
async def register_provider(
    payload: ProviderRegisterRequest,
    uid: str = Depends(get_verified_uid),
) -> ProviderRegisterResponse:
    try:
        provider_id = await asyncio.to_thread(
            svc.create_provider,
            {
                "uid":             uid,
                "name":            payload.name,
                "phone":           payload.phone,
                "service":         payload.service,
                "hourly_rate":     payload.hourly_rate,
                "experience_yrs":  payload.experience_yrs,
                "fcm_token":       payload.fcm_token,
                "city":            payload.city,
                "address":         payload.address,
                "latitude":        payload.latitude,
                "longitude":       payload.longitude,
            },
        )
        doc = await asyncio.to_thread(svc.get_provider_by_id, provider_id)
        if not doc:
            raise HTTPException(status_code=500, detail="Failed to create provider.")
        logger.info("Provider registered: %s (%s)", provider_id, payload.service)
        return ProviderRegisterResponse(
            success=True,
            provider_id=provider_id,
            profile=_to_profile(doc),
            message=f"Welcome {payload.name}! Your provider profile has been created.",
        )
    except Exception:
        logger.exception("Provider registration failed")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")


@router.get(
    "/me",
    response_model=ProviderProfile,
    summary="Get current provider profile (by uid)",
)
async def get_current_provider(
    uid: str = Depends(get_verified_uid),
) -> ProviderProfile:
    try:
        doc = await asyncio.to_thread(svc.get_provider_by_uid, uid)
        if not doc:
            raise HTTPException(status_code=404, detail="Provider profile not found for this user.")
        return _to_profile(doc)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to fetch profile for user %s", uid)
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")


@router.put(
    "/profile",
    response_model=ProviderProfile,
    summary="Update provider profile",
)
async def update_profile(
    payload: ProviderRegisterRequest,
    provider_id: str = Header(..., description="Provider ID"),
) -> ProviderProfile:
    try:
        updated = await asyncio.to_thread(
            svc.update_provider_profile, provider_id, payload.model_dump()
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Provider not found.")
        return _to_profile(updated)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to update profile for provider %s", provider_id)
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")


# ─────────────────────────────────────────────────────────────────────────────
# Status / location
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/status",
    response_model=ProviderStatusResponse,
    summary="Toggle provider availability",
)
async def update_provider_status(
    payload: ProviderStatusRequest,
    provider_id: str = Header(..., description="Provider ID"),
) -> ProviderStatusResponse:
    try:
        doc = await asyncio.to_thread(svc.get_provider_by_id, provider_id)
        if not doc:
            raise HTTPException(status_code=404, detail=f"Provider {provider_id} not found.")
        await asyncio.to_thread(svc.update_provider_availability, provider_id, payload.is_available)
        return ProviderStatusResponse(
            success=True,
            provider_id=provider_id,
            is_available=payload.is_available,
            updated_at=svc.now_iso(),
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Status update failed for provider %s", provider_id)
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")


@router.post(
    "/location",
    response_model=ProviderLocationResponse,
    summary="Stream provider GPS coordinates",
)
async def update_provider_location(
    payload: ProviderLocationUpdate,
    provider_id: str = Header(..., description="Provider ID"),
) -> ProviderLocationResponse:
    try:
        doc = await asyncio.to_thread(svc.get_provider_by_id, provider_id)
        if not doc:
            raise HTTPException(status_code=404, detail=f"Provider {provider_id} not found.")
        await asyncio.to_thread(
            svc.update_provider_location,
            provider_id, payload.latitude, payload.longitude, booking_id=payload.booking_id,
        )
        return ProviderLocationResponse(
            success=True, provider_id=provider_id, message="Location updated successfully."
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Location update failed for provider %s", provider_id)
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")


# ─────────────────────────────────────────────────────────────────────────────
# Performance metrics (Ref: image_0a88f0.png dashboard card)
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/performance",
    response_model=ProviderPerformance,
    summary="Aggregated dashboard metrics",
)
async def get_performance(
    provider_id: str = Header(..., description="Provider ID"),
) -> ProviderPerformance:
    try:
        perf = await asyncio.to_thread(svc.get_provider_performance, provider_id)
        return ProviderPerformance(**perf)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Performance lookup failed for provider %s", provider_id)
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")
