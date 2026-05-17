"""
Notification Agent — Agent #5
Generates FCM-ready push notification payloads in the user's detected language.
"""
from app.core.logger import log_agent
from app.models.schemas import BookingResult, IntentOutput

TEMPLATES = {
    "en": {
        "title": "✅ Booking Confirmed!",
        "body":  "Your {service} ({provider}) is booked for {time}. Confirmation: {code}",
    },
    "ur": {
        "title": "✅ بکنگ تصدیق ہو گئی!",
        "body":  "آپ کا {service} ({provider}) {time} کے لیے بک ہو گیا ہے۔ کوڈ: {code}",
    },
    "roman_ur": {
        "title": "✅ Booking Confirm Ho Gayi!",
        "body":  "Aapka {service} ({provider}) {time} ke liye book ho gaya hai. Code: {code}",
    },
}


def run_notification_agent(
    booking_id: str,
    booking: BookingResult,
    intent: IntentOutput,
) -> tuple[dict, list]:
    """
    Returns (notification_payload dict, list[AgentLog])
    """
    logs = []

    logs.append(log_agent(
        booking_id=booking_id,
        agent="Notification Agent",
        action="Preparing push notification",
        status="processing",
        reasoning=f"Detected language: '{intent.language}'. Generating localized notification.",
    ))

    lang = intent.language if intent.language in TEMPLATES else "en"
    tpl = TEMPLATES[lang]

    payload = {
        "fcm_payload": {
            "notification": {
                "title": tpl["title"],
                "body": tpl["body"].format(
                    service=booking.provider.service,
                    provider=booking.provider.name,
                    time=booking.scheduled_at,
                    code=booking.confirmation_code,
                ),
            },
            "data": {
                "booking_id":        booking_id,
                "confirmation_code": booking.confirmation_code,
                "eta_minutes":       str(booking.eta_minutes),
                "status":            "confirmed",
            },
        },
        "language_used": lang,
        "channel": "FCM",
    }

    logs.append(log_agent(
        booking_id=booking_id,
        agent="Notification Agent",
        action="Notification payload ready",
        status="success",
        reasoning=f"Localized notification prepared in '{lang}'. FCM payload built. (In production, this triggers Firebase Cloud Messaging.)",
        data=payload,
    ))

    return payload, logs
