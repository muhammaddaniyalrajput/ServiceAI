# KaamEasy AI — Quickstart Guide

This guide will walk you through setting up and running the three main components of the KaamEasy AI application:
1. **FastAPI Backend Server** (with Multi-Agent DAG Orchestrator)
2. **Customer Mobile Application** (`mobile`)
3. **Provider Mobile Application** (`mobile-provider`)

---

## 1. Backend Setup

The backend is built with FastAPI, using an agentic pipeline managed by the Google Labs Antigravity DAG engine.

### Prerequisites
*   Python 3.11 or higher installed.

### Steps
1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```

2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # On Windows (PowerShell):
   .\venv\Scripts\Activate.ps1
   # On Windows (CMD):
   .\venv\Scripts\Activate.bat
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure your Environment Variables:
   *   Copy `.env.example` to `.env`:
       ```powershell
       Copy-Item .env.example .env
       ```
   *   Open `.env` and configure your API keys:
       *   `GEMINI_API_KEY`: Your Google Gemini API Key.
       *   `GOOGLE_MAPS_API_KEY`: Optional. Required to compute real-world driving distances (set `USE_MOCK_MAPS=False` in settings to activate).
       *   `FIREBASE_CREDENTIALS_JSON_PATH`: Optional. Path to your `firebase-admin.json` private key file for Firestore integration.
       *   *Note: If no Firestore credentials or Gemini keys are provided, the backend will automatically fall back to mock/in-memory mode for development and local testing.*

5. Seed the Firestore database with mock service providers (optional, requires credentials):
   ```bash
   python seed_firestore.py
   ```

6. Start the FastAPI local server:
   ```bash
   # Bind to 0.0.0.0 so that physical devices on the same Wi-Fi can connect
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

7. Verify the backend is running:
   Open your browser and visit:
   *   **API Root**: http://localhost:8000
   *   **Swagger Docs (Interactive)**: http://localhost:8000/docs
   *   **Health Check**: http://localhost:8000/health (Expected: `{"status": "ok"}`)

---

## 2. Customer Mobile Setup (`mobile`)

The customer application is a React Native app built using Expo.

### Prerequisites
*   Node.js (v18 or higher recommended) and npm installed.

### Steps
1. Navigate to the `mobile` directory:
   ```bash
   cd mobile
   ```

2. Install dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```

3. Configure Environment Variables:
   *   Create a `.env` file matching `.env.example`:
       ```env
       EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:8000/api/v1
       ```
   *   *Note: Replace `YOUR_LOCAL_IP` with your computer's local network IP address (e.g. `192.168.1.50`), which you can find by running `ipconfig` (Windows) or `ifconfig` (macOS/Linux). Do not use `localhost` or `127.0.0.1` as physical devices and emulators cannot connect to your PC via those interfaces.*

4. Start the Expo development server:
   ```bash
   # Run with cleared cache to prevent bundling errors
   npx expo start -c
   ```

5. Open the app:
   *   **Android Emulator**: Press `a` in the terminal.
   *   **iOS Simulator**: Press `i` in the terminal.
   *   **Expo Go (Physical Phone)**: Scan the QR code displayed in the terminal with the Expo Go app (Android) or the native Camera app (iOS).
   *   *Note: Bypassing `FIS_AUTH_ERROR`: Expo Go runs with Expo's native signature, which causes Firebase Installations Service (FIS) token generation warnings. The app catches this error, logs a warning, skips push notifications, and continues functioning normally.*

---

## 3. Provider Mobile Setup (`mobile-provider`)

The provider app is a React Native app built using Expo 56 and Expo Router.

### Prerequisites
*   Node.js (v18 or higher recommended) and npm installed.

### Steps
1. Navigate to the `mobile-provider` directory:
   ```bash
   cd mobile-provider
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables:
   *   Create a `.env` file:
       ```env
       EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:8000/api/v1
       ```
   *   Ensure `YOUR_LOCAL_IP` matches the IP used in the customer app.

4. Start the Expo development server:
   ```bash
   npx expo start
   ```

5. Open the app using emulators (press `a` or `i`) or Expo Go by scanning the Metro QR code.

---

## 4. Testing & Simulations

### 4.1 Running Backend Integration Tests
To verify that the agentic orchestrator pipeline executes successfully, run the following command from the `backend` directory (with active virtual environment):
```bash
python test.py
```
This runs a simulated client request and tests Intent extraction, Provider Discovery, Ranking, and Booking confirmation.

### 4.2 Running the Provider Simulation Tool
If you want to test the entire customer app lifecycle (booking, negotiation, coordinate tracking, status progression) without manually operating the provider app, you can use the backend provider simulation tool:
```bash
cd backend
python test_provider_simulation.py --register --auto_accept --auto_location --auto_status
```

#### Command Options:
*   `--register`: Auto-registers a new provider profile in Firestore.
*   `--auto_accept`: Automatically claims any broadcasted job matching the provider's details.
*   `--auto_location`: Periodically streams mock GPS coordinates (simulating movement toward the customer) to the backend.
*   `--auto_status`: Automatically progresses the job status through:
    `on_the_way` → `arrived` → `in_progress` → `completed`.
*   `--interval [seconds]`: Adjust the delay between coordinate streams and status updates (default: 5 seconds).
