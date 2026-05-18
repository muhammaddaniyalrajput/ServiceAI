"""
Firebase Cloud Messaging service.

Wraps firebase_admin.messaging.send() with graceful fallback:
  - If device_token is None → logs and returns False (no crash).
  - If Firebase is not initialised → logs and returns False.
  - On any FCM error → logs the error and returns False.
"""
import logging
import firebase_admin
from firebase_admin import messaging

logger = logging.getLogger("serviceflow")


def send_fcm(fcm_payload: dict, device_token: str | None = None) -> bool:
    """
    Send a push notification via Firebase Cloud Messaging.

    Parameters
    ----------
    fcm_payload : dict
        Must contain a "notification" key with "title" and "body".
        May contain a "data" key with string key-value pairs.
    device_token : str | None
        The target device's FCM registration token.

    Returns
    -------
    bool
        True if the message was sent successfully, False otherwise.
    """
    if not device_token:
        logger.info("FCM: No device_token provided — skipping push notification send.")
        return False

    if not firebase_admin._apps:
        logger.warning("FCM: Firebase not initialised — skipping push notification send.")
        return False

    try:
        notification_data = fcm_payload.get("notification", {})
        data_payload = fcm_payload.get("data", {})

        # firebase_admin.messaging requires all data values to be strings
        clean_data = {k: str(v) for k, v in data_payload.items()}

        message = messaging.Message(
            notification=messaging.Notification(
                title=notification_data.get("title", ""),
                body=notification_data.get("body", ""),
            ),
            data=clean_data,
            token=device_token,
        )

        response = messaging.send(message)
        logger.info("FCM: Push notification sent successfully. Message ID: %s", response)
        return True

    except messaging.UnregisteredError:
        logger.warning("FCM: Device token is unregistered / expired: %s", device_token[:20])
        return False
    except Exception as exc:
        logger.error("FCM: Failed to send push notification: %s", exc)
        return False
