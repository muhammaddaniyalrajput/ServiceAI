"""
POST /api/v1/find-providers
Discovers and ranks nearby service providers based on extracted intent.
"""
from fastapi import APIRouter, HTTPException
from app.models.schemas import FindProvidersRequest, FindProvidersResponse
from app.orchestrator.workflow import orchestrate_find_providers

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
        return orchestrate_find_providers(
            booking_id=payload.booking_id,
            intent=payload.intent,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
