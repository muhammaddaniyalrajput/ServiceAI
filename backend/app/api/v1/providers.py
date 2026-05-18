"""
POST /api/v1/find-providers   — Discovers and ranks nearby service providers.
GET  /api/v1/providers        — Lists all available providers, grouped by service category.
"""
from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    FindProvidersRequest,
    FindProvidersResponse,
    ProvidersListResponse,
    ServiceCategory,
    Provider,
)
from app.orchestrator.workflow import orchestrate_find_providers
from app.services import firebase_db as db

router = APIRouter()


@router.post("/find-providers", response_model=FindProvidersResponse, summary="Find and rank providers")
async def find_providers(payload: FindProvidersRequest) -> FindProvidersResponse:
    """
    **Stage 2 of the booking pipeline.**

    Takes the `booking_id` and `intent` from Stage 1.
    Runs the **Provider Discovery Agent** and **Ranking Agent**.

    Returns a list of `providers` (unranked) and `ranked` (best→worst).

    ---
    **Sample Request:**
    ```json
    {
      "booking_id": "f47ac10b-...",
      "intent": {
        "service_type": "AC Technician",
        "location": "G-13, Islamabad",
        "urgency": "medium",
        "language": "roman_ur",
        "confidence": 0.97
      }
    }
    ```

    **Sample Response (truncated):**
    ```json
    {
      "success": true,
      "providers": [...],
      "ranked": [
        {
          "provider": { "name": "Ali AC Repair & Services", "rating": 4.9, ... },
          "score": 82.5,
          "score_reason": "Score 82.5/100 — Selected because of outstanding rating of 4.9, very close at 1.0km, platform-verified."
        }
      ],
      "logs": [...]
    }
    ```
    """
    try:
        result = orchestrate_find_providers(
            booking_id=payload.booking_id,
            intent=payload.intent,
        )

        # Cache ranked results for Stage 3 (also persisted in Firestore by workflow.py)
        from app.api.v1.bookings import cache_ranked
        cache_ranked(payload.booking_id, result.ranked)

        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/providers", response_model=ProvidersListResponse, summary="List all available providers")
async def list_providers() -> ProvidersListResponse:
    """
    Returns all available service providers, grouped by service category.

    Reads from Firestore `providers` collection if available.
    Falls back to the hardcoded mock dataset during development.

    Useful for the frontend provider browse / discovery UI.
    """
    raw_providers = db.get_all_providers()

    # Group by service category
    categories_map: dict[str, list] = {}
    for p in raw_providers:
        svc = p.get("service", "Other")
        categories_map.setdefault(svc, []).append(p)

    categories = [
        ServiceCategory(
            service=svc,
            count=len(items),
            providers=[Provider(**item) for item in items],
        )
        for svc, items in sorted(categories_map.items())
    ]

    return ProvidersListResponse(
        total=len(raw_providers),
        categories=categories,
    )
