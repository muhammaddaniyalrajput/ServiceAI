"""
POST /api/v1/analyze-request
Accepts raw natural language text and returns extracted intent + agent logs.
The user_id is derived from the verified Firebase Auth token (falls back to
the request body field in mock / dev mode).
"""
from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import AnalyzeRequest, AnalyzeResponse
from app.orchestrator.workflow import orchestrate_analyze
from app.core.auth import get_verified_uid

router = APIRouter()


@router.post("/analyze-request", response_model=AnalyzeResponse, summary="Analyze NL service request")
async def analyze_request(
    payload: AnalyzeRequest,
    uid: str = Depends(get_verified_uid),
) -> AnalyzeResponse:
    """
    **Stage 1 of the booking pipeline.**

    Accepts a natural language request in English, Urdu, or Roman Urdu.
    Runs the **Intent Agent** to extract:
    - `service_type`
    - `location`
    - `datetime_hint`
    - `urgency`
    - `language`

    Returns a `booking_id` that is used in all subsequent calls.

    Requires `Authorization: Bearer <firebase_id_token>` header.
    In development / mock mode the header is optional.

    ---
    **Sample Request:**
    ```json
    {
      "user_id": "user_abc123",
      "text": "Mujhe kal subah G-13 mein AC technician chahiye"
    }
    ```

    **Sample Response:**
    ```json
    {
      "success": true,
      "booking_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "intent": {
        "service_type": "AC Technician",
        "location": "G-13, Islamabad",
        "datetime_hint": "kal subah (tomorrow morning)",
        "urgency": "medium",
        "language": "roman_ur",
        "confidence": 0.97
      },
      "logs": [...]
    }
    ```
    """
    try:
        # Prefer verified uid from token; fall back to body field for dev convenience
        effective_user_id = uid if uid != "dev_user" else payload.user_id
        return orchestrate_analyze(user_id=effective_user_id, text=payload.text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
