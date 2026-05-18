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
    AgentTraceResponse,
    AgentTraceStep,
    BookingStatus,
    RankedProvider,
)
from app.orchestrator.workflow import orchestrate_book_service
from app.services import firebase_db as db

router = APIRouter()

# ── In-process cache (fast path — also backed by Firestore now) ──────────────
_ranked_cache: dict = {}


def cache_ranked(booking_id: str, ranked: list):
    _ranked_cache[booking_id] = ranked


def get_cached_ranked(booking_id: str) -> list:
    """
    Try in-memory first. If missing (server restarted between Stage 2→3),
    fall back to the Firestore-persisted ranked_snapshot.
    """
    if booking_id in _ranked_cache:
        return _ranked_cache[booking_id]

    # Restore from Firestore
    raw_list = db.load_ranked_providers(booking_id)
    if raw_list:
        restored = [RankedProvider(**item) for item in raw_list]
        _ranked_cache[booking_id] = restored   # re-populate local cache
        return restored

    return []


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
      "intent": { "service_type": "AC Technician", "location": "G-13, Islamabad", ... },
      "device_token": "optional_fcm_token"
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
            device_token=payload.device_token,
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


@router.get("/agent-logs/{booking_id}", response_model=AgentTraceResponse, summary="Get agent reasoning logs")
async def get_agent_logs(booking_id: str) -> AgentTraceResponse:
    """
    Returns the full agent reasoning trace for a booking.

    Reads from the dedicated `agent_logs/{booking_id}` Firestore collection.
    Each step contains: agent name, action, reasoning, output, status, timestamp.

    Useful for the frontend **'Live Workflow'** timeline view.
    """
    trace = db.get_agent_trace(booking_id)
    steps = [AgentTraceStep(**s) for s in trace.get("steps", [])]

    return AgentTraceResponse(
        booking_id=booking_id,
        steps=steps,
    )
