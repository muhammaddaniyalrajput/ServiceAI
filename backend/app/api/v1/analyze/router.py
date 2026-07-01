"""
Analyze (Stage 1) — HTTP routes.

Runs the Intent Agent on a natural language request and returns the
extracted intent + agent trace logs.

Lives in the ``analyze`` miniservice — the smaller sibling of the
``bookings`` and ``providers`` packages.
"""
from __future__ import annotations

import asyncio
import re
from fastapi import APIRouter, HTTPException, Depends

from app.core.auth import get_verified_uid
from app.models.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    FindProvidersRequest,
    FindProvidersResponse,
    ProvidersListResponse,
    Provider,
    ServiceCategory,
)
from app.orchestrator.workflow import (
    orchestrate_analyze,
    orchestrate_find_providers,
)

router = APIRouter()

# Simple HTML/script tag stripper used to sanitise free-text input
_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _sanitize_text(text: str) -> str:
    cleaned = _HTML_TAG_RE.sub("", text).strip()
    if len(cleaned) < 3:
        raise ValueError("Input text too short after sanitization.")
    return cleaned


@router.post(
    "/analyze-request",
    response_model=AnalyzeResponse,
    summary="Analyze NL service request",
)
async def analyze_request(
    payload: AnalyzeRequest,
    uid: str = Depends(get_verified_uid),
) -> AnalyzeResponse:
    """Stage 1 of the booking pipeline."""
    try:
        sanitized_text = _sanitize_text(payload.text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    try:
        effective_user_id = uid if uid != "dev_user" else payload.user_id
        result = await asyncio.to_thread(
            orchestrate_analyze,
            user_id=effective_user_id,
            text=sanitized_text,
            coordinates=payload.coordinates,
        )
        return result
    except Exception:
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")


@router.post(
    "/find-providers",
    response_model=FindProvidersResponse,
    summary="Find and rank providers",
)
async def find_providers(payload: FindProvidersRequest) -> FindProvidersResponse:
    """Stage 2 of the booking pipeline."""
    try:
        result = await asyncio.to_thread(
            orchestrate_find_providers,
            booking_id=payload.booking_id,
            intent=payload.intent,
        )
        # Hand-off to Stage 3 cache
        from app.api.v1.bookings.services import cache_ranked
        await asyncio.to_thread(cache_ranked, payload.booking_id, result.ranked)
        return result
    except Exception:
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")


@router.get(
    "/providers",
    response_model=ProvidersListResponse,
    summary="List all available providers",
)
async def list_providers() -> ProvidersListResponse:
    from app.api.v1.providers.services import get_all_providers
    raw = await asyncio.to_thread(get_all_providers)
    categories_map: dict = {}
    for p in raw:
        svc_name = p.get("service", "Other")
        categories_map.setdefault(svc_name, []).append(p)
    categories = [
        ServiceCategory(
            service=svc_name, count=len(items),
            providers=[Provider(**item) for item in items],
        )
        for svc_name, items in sorted(categories_map.items())
    ]
    return ProvidersListResponse(total=len(raw), categories=categories)
