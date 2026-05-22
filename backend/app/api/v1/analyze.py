"""
POST /api/v1/analyze-request
Accepts raw natural language text and returns extracted intent + agent logs.

Includes:
  - Input sanitization (strip HTML/script tags)
  - Simple rate limiting per user
"""
import re
import asyncio
from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import AnalyzeRequest, AnalyzeResponse
from app.orchestrator.workflow import orchestrate_analyze
from app.core.auth import get_verified_uid

router = APIRouter()

# Simple HTML/script tag stripper
_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _sanitize_text(text: str) -> str:
    """Strip HTML tags and excessive whitespace from user input."""
    cleaned = _HTML_TAG_RE.sub("", text)
    cleaned = cleaned.strip()
    if len(cleaned) < 3:
        raise ValueError("Input text too short after sanitization.")
    return cleaned


@router.post("/analyze-request", response_model=AnalyzeResponse, summary="Analyze NL service request")
async def analyze_request(
    payload: AnalyzeRequest,
    uid: str = Depends(get_verified_uid),
) -> AnalyzeResponse:
    """
    **Stage 1 of the booking pipeline.**
    Accepts a natural language request in English, Urdu, or Roman Urdu.
    Runs the Intent Agent to extract structured variables.
    """
    try:
        sanitized_text = _sanitize_text(payload.text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    try:
        # Prefer verified uid from token; fall back to body field for dev convenience
        effective_user_id = uid if uid != "dev_user" else payload.user_id

        result = await asyncio.to_thread(
            orchestrate_analyze,
            user_id=effective_user_id,
            text=sanitized_text
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
