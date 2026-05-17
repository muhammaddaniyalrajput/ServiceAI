"""
Booking Agent — Agent #4
Simulates a booking transaction, generates a confirmation code,
and calculates ETA + estimated cost.
"""
import uuid
import random
from datetime import datetime, timezone, timedelta
from app.core.logger import log_agent
from app.models.schemas import IntentOutput, Provider, BookingResult, BookingStatus

ETA_RANGES = {
    "high":   (15, 35),
    "medium": (30, 90),
    "low":    (60, 180),
}


def _resolve_scheduled_time(datetime_hint: str | None, urgency: str) -> str:
    now = datetime.now(timezone.utc)
    if not datetime_hint:
        offset = timedelta(hours=1 if urgency == "high" else 3)
        return (now + offset).strftime("%Y-%m-%d %H:%M UTC")

    hint = (datetime_hint or "").lower()
    if "kal" in hint or "tomorrow" in hint:
        base = now + timedelta(days=1)
    elif "parso" in hint or "day after" in hint:
        base = now + timedelta(days=2)
    else:
        base = now + timedelta(hours=2)

    if "subah" in hint or "morning" in hint:
        base = base.replace(hour=9, minute=0)
    elif "sham" in hint or "evening" in hint:
        base = base.replace(hour=17, minute=0)
    elif "raat" in hint or "night" in hint:
        base = base.replace(hour=20, minute=0)
    else:
        base = base.replace(hour=10, minute=0)

    return base.strftime("%Y-%m-%d %H:%M UTC")


def run_booking_agent(
    booking_id: str,
    provider: Provider,
    intent: IntentOutput,
) -> tuple[BookingResult, list]:
    """
    Returns (BookingResult, list[AgentLog])
    """
    logs = []

    logs.append(log_agent(
        booking_id=booking_id,
        agent="Booking Agent",
        action="Initiating booking simulation",
        status="processing",
        reasoning=f"Creating booking with provider '{provider.name}' for '{intent.service_type}'.",
    ))

    urgency_str = intent.urgency.value if hasattr(intent.urgency, "value") else str(intent.urgency)
    eta_min, eta_max = ETA_RANGES.get(urgency_str, (30, 90))
    eta = random.randint(eta_min, eta_max)

    scheduled_at = _resolve_scheduled_time(intent.datetime_hint, urgency_str)
    confirmation_code = f"SFW-{uuid.uuid4().hex[:6].upper()}"
    estimated_cost = provider.hourly_rate * 2  # assumes 2-hour job

    booking = BookingResult(
        booking_id=booking_id,
        provider=provider,
        status=BookingStatus.confirmed,
        scheduled_at=scheduled_at,
        eta_minutes=eta,
        total_estimated_cost=estimated_cost,
        confirmation_code=confirmation_code,
    )

    logs.append(log_agent(
        booking_id=booking_id,
        agent="Booking Agent",
        action="Booking confirmed",
        status="success",
        reasoning=(
            f"Booking {confirmation_code} created. "
            f"{provider.name} is scheduled for {scheduled_at}. "
            f"ETA: {eta} minutes. Estimated cost: PKR {estimated_cost}."
        ),
        data=booking.model_dump(exclude={"provider"}),
    ))

    return booking, logs
