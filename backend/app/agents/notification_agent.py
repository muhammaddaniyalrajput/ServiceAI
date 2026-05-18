"""
Notification Agent — Agent #5
Generates FCM-ready push notification payloads in the user's detected language.
When a device_token is provided, sends a real push notification via FCM.
"""
from app.core.logger import log_agent
from app.models.schemas import BookingResult, IntentOutput
from app.services.fcm_service import send_fcm

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
    *,
    device_token: str | None = None,
) -> tuple[dict, list]:
    """
    Returns (notification_payload dict, list[AgentLog])

    If a device_token is provided and Firebase is initialised,
    sends a real push notification via FCM.
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

    notification_body = {
        "title": tpl["title"],
        "body": tpl["body"].format(
            service=booking.provider.service,
            provider=booking.provider.name,
            time=booking.scheduled_at,
            code=booking.confirmation_code,
        ),
    }

    data_payload = {
        "booking_id":        booking_id,
        "confirmation_code": booking.confirmation_code,
        "eta_minutes":       str(booking.eta_minutes),
        "status":            "confirmed",
    }

    payload = {
        "fcm_payload": {
            "notification": notification_body,
            "data":         data_payload,
        },
        "language_used": lang,
        "channel":       "FCM",
        "fcm_sent":      False,   # updated below if FCM succeeds
    }

    # ── Attempt real FCM send ─────────────────────────────────────────────────
    if device_token:
        fcm_sent = send_fcm(payload["fcm_payload"], device_token=device_token)
        payload["fcm_sent"] = fcm_sent
        fcm_note = (
            f"Real FCM push sent successfully to device."
            if fcm_sent
            else f"FCM send attempted but failed or device token invalid."
        )
    else:
        fcm_note = "No device_token provided — FCM push skipped. Payload ready for client-side handling."

    logs.append(log_agent(
        booking_id=booking_id,
        agent="Notification Agent",
        action="Notification payload ready",
        status="success",
        reasoning=f"Localized notification prepared in '{lang}'. {fcm_note}",
        data=payload,
    ))

    return payload, logs
