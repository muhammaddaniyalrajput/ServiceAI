"""
Shared in-memory mock stores.

When Firebase is not reachable, every miniservice keeps its own mock store
keyed by the same shape it would persist to Firestore. The shared
``mock_store`` and ``mock_agent_logs`` dicts here exist for backward
compatibility with the original (pre-refactor) service module.

The miniservices own their own per-domain mock dicts (bookings, providers,
conversations, etc.). The dicts defined here are *only* a single source of
fallback state for cross-domain reads that pre-date the refactor.
"""
from __future__ import annotations
from typing import Any, Dict, List


# Bookings — keyed by booking_id
mock_store: Dict[str, Dict[str, Any]] = {}

# Agent logs — keyed by booking_id, value is { "booking_id": ..., "steps": [...] }
mock_agent_logs: Dict[str, Dict[str, Any]] = {}

# Provider profiles (used by the providers miniservice)
mock_providers: List[Dict[str, Any]] = []

# Conversations (used by the chat miniservice) — keyed by conversation_id
mock_conversations: Dict[str, Dict[str, Any]] = {}
