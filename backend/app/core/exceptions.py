"""
Centralized exception handlers for FastAPI.

Includes:
  - HTTPException handler with request-ID
  - FastAPI RequestValidationError handler (422 — request body / query param validation)
  - Pydantic ValidationError handler (422 — internal model validation)
  - Generic exception handler (500 catch-all)

Note: FastAPI's built-in 422 handler uses `RequestValidationError` (from
`fastapi.exceptions`), which is DIFFERENT from Pydantic's `ValidationError`.
Both must be registered separately to produce consistent JSON error shapes.
"""
from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError
import logging

logger = logging.getLogger("kaameasy")


def _get_request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


def _format_pydantic_errors(errors: list) -> list[dict]:
    """Convert Pydantic error dicts into a clean, consistent shape."""
    result = []
    for err in errors:
        # Skip the top-level 'body' wrapper Pydantic adds for request bodies
        loc_parts = [str(part) for part in err.get("loc", []) if part != "body"]
        field = " → ".join(loc_parts) if loc_parts else "input"
        result.append({
            "field": field,
            "message": err.get("msg", "Validation error"),
            "type": err.get("type", ""),
        })
    return result


# ── HTTP Exception (4xx / 5xx raised explicitly in route handlers) ────────────

async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": exc.detail,
            "request_id": _get_request_id(request),
        },
    )


# ── FastAPI Request Validation Error (422 — body / query / path params) ───────
# This fires when the incoming request body fails schema validation BEFORE
# the route handler is even called. Previously unregistered, so FastAPI's
# default handler returned raw Pydantic output to clients.

async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = _format_pydantic_errors(exc.errors())

    logger.warning(
        "Request validation error on %s %s: %s",
        request.method,
        request.url.path,
        errors,
    )

    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": "Validation failed — please check your input.",
            "details": errors,
            "request_id": _get_request_id(request),
        },
    )


# ── Pydantic Internal Validation Error (422 — model instantiation) ────────────
# Fires when code inside a route handler manually instantiates a Pydantic model
# with invalid data (rare, but important to handle consistently).

async def validation_exception_handler(request: Request, exc: ValidationError):
    errors = _format_pydantic_errors(exc.errors())

    logger.warning(
        "Internal validation error on %s %s: %s",
        request.method,
        request.url.path,
        errors,
    )

    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": "Validation failed — please check your input.",
            "details": errors,
            "request_id": _get_request_id(request),
        },
    )


# ── Generic Exception (500 catch-all) ─────────────────────────────────────────

async def generic_exception_handler(request: Request, exc: Exception):
    request_id = _get_request_id(request)
    logger.exception("Unhandled exception [%s]: %s", request_id, exc)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "request_id": request_id,
        },
    )

# ── Custom Validation Exception Class ────────────────────────────────────────
# Yeh class aapki provider.py ya kisi bhi aur file mein manually error raise karne ke kaam aayegi

class ValidationException(HTTPException):
    def __init__(self, detail: str = "Validation failed — please check your input."):
        # 422 Unprocessable Entity status code ke sath HTTPException ko call karein
        super().__init__(status_code=422, detail=detail)


class JobAlreadyTakenError(HTTPException):
    """Raised when a provider tries to accept a job another provider already took."""
    def __init__(self, detail: str = "This job has already been accepted by another provider."):
        super().__init__(status_code=409, detail=detail)