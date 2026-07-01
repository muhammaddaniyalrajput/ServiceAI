"""
Bookings domain — HTTP routes.

Every route is a thin wrapper over a function in ``services.py``. This
file is intentionally small — auth, validation, response shaping only.
"""
from __future__ import annotations

import asyncio
import logging
import threading
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Path
from pydantic import BaseModel

from app.core.auth import get_verified_uid
from app.core.time_utils import format_created_at
from app.models.schemas import (
    AgentTraceStep,
    BookingStatus,
    IntentOutput,
)
from app.orchestrator.workflow import orchestrate_book_service

from app.api.v1.bookings.schemas import (
    AgentTraceResponse,
    BookServiceRequest,
    BookServiceResponse,
    BookingStatusResponse,
    ConfirmBookingRequest,
    ProviderJob,
    ProviderJobRespondRequest,
    ProviderJobRespondResponse,
    ProviderJobStatusUpdateRequest,
    ProviderJobStatusUpdateResponse,
    ProviderJobsResponse,
)
from app.api.v1.bookings import services as svc

logger = logging.getLogger("kaameasy")

router = APIRouter()


# ── Idempotency guard ─────────────────────────────────────────────────────────

_booking_locks: set = set()
_lock_mutex = threading.Lock()


def _acquire_booking_lock(booking_id: str) -> None:
    with _lock_mutex:
        if booking_id in _booking_locks:
            raise HTTPException(
                status_code=409,
                detail="Booking is already being processed. Please wait.",
            )
        _booking_locks.add(booking_id)


def _release_booking_lock(booking_id: str) -> None:
    with _lock_mutex:
        _booking_locks.discard(booking_id)


# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — Confirm booking
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/book-service",
    response_model=BookServiceResponse,
    summary="Confirm a service booking",
)
async def book_service(
    payload: BookServiceRequest,
    uid: str = Depends(get_verified_uid),
) -> BookServiceResponse:
    """Stage 3 of the booking pipeline. Runs Booking → Notification → Follow-Up."""
    logger.debug("Authenticated booking request for uid=%s", uid)

    # Idempotency check
    existing = await asyncio.to_thread(svc.get_booking, payload.booking_id)
    if existing and existing.get("status") == "confirmed":
        logger.info("Booking %s already confirmed — returning idempotent response.", payload.booking_id)
        raise HTTPException(
            status_code=409,
            detail="Booking already confirmed. Duplicate submission rejected.",
        )

    _acquire_booking_lock(payload.booking_id)

    try:
        # ── Fix #1: embed the customer snapshot in the booking doc ────────
        # The orchestrator (workflow.py) does the heavy lifting, but we
        # make sure the customer_details field is populated up front so
        # any downstream code (agent trace, notifications, provider list)
        # sees the snapshot.
        customer_details = svc.build_customer_details(
            uid=uid,
            name=payload.customer_name,
            phone=payload.customer_phone,
            address=payload.customer_address,
        ).model_dump(exclude_none=True)

        await asyncio.to_thread(
            svc.update_booking,
            payload.booking_id,
            {"customer_details": customer_details},
        )

        def run_booking():
            ranked = svc.get_cached_ranked(payload.booking_id)
            return orchestrate_book_service(
                booking_id=payload.booking_id,
                provider_id=payload.provider_id,
                intent=payload.intent,
                ranked_providers=ranked,
                customer_name=payload.customer_name,
                customer_phone=payload.customer_phone,
                customer_address=payload.customer_address,
                customer_coordinates=payload.customer_coordinates,
                device_token=payload.device_token,
            )

        result = await asyncio.to_thread(run_booking)
        return result
    except ValueError as exc:
        logger.warning("Booking not found: booking_id=%s err=%s", payload.booking_id, exc)
        raise HTTPException(status_code=404, detail="Booking or provider not found.")
    except Exception:
        logger.exception("Unexpected error in book_service: booking_id=%s", payload.booking_id)
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")
    finally:
        _release_booking_lock(payload.booking_id)


# ─────────────────────────────────────────────────────────────────────────────
# /booking-status/{id}
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/booking-status/{booking_id}",
    response_model=BookingStatusResponse,
    summary="Get booking status",
)
async def get_booking_status(
    booking_id: str,
    uid: str = Depends(get_verified_uid),
) -> BookingStatusResponse:
    logger.debug("Authenticated booking status lookup for uid=%s booking_id=%s", uid, booking_id)

    # Fix #1: use the join-aware fetch so customer_details is guaranteed
    data = await asyncio.to_thread(svc.get_booking_with_customer, booking_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"Booking '{booking_id}' not found.")

    status_raw = data.get("status", "pending_intent")
    try:
        status = BookingStatus(status_raw)
    except ValueError:
        status = BookingStatus.pending_intent

    return BookingStatusResponse(
        booking_id=booking_id,
        status=status,
        details={k: v for k, v in data.items() if k not in {"user_id", "logs"}},
        formatted_created_at=format_created_at(data.get("created_at")),
    )


# ─────────────────────────────────────────────────────────────────────────────
# /agent-logs/{id}   (showcase feature)
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/agent-logs/{booking_id}",
    response_model=AgentTraceResponse,
    summary="Get agent reasoning logs",
)
async def get_agent_logs(
    booking_id: str,
    uid: str = Depends(get_verified_uid),
) -> AgentTraceResponse:
    logger.debug("Authenticated agent log lookup for uid=%s booking_id=%s", uid, booking_id)

    cached = svc._agent_logs_cache.get(booking_id)
    if cached:
        return cached

    from app.services import firebase_db as db
    trace = await asyncio.to_thread(db.get_agent_trace, booking_id)
    # Normalize each step into a shape that the AgentTraceStep Pydantic
    # model can consume. Firestore has two write paths that produced
    # two on-disk shapes:
    #   * New (save_agent_trace):     { agent, action, reasoning, output, status, timestamp }
    #   * Legacy (save_agent_logs):    { agent, action, reasoning, data, status, timestamp, booking_id }
    # Plus the agent doc may have been written by hand with missing fields.
    # The normalizer below handles all three so we never 422.
    steps: list = []
    for raw in trace.get("steps", []) or []:
        if not isinstance(raw, dict):
            # Skip garbage entries — would otherwise fail Pydantic's
            # "Input should be a valid dictionary" rule and 422 the whole
            # response. An empty chat is far better UX than a 500.
            logger.debug("Skipping non-dict trace step: %r", type(raw).__name__)
            continue
        normalized = {
            "agent":     str(raw.get("agent", "") or ""),
            "action":    str(raw.get("action", "") or ""),
            "reasoning": str(raw.get("reasoning", "") or ""),
            # `output` (new) ↔ `data` (legacy) — accept either, never
            # both, and never neither.
            "output":    raw.get("output")
                          if isinstance(raw.get("output"), dict)
                          else (raw.get("data") if isinstance(raw.get("data"), dict) else {}),
            "status":    str(raw.get("status", "") or ""),
            "timestamp": str(raw.get("timestamp", "") or ""),
        }
        # Required field guarantee: Pydantic v2 will accept an empty
        # string for `agent` / `action` (the model is `str`, not a
        # constrained type), so the response model is safe.
        try:
            steps.append(AgentTraceStep(**normalized))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Dropping malformed trace step: %s", exc)

    response = AgentTraceResponse(booking_id=booking_id, steps=steps)
    svc._agent_logs_cache.set(booking_id, response)
    return response


# ─────────────────────────────────────────────────────────────────────────────
# /booking-tracking/{id}
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/booking-tracking/{booking_id}",
    summary="Get live provider tracking data",
)
async def get_booking_tracking(
    booking_id: str,
    uid: str = Depends(get_verified_uid),
):
    logger.debug("Authenticated tracking lookup for uid=%s booking_id=%s", uid, booking_id)
    data = await asyncio.to_thread(svc.get_booking_tracking, booking_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"Booking '{booking_id}' not found.")
    return data


# ─────────────────────────────────────────────────────────────────────────────
# Backward-compat: legacy /{booking_id}/chat (delegates to chat miniservice)
# ─────────────────────────────────────────────────────────────────────────────

class LegacyChatMessageRequest(BaseModel):
    sender:      str
    text:        str
    sender_type: str = "system"


@router.post(
    "/{booking_id}/chat",
    summary="Send a chat message (legacy /chat endpoint)",
)
async def legacy_send_chat_message(
    booking_id: str,
    payload: LegacyChatMessageRequest,
    uid: str = Depends(get_verified_uid),
):
    """Legacy compatibility wrapper around the chat miniservice.

    The mobile apps call ``POST /api/v1/{booking_id}/chat``. The new
    canonical route is ``POST /api/v1/chat/{booking_id}/messages`` but
    this shim keeps the existing client code working without changes.
    """
    from app.api.v1.chat import services as chat_svc
    if not payload.text or not payload.text.strip():
        raise HTTPException(status_code=422, detail="Message text is required.")
    try:
        result = await asyncio.to_thread(
            chat_svc.send_message,
            booking_id,
            payload.sender,
            payload.text.strip(),
            payload.sender_type,
        )
        return {
            "success": True,
            "booking_id": booking_id,
            "message_id": result.get("message_id"),
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error sending chat message: booking_id=%s", booking_id)
        raise HTTPException(status_code=500, detail="Failed to send chat message.")


# ─────────────────────────────────────────────────────────────────────────────
# /{booking_id}/confirm  (post-negotiation)
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/{booking_id}/confirm",
    summary="Confirm a booking after negotiation",
)
async def confirm_negotiated_booking(
    booking_id: str,
    payload: ConfirmBookingRequest,
    uid: str = Depends(get_verified_uid),
):
    logger.debug("Authenticated booking confirm for uid=%s booking_id=%s", uid, booking_id)
    booking = await asyncio.to_thread(svc.get_booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    try:
        result = await asyncio.to_thread(
            svc.confirm_booking, booking_id, payload.scheduled_time
        )
        return {"success": True, "status": "confirmed", "scheduled_time": payload.scheduled_time}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error confirming booking: booking_id=%s", booking_id)
        raise HTTPException(status_code=500, detail="Failed to confirm booking. Please try again.")


# ─────────────────────────────────────────────────────────────────────────────
# Provider-side routes
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/provider/jobs",
    response_model=ProviderJobsResponse,
    summary="List assigned jobs for provider",
)
async def get_provider_jobs(
    provider_id: str = Header(..., description="Provider ID"),
) -> ProviderJobsResponse:
    try:
        provider = await asyncio.to_thread(svc.get_provider_by_id, provider_id)
        if not provider:
            raise HTTPException(status_code=404, detail=f"Provider {provider_id} not found.")
        jobs = await asyncio.to_thread(svc.get_provider_assigned_jobs, provider_id)
        logger.info("Retrieved %d jobs for provider %s", len(jobs), provider_id)
        return ProviderJobsResponse(success=True, jobs=jobs, total=len(jobs))
    except HTTPException:
        raise
    except Exception:
        logger.exception("Job retrieval failed for provider %s", provider_id)
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")


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
    try:
        booking = await asyncio.to_thread(svc.get_booking, booking_id)
        if not booking:
            raise HTTPException(status_code=404, detail=f"Booking {booking_id} not found.")

        is_assigned = booking.get("provider_id") == provider_id
        is_broadcast = booking.get("status") == "pending"
        if not (is_assigned or is_broadcast):
            raise HTTPException(status_code=403, detail="This job is not assigned to you.")

        if payload.action not in ["accept", "reject"]:
            raise HTTPException(status_code=400, detail="action must be 'accept' or 'reject'.")

        updated = await asyncio.to_thread(
            svc.respond_to_job, booking_id, payload.action, provider_id=provider_id
        )
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to update job status.")

        status = updated.get("status", "unknown")
        message = (
            f"Job {payload.action}ed successfully." if payload.action == "accept"
            else "Job declined."
        )
        logger.info("Provider %s %sed job %s", provider_id, payload.action, booking_id)

        return ProviderJobRespondResponse(
            success=True, booking_id=booking_id, action=payload.action,
            status=BookingStatus(status), message=message,
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Job response failed for booking %s", booking_id)
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")


@router.post(
    "/provider/jobs/{booking_id}/accept",
    response_model=ProviderJobRespondResponse,
    summary="Accept a broadcast job",
)
async def accept_job(
    booking_id: str = Path(..., description="Booking ID"),
    provider_id: str = Header(..., description="Provider ID"),
) -> ProviderJobRespondResponse:
    try:
        booking = await asyncio.to_thread(svc.get_booking, booking_id)
        if not booking:
            raise HTTPException(status_code=404, detail=f"Booking {booking_id} not found.")

        is_assigned = booking.get("provider_id") == provider_id
        is_broadcast = booking.get("status") == "pending"
        if not (is_assigned or is_broadcast):
            raise HTTPException(status_code=403, detail="Not authorized to accept this job.")

        updated = await asyncio.to_thread(
            svc.respond_to_job, booking_id, "accept", provider_id=provider_id
        )
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to update job status.")

        return ProviderJobRespondResponse(
            success=True, booking_id=booking_id, action="accept",
            status=BookingStatus(updated.get("status")),
            message="Job accepted successfully.",
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to accept job %s", booking_id)
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")


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
    try:
        booking = await asyncio.to_thread(svc.get_booking, booking_id)
        if not booking:
            raise HTTPException(status_code=404, detail=f"Booking {booking_id} not found.")
        if booking.get("provider_id") != provider_id:
            raise HTTPException(status_code=403, detail="This job is not assigned to you.")

        allowed = [BookingStatus.on_the_way, BookingStatus.arrived, BookingStatus.in_progress, BookingStatus.completed]
        if payload.status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status. Allowed: {[s.value for s in allowed]}",
            )

        updated = await asyncio.to_thread(svc.update_job_status, booking_id, payload.status.value)
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to update job status.")

        logger.info("Provider %s updated job %s status to: %s", provider_id, booking_id, payload.status.value)
        return ProviderJobStatusUpdateResponse(
            success=True, booking_id=booking_id, status=payload.status, updated_at=svc.now_iso()
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Job status update failed for booking %s", booking_id)
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")
