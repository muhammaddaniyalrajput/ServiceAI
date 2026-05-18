"""
Antigravity Orchestrator — The central conductor.

This module defines the execution DAG for the ServiceFlow AI multi-agent pipeline.

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
"""
import uuid
from app.agents.intent_agent       import run_intent_agent
from app.agents.discovery_agent    import run_discovery_agent
from app.agents.ranking_agent      import run_ranking_agent
from app.agents.booking_agent      import run_booking_agent
from app.agents.notification_agent import run_notification_agent
from app.agents.followup_agent     import run_followup_agent
from app.services                  import firebase_db as db
from app.models.schemas            import (
    AnalyzeResponse,
    FindProvidersResponse,
    BookServiceResponse,
    IntentOutput,
    RankedProvider,
    Provider,
)


# ── Step 1 ────────────────────────────────────────────────────────────────────

def orchestrate_analyze(user_id: str, text: str) -> AnalyzeResponse:
    """
    Node 1: Receive raw text → run Intent Agent → persist → return.
    """
    booking_id = str(uuid.uuid4())
    db.create_booking_doc(booking_id, user_id, text)

    intent, logs = run_intent_agent(booking_id, text)

    db.update_booking(booking_id, {"status": "searching", "extracted_intent": intent.model_dump()})
    db.save_agent_logs(booking_id, logs)
    db.save_agent_trace(booking_id, logs)   # ← dedicated agent_logs collection

    return AnalyzeResponse(
        booking_id=booking_id,
        intent=intent,
        logs=logs,
    )


# ── Step 2 ────────────────────────────────────────────────────────────────────

def orchestrate_find_providers(booking_id: str, intent: IntentOutput) -> FindProvidersResponse:
    """
    Node 2 + 3: Run Discovery Agent then Ranking Agent.
    Persists the ranked list to Firestore so Stage 3 survives a server restart.
    """
    # Discovery
    providers, disc_logs = run_discovery_agent(booking_id, intent)

    # Ranking
    ranked, rank_logs = run_ranking_agent(booking_id, providers, intent)

    all_logs = disc_logs + rank_logs

    db.update_booking(booking_id, {
        "status":           "ranking",
        "providers_count":  len(providers),
        "top_provider":     ranked[0].provider.provider_id if ranked else None,
    })
    db.save_agent_logs(booking_id, all_logs)
    db.save_agent_trace(booking_id, all_logs)    # ← dedicated agent_logs collection
    db.save_ranked_providers(booking_id, ranked)  # ← persist for Stage 3

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
    device_token: str | None = None,
) -> BookServiceResponse:
    """
    Node 4 + 5 + 6: Booking → Notification → Follow-Up.

    ranked_providers: list[RankedProvider] — comes from the API layer which
    tries the in-memory cache first, then falls back to Firestore.
    """
    # Resolve selected provider from the ranked list
    selected_provider = next(
        (r.provider for r in ranked_providers if r.provider.provider_id == provider_id),
        ranked_providers[0].provider if ranked_providers else None,
    )

    if not selected_provider:
        raise ValueError(f"Provider '{provider_id}' not found in ranked results.")

    # Booking
    booking, book_logs = run_booking_agent(booking_id, selected_provider, intent)

    # Notification (+ real FCM send)
    notification, notif_logs = run_notification_agent(
        booking_id, booking, intent, device_token=device_token
    )

    # Follow-Up
    follow_up, fu_logs = run_followup_agent(booking_id, booking, intent)

    all_logs = book_logs + notif_logs + fu_logs

    db.update_booking(booking_id, {
        "status":  "confirmed",
        "booking": booking.model_dump(exclude={"provider"}),
    })
    db.save_agent_logs(booking_id, all_logs)
    db.save_agent_trace(booking_id, all_logs)   # ← dedicated agent_logs collection

    return BookServiceResponse(
        booking=booking,
        notification=notification,
        follow_up=follow_up,
        logs=all_logs,
    )
