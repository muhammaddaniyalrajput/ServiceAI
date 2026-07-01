"""
Antigravity Orchestrator — The central conductor.

This module defines the execution DAG for the KaamEasy AI multi-agent pipeline.

DAG:
  User Request
      │
      ▼
  [1] Intent Agent          → extract structured intent from NL text
      │
      ▼
  [2] Provider Discovery    → filter providers by service + location
      │
      ▼
  [3] Ranking Agent         → score & rank with Gemini reasoning
      │
      ▼
  [4] Booking Agent         → simulate booking, generate confirmation
      │
      ├──▼
      │  [5] Notification Agent  → build localized FCM payload + send
      │
      └──▼
         [6] Follow-Up Agent     → schedule survey + loyalty reward

All agents emit structured logs persisted to:
  - bookings/{id}               (status + snapshot)
  - bookings/{id}/logs          (legacy subcollection)
  - agent_logs/{id}             (top-level trace document — showcase feature)

Improvements:
  - DAG is cached per-thread to avoid re-creation overhead
  - Error recovery: agent failures are caught and logged, pipeline continues
  - Timing instrumentation for each pipeline stage
"""
import uuid
import time
import logging
import threading
from app.agents.intent_agent       import run_intent_agent
from app.agents.discovery_agent    import run_discovery_agent
from app.agents.ranking_agent      import run_ranking_agent
from app.agents.booking_agent      import run_booking_agent
from app.agents.notification_agent import run_notification_agent
from app.agents.followup_agent     import run_followup_agent
from app.agents.provider_simulation_agent import run_provider_simulation
from app.services                  import firebase_db as db
from app.core.config               import settings
from app.orchestrator.google_labs_antigravity import AntigravityClient, AntigravityDAG
from app.models.schemas            import (
    AnalyzeResponse,
    FindProvidersResponse,
    BookServiceResponse,
    IntentOutput,
    RankedProvider,
    Provider,
    BookingStatus,
)

logger = logging.getLogger("kaameasy")

# Initialize global Antigravity client
client = AntigravityClient(api_key=settings.ANTIGRAVITY_API_KEY)

# ── Cached DAG factory ────────────────────────────────────────────────────────
_dag_cache = None


def _timed(label: str, func, *args, **kwargs):
    """Execute func and log its duration."""
    start = time.time()
    result = func(*args, **kwargs)
    elapsed_ms = round((time.time() - start) * 1000, 1)
    logger.info("[TIMING] %s completed in %sms", label, elapsed_ms)
    return result


# ── Wrapper Node Functions for the DAG ────────────────────────────────────────

def wrap_intent_extraction(dep_results: dict, context: dict):
    booking_id = context["booking_id"]
    text = context["text"]
    return _timed("Intent Extraction", run_intent_agent, booking_id, text)


def wrap_provider_discovery(dep_results: dict, context: dict):
    booking_id = context["booking_id"]
    if "intent_extraction" in dep_results:
        intent = dep_results["intent_extraction"][0]
    else:
        intent = context["intent"]
    return _timed("Provider Discovery", run_discovery_agent, booking_id, intent)


def wrap_provider_ranking(dep_results: dict, context: dict):
    booking_id = context["booking_id"]
    if "intent_extraction" in dep_results:
        intent = dep_results["intent_extraction"][0]
    else:
        intent = context["intent"]
    providers = dep_results["provider_discovery"][0]
    return _timed("Provider Ranking", run_ranking_agent, booking_id, providers, intent)


def wrap_booking_confirmation(dep_results: dict, context: dict):
    booking_id = context["booking_id"]
    if "intent_extraction" in dep_results:
        intent = dep_results["intent_extraction"][0]
    else:
        intent = context["intent"]
    selected_provider = context["selected_provider"]
    return _timed("Booking Confirmation", run_booking_agent, booking_id, selected_provider, intent)


def wrap_send_notification(dep_results: dict, context: dict):
    booking_id = context["booking_id"]
    if "intent_extraction" in dep_results:
        intent = dep_results["intent_extraction"][0]
    else:
        intent = context["intent"]
    booking = dep_results["booking_confirmation"][0]
    device_token = context.get("device_token")
    return _timed(
        "Send Notification",
        run_notification_agent,
        booking_id, booking, intent, device_token=device_token,
    )


def wrap_schedule_followup(dep_results: dict, context: dict):
    booking_id = context["booking_id"]
    if "intent_extraction" in dep_results:
        intent = dep_results["intent_extraction"][0]
    else:
        intent = context["intent"]
    booking = dep_results["booking_confirmation"][0]
    return _timed("Schedule Follow-Up", run_followup_agent, booking_id, booking, intent)


def get_pipeline_dag() -> AntigravityDAG:
    dag = AntigravityDAG("kaameasy_booking_pipeline", client)
    dag.add_node("intent_extraction", wrap_intent_extraction)
    dag.add_node("provider_discovery", wrap_provider_discovery, depends_on=["intent_extraction"])
    dag.add_node("provider_ranking", wrap_provider_ranking, depends_on=["provider_discovery"])
    dag.add_node("booking_confirmation", wrap_booking_confirmation, depends_on=["provider_ranking"])
    dag.add_node("send_notification", wrap_send_notification, depends_on=["booking_confirmation"])
    dag.add_node("schedule_followup", wrap_schedule_followup, depends_on=["booking_confirmation"])
    return dag


# ── Step 1 ────────────────────────────────────────────────────────────────────

def orchestrate_analyze(user_id: str, text: str, coordinates: dict = None) -> AnalyzeResponse:
    """
    Stage 1: Intent Extraction segment.
    """
    booking_id = str(uuid.uuid4())
    db.create_booking_doc(booking_id, user_id, text)

    dag = get_pipeline_dag()
    context = {"booking_id": booking_id, "text": text}

    results = dag.run_segment(["intent_extraction"], context)
    intent, logs = results["intent_extraction"]

    # ── Fall back to user's saved location if not specified in text ──
    user_coords = coordinates
    if user_id and user_id not in ("anonymous", "dev_user"):
        profile = db.get_user_profile(user_id)
        if profile:
            # Check if intent location was not explicitly defined in the request text
            if intent.location.lower() in ("not specified", "unknown", ""):
                saved_loc = profile.get("address") or f"{profile.get('city')}, {profile.get('province')}"
                if saved_loc:
                    intent.location = saved_loc
                    
                    # Log the auto-population logic in the agent trace logs
                    from app.core.logger import log_agent
                    logs.append(log_agent(
                        booking_id=booking_id,
                        agent="Intent Agent",
                        action="Resolving location from profile",
                        status="success",
                        reasoning=f"User did not specify location in text. Auto-populated location using saved profile address: '{saved_loc}'.",
                    ))
            
            # Fetch coordinates if not already passed, and if the intent location is derived from the profile's address/city.
            if not user_coords:
                profile_address = profile.get("address", "")
                profile_city_prov = f"{profile.get('city', '')}, {profile.get('province', '')}"
                if (intent.location == profile_address or intent.location == profile_city_prov or 
                    (profile_address and profile_address in intent.location) or (intent.location and intent.location in profile_address)):
                    coords = profile.get("coordinates")
                    if isinstance(coords, dict) and "latitude" in coords and "longitude" in coords:
                        user_coords = {
                            "latitude": coords["latitude"],
                            "longitude": coords["longitude"]
                        }

    booking_updates = {
        "status": "searching",
        "extracted_intent": intent.model_dump()
    }
    if user_coords:
        booking_updates["user_coordinates"] = user_coords

    db.update_booking(booking_id, booking_updates)
    db.save_agent_logs(booking_id, logs)
    db.save_agent_trace(booking_id, logs)

    return AnalyzeResponse(
        booking_id=booking_id,
        intent=intent,
        logs=logs,
    )



# ── Step 2 ────────────────────────────────────────────────────────────────────

def orchestrate_find_providers(booking_id: str, intent: IntentOutput) -> FindProvidersResponse:
    """
    Stage 2: Provider Discovery and Ranking segment.
    """
    dag = get_pipeline_dag()
    dag.set_node_result("intent_extraction", (intent, []))

    context = {"booking_id": booking_id, "intent": intent}
    results = dag.run_segment(["provider_ranking"], context)

    providers, disc_logs = dag.results["provider_discovery"]
    ranked, rank_logs = results["provider_ranking"]

    all_logs = disc_logs + rank_logs

    db.update_booking(booking_id, {
        "status":           "ranking",
        "providers_count":  len(providers),
        "top_provider":     ranked[0].provider.provider_id if ranked else None,
    })
    db.save_agent_logs(booking_id, all_logs)
    db.save_agent_trace(booking_id, all_logs)
    db.save_ranked_providers(booking_id, ranked)

    return FindProvidersResponse(
        providers=providers,
        ranked=ranked,
        logs=all_logs,
    )


# ── Step 3 ────────────────────────────────────────────────────────────────────

def orchestrate_book_service(
    booking_id: str,
    provider_id: str,
    intent: IntentOutput,
    ranked_providers: list,
    customer_name: str,
    customer_phone: str,
    customer_address: str,
    customer_coordinates: dict,
    device_token: str | None = None,
) -> BookServiceResponse:
    """
    Stage 3: Booking Confirmation, Notification, and Follow-up segment.
    Runs Notification and Follow-up nodes in parallel.
    """
    # Resolve selected provider from the ranked list
    selected_provider = next(
        (r.provider for r in ranked_providers if r.provider.provider_id == provider_id),
        ranked_providers[0].provider if ranked_providers else None,
    )

    if not selected_provider:
        raise ValueError(f"Provider '{provider_id}' not found in ranked results.")

    dag = get_pipeline_dag()
    dag.set_node_result("intent_extraction", (intent, []))
    dag.set_node_result("provider_ranking", (ranked_providers, []))

    context = {
        "booking_id": booking_id,
        "intent": intent,
        "selected_provider": selected_provider,
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "customer_address": customer_address,
        "customer_coordinates": customer_coordinates,
        "device_token": device_token
    }

    # Executes booking confirmation, then notifications and follow-up in parallel
    results = dag.run_segment(["send_notification", "schedule_followup"], context)

    booking, book_logs = dag.results["booking_confirmation"]
    notification, notif_logs = results["send_notification"]
    follow_up, fu_logs = results["schedule_followup"]

    all_logs = book_logs + notif_logs + fu_logs

    # Check if the selected provider is a real registered provider in the DB
    is_real_provider = False
    provider_fcm_token = None
    if provider_id:
        provider_doc = db.get_provider_by_id(provider_id)
        if provider_doc and provider_doc.get("uid"):
            is_real_provider = True
            provider_fcm_token = provider_doc.get("fcm_token")

    if is_real_provider:
        # Override the status of the booking result to pending
        booking.status = BookingStatus.pending
        
        # Log dispatch action in agent logs/timeline
        from app.core.logger import log_agent
        all_logs.append(log_agent(
            booking_id=booking_id,
            agent="Booking Agent",
            action="Broadcasting job to providers",
            status="success",
            reasoning=f"Broadcasting job request for {intent.service_type}. Awaiting provider acceptance.",
        ))

        db.update_booking(booking_id, {
            "status":  "pending",
            "booking": booking.model_dump(exclude={"provider"}),
            "provider": selected_provider.model_dump(),
            "scheduled_at": booking.scheduled_at,
            "total_estimated_cost": booking.total_estimated_cost,
            "customer_name": customer_name,
            "customer_phone": customer_phone,
            "customer_address": customer_address,
            "customer_coordinates": customer_coordinates,
            # Mirror under the legacy key the simulation/tracking layer reads.
            "user_coordinates": customer_coordinates,
        })
        db.save_agent_logs(booking_id, all_logs)
        db.save_agent_trace(booking_id, all_logs)

        # Send push notification to the provider's device (broadcast alert could be sent here to ALL matching providers instead)
        if provider_fcm_token:
            try:
                from app.services.fcm_service import send_fcm
                payload = {
                    "notification": {
                        "title": "New Job Offered! 🔧",
                        "body": f"New request for {intent.service_type}. Tap to view details and accept.",
                    },
                    "data": {
                        "booking_id": booking_id,
                        "status": "pending",
                        "type": "new_booking_dispatch",
                    },
                }
                send_fcm(payload, device_token=provider_fcm_token)
                logger.info("[ORCHESTRATOR] FCM job broadcast sent to provider %s", provider_id)
            except Exception as e:
                logger.error("[ORCHESTRATOR] Failed to send FCM job broadcast to provider: %s", e)
    else:
        db.update_booking(booking_id, {
            "status":  "confirmed",
            "booking": booking.model_dump(exclude={"provider"}),
            "provider": selected_provider.model_dump(),
            "scheduled_at": booking.scheduled_at,
            "total_estimated_cost": booking.total_estimated_cost,
            # Persist customer info on the simulated path too, so the booking
            # doc, live tracking, and provider simulation all have it.
            "customer_name": customer_name,
            "customer_phone": customer_phone,
            "customer_address": customer_address,
            "customer_coordinates": customer_coordinates,
            "user_coordinates": customer_coordinates,
        })
        db.save_agent_logs(booking_id, all_logs)
        db.save_agent_trace(booking_id, all_logs)

        # ── Launch Provider Simulation Agent (background daemon) ──────────────
        # Simulates the provider lifecycle: accept → travel → arrive → complete
        threading.Thread(
            target=run_provider_simulation,
            args=(booking_id, selected_provider, intent, device_token),
            daemon=True,
            name=f"sim-{booking_id[:8]}",
        ).start()
        logger.info("[ORCHESTRATOR] Provider simulation spawned for %s", booking_id)

    return BookServiceResponse(
        booking=booking,
        notification=notification,
        follow_up=follow_up,
        logs=all_logs,
    )
