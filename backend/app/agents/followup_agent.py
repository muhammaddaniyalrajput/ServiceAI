"""
Follow-Up Agent — Agent #6
Schedules post-service reminders and generates a satisfaction survey payload.
"""
from datetime import datetime, timezone, timedelta
from app.core.logger import log_agent
from app.models.schemas import BookingResult, IntentOutput


def run_followup_agent(
    booking_id: str,
    booking: BookingResult,
    intent: IntentOutput,
) -> tuple[dict, list]:
    """
    Returns (follow_up_payload dict, list[AgentLog])
    """
    logs = []

    logs.append(log_agent(
        booking_id=booking_id,
        agent="Follow-Up Agent",
        action="Planning post-service follow-up",
        status="processing",
        reasoning="Scheduling reminder and satisfaction survey based on booking time.",
    ))

    # Schedule survey 2 hours after appointment
    remind_at = (datetime.now(timezone.utc) + timedelta(hours=booking.eta_minutes / 60 + 2)).strftime("%Y-%m-%d %H:%M UTC")

    payload = {
        "reminder": {
            "type":       "in_app",
            "trigger_at": remind_at,
            "message":    f"How was your experience with {booking.provider.name}? Tap to rate.",
        },
        "survey": {
            "booking_id":   booking_id,
            "provider_id":  booking.provider.provider_id,
            "rating_prompt": "Rate your service experience (1–5 stars)",
            "fields":       ["rating", "comment", "would_recommend"],
        },
        "loyalty": {
            "points_earned": 50,
            "message":       "🎉 You earned 50 ServiceFlow points! Use them on your next booking.",
        },
    }

    logs.append(log_agent(
        booking_id=booking_id,
        agent="Follow-Up Agent",
        action="Follow-up scheduled",
        status="success",
        reasoning=f"Survey scheduled for {remind_at}. Loyalty points: 50.",
        data=payload,
    ))

    return payload, logs
