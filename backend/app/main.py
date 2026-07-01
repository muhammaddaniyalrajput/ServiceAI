"""
FastAPI application entry point.

The backend is structured as a **miniservices (modular monolith)**:
each domain (auth, analyze, bookings, chat, providers) lives in its own
package under ``app/api/v1/<domain>`` and exports a single ``router``
that is mounted here.

All miniservices share a single FastAPI app, a single Firebase
connection (see ``app.core.firebase_config``), and a single set of
exception handlers / middleware.

Backward compatibility
----------------------
The original flat layout (``app/api/v1/bookings.py``,
``app/api/v1/provider.py``, ``app/api/v1/analyze.py``,
``app/api/v1/providers.py``) is preserved as thin re-exports that
forward to the new miniservice routers. This means:

* Existing mobile clients keep working without any code change.
* New code can import from the new packages (e.g. ``from
  app.api.v1.bookings.services import create_booking_doc``).
* Old imports (``from app.api.v1.bookings import router``) still
  resolve and return the same router object.
"""
from __future__ import annotations

import logging
import time
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.exceptions import (
    generic_exception_handler,
    http_exception_handler,
    request_validation_exception_handler,
    validation_exception_handler,
)

# ── Miniservice routers (canonical) ──────────────────────────────────────────
from app.api.v1.auth.router       import router as auth_router
from app.api.v1.analyze.router    import router as analyze_router
from app.api.v1.bookings.router   import router as bookings_router
from app.api.v1.chat.router       import router as chat_router
from app.api.v1.providers.router  import router as providers_router

# Best-effort composite-index spec log (see core/firestore_indexes.py
# for the canonical spec). The Admin SDK can't create composite indexes
# at runtime; deploy them via ``firebase deploy --only firestore:indexes``.
try:
    from app.core.firestore_indexes import log_index_specs
    log_index_specs()
except Exception as _idx_exc:  # noqa: BLE001
    import logging as _l
    _l.getLogger("kaameasy").debug("Index spec log skipped: %s", _idx_exc)

logger = logging.getLogger("kaameasy")

app = FastAPI(
    title=settings.PROJECT_NAME,
    description=(
        "Agentic AI Service Orchestration Backend. "
        "Accepts natural language requests and orchestrates multi-agent booking workflows. "
        "Structured as a miniservices (modular monolith) — every domain (auth, analyze, "
        "bookings, chat, providers) lives in its own package."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)


# ── Request-ID + Timing Middleware ────────────────────────────────────────────

class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())[:8]
        request.state.request_id = request_id
        start_time = time.time()

        response = await call_next(request)

        duration_ms = round((time.time() - start_time) * 1000, 1)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{duration_ms}ms"

        logger.info(
            "[%s] %s %s → %s (%sms)",
            request_id, request.method, request.url.path,
            response.status_code, duration_ms,
        )
        return response


app.add_middleware(RequestContextMiddleware)


# ── CORS ─────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Exception handlers ───────────────────────────────────────────────────────

app.add_exception_handler(HTTPException,             http_exception_handler)
app.add_exception_handler(RequestValidationError,    request_validation_exception_handler)
app.add_exception_handler(ValidationError,           validation_exception_handler)
app.add_exception_handler(Exception,                  generic_exception_handler)


# ── Miniservice routing ──────────────────────────────────────────────────────

API_V1 = "/api/v1"

# Each domain lives under its own URL prefix. The mobile apps can either
# call the new prefixed routes or the backward-compat aliases below.
app.include_router(auth_router,      prefix=f"{API_V1}/auth",      tags=["Auth"])
app.include_router(analyze_router,   prefix=API_V1,               tags=["Stage 1 — Intent"])
app.include_router(bookings_router,  prefix=API_V1,               tags=["Stage 3 — Bookings"])
app.include_router(chat_router,      prefix=f"{API_V1}/chat",     tags=["Chat & Inbox"])
app.include_router(providers_router, prefix=f"{API_V1}/provider", tags=["Provider Operations"])


# ── Health endpoints ─────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
def root():
    return {
        "service": settings.PROJECT_NAME,
        "status":  "running",
        "version": "1.0.0",
        "docs":    "/docs",
        "domains": ["auth", "analyze", "bookings", "chat", "providers"],
    }


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}


# ── Backward-compat: re-export the old flat-file routers so any code that
# still imports ``app.api.v1.bookings.router`` etc. keeps working. ────────────
# These are written in the legacy files (analyze.py, bookings.py, etc.) which
# now simply do ``from app.api.v1.<domain>.router import router`` and
# re-export the symbol. See those files for the thin re-export shims.
from app.api.v1 import analyze as _legacy_analyze      # noqa: E402
from app.api.v1 import bookings as _legacy_bookings    # noqa: E402
from app.api.v1 import provider as _legacy_provider    # noqa: E402
from app.api.v1 import providers as _legacy_providers  # noqa: E402
