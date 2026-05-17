"""
FastAPI application entry point.
Registers all routes and middleware.
"""
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.exceptions import http_exception_handler, generic_exception_handler
from app.api.v1.analyze   import router as analyze_router
from app.api.v1.providers import router as providers_router
from app.api.v1.bookings  import router as bookings_router

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

# ── Middleware ────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Exception Handlers ────────────────────────────────────────────────────────
app.add_exception_handler(HTTPException, http_exception_handler)
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
