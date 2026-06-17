"""
Provider API routes for the ServiceFlow AI provider mobile app.

Endpoints:
  POST   /api/v1/provider/register              — Register a new service provider
  POST   /api/v1/provider/status               — Toggle provider availability
  POST   /api/v1/provider/location             — Stream provider's current coordinates
  GET    /api/v1/provider/jobs                 — List assigned jobs for provider
  POST   /api/v1/provider/jobs/{booking_id}/respond   — Accept or reject a job
  POST   /api/v1/provider/jobs/{booking_id}/status    — Update job status (on_the_way, arrived, in_progress, completed)
"""
import logging
from fastapi import APIRouter, HTTPException, Header, Path, Depends
from app.core.auth import get_verified_uid
from app.core.exceptions import ValidationException
from app.models.schemas import (
    ProviderRegisterRequest,
    ProviderRegisterResponse,
    ProviderStatusRequest,
    ProviderStatusResponse,
    ProviderLocationUpdate,
    ProviderLocationResponse,
    ProviderJobsResponse,
    ProviderJob,
    ProviderJobRespondRequest,
    ProviderJobRespondResponse,
    ProviderJobStatusUpdateRequest,
    ProviderJobStatusUpdateResponse,
    ProviderProfile,
    BookingStatus,
)
from app.services import firebase_db as db
from datetime import datetime

logger = logging.getLogger("serviceflow")

router = APIRouter()

# ─────────────────────────────────────────────────────────────────────────────
# Helper: Convert booking doc to ProviderJob
# ─────────────────────────────────────────────────────────────────────────────

def booking_to_provider_job(booking_doc: dict) -> ProviderJob:
    """Convert a Firestore booking document to a ProviderJob response model."""
    intent = booking_doc.get("extracted_intent") or booking_doc.get("intent") or {}
    booking_data = booking_doc.get("booking", {})
    provider_data = booking_data.get("provider", {})
    
    return ProviderJob(
        booking_id=booking_doc.get("booking_id", ""),
        user_id=booking_doc.get("user_id", ""),
        status=booking_doc.get("status", BookingStatus.pending_intent),
        service_type=intent.get("service_type", ""),
        customer_name=booking_doc.get("user_name", "Customer"),  # Would come from user profile in real scenario
        customer_phone=booking_doc.get("user_phone", ""),
        customer_coordinates=booking_doc.get("user_coordinates", {"latitude": 0, "longitude": 0}),
        location_description=intent.get("location", ""),
        requested_at=booking_doc.get("created_at", datetime.utcnow().isoformat() + "Z"),
        urgency=intent.get("urgency", "medium"),
        total_estimated_cost=booking_data.get("total_estimated_cost", 0),
        eta_minutes=booking_data.get("eta_minutes", 0),
    )


def provider_doc_to_profile(provider_doc: dict) -> ProviderProfile:
    """Convert a Firestore provider document to a ProviderProfile response model."""
    return ProviderProfile(
        provider_id=provider_doc.get("provider_id", ""),
        name=provider_doc.get("name", ""),
        phone=provider_doc.get("phone", ""),
        service=provider_doc.get("service", ""),
        hourly_rate=provider_doc.get("hourly_rate", 0),
        experience_yrs=provider_doc.get("experience_yrs", 1),
        rating=provider_doc.get("rating", 4.5),
        is_verified=provider_doc.get("is_verified", False),
        is_available=provider_doc.get("is_available", True),
        current_coordinates=provider_doc.get("current_coordinates", {}),
        fcm_token=provider_doc.get("fcm_token"),
        updated_at=provider_doc.get("updated_at", datetime.utcnow().isoformat() + "Z"),
        city=provider_doc.get("city"),
        address=provider_doc.get("address"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 1. POST /api/v1/provider/register
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/provider/register",
    response_model=ProviderRegisterResponse,
    summary="Register a new service provider",
)
async def register_provider(
    payload: ProviderRegisterRequest,
    uid: str = Depends(get_verified_uid),
) -> ProviderRegisterResponse:
    """
    Register a new service provider.
    Returns a unique provider_id and initial profile.
    """
    try:
        # Create provider in Firestore
        provider_id = db.create_provider({
            "uid": uid,
            "name": payload.name,
            "phone": payload.phone,
            "service": payload.service,
            "hourly_rate": payload.hourly_rate,
            "experience_yrs": payload.experience_yrs,
            "fcm_token": payload.fcm_token,
            "city": payload.city,
            "address": payload.address,
            "latitude": payload.latitude,
            "longitude": payload.longitude,
        })
        
        # Fetch the created provider
        provider_doc = db.get_provider_by_id(provider_id)
        if not provider_doc:
            raise HTTPException(status_code=500, detail="Failed to create provider.")
        
        profile = provider_doc_to_profile(provider_doc)
        
        logger.info(f"Provider registered: {provider_id} ({payload.service})")
        
        return ProviderRegisterResponse(
            success=True,
            provider_id=provider_id,
            profile=profile,
            message=f"Welcome {payload.name}! Your provider profile has been created.",
        )
    except Exception as exc:
        logger.error(f"Provider registration failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# 1b. GET /api/v1/provider/me
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/provider/me",
    response_model=ProviderProfile,
    summary="Get current provider profile",
)
async def get_current_provider(
    uid: str = Depends(get_verified_uid),
) -> ProviderProfile:
    """
    Get the provider profile associated with the authenticated Firebase user.
    """
    try:
        db_client = db._get_db()
        if db_client:
            docs = (
                db_client.collection("providers")
                .where("uid", "==", uid)
                .limit(1)
                .stream()
            )
            provider_doc = None
            for d in docs:
                provider_doc = d.to_dict()
                break
            
            if not provider_doc:
                raise HTTPException(status_code=404, detail="Provider profile not found for this user.")
            
            return provider_doc_to_profile(provider_doc)
        else:
            # Mock mode fallback
            for p in db._mock_providers:
                if p.get("uid") == uid:
                    return provider_doc_to_profile(p)
            raise HTTPException(status_code=404, detail="Provider profile not found in mock store.")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Failed to fetch profile for user {uid}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# 1c. PUT /api/v1/provider/profile
# ─────────────────────────────────────────────────────────────────────────────

@router.put(
    "/provider/profile",
    response_model=ProviderProfile,
    summary="Update provider profile details",
)
async def update_profile(
    payload: ProviderRegisterRequest,
    provider_id: str = Header(..., description="Provider ID"),
) -> ProviderProfile:
    """
    Update provider's name, phone, service, hourly rate, etc.
    """
    try:
        updated = db.update_provider_profile(provider_id, {
            "name": payload.name,
            "phone": payload.phone,
            "service": payload.service,
            "hourly_rate": payload.hourly_rate,
            "experience_yrs": payload.experience_yrs,
            "city": payload.city,
            "address": payload.address,
            "latitude": payload.latitude,
            "longitude": payload.longitude,
        })
        if not updated:
            raise HTTPException(status_code=404, detail="Provider not found.")
        return provider_doc_to_profile(updated)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Failed to update profile for provider {provider_id}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# 2. POST /api/v1/provider/status
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/provider/status",
    response_model=ProviderStatusResponse,
    summary="Toggle provider availability",
)
async def update_provider_status(
    payload: ProviderStatusRequest,
    provider_id: str = Header(..., description="Provider ID from Authorization header or app state"),
) -> ProviderStatusResponse:
    """
    Toggle provider's availability status (online/offline).
    """
    try:
        # Verify provider exists
        provider_doc = db.get_provider_by_id(provider_id)
        if not provider_doc:
            raise HTTPException(status_code=404, detail=f"Provider {provider_id} not found.")
        
        # Update availability
        db.update_provider_availability(provider_id, payload.is_available)
        
        status_text = "online" if payload.is_available else "offline"
        logger.info(f"Provider {provider_id} status set to: {status_text}")
        
        return ProviderStatusResponse(
            success=True,
            provider_id=provider_id,
            is_available=payload.is_available,
            updated_at=datetime.utcnow().isoformat() + "Z",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Status update failed for {provider_id}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# 3. POST /api/v1/provider/location
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/provider/location",
    response_model=ProviderLocationResponse,
    summary="Stream provider's current GPS coordinates",
)
async def update_provider_location(
    payload: ProviderLocationUpdate,
    provider_id: str = Header(..., description="Provider ID"),
) -> ProviderLocationResponse:
    """
    Update provider's current GPS coordinates.
    This endpoint is called frequently (e.g., every 10 seconds) from the provider mobile app.
    If booking_id is provided, also updates the booking's live provider coordinates for real-time tracking.
    """
    try:
        # Verify provider exists
        provider_doc = db.get_provider_by_id(provider_id)
        if not provider_doc:
            raise HTTPException(status_code=404, detail=f"Provider {provider_id} not found.")
        
        # Update location in Firestore
        db.update_provider_location(
            provider_id,
            payload.latitude,
            payload.longitude,
            booking_id=payload.booking_id,
        )
        
        logger.debug(f"Provider {provider_id} location updated: ({payload.latitude}, {payload.longitude})")
        
        return ProviderLocationResponse(
            success=True,
            provider_id=provider_id,
            message="Location updated successfully.",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Location update failed for {provider_id}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# 4. GET /api/v1/provider/jobs
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/provider/jobs",
    response_model=ProviderJobsResponse,
    summary="List assigned jobs for provider",
)
async def get_provider_jobs(
    provider_id: str = Header(..., description="Provider ID"),
) -> ProviderJobsResponse:
    """
    Get all active/pending jobs assigned to the provider.
    Returns jobs with status: pending_acceptance, accepted, on_the_way, arrived, or in_progress.
    """
    try:
        # Verify provider exists
        provider_doc = db.get_provider_by_id(provider_id)
        if not provider_doc:
            raise HTTPException(status_code=404, detail=f"Provider {provider_id} not found.")
        
        # Fetch assigned jobs
        bookings = db.get_provider_assigned_jobs(provider_id)
        
        # Convert to ProviderJob models
        jobs = [booking_to_provider_job(b) for b in bookings]
        
        logger.info(f"Retrieved {len(jobs)} jobs for provider {provider_id}")
        
        return ProviderJobsResponse(
            success=True,
            jobs=jobs,
            total=len(jobs),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Job retrieval failed for {provider_id}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# 5. POST /api/v1/provider/jobs/{booking_id}/respond
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/provider/jobs/{booking_id}/respond",
    response_model=ProviderJobRespondResponse,
    summary="Accept or reject a job offer",
)
async def respond_to_job(
    booking_id: str = Path(..., description="Booking ID"),
    payload: ProviderJobRespondRequest = None,
    provider_id: str = Header(..., description="Provider ID"),
) -> ProviderJobRespondResponse:
    """
    Provider accepts or rejects a job.
    action: 'accept' or 'reject'
    """
    try:
        # Verify provider and booking exist
        provider_doc = db.get_provider_by_id(provider_id)
        if not provider_doc:
            raise HTTPException(status_code=404, detail=f"Provider {provider_id} not found.")
        
        booking_doc = db.get_booking(booking_id)
        if not booking_doc:
            raise HTTPException(status_code=404, detail=f"Booking {booking_id} not found.")
        
        # Verify the booking is assigned to this provider or is a pending broadcast
        is_assigned = booking_doc.get("provider_id") == provider_id
        is_broadcast = booking_doc.get("status") == "pending"
        
        if not (is_assigned or is_broadcast):
            raise HTTPException(
                status_code=403,
                detail="This job is not assigned to you.",
            )
        
        # Validate action
        if payload.action not in ["accept", "reject"]:
            raise HTTPException(
                status_code=400,
                detail="action must be 'accept' or 'reject'.",
            )
        
        # Update booking status
        updated_booking = db.respond_to_job(booking_id, payload.action, provider_id=provider_id)
        if not updated_booking:
            raise HTTPException(status_code=500, detail="Failed to update job status.")
        
        status = updated_booking.get("status", "unknown")
        message = f"Job {payload.action}ed successfully." if payload.action == "accept" else "Job declined."
        
        logger.info(f"Provider {provider_id} {payload.action}ed job {booking_id}")
        
        return ProviderJobRespondResponse(
            success=True,
            booking_id=booking_id,
            action=payload.action,
            status=status,
            message=message,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Job response failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# 5b. POST /api/v1/provider/jobs/{booking_id}/accept (Alias for accept)
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/provider/jobs/{booking_id}/accept",
    response_model=ProviderJobRespondResponse,
    summary="Accept a broadcast job",
)
async def accept_job(
    booking_id: str = Path(..., description="Booking ID"),
    provider_id: str = Header(..., description="Provider ID"),
) -> ProviderJobRespondResponse:
    """
    Provider accepts a job. Changes status from PENDING to ACCEPTED.
    """
    try:
        provider_doc = db.get_provider_by_id(provider_id)
        if not provider_doc:
            raise HTTPException(status_code=404, detail=f"Provider {provider_id} not found.")
        
        booking_doc = db.get_booking(booking_id)
        if not booking_doc:
            raise HTTPException(status_code=404, detail=f"Booking {booking_id} not found.")
            
        is_assigned = booking_doc.get("provider_id") == provider_id
        is_broadcast = booking_doc.get("status") == "pending"
        
        if not (is_assigned or is_broadcast):
            raise HTTPException(status_code=403, detail="Not authorized to accept this job.")
            
        updated_booking = db.respond_to_job(booking_id, "accept", provider_id=provider_id)
        if not updated_booking:
            raise HTTPException(status_code=500, detail="Failed to update booking status.")
            
        return ProviderJobRespondResponse(
            success=True,
            booking_id=booking_id,
            action="accept",
            status=updated_booking.get("status"),
            message="Job accepted successfully.",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Failed to accept job {booking_id}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# 6. POST /api/v1/provider/jobs/{booking_id}/status
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/provider/jobs/{booking_id}/status",
    response_model=ProviderJobStatusUpdateResponse,
    summary="Update job status progression",
)
async def update_job_status(
    booking_id: str = Path(..., description="Booking ID"),
    payload: ProviderJobStatusUpdateRequest = None,
    provider_id: str = Header(..., description="Provider ID"),
) -> ProviderJobStatusUpdateResponse:
    """
    Update a job's status as the provider works on it.
    Allowed transitions:
      - on_the_way    (provider has accepted and is traveling)
      - arrived       (provider arrived at customer location)
      - in_progress   (provider started work)
      - completed     (provider finished the job)
    """
    try:
        # Verify provider and booking exist
        provider_doc = db.get_provider_by_id(provider_id)
        if not provider_doc:
            raise HTTPException(status_code=404, detail=f"Provider {provider_id} not found.")
        
        booking_doc = db.get_booking(booking_id)
        if not booking_doc:
            raise HTTPException(status_code=404, detail=f"Booking {booking_id} not found.")
        
        # Verify the booking is assigned to this provider
        if booking_doc.get("provider_id") != provider_id:
            raise HTTPException(
                status_code=403,
                detail="This job is not assigned to you.",
            )
        
        # Validate status transition
        allowed_statuses = [
            BookingStatus.on_the_way,
            BookingStatus.arrived,
            BookingStatus.in_progress,
            BookingStatus.completed,
        ]
        
        if payload.status not in allowed_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status. Allowed: {[s.value for s in allowed_statuses]}",
            )
        
        # Update booking status
        updated_booking = db.update_job_status(booking_id, payload.status.value)
        if not updated_booking:
            raise HTTPException(status_code=500, detail="Failed to update job status.")
        
        logger.info(f"Provider {provider_id} updated job {booking_id} status to: {payload.status.value}")
        
        return ProviderJobStatusUpdateResponse(
            success=True,
            booking_id=booking_id,
            status=payload.status,
            updated_at=datetime.utcnow().isoformat() + "Z",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Job status update failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
