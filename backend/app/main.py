"""
FastAPI application entry point.
Registers all routes, middleware, and exception handlers.

Includes:
  - Request-ID middleware (UUID per request for tracing)
  - Request timing middleware
  - Improved CORS for development
  - Centralized exception handlers
"""
import uuid
import time
import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.config import settings
from app.core.exceptions import http_exception_handler, generic_exception_handler, validation_exception_handler
from app.api.v1.analyze   import router as analyze_router
from app.api.v1.providers import router as providers_router
from app.api.v1.bookings  import router as bookings_router
from pydantic import ValidationError

logger = logging.getLogger("serviceflow")

app = FastAPI(
    title=settings.PROJECT_NAME,
    description=(
        "Agentic AI Service Orchestration Backend. "
        "Accepts natural language requests and orchestrates multi-agent booking workflows."
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
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )

        return response


app.add_middleware(RequestContextMiddleware)


# ── CORS Middleware ───────────────────────────────────────────────────────────
# Note: For production, configure explicit domain origins instead of regex wildcards.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Exception Handlers ────────────────────────────────────────────────────────
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(ValidationError, validation_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# ── Routes ────────────────────────────────────────────────────────────────────
API_V1 = "/api/v1"
app.include_router(analyze_router,   prefix=API_V1, tags=["Stage 1 — Intent"])
app.include_router(providers_router, prefix=API_V1, tags=["Stage 2 — Discovery & Ranking"])
app.include_router(bookings_router,  prefix=API_V1, tags=["Stage 3 — Booking"])


@app.get("/", tags=["Health"])
def root():
    return {
        "service": settings.PROJECT_NAME,
        "status":  "running",
        "version": "1.0.0",
        "docs":    "/docs",
    }


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}
