import time
import asyncio
import threading
from fastapi import APIRouter, Depends, HTTPException
from app.models.schemas import (
    BookServiceRequest,
    BookServiceResponse,
    BookingStatusResponse,
    AgentTraceResponse,
    AgentTraceStep,
    BookingStatus,
    RankedProvider,
)
from app.core.auth import get_verified_uid
from app.orchestrator.workflow import orchestrate_book_service
from app.services import firebase_db as db
import logging

logger = logging.getLogger("kaameasy")

router = APIRouter()

# ── Booking lock to prevent duplicate concurrent submissions ──────────────────
_booking_locks: set = set()
_lock_mutex = threading.Lock()

# ── LRU Cache with TTL to prevent memory leaks ────────────────────────────────

class LRUCacheWithTTL:
    def __init__(self, maxsize: int = 1000, ttl_seconds: int = 3600):
        self.maxsize = maxsize
        self.ttl_seconds = ttl_seconds
        self.cache = {}
        self.lock = threading.Lock()

    def get(self, key):
        with self.lock:
            self._cleanup_unlocked()
            if key in self.cache:
                value, creation, expiry, _ = self.cache[key]
                if expiry > time.time():
                    self.cache[key] = (value, creation, expiry, time.time())
                    return value
                else:
                    del self.cache[key]
            return None

    def set(self, key, value):
        with self.lock:
            self._cleanup_unlocked()
            if len(self.cache) >= self.maxsize:
                lru_key = min(self.cache.keys(), key=lambda k: self.cache[k][3])
                del self.cache[lru_key]
            now = time.time()
            self.cache[key] = (value, now, now + self.ttl_seconds, now)

    def invalidate(self, key):
        with self.lock:
            if key in self.cache:
                del self.cache[key]

    def _cleanup_unlocked(self):
        """Active removal of expired items or items created > 2 hours ago."""
        now = time.time()
        keys_to_remove = [
            k for k, v in self.cache.items()
            if v[2] < now or (now - v[1]) > 7200
        ]
        for k in keys_to_remove:
            del self.cache[k]

_ranked_cache = LRUCacheWithTTL(maxsize=1000, ttl_seconds=3600)
_agent_logs_cache = LRUCacheWithTTL(maxsize=1000, ttl_seconds=3)

def invalidate_agent_logs(booking_id: str):
    _agent_logs_cache.invalidate(booking_id)


def cache_ranked(booking_id: str, ranked: list):
    _ranked_cache.set(booking_id, ranked)


def get_cached_ranked(booking_id: str) -> list:
    """
    Try in-memory first. If missing (server restarted between Stage 2→3),
    fall back to the Firestore-persisted ranked_snapshot.
    """
    cached = _ranked_cache.get(booking_id)
    if cached:
        return cached

    # Restore from Firestore
    raw_list = db.load_ranked_providers(booking_id)
    if raw_list:
        restored = [RankedProvider(**item) for item in raw_list]
        _ranked_cache.set(booking_id, restored)   # re-populate local cache
        return restored

    return []


@router.post("/book-service", response_model=BookServiceResponse, summary="Confirm a service booking")
async def book_service(
    payload: BookServiceRequest,
    uid: str = Depends(get_verified_uid),
) -> BookServiceResponse:
    """
    **Stage 3 (Final) of the booking pipeline.**
    Runs Booking Agent → Notification Agent → Follow-Up Agent.

    Includes idempotency guard: rejects duplicate submissions for the same booking.
    """
    logger.debug("Authenticated booking request for uid=%s", uid)
    # ── Idempotency check: if already confirmed, return early ──
    existing = await asyncio.to_thread(db.get_booking, payload.booking_id)
    if existing and existing.get("status") == "confirmed":
        logger.info("Booking %s already confirmed — returning idempotent response.", payload.booking_id)
        raise HTTPException(
            status_code=409,
            detail="Booking already confirmed. Duplicate submission rejected.",
        )

    # ── Concurrent duplicate guard ──
    with _lock_mutex:
        if payload.booking_id in _booking_locks:
            raise HTTPException(
                status_code=409,
                detail="Booking is already being processed. Please wait.",
            )
        _booking_locks.add(payload.booking_id)

    try:
        def run_booking():
            ranked = get_cached_ranked(payload.booking_id)
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
    except Exception as exc:
        logger.exception("Unexpected error in book_service: booking_id=%s", payload.booking_id)
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")
    finally:
        with _lock_mutex:
            _booking_locks.discard(payload.booking_id)


@router.get("/booking-status/{booking_id}", response_model=BookingStatusResponse, summary="Get booking status")
async def get_booking_status(
    booking_id: str,
    uid: str = Depends(get_verified_uid),
) -> BookingStatusResponse:
    """
    Returns the current status and details of a booking by its ID.
    """
    logger.debug("Authenticated booking status lookup for uid=%s booking_id=%s", uid, booking_id)
    data = await asyncio.to_thread(db.get_booking, booking_id)
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
async def get_agent_logs(
    booking_id: str,
    uid: str = Depends(get_verified_uid),
) -> AgentTraceResponse:
    """
    Returns the full agent reasoning trace for a booking.
    """
    logger.debug("Authenticated agent log lookup for uid=%s booking_id=%s", uid, booking_id)
    cached = _agent_logs_cache.get(booking_id)
    if cached:
        return cached

    trace = await asyncio.to_thread(db.get_agent_trace, booking_id)
    steps = [AgentTraceStep(**s) for s in trace.get("steps", [])]

    response = AgentTraceResponse(
        booking_id=booking_id,
        steps=steps,
    )
    _agent_logs_cache.set(booking_id, response)
    return response


@router.get("/booking-tracking/{booking_id}", summary="Get live provider tracking data")
async def get_booking_tracking(
    booking_id: str,
    uid: str = Depends(get_verified_uid),
):
    """
    Returns real-time tracking data for a booking:
    status, provider live coordinates, user coordinates, and ETA.
    Used by the mobile app's live map tracking screen.
    """
    logger.debug("Authenticated tracking lookup for uid=%s booking_id=%s", uid, booking_id)
    data = await asyncio.to_thread(db.get_booking_tracking, booking_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"Booking '{booking_id}' not found.")
    return data


from pydantic import BaseModel
class ChatMessageRequest(BaseModel):
    sender: str
    text: str
    sender_type: str = "system"

@router.post("/{booking_id}/chat", summary="Send a chat message for a booking")
async def send_chat_message(
    booking_id: str,
    payload: ChatMessageRequest,
    uid: str = Depends(get_verified_uid),
):
    """
    Append a chat message to the booking's chat history.
    """
    try:
        logger.debug(
            "Authenticated chat send for uid=%s booking_id=%s sender_type=%s",
            uid,
            booking_id,
            payload.sender_type,
        )
        updated = await asyncio.to_thread(
            db.add_chat_message,
            booking_id,
            payload.sender,
            payload.text,
            payload.sender_type,
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Booking not found or update failed")
        # The message is persisted as a new document in
        # `bookings/{booking_id}/messages`. The frontend subscribes to that
        # subcollection via `onSnapshot` and will receive the new message
        # in real time. We no longer return the full chat array here.
        return {"success": True, "booking_id": booking_id}
    except HTTPException:
        raise  # re-raise 404 not found as-is
    except Exception:
        logger.exception("Error sending chat message: booking_id=%s", booking_id)
        raise HTTPException(status_code=500, detail="Failed to send chat message.")


class ConfirmBookingRequest(BaseModel):
    scheduled_time: str

@router.post("/{booking_id}/confirm", summary="Confirm a booking after negotiation")
async def confirm_negotiated_booking(
    booking_id: str,
    payload: ConfirmBookingRequest,
    uid: str = Depends(get_verified_uid),
):
    """
    Finalize the booking status to 'confirmed' with an agreed upon scheduled_time.
    """
    try:
        logger.debug("Authenticated booking confirm for uid=%s booking_id=%s", uid, booking_id)
        booking = await asyncio.to_thread(db.get_booking, booking_id)
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
            
        updates = {
            "status": "confirmed",
            "scheduled_time": payload.scheduled_time
        }
        
        # update directly in db
        db_instance = db._get_db()
        if db_instance:
            db_instance.collection("bookings").document(booking_id).update(updates)
            from firebase_admin import firestore

            db_instance.collection("bookings").document(booking_id).collection("messages").add({
                "text": f"Booking confirmed for {payload.scheduled_time}.",
                "senderId": "system",
                "senderType": "system",
                "createdAt": firestore.SERVER_TIMESTAMP,
            })
        else:
            if booking_id in db._mock_store:
                db._mock_store[booking_id].update(updates)
                db._mock_store[booking_id].setdefault("messages", []).append({
                    "text": f"Booking confirmed for {payload.scheduled_time}.",
                    "senderId": "system",
                    "senderType": "system",
                    "createdAt": time.time(),
                })
                
        return {"success": True, "status": "confirmed", "scheduled_time": payload.scheduled_time}
    except HTTPException:
        raise  # re-raise 404 not found as-is
    except Exception:
        logger.exception("Error confirming booking: booking_id=%s", booking_id)
        raise HTTPException(status_code=500, detail="Failed to confirm booking. Please try again.")

