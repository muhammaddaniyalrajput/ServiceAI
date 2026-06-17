"""
Provider Simulation Agent — Agent #7

Simulates a real service provider's lifecycle after a booking is confirmed.
Runs as a background daemon thread and progresses through:
  confirmed → accepted → on_the_way (with GPS streaming) → arrived → in_progress → completed

Each status transition:
  1. Updates the booking document in Firestore
  2. Writes a structured trace step to agent_logs/{booking_id}
  3. Sends an FCM push notification (if device token available)

This allows the Customer App to show real-time map tracking and live
agent reasoning logs without requiring a separate Provider mobile app.
"""
import time
import math
import logging
from app.core.logger import log_agent
from app.services import firebase_db as db
from app.services.fcm_service import send_fcm
from app.models.schemas import Provider, IntentOutput

logger = logging.getLogger("serviceflow")

# ── Configuration ─────────────────────────────────────────────────────────────

ACCEPT_DELAY_S       = 3     # seconds before provider "accepts"
DEPART_DELAY_S       = 5     # seconds before provider "departs"
WAYPOINT_INTERVAL_S  = 5     # seconds between GPS coordinate updates
NUM_WAYPOINTS        = 10    # number of intermediate travel points
ARRIVE_PAUSE_S       = 8     # seconds at "arrived" before starting work
WORK_DURATION_S      = 15    # seconds of simulated "in_progress" work


def _interpolate_waypoints(
    start_lat: float, start_lng: float,
    end_lat: float, end_lng: float,
    num_points: int,
) -> list[tuple[float, float]]:
    """
    Generate `num_points` intermediate GPS coordinates along a slightly curved
    path from start to end. Adds a small sinusoidal offset to simulate realistic
    road-following rather than a perfectly straight line.
    """
    waypoints = []
    for i in range(1, num_points + 1):
        t = i / (num_points + 1)
        # Sinusoidal curve offset to simulate road deviation
        curve_offset = math.sin(t * math.pi) * 0.002
        lat = start_lat + (end_lat - start_lat) * t + curve_offset
        lng = start_lng + (end_lng - start_lng) * t - curve_offset * 0.5
        waypoints.append((round(lat, 6), round(lng, 6)))
    return waypoints


def _send_status_notification(
    booking_id: str,
    status: str,
    provider_name: str,
    device_token: str | None,
) -> None:
    """Send an FCM push notification for a status transition."""
    messages = {
        "accepted":    f"✅ {provider_name} has accepted your booking!",
        "on_the_way":  f"🚗 {provider_name} is on the way to your location.",
        "arrived":     f"📍 {provider_name} has arrived at your location!",
        "in_progress": f"🔧 {provider_name} has started working on your service.",
        "completed":   f"🎉 Service completed! Please rate your experience.",
    }
    body = messages.get(status, f"Booking status updated to: {status}")
    payload = {
        "notification": {
            "title": "ServiceFlow AI — Booking Update",
            "body": body,
        },
        "data": {
            "booking_id": booking_id,
            "status": status,
            "type": "tracking_update",
        },
    }
    if device_token:
        send_fcm(payload, device_token=device_token)


def run_provider_simulation(
    booking_id: str,
    provider: Provider,
    intent: IntentOutput,
    device_token: str | None = None,
) -> None:
    """
    Background thread entry point.
    Simulates the full provider lifecycle for a confirmed booking.
    """
    logger.info("[SIM] Starting provider simulation for booking %s", booking_id)

    # Resolve coordinates
    provider_lat = provider.latitude
    provider_lng = provider.longitude

    # Get the customer's saved coordinates from the booking document
    booking_data = db.get_booking(booking_id)
    user_coords = booking_data.get("user_coordinates") if booking_data else None

    if user_coords and isinstance(user_coords, dict):
        user_lat = user_coords.get("latitude", provider_lat + 0.015)
        user_lng = user_coords.get("longitude", provider_lng + 0.012)
    else:
        # Fallback: simulate a ~1.5km offset
        user_lat = provider_lat + 0.015
        user_lng = provider_lng + 0.012

    try:
        # ── Phase 1: Provider Accepts ─────────────────────────────────────────
        time.sleep(ACCEPT_DELAY_S)

        logs = [log_agent(
            booking_id=booking_id,
            agent="Provider Simulation",
            action="Provider accepted booking",
            status="success",
            reasoning=(
                f"{provider.name} has reviewed the booking request for "
                f"'{intent.service_type}' and accepted the job. "
                f"Preparing to depart from current location."
            ),
        )]
        db.save_agent_trace(booking_id, logs)
        db.update_booking(booking_id, {"status": "accepted"})
        _send_status_notification(booking_id, "accepted", provider.name, device_token)
        logger.info("[SIM] %s: status → accepted", booking_id)

        # ── Phase 2: Provider Departs ─────────────────────────────────────────
        time.sleep(DEPART_DELAY_S)

        logs = [log_agent(
            booking_id=booking_id,
            agent="Provider Simulation",
            action="Provider departed — en route",
            status="processing",
            reasoning=(
                f"{provider.name} has departed and is now traveling toward "
                f"the customer's location. Live GPS tracking enabled."
            ),
        )]
        db.save_agent_trace(booking_id, logs)
        db.update_booking(booking_id, {"status": "on_the_way"})
        db.update_provider_coordinates(booking_id, provider_lat, provider_lng)
        _send_status_notification(booking_id, "on_the_way", provider.name, device_token)
        logger.info("[SIM] %s: status → on_the_way", booking_id)

        # ── Phase 3: GPS Coordinate Streaming ─────────────────────────────────
        waypoints = _interpolate_waypoints(
            provider_lat, provider_lng, user_lat, user_lng, NUM_WAYPOINTS,
        )

        for i, (lat, lng) in enumerate(waypoints, 1):
            time.sleep(WAYPOINT_INTERVAL_S)
            db.update_provider_coordinates(booking_id, lat, lng)

            # Calculate remaining ETA
            remaining_fraction = 1 - (i / len(waypoints))
            eta_remaining = max(1, int(remaining_fraction * 20))  # ~20 min simulated total

            db.update_booking(booking_id, {
                "simulation_eta_minutes": eta_remaining,
            })

            # Log every 3rd waypoint to avoid spamming the trace
            if i % 3 == 0 or i == len(waypoints):
                logs = [log_agent(
                    booking_id=booking_id,
                    agent="Provider Simulation",
                    action=f"GPS update ({i}/{len(waypoints)})",
                    status="processing",
                    reasoning=(
                        f"{provider.name} is en route. "
                        f"Current position: ({lat}, {lng}). "
                        f"Estimated arrival: ~{eta_remaining} minutes."
                    ),
                    data={"latitude": lat, "longitude": lng, "eta_minutes": eta_remaining},
                )]
                db.save_agent_trace(booking_id, logs)

            logger.info("[SIM] %s: waypoint %d/%d → (%.6f, %.6f)",
                        booking_id, i, len(waypoints), lat, lng)

        # ── Phase 4: Provider Arrives ─────────────────────────────────────────
        db.update_provider_coordinates(booking_id, user_lat, user_lng)
        logs = [log_agent(
            booking_id=booking_id,
            agent="Provider Simulation",
            action="Provider arrived at customer location",
            status="success",
            reasoning=(
                f"{provider.name} has arrived at the customer's address. "
                f"Preparing to begin {intent.service_type} service."
            ),
        )]
        db.save_agent_trace(booking_id, logs)
        db.update_booking(booking_id, {"status": "arrived", "simulation_eta_minutes": 0})
        _send_status_notification(booking_id, "arrived", provider.name, device_token)
        logger.info("[SIM] %s: status → arrived", booking_id)

        # ── Phase 5: Work In Progress ─────────────────────────────────────────
        time.sleep(ARRIVE_PAUSE_S)

        logs = [log_agent(
            booking_id=booking_id,
            agent="Provider Simulation",
            action="Service work in progress",
            status="processing",
            reasoning=(
                f"{provider.name} has started working on the "
                f"'{intent.service_type}' service. Estimated completion: "
                f"~{WORK_DURATION_S} seconds (simulated)."
            ),
        )]
        db.save_agent_trace(booking_id, logs)
        db.update_booking(booking_id, {"status": "in_progress"})
        _send_status_notification(booking_id, "in_progress", provider.name, device_token)
        logger.info("[SIM] %s: status → in_progress", booking_id)

        time.sleep(WORK_DURATION_S)

        # ── Phase 6: Job Completed ────────────────────────────────────────────
        logs = [log_agent(
            booking_id=booking_id,
            agent="Provider Simulation",
            action="Service completed successfully",
            status="success",
            reasoning=(
                f"{provider.name} has completed the '{intent.service_type}' service. "
                f"Total estimated cost: PKR {provider.hourly_rate * 2}. "
                f"Thank you for using ServiceFlow AI!"
            ),
        )]
        db.save_agent_trace(booking_id, logs)
        db.update_booking(booking_id, {"status": "completed"})
        _send_status_notification(booking_id, "completed", provider.name, device_token)
        logger.info("[SIM] %s: status → completed ✅", booking_id)

    except Exception as exc:
        logger.error("[SIM] Provider simulation failed for %s: %s", booking_id, exc)
        try:
            logs = [log_agent(
                booking_id=booking_id,
                agent="Provider Simulation",
                action="Simulation error",
                status="error",
                reasoning=f"Provider simulation encountered an error: {exc}",
            )]
            db.save_agent_trace(booking_id, logs)
        except Exception:
            pass
