import time
import asyncio
import threading
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
import logging

logger = logging.getLogger("serviceflow")

router = APIRouter()

# ── Booking lock to prevent duplicate concurrent submissions ──────────────────
_booking_locks: set = set()
_lock_mutex = threading.Lock()

# ── LRU Cache with TTL to prevent memory leaks ────────────────────────────────

class LRUCacheWithTTL:
    def __init__(self, maxsize: int = 1000, ttl_seconds: int = 3600):
        self.maxsize = maxsize
        self.ttl_seconds = ttl_seconds
        # key -> (value, creation_time, expiry_time, last_accessed_time)
        self.cache = {}

    def get(self, key):
        self._cleanup()
        if key in self.cache:
            value, creation, expiry, _ = self.cache[key]
            if expiry > time.time():
                # Update last accessed time
                self.cache[key] = (value, creation, expiry, time.time())
                return value
            else:
                del self.cache[key]
        return None

    def set(self, key, value):
        self._cleanup()
        if len(self.cache) >= self.maxsize:
            # Remove least recently used
            lru_key = min(self.cache.keys(), key=lambda k: self.cache[k][3])
            del self.cache[lru_key]
        
        now = time.time()
        self.cache[key] = (value, now, now + self.ttl_seconds, now)

    def _cleanup(self):
        """Active removal of expired items or items created > 2 hours ago."""
        now = time.time()
        keys_to_remove = [
            k for k, v in self.cache.items()
            if v[2] < now or (now - v[1]) > 7200
        ]
        for k in keys_to_remove:
            del self.cache[k]

_ranked_cache = LRUCacheWithTTL(maxsize=1000, ttl_seconds=3600)


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
async def book_service(payload: BookServiceRequest) -> BookServiceResponse:
    """
    **Stage 3 (Final) of the booking pipeline.**
    Runs Booking Agent → Notification Agent → Follow-Up Agent.

    Includes idempotency guard: rejects duplicate submissions for the same booking.
    """
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
                device_token=payload.device_token,
            )

        result = await asyncio.to_thread(run_booking)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        with _lock_mutex:
            _booking_locks.discard(payload.booking_id)


@router.get("/booking-status/{booking_id}", response_model=BookingStatusResponse, summary="Get booking status")
async def get_booking_status(booking_id: str) -> BookingStatusResponse:
    """
    Returns the current status and details of a booking by its ID.
    """
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
async def get_agent_logs(booking_id: str) -> AgentTraceResponse:
    """
    Returns the full agent reasoning trace for a booking.
    """
    trace = await asyncio.to_thread(db.get_agent_trace, booking_id)
    steps = [AgentTraceStep(**s) for s in trace.get("steps", [])]

    return AgentTraceResponse(
        booking_id=booking_id,
        steps=steps,
    )
