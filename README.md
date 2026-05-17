# ServiceFlow AI

Agentic AI Service Orchestration Platform — Built for hackathon demo using Gemini, Antigravity, FastAPI, Firebase, and React Native Expo.

---

## Project Structure

```
ServiceAI/
├── backend/     # FastAPI + Multi-Agent Orchestrator (Python)
└── mobile/      # React Native Expo App (TypeScript)
```

---

## Prerequisites

Make sure the following are installed before running anything:

| Tool | Check Command | Minimum Version |
|------|--------------|-----------------|
| Python | `python --version` | 3.11+ |
| Node.js | `node --version` | 18+ |
| npm | `npm --version` | 9+ |
| Expo CLI | `npx expo --version` | Latest |

---

## Step 1 — Clone & Open the Project

```powershell
cd d:\ServiceAI
```

---

## Step 2 — Backend Setup (FastAPI)

### 2a. Navigate to the backend folder
```powershell
cd d:\ServiceAI\backend
```

### 2b. Activate the virtual environment
```powershell
# Windows PowerShell
.\venv\Scripts\Activate.ps1

# If venv doesn't exist yet, create it first:
python -m venv venv
.\venv\Scripts\Activate.ps1
```

### 2c. Install dependencies
```powershell
pip install -r requirements.txt
```

### 2d. Configure environment variables
```powershell
# Copy the example env file
Copy-Item .env.example .env
```

Then open `.env` and fill in your keys:
```env
GEMINI_API_KEY=your_gemini_api_key_here
GOOGLE_MAPS_API_KEY=your_maps_api_key_here   # optional
FIREBASE_CREDENTIALS_JSON_PATH=./firebase-admin.json  # optional
```

> **Note:** The app runs in **mock mode** without Firebase credentials. You only need `GEMINI_API_KEY` to test the full AI pipeline.

### 2e. Start the backend server
```powershell
uvicorn app.main:app --reload --port 8000
```

### 2f. Verify the backend is running
Open your browser and visit:
- **API Root:** http://localhost:8000
- **Swagger Docs (Interactive):** http://localhost:8000/docs
- **Health Check:** http://localhost:8000/health

Expected response from `/health`:
```json
{ "status": "ok" }
```

---

## Step 3 — Test the AI Agents (Backend Only)

Use Swagger UI at http://localhost:8000/docs or run these `curl` commands:

### Test Intent Extraction (Agent 1)
```powershell
curl -X POST http://localhost:8000/api/v1/analyze-request `
  -H "Content-Type: application/json" `
  -d '{"user_id": "user_001", "text": "Mujhe kal subah G-13 mein AC technician chahiye"}'
```

### Find & Rank Providers (Agents 2 + 3)
```powershell
# Use the booking_id from the response above
curl -X POST http://localhost:8000/api/v1/find-providers `
  -H "Content-Type: application/json" `
  -d '{
    "booking_id": "PASTE_BOOKING_ID_HERE",
    "intent": {
      "service_type": "AC Technician",
      "location": "G-13, Islamabad",
      "urgency": "medium",
      "language": "roman_ur",
      "confidence": 0.97
    }
  }'
```

### Confirm Booking (Agents 4 + 5 + 6)
```powershell
curl -X POST http://localhost:8000/api/v1/book-service `
  -H "Content-Type: application/json" `
  -d '{
    "booking_id": "PASTE_BOOKING_ID_HERE",
    "provider_id": "prov_001",
    "intent": {
      "service_type": "AC Technician",
      "location": "G-13, Islamabad",
      "urgency": "medium",
      "language": "roman_ur",
      "confidence": 0.97
    }
  }'
```

### Get Agent Reasoning Logs
```powershell
curl http://localhost:8000/api/v1/agent-logs/PASTE_BOOKING_ID_HERE
```

### Get Booking Status
```powershell
curl http://localhost:8000/api/v1/booking-status/PASTE_BOOKING_ID_HERE
```

---

## Step 4 — Mobile App Setup (React Native Expo)

### 4a. Open a NEW terminal window and navigate to mobile
```powershell
cd d:\ServiceAI\mobile
```

### 4b. Install dependencies (if not already done)
```powershell
npm install --legacy-peer-deps
```

### 4c. Configure the API URL
Open `mobile/.env` (create it if it doesn't exist):
```env
EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:8000/api/v1
```

> **Find your local IP:** Run `ipconfig` in PowerShell and look for **IPv4 Address** (e.g. `192.168.1.10`). Do NOT use `localhost` — Android emulator and Expo Go cannot reach your PC via `localhost`.

### 4d. Start the Expo development server
```powershell
# Normal start
npx expo start

# Start with cleared cache (use this if you see bundling errors)
npx expo start -c
```

### 4e. Open the app

| Platform | Command |
|----------|---------|
| Android Emulator | Press `a` in the terminal |
| Expo Go (Phone) | Scan the QR code shown in terminal |
| Web Browser | Press `w` in the terminal |

---

## Step 5 — Verify Everything Works

### Backend checks
```powershell
# Is the server running?
curl http://localhost:8000/health
# Expected: {"status":"ok"}

# Can Babel parse the project?
cd d:\ServiceAI\mobile
node -e "const b=require('@babel/core'); const c=b.loadPartialConfig({filename:'App.tsx',cwd:process.cwd()}); console.log('Babel OK, presets:', c.options.presets.length);"
```

### Mobile checks
```powershell
cd d:\ServiceAI\mobile

# Are all critical packages installed?
node -p "require('./node_modules/babel-preset-expo/package.json').version"
node -p "require('./node_modules/react-native-reanimated/package.json').version"
node -p "require('./node_modules/nativewind/package.json').version"
node -p "require('./node_modules/expo/package.json').version"
```

Expected output:
```
12.x.x          ← babel-preset-expo
3.16.x          ← react-native-reanimated
4.x.x           ← nativewind
54.x.x          ← expo
```

---

## Step 6 — Full Reset (if something breaks)

```powershell
# Clear Metro bundler cache
cd d:\ServiceAI\mobile
npx expo start -c

# Full clean reinstall of mobile dependencies
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm install --legacy-peer-deps

# Reinstall backend dependencies
cd d:\ServiceAI\backend
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

---

## Quick Reference — All Commands

```powershell
# ── Backend ──────────────────────────────────────────────────
cd d:\ServiceAI\backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000

# ── Mobile ───────────────────────────────────────────────────
cd d:\ServiceAI\mobile
npx expo start -c
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI Model | Gemini 2.0 Flash |
| Orchestration | Google Antigravity (Multi-Agent DAG) |
| Backend | FastAPI + Python |
| Database | Firebase Firestore (mock fallback for local dev) |
| Mobile | React Native + Expo SDK 54 |
| Styling | NativeWind v4 (TailwindCSS) |
| State | Zustand |
| HTTP | Axios |