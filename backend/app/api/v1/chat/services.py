"""
Chat domain — service layer.

The chat miniservice owns:

* the ``conversations`` collection — one doc per (booking, customer,
  provider), used by both the customer and the provider inbox screens to
  show a chronological list of active chats.
* the ``bookings/{booking_id}/messages`` subcollection — the actual
  chat thread.

Behaviour
---------
* A conversation is **only** initialised after a provider accepts a job
  (we treat the booking's status transition into ``accepted`` as the
  trigger). The transition is idempotent: re-accepting does not create
  duplicate rows.
* Every send bumps the parent conversation's ``last_message`` and
  ``updated_at`` so the inbox always sorts by the most recent message.
* The two Firestore ``where(...)`` calls use the modern keyword
  ``filter=`` argument (firebase-admin >= 6.5) and the result is always
  ``order_by("updated_at", direction=firestore.Query.DESCENDING)``.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

from firebase_admin import firestore

from app.core.firebase_config import get_db
from app.core.mock_store import mock_conversations, mock_store
from app.core.time_utils import format_created_at, now_iso

from app.api.v1.chat.schemas import (
    ChatMessage,
    Conversation,
    ConversationStatus,
)

logger = logging.getLogger("kaameasy")


# ─────────────────────────────────────────────────────────────────────────────
# Conversation lifecycle
# ─────────────────────────────────────────────────────────────────────────────

def _conversation_id(booking_id: str) -> str:
    """Stable id for the conversation — one per booking."""
    return f"conv_{booking_id}"


def initialise_conversation(
    booking_id: str,
    customer_id: str,
    provider_id: str,
    customer_name: Optional[str] = None,
    provider_name: Optional[str] = None,
    service_type: Optional[str] = None,
) -> Conversation:
    """
    Create (or no-op if it already exists) the inbox row for a booking.

    Called by the provider-accept flow on the bookings side. Safe to
    invoke multiple times — the second call returns the existing
    conversation unchanged.
    """
    conv_id = _conversation_id(booking_id)
    db = get_db()
    now = now_iso()

    if db:
        ref = db.collection("conversations").document(conv_id)
        snap = ref.get()
        if snap.exists:
            return _to_conversation(snap.to_dict())

        ref.set({
            "conversation_id":  conv_id,
            "booking_id":       booking_id,
            "customer_id":      customer_id,
            "provider_id":      provider_id,
            "customer_name":    customer_name or "",
            "provider_name":    provider_name or "",
            "service_type":     service_type or "",
            "last_message":     "Chat opened — start the conversation.",
            "last_sender_type": "system",
            "status":           ConversationStatus.active.value,
            "created_at":       now,
            "updated_at":       now,
        })
        return _to_conversation(ref.get().to_dict())

    # Mock-mode fallback
    if conv_id in mock_conversations:
        return _to_conversation(mock_conversations[conv_id])

    conv = {
        "conversation_id":  conv_id,
        "booking_id":       booking_id,
        "customer_id":      customer_id,
        "provider_id":      provider_id,
        "customer_name":    customer_name or "",
        "provider_name":    provider_name or "",
        "service_type":     service_type or "",
        "last_message":     "Chat opened — start the conversation.",
        "last_sender_type": "system",
        "status":           ConversationStatus.active.value,
        "created_at":       now,
        "updated_at":       now,
    }
    mock_conversations[conv_id] = conv
    return _to_conversation(conv)


def archive_conversation(booking_id: str) -> None:
    """Mark a conversation archived (e.g. on booking completion)."""
    conv_id = _conversation_id(booking_id)
    db = get_db()
    if db:
        ref = db.collection("conversations").document(conv_id)
        if ref.get().exists:
            ref.update({
                "status":     ConversationStatus.archived.value,
                "updated_at": now_iso(),
            })
    elif conv_id in mock_conversations:
        mock_conversations[conv_id]["status"] = ConversationStatus.archived.value
        mock_conversations[conv_id]["updated_at"] = now_iso()


def get_conversation_by_booking(booking_id: str) -> Optional[Conversation]:
    conv_id = _conversation_id(booking_id)
    db = get_db()
    if db:
        snap = db.collection("conversations").document(conv_id).get()
        return _to_conversation(snap.to_dict()) if snap.exists else None
    return _to_conversation(mock_conversations.get(conv_id)) if conv_id in mock_conversations else None


def _get_provider_by_uid(uid: str) -> Optional[Dict[str, Any]]:
    """
    Resolve a provider profile by the caller's Firebase ``uid``.

    Falls back gracefully to the in-memory mock store so the dev
    server keeps working without Firebase.

    Imported lazily to avoid a hard import-time dependency on the
    providers miniservice from the chat miniservice.
    """
    try:
        from app.api.v1.providers.services import get_provider_by_uid as _get
    except Exception:
        _get = None

    if _get is not None:
        return _get(uid)

    # Inline fallback (covers both real and mock modes if the import
    # somehow fails — defensive, shouldn't normally trigger).
    from app.core.firebase_config import get_db
    from app.core.mock_store import mock_providers

    db = get_db()
    if db:
        try:
            query = (
                db.collection("providers")
                .where(filter=firestore.FieldFilter("uid", "==", uid))
                .limit(1)
            )
            for snap in query.stream():
                return snap.to_dict()
        except Exception as exc:
            logger.warning("Provider-by-uid lookup failed for %s: %s", uid, exc)
            return None
        return None

    for p in mock_providers:
        if p.get("uid") == uid:
            return p
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Inbox listing
# ─────────────────────────────────────────────────────────────────────────────

def list_conversations_for_user(
    user_id: str,
    role: str = "customer",
    status_filter: Optional[ConversationStatus] = None,
) -> List[Conversation]:
    """
    Return every conversation the user is a participant in, sorted by
    ``updated_at`` DESC (recent first).

    ``role`` is one of ``"customer"`` or ``"provider"`` — it tells us
    which field to filter on.

    Index note
    ----------
    We deliberately use a *single-field* ``where`` + in-memory
    ``status`` filter + sort. The previous implementation used two
    ``where`` clauses plus an ``order_by`` on a different field, which
    Firestore requires a *composite* index for. Composite indexes have
    to be created out-of-band (Firebase Console or
    ``firestore.indexes.json``) and take minutes to build, which is a
    bad first-run UX. A single-field equality filter is auto-indexed by
    Firestore. For a chat app the per-user conversation list is small
    (dozens, not millions), so in-memory sort/filter is the right
    trade-off.

    For production-scale deployments, the recommended composite
    indexes are listed in ``backend/firestore.indexes.json`` — deploy
    them with ``firebase deploy --only firestore:indexes``.
    """
    field = "customer_id" if role == "customer" else "provider_id"
    target_status = (status_filter or ConversationStatus.active).value

    # ── Resolve the Firestore filter value ──────────────────────────────
    # The conversation doc stores the *provider's* ``provider_id``
    # (e.g. ``PROV-7C0CF7``), not the Firebase ``uid``. So when the
    # caller is a provider, we have to first look up the provider
    # profile by uid, get the canonical ``provider_id``, and filter on
    # that. Without this step the provider inbox is always empty.
    #
    # The customer's case is simpler: the conversation's
    # ``customer_id`` is already the Firebase uid (we persist it that
    # way in ``initialise_conversation``), so we filter directly.
    filter_value = user_id
    if role == "provider":
        provider = _get_provider_by_uid(user_id)
        if not provider or not provider.get("provider_id"):
            # No provider profile = no inbox. Return an empty list
            # rather than firing a query that will always miss.
            logger.debug("Provider profile not found for uid=%s", user_id)
            return []
        filter_value = provider["provider_id"]
        # Some legacy conversation docs may have stored the Firebase uid
        # instead of the provider_id. Collect those too so a provider
        # never sees an empty inbox just because of an old doc shape.
        legacy_filter_values = [filter_value, user_id]
    else:
        legacy_filter_values = [filter_value]

    results: List[Dict[str, Any]] = []
    db = get_db()

    if db:
        # Single-field equality filter — auto-indexed, no composite
        # index required. The status filter and the updated_at sort
        # happen in Python (see below).
        seen_ids: set = set()
        for fv in legacy_filter_values:
            query = (
                db.collection("conversations")
                .where(filter=firestore.FieldFilter(field, "==", fv))
            )
            for snap in query.stream():
                cid = snap.id
                if cid in seen_ids:
                    continue
                seen_ids.add(cid)
                data = snap.to_dict() or {}
                data["conversation_id"] = data.get("conversation_id") or cid
                results.append(data)
    else:
        for c in mock_conversations.values():
            if c.get(field) not in legacy_filter_values:
                continue
            results.append(c)

    # In-memory filter (status) + sort (updated_at DESC)
    results = [r for r in results if r.get("status") == target_status]
    results.sort(key=lambda c: c.get("updated_at", ""), reverse=True)

    return [_to_conversation(r) for r in results]


# ─────────────────────────────────────────────────────────────────────────────
# Messages (per-booking subcollection)
# ─────────────────────────────────────────────────────────────────────────────

def send_message(
    booking_id: str,
    sender: str,
    text: str,
    sender_type: str = "system",
) -> Dict[str, Any]:
    """
    Append a message to ``bookings/{booking_id}/messages`` and bump the
    parent conversation's ``last_message``/``updated_at``.
    """
    normalized_type = sender_type if sender_type in ("customer", "provider", "system") else "system"
    db = get_db()
    now = now_iso()
    new_id: Optional[str] = None

    if db:
        booking_ref = db.collection("bookings").document(booking_id)
        messages_ref = booking_ref.collection("messages")
        new_doc_ref = messages_ref.add({
            "text":       text,
            "senderId":   sender,
            "senderType": normalized_type,
            "createdAt":  firestore.SERVER_TIMESTAMP,
            "clientTime": now,
        })
        new_id = new_doc_ref[1].id
        booking_ref.update({"updated_at": now})

        # Bump the conversation row for the inbox
        conv_ref = db.collection("conversations").document(_conversation_id(booking_id))
        if conv_ref.get().exists:
            conv_ref.update({
                "last_message":     text,
                "last_sender_type": normalized_type,
                "updated_at":       now,
            })
    else:
        # Mock-mode fallback
        booking = mock_store.setdefault(booking_id, {})
        messages = booking.setdefault("messages", [])
        new_id = f"msg_{uuid.uuid4().hex[:12]}"
        messages.append({
            "id":         new_id,
            "text":       text,
            "senderId":   sender,
            "senderType": normalized_type,
            "createdAt":  now,
            "clientTime": now,
        })
        booking["updated_at"] = now

        conv_id = _conversation_id(booking_id)
        if conv_id in mock_conversations:
            mock_conversations[conv_id]["last_message"] = text
            mock_conversations[conv_id]["last_sender_type"] = normalized_type
            mock_conversations[conv_id]["updated_at"] = now

    return {"success": True, "booking_id": booking_id, "message_id": new_id, "created_at": now}


def list_messages(booking_id: str, limit: int = 100) -> List[ChatMessage]:
    """Return messages for a booking, oldest first."""
    db = get_db()
    results: List[Dict[str, Any]] = []
    if db:
        # order_by createdAt ASC for the chat scroll (oldest at top)
        query = (
            db.collection("bookings")
            .document(booking_id)
            .collection("messages")
            .order_by("createdAt", direction=firestore.Query.ASCENDING)
            .limit(limit)
        )
        for snap in query.stream():
            data = snap.to_dict() or {}
            data["id"] = snap.id
            results.append(data)
    else:
        booking = mock_store.get(booking_id, {})
        for m in booking.get("messages", []):
            results.append(m)

    return [_to_message(r) for r in results]


# ─────────────────────────────────────────────────────────────────────────────
# Internal converters
# ─────────────────────────────────────────────────────────────────────────────

def _to_conversation(raw: Optional[Dict[str, Any]]) -> Optional[Conversation]:
    if not raw:
        return None
    return Conversation(
        conversation_id=raw.get("conversation_id", ""),
        booking_id=raw.get("booking_id", ""),
        customer_id=raw.get("customer_id", ""),
        provider_id=raw.get("provider_id", ""),
        last_message=raw.get("last_message", ""),
        last_sender_type=raw.get("last_sender_type", "system"),
        updated_at=raw.get("updated_at", ""),
        created_at=raw.get("created_at", ""),
        status=ConversationStatus(raw.get("status", ConversationStatus.active.value)),
        customer_name=raw.get("customer_name"),
        provider_name=raw.get("provider_name"),
        service_type=raw.get("service_type"),
    )


def _to_message(raw: Dict[str, Any]) -> ChatMessage:
    return ChatMessage(
        id=raw.get("id", ""),
        text=raw.get("text", ""),
        senderId=raw.get("senderId", ""),
        senderType=raw.get("senderType", "system"),
        createdAt=raw.get("createdAt"),
        clientTime=raw.get("clientTime"),
    )
