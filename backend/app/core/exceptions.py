"""
Centralized exception handlers for FastAPI.

Includes:
  - HTTPException handler with request-ID
  - Pydantic ValidationError handler (422 with readable field errors)
  - Generic exception handler (500 catch-all)
"""
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError
import logging

logger = logging.getLogger("serviceflow")


def _get_request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": exc.detail,
            "request_id": _get_request_id(request),
        },
    )


async def validation_exception_handler(request: Request, exc: ValidationError):
    """Return 422 with readable field-level validation errors."""
    errors = []
    for err in exc.errors():
        field = " → ".join(str(loc) for loc in err.get("loc", []))
        errors.append({
            "field": field,
            "message": err.get("msg", "Validation error"),
            "type": err.get("type", ""),
        })

    logger.warning(
        "Validation error on %s %s: %s",
        request.method,
        request.url.path,
        errors,
    )

    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": "Validation failed",
            "details": errors,
            "request_id": _get_request_id(request),
        },
    )


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
