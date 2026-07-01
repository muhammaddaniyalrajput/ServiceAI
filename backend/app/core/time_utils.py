"""
Shared timestamp / ID helpers.

Miniservices across the backend all need the same conventions:

* ``now_iso()`` — UTC ISO 8601 with a ``Z`` suffix (the shape Firestore
  writes back when you read a ``SERVER_TIMESTAMP`` field).
* ``format_local(timestamp, fmt)`` — render any of {ISO string, datetime,
  Firestore Timestamp, ``None``} into a readable local string. The
  "Unknown date" fallback is centralised so the frontend never sees
  garbage.
* ``format_created_at(timestamp)`` — convenience wrapper that returns the
  canonical ``YYYY-MM-DD HH:mm`` string used across the customer and
  provider app booking lists.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional, Union


# Default display format used across booking list screens
DEFAULT_DISPLAY_FMT = "%Y-%m-%d %H:%M"


def now_iso() -> str:
    """UTC ISO 8601 with a ``Z`` suffix — matches Firestore's read shape."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _to_datetime(value: Any) -> Optional[datetime]:
    """Best-effort coercion of Firestore Timestamp / ISO string / datetime."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    # Firestore Timestamp — has a .timestamp() helper that returns POSIX seconds
    if hasattr(value, "timestamp") and callable(value.timestamp):
        try:
            return datetime.fromtimestamp(value.timestamp(), tz=timezone.utc)
        except Exception:
            pass
    # ISO 8601 string
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        # Normalise "Z" → "+00:00" for fromisoformat()
        if cleaned.endswith("Z"):
            cleaned = cleaned[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(cleaned)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    # POSIX seconds (int / float)
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc)
        except (ValueError, OSError):
            return None
    return None


def format_local(
    value: Any,
    fmt: str = DEFAULT_DISPLAY_FMT,
    fallback: str = "Unknown date",
) -> str:
    """Render any timestamp into a readable string, never raising.

    Falls back to ``fallback`` (default ``"Unknown date"``) for ``None`` or
    unparseable values — the booking list screens in the customer and
    provider apps rely on this never throwing.
    """
    dt = _to_datetime(value)
    if dt is None:
        return fallback
    return dt.strftime(fmt)


def format_created_at(value: Any) -> str:
    """Convenience wrapper — the canonical booking-row timestamp format."""
    return format_local(value)


def parse_iso(value: str) -> Optional[datetime]:
    """Parse an ISO 8601 string into an aware ``datetime`` (or ``None``)."""
    return _to_datetime(value)
