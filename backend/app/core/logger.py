import logging
import json
from datetime import datetime, timezone
from app.core.config import settings

# ─────────────────────────────────────────────
# Structured JSON logger for agent reasoning
# ─────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.DEBUG),
    format="%(message)s",
)

logger = logging.getLogger("serviceflow")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def log_agent(
    booking_id: str,
    agent: str,
    action: str,
    status: str,       # processing | success | error | skipped
    reasoning: str = "",
    data: dict = None,
) -> dict:
    """Emit a structured agent log entry and return it as a dict."""
    entry = {
        "timestamp": _now_iso(),
        "booking_id": booking_id,
        "agent": agent,
        "action": action,
        "status": status,
        "reasoning": reasoning,
        "data": data or {},
    }
    logger.info(json.dumps(entry, ensure_ascii=False, default=str))
    return entry
