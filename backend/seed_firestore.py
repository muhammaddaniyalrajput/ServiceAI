"""
seed_firestore.py — One-time script to populate the Firestore `providers` collection.

Usage:
    cd backend
    python seed_firestore.py

This reads from data/providers.py and writes each provider to
Firestore at `providers/{provider_id}`.

Safe to re-run — uses set() (upsert) so existing docs are overwritten with
the latest data.
"""
import os
import sys

# Ensure app package is importable
sys.path.insert(0, os.path.dirname(__file__))

import firebase_admin
from firebase_admin import credentials, firestore
from app.core.config import settings
from app.data.providers import MOCK_PROVIDERS


def main():
    cred_path = settings.FIREBASE_CREDENTIALS_JSON_PATH
    if not os.path.exists(cred_path):
        print(f"[ERROR] Firebase credentials not found at: {cred_path}")
        print("   Make sure firebase-admin.json exists and the path is correct in .env")
        sys.exit(1)

    # Initialise Firebase (skip if already initialised)
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)

    db = firestore.client()
    collection = db.collection("providers")

    print(f"[SEEDING] Seeding {len(MOCK_PROVIDERS)} providers to Firestore...")
    print(f"   Project: {cred.project_id if hasattr(cred, 'project_id') else 'unknown'}")
    print()

    for provider in MOCK_PROVIDERS:
        data = provider.model_dump()
        doc_id = provider.provider_id
        collection.document(doc_id).set(data)
        print(f"   [OK] {doc_id}: {provider.name} ({provider.service})")

    print()
    print(f"[SUCCESS] Done! {len(MOCK_PROVIDERS)} providers seeded to 'providers' collection.")
    print(f"   View them at: https://console.firebase.google.com/project/{settings.FIREBASE_CREDENTIALS_JSON_PATH.split('/')[-1].replace('.json','')}/firestore")


if __name__ == "__main__":
    main()
