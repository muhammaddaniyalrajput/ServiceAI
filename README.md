# KaamEasy AI

KaamEasy AI is a production-grade, double-sided **Agentic AI Service Orchestration Platform**. It allows customers to book home services using natural language (English, Urdu, or Roman Urdu) parsed by LLM agents, while enabling service providers to manage bookings, track earnings, and stream real-time location tracking in a cohesive double-sided marketplace.

The system features a thread-safe multi-agent DAG engine (with 7 specialized agents), a FastAPI backend, and two React Native Expo mobile apps (Customer App and Provider App) backed by Firebase Firestore.

---

## Project Structure

```
ServiceAI/
├── backend/            # FastAPI + Multi-Agent DAG Orchestrator (Python)
├── mobile/             # React Native Expo App — Customer Client (TypeScript + NativeWind v4)
└── mobile-provider/    # React Native Expo App — Provider Client (TypeScript + StyleSheet)
```

---

## Prerequisites

Ensure the following tools are installed before running the applications:

| Tool | Check Command | Minimum Version | Required For |
|------|--------------|-----------------|--------------|
| **Python** | `python --version` | 3.11+ | Backend Server & Simulation Scripts |
| **Node.js** | `node --version` | 18+ | Customer & Provider Mobile Apps |
| **npm** | `npm --version` | 9+ | Dependency Management for Mobile |
| **Expo CLI** | `npx expo --version` | Latest | Running Metro Bundler & Dev Clients |

---

## Quick Start — Run Commands

Here are the terminal commands to quickly start each component of the platform:

### 1. Start the FastAPI Backend
```powershell
cd d:\ServiceAI\backend
# Activate virtual environment (Windows)
.\venv\Scripts\Activate.ps1
# Start development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Start the Customer Mobile App
```powershell
cd d:\ServiceAI\mobile
# Start development server with cleared cache
npx expo start -c
```

### 3. Start the Provider Mobile App
```powershell
cd d:\ServiceAI\mobile-provider
# Start development server
npx expo start
```

---

## Core Modules & Tech Stack

### 1. Backend Server (`backend`)
*   **AI Model**: Gemini 2.0 Flash / Gemini 1.5 Flash (via `GEMINI_API_KEY`)
*   **Orchestration**: Google Labs Antigravity (Multi-Agent DAG Engine)
*   **Web Framework**: FastAPI & Uvicorn
*   **Database & Auth**: Firebase Admin SDK (Firestore Database, Firebase Auth)
*   **Key Services**: Firebase Cloud Messaging (FCM) for real-time push notification delivery
*   **Features**: LRU Caching with TTL, concurrency locks (idempotency guards), background daemon simulation thread for mock provider testing.

### 2. Customer Mobile App (`mobile`)
*   **Framework**: React Native (Expo SDK 54)
*   **Styling**: NativeWind v4 (TailwindCSS)
*   **State Management**: Zustand v5 (with persistent storage)
*   **Features**:
    *   Natural language service requests with intent confidence visuals
    *   Reverse geocoding with Google Maps API (auto-location onboarding)
    *   Real-time chat negotiation with the provider
    *   Live provider GPS tracking using `react-native-maps` (with progress indicators)
    *   Timeline viewer to inspect the AI agent reasoning steps in real-time

### 3. Provider Mobile App (`mobile-provider`)
*   **Framework**: React Native (Expo SDK 56 + Expo Router)
*   **Styling**: Vanilla React Native `StyleSheet` & Native UI
*   **State Management**: Zustand v5
*   **Features**:
    *   Availability online/offline toggle
    *   Scrollable jobs board filtering jobs by service and location
    *   Real-time negotiation chat with quick-presets to propose scheduled timings
    *   Map-based route view displaying live GPS path to the customer's coordinates
    *   Background location tracking hook streaming GPS coordinates to the backend every 10 seconds
    *   Analytics dashboard displaying total earnings, period breakdowns, average ratings, completion rates, and future income projections

---

## Configuration & Environment Setup

Each module requires configuration via environment variables. See the specific configurations below:

### Backend Configuration (`backend/.env`)
Copy `.env.example` to `.env` and fill in your keys:
```env
GEMINI_API_KEY=your_gemini_api_key_here
GOOGLE_MAPS_API_KEY=your_maps_api_key_here
FIREBASE_CREDENTIALS_JSON_PATH=./firebase-admin.json
```
*Note: The backend runs in **mock/in-memory mode** if Firebase credentials are not found.*

### Customer App Configuration (`mobile/.env`)
Create `mobile/.env` with your API address:
```env
EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:8000/api/v1
```

### Provider App Configuration (`mobile-provider/.env`)
Create `mobile-provider/.env` with your API address:
```env
EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:8000/api/v1
```

> [!TIP]
> **Finding your Local IP Address**: Run `ipconfig` (Windows) or `ifconfig` (macOS/Linux) in your terminal and find your IPv4 Address (e.g. `192.168.1.50`). Do NOT use `localhost` or `127.0.0.1` for testing on physical devices or Android emulators, as they will fail to reach the backend server.

---

## Detailed Setup & Testing
For step-by-step instructions on setting up environments, seeding databases, running backend unit tests, testing notifications, and executing provider simulation scripts, refer to the [Quickstart Guide](quickstart.md).

For a complete review of system architectures, API endpoints, agent structures, and database states, refer to the [System Capability Report](system_capability.md).