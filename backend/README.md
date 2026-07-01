# KaamEasy AI — Backend

Agentic AI Service Orchestration Platform. Accepts natural language booking requests in **English, Urdu, and Roman Urdu** and orchestrates a multi-agent pipeline to discover, rank, book, notify, and follow up on local service providers.

---

## Architecture

```
User Request (NL Text)
       │
       ▼
[1] Intent Agent          (Gemini)   — extract service, location, time, urgency
       │
       ▼
[2] Provider Discovery    (Firestore/Mock) — filter by service + proximity
       │
       ▼
[3] Ranking Agent         (Algorithm + Gemini) — score by rating/distance/price
       │
       ▼
[4] Booking Agent         (Simulation) — confirm, ETA, cost, confirmation code
       │
       ├──▼
       │  [5] Notification Agent  — localized FCM payload
       └──▼
          [6] Follow-Up Agent     — survey + loyalty reward
```

---

## Quick Start

```bash
# 1. Create & activate virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1         # Windows PowerShell
# source venv/bin/activate           # macOS / Linux

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# 4. (Optional) Add Firebase credentials
# Place firebase-admin.json in backend/
# Without it, the app runs in local mock mode.

# 5. Start the server
uvicorn app.main:app --reload --port 8000
```

Open **http://localhost:8000/docs** for the interactive Swagger UI.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/analyze-request` | Stage 1: Extract intent from NL text |
| `POST` | `/api/v1/find-providers` | Stage 2: Discover + rank providers |
| `POST` | `/api/v1/book-service` | Stage 3: Confirm booking |
| `GET`  | `/api/v1/booking-status/{id}` | Get current booking status |
| `GET`  | `/api/v1/agent-logs/{id}` | Get full agent reasoning trace |

---

## Example Flow

**Request:**
```json
POST /api/v1/analyze-request
{
  "user_id": "user_001",
  "text": "Mujhe kal subah G-13 mein AC technician chahiye"
}
```

**Response:**
```json
{
  "success": true,
  "booking_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "intent": {
    "service_type": "AC Technician",
    "location": "G-13, Islamabad",
    "datetime_hint": "kal subah (tomorrow morning)",
    "urgency": "medium",
    "language": "roman_ur",
    "confidence": 0.97
  },
  "logs": [
    {
      "agent": "Intent Agent",
      "action": "Analyzing user request",
      "status": "processing",
      "reasoning": "Received text: 'Mujhe kal subah...'. Calling Gemini."
    },
    {
      "agent": "Intent Agent",
      "action": "Intent extracted successfully",
      "status": "success",
      "reasoning": "Identified service='AC Technician', location='G-13', urgency='medium', confidence=97%."
    }
  ]
}
```

---

## Folder Structure

```
backend/
├── app/
│   ├── api/v1/
│   │   ├── analyze.py        # POST /analyze-request
│   │   ├── providers.py      # POST /find-providers
│   │   └── bookings.py       # POST /book-service, GET /booking-status, GET /agent-logs
│   ├── agents/
│   │   ├── intent_agent.py        # Agent 1 — NL intent extraction (Gemini)
│   │   ├── discovery_agent.py     # Agent 2 — Provider discovery + haversine distance
│   │   ├── ranking_agent.py       # Agent 3 — Weighted scoring + Gemini reasoning
│   │   ├── booking_agent.py       # Agent 4 — Booking simulation
│   │   ├── notification_agent.py  # Agent 5 — Multilingual FCM payload
│   │   └── followup_agent.py      # Agent 6 — Reminders + loyalty
│   ├── core/
│   │   ├── config.py         # Pydantic settings
│   │   ├── logger.py         # Structured JSON logger
│   │   └── exceptions.py     # Global error handlers
│   ├── data/
│   │   └── mock_providers.py # 14 mock providers across 6 service categories
│   ├── models/
│   │   └── schemas.py        # All Pydantic request/response schemas
│   ├── orchestrator/
│   │   └── workflow.py       # Antigravity DAG orchestrator
│   ├── services/
│   │   └── firebase_db.py    # Firestore CRUD + mock fallback
│   └── main.py               # FastAPI app entry point
├── requirements.txt
├── .env.example
└── README.md
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | ✅ | Google Gemini AI key |
| `GOOGLE_MAPS_API_KEY` | ❌ | Maps API (app uses mock if omitted) |
| `FIREBASE_CREDENTIALS_JSON_PATH` | ❌ | Path to firebase-admin.json (mock mode if missing) |
| `CORS_ORIGINS` | ❌ | Comma-separated allowed origins |
| `USE_MOCK_MAPS` | ❌ | Set `true` to skip real Maps API calls |
