"""
Deploy Firestore composite indexes.

Usage
-----
From the ``backend/`` directory:

    # Requires the Firebase CLI and admin credentials
    firebase login
    firebase deploy --only firestore:indexes

Or via the gcloud CLI:

    gcloud firestore indexes composite create \
        --project=serviceflowai-final \
        --collection-group=conversations \
        --field-config=field-path=customer_id,order=ascending \
        --field-config=field-path=status,order=ascending \
        --field-config=field-path=updated_at,order=descending

The canonical set of indexes is defined in two places:
  * ``firestore.indexes.json`` — consumed by the Firebase CLI.
  * ``app/core/firestore_indexes.py`` — embedded in the Python app
    for runtime introspection (the app does NOT auto-create indexes
    because the Admin SDK gRPC surface for composite indexes is
    private/unstable; the file-based deploy is the supported path).

The Python app currently uses single-field equality filters + in-memory
sort/filter for the inbox and provider-job-list queries, so it
**runs without any composite indexes** (perfect for local dev and
fresh Firebase projects). The composite indexes in this file become
useful at scale when you want Firestore to do the sorting server-side.
"""
