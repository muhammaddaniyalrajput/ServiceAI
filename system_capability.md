# ServiceFlow AI — System Capability Report

> Updated on: 2026-05-18
> Project Root: `d:\ServiceAI`

---

## Overview

ServiceFlow AI is an **Agentic AI Service Booking Platform**. A user types a natural language request (English, Urdu, or Roman Urdu), and a chain of 6 AI agents automatically extracts intent, finds providers, ranks them intelligently, simulates a booking, sends a localized notification, and schedules a follow-up.

---

## 1. What the System CAN Do RIGHT NOW ✅

### 1.1 Backend — Fully Functional & Production Hardened

#### Agent Pipeline (All 6 Agents Working)

| # | Agent | What It Does Right Now | Status |
|---|-------|------------------------|--------|
| 1 | **Intent Agent** | Parses EN/Urdu/Roman Urdu text into structured JSON (`service_type`, `location`, `datetime_hint`, `urgency`, `language`, `confidence`). | ✅ Working |
| 2 | **Provider Discovery Agent** | Filters providers from **Firestore Database** by matching service category. Calculates distance from user's location. | ✅ Working |
| 3 | **Ranking Agent** | Scores matching providers 0–100 using a weighted algorithm. Uses Gemini to write a reasoning paragraph for the top pick. | ✅ Working |
| 4 | **Booking Agent** | Generates `SFW-XXXXXX` code, resolves time hints, calculates ETA, estimates cost, and saves the appointment to **Firestore**. | ✅ Working |
| 5 | **Notification Agent** | Localizes message (EN/UR/Roman UR) and uses **Firebase Cloud Messaging (FCM)** to send a real push notification to the device. | ✅ Working |
| 6 | **Follow-Up Agent** | Schedules a satisfaction survey reminder and awards loyalty points. | ✅ Working |

#### Infrastructure & Integrations

| Component | Current State |
|-----------|--------------|
| FastAPI server | Running with CORS and global error handlers. |
| Firebase Firestore | ✅ Connected. Real persistence for `bookings` and `providers` collections. |
| Firebase Auth | ✅ Connected. Endpoints protected via Bearer tokens. |
| Push Notifications | ✅ Connected. Real FCM payload delivery to registered devices. |
| Structured Logging | Agent traces are saved persistently to Firestore. |
| Provider Data | DB seeded via `seed_firestore.py`. Providers fetched dynamically. |

### 1.2 Mobile App — Connected & Authenticated

| Feature | Current State |
|---------|--------------|
| Expo SDK 54 | Bootstrapped and bundling successfully. |
| Firebase Auth | ✅ `signInAnonymously()` runs on app startup. |
| API Service Layer | ✅ Axios client built with interceptor to attach Firebase Auth token. |
| Push Notifications | ✅ `expo-notifications` setup to request permissions and get FCM token. |
| Native Firebase | ✅ `google-services.json` (Android) & `GoogleService-Info.plist` (iOS) configured in `app.json`. |
| HomeScreen UI | Chat interface with text input connected to backend API endpoint. |

---

## 2. How to Setup Firebase & Google Maps for Provider Appointments

This section explains how to configure the platform to find real providers using Google Maps and store the appointments securely in Firebase.

### Step A: Firebase Configuration (Storage & Push)

1. **Backend Admin Setup**:
   - Download the Service Account Key from Firebase Console -> Project Settings -> Service Accounts.
   - Save it as `backend/app/firebase-admin.json` (ensure this is ignored in Git).
   - Update `backend/.env`:
     ```env
     FIREBASE_CREDENTIALS_JSON_PATH=./app/firebase-admin.json
     ```
   - **How it works**: The backend will automatically use this to connect to Firestore. When the `Booking Agent` finalizes a provider, it creates a document in the `bookings` Firestore collection.

2. **Mobile Client Setup**:
   - Download `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) from Firebase Console and place them in the `mobile/` directory.
   - Provide your Web App Config in `mobile/src/firebase.ts`.
   - **How it works**: The app authenticates the user, retrieves an FCM device token for push notifications, and sends API requests securely using the Auth ID token.

3. **Database Seeding**:
   - Run `python backend/seed_firestore.py` to populate the `providers` collection with initial data so the Discovery Agent has professionals to find.

### Step B: Google Maps Configuration (Real Routing & ETA)

By default, the system uses a mock Haversine distance calculator. To use real Google Maps data for provider discovery:

1. **Get API Key**: Obtain a Google Maps API Key from the Google Cloud Console (ensure Distance Matrix and Geocoding APIs are enabled).
2. **Update Backend Config**:
   - In `backend/.env`, set:
     ```env
     GOOGLE_MAPS_API_KEY=your_real_api_key_here
     USE_MOCK_MAPS=false
     ```
3. **How it works**:
   - With `USE_MOCK_MAPS=false`, the **Provider Discovery Agent** uses the `google_maps.py` service to call the real Google Maps Distance Matrix API.
   - Instead of straight-line distance, it ranks providers based on real-world travel time (traffic-aware) and exact routing distance.
   - The **Booking Agent** uses this real travel time to calculate a highly accurate ETA for the provider to reach the user's location.

---

## 3. What is NOT Done Yet ❌ (Remaining Work)

| Gap | Description | Priority |
|-----|-------------|----------|
| **Zustand store** | Mobile app state management is incomplete. | CRITICAL |
| **AgentLogViewer** | UI component to show real-time agent reasoning logs on mobile. | HIGH |
| **ProviderCard & List** | UI to display ranked providers on the mobile app. | HIGH |
| **BookingStatus UI** | UI to show confirmation code, exact Maps ETA, and cost on mobile. | HIGH |
| **Real-time Map UI** | `react-native-maps` is installed but no map screen exists to show provider location. | MEDIUM |
| **Google Maps Script** | Ensure `backend/app/services/google_maps.py` is fully implemented for the Discovery agent to use when `USE_MOCK_MAPS=false`. | MEDIUM |
