"""
Firestore composite index reference.

Composite indexes in Firestore can't be created at runtime through the
public Admin SDK (the gRPC surface is private). Production deploys
should use one of:

    firebase deploy --only firestore:indexes          # canonical
    gcloud firestore indexes composite create ...      # manual

The canonical set of indexes is defined in
``backend/firestore.indexes.json`` — keep that file and this module
in sync.

The app itself uses single-field equality filters + in-memory sort
everywhere it lists conversations, so it runs *without* these
composite indexes (the perfect fresh-project experience). The
indexes become useful at scale when you want Firestore to do the
sorting server-side instead of the Python app.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Tuple

logger = logging.getLogger("kaameasy")


# Canonical index definitions. Mirrors firestore.indexes.json.
# Each entry is ``(collection_group, [(field_name, direction_label), ...])``.
INDEXES: List[Tuple[str, List[Tuple[str, str]]]] = [
    (
        "conversations",
        [
            ("customer_id", "ASCENDING"),
            ("status",      "ASCENDING"),
            ("updated_at",  "DESCENDING"),
        ],
    ),
    (
        "conversations",
        [
            ("provider_id", "ASCENDING"),
            ("status",      "ASCENDING"),
            ("updated_at",  "DESCENDING"),
        ],
    ),
    (
        "bookings",
        [
            ("provider_id", "ASCENDING"),
            ("created_at",  "DESCENDING"),
        ],
    ),
    (
        "bookings",
        [
            ("user_id",    "ASCENDING"),
            ("created_at", "DESCENDING"),
        ],
    ),
]


def log_index_specs() -> None:
    """Log the expected composite indexes at startup.

    Helpful when debugging the "FailedPrecondition: query requires an
    index" error — the message shows the operator which indexes exist
    on the project and which still need to be deployed.
    """
    if not INDEXES:
        return
    logger.info("Expected composite indexes (deploy via firestore.indexes.json):")
    for collection, fields in INDEXES:
        field_str = ", ".join(f"{n} ({d})" for n, d in fields)
        logger.info("  - %s: %s", collection, field_str)
