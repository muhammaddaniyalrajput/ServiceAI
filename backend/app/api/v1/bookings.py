"""
POST /api/v1/book-service
GET  /api/v1/booking-status/{id}
GET  /api/v1/agent-logs/{id}
"""
from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    BookServiceRequest,
    BookServiceResponse,
    BookingStatusResponse,
    AgentLogsResponse,
    BookingStatus,
)
from app.orchestrator.workflow import orchestrate_book_service
from app.services import firebase_db as db

router = APIRouter()

# Temporary in-process cache of ranked results for a booking session.
# In production this lives in Redis or Firestore.
_ranked_cache: dict = {}


def cache_ranked(booking_id: str, ranked: list):
    _ranked_cache[booking_id] = ranked


def get_cached_ranked(booking_id: str) -> list:
    return _ranked_cache.get(booking_id, [])


@router.post("/book-service", response_model=BookServiceResponse, summary="Confirm a service booking")
async def book_service(payload: BookServiceRequest) -> BookServiceResponse:
    """
    **Stage 3 (Final) of the booking pipeline.**

    Runs **Booking Agent → Notification Agent → Follow-Up Agent**.

    ---
    **Sample Request:**
    ```json
    {
      "booking_id": "f47ac10b-...",
      "provider_id": "prov_001",
      "intent": { "service_type": "AC Technician", "location": "G-13, Islamabad", ... }
    }
    ```

    **Sample Response (truncated):**
    ```json
    {
      "success": true,
      "booking": {
        "booking_id": "f47ac10b-...",
        "confirmation_code": "SFW-A3F92C",
        "status": "confirmed",
        "eta_minutes": 28,
        "scheduled_at": "2026-05-19 09:00 UTC",
        "total_estimated_cost": 3600
      },
      "notification": { "fcm_payload": { "notification": { "title": "✅ Booking Confirm Ho Gayi!", ... } } },
      "follow_up": { "reminder": { ... }, "survey": { ... }, "loyalty": { ... } },
      "logs": [...]
    }
    ```
    """
    try:
        ranked = get_cached_ranked(payload.booking_id)
        result = orchestrate_book_service(
            booking_id=payload.booking_id,
            provider_id=payload.provider_id,
            intent=payload.intent,
            ranked_providers=ranked,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/booking-status/{booking_id}", response_model=BookingStatusResponse, summary="Get booking status")
async def get_booking_status(booking_id: str) -> BookingStatusResponse:
    """
    Returns the current status and details of a booking by its ID.
    """
    data = db.get_booking(booking_id)
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
    )


@router.get("/agent-logs/{booking_id}", response_model=AgentLogsResponse, summary="Get agent reasoning logs")
async def get_agent_logs(booking_id: str) -> AgentLogsResponse:
    """
    Returns the full agent reasoning log trace for a booking.
    Useful for the frontend 'Live Workflow' view.
    """
    logs = db.get_agent_logs(booking_id)
    return AgentLogsResponse(booking_id=booking_id, logs=logs)
