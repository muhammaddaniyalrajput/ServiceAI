# ServiceFlow AI — Quickstart Guide

This guide will help you set up and run the ServiceFlow AI application (FastAPI backend & React Native Expo mobile client) on your local development machine.

---

## 1. Backend Setup

The backend is built with FastAPI, using an agentic pipeline managed by the Google Antigravity DAG engine.

### Prerequisites
- Python 3.10 or higher installed.

### Steps
1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```

2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # On Windows (PowerShell):
   .\venv\Scripts\activate
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
   - Copy `.env.example` to `.env`:
     ```bash
     copy .env.example .env
     ```
   - Open `.env` and fill in your keys:
     - `GEMINI_API_KEY`: Your Google Gemini API Key.
     - `ANTIGRAVITY_API_KEY`: Your Antigravity key.
     - `GOOGLE_MAPS_API_KEY`: Required if `USE_MOCK_MAPS=False` to compute driving distances.

5. *(Optional)* Seed the Firestore database with mock service providers:
   ```bash
   python seed_firestore.py
   ```
   *Note: If Firestore is not enabled or credentials are not found, the application will automatically fall back to mock/in-memory mode, so you can develop without additional setup.*

6. Start the FastAPI local server:
   ```bash
   # Bind to 0.0.0.0 so that physical devices on the same Wi-Fi can connect to it!
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
   *If you only want to test locally on an emulator on the same machine, you can run:*
   ```bash
   uvicorn app.main:app --port 8000 --reload
   ```

---

## 2. Mobile Setup

The mobile application is a React Native app built using Expo.

### Prerequisites
- Node.js (v18 or higher recommended) and npm installed.
- Expo Go app installed on your physical mobile device (available on Google Play Store and iOS App Store) for testing, or an Android/iOS emulator.

### Steps
1. Navigate to the `mobile` directory:
   ```bash
   cd mobile
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables:
   - Copy `.env.example` to `.env`:
     ```bash
     copy .env.example .env
     ```
   - Edit `.env` and configure `EXPO_PUBLIC_API_URL`.
     - **For Emulator testing**: Use `http://10.0.2.2:8000/api/v1` (Android emulator) or `http://127.0.0.1:8000/api/v1` (iOS Simulator).
     - **For Physical Device testing**: Use your computer's local network IP address (e.g. `http://192.168.24.139:8000/api/v1`). Make sure your mobile device and computer are on the same Wi-Fi network. *Note: Match the IP address displayed by Expo when Metro starts.*

4. Start the Expo developer server:
   ```bash
   npm run start
   ```

5. Scan the QR code displayed in the terminal with the Expo Go app (on Android) or your Camera app (on iOS) to launch the application.

### Important: Testing Push Notifications
- **Using Expo Go**: 
  FCM push notification tokens require a native app signature matching your Firebase project settings. Because Expo Go is signed with Expo Inc.'s certificate, attempting to generate tokens inside Expo Go results in a Firebase Installations Service error (`FIS_AUTH_ERROR`).
  
  **The app handles this gracefully** by detecting Expo Go, skipping push registration, logging a warning, and continuing normal operation.
  
- **For Production / Full Push Notification Testing**:
  To test actual FCM token generation and notifications, you must build a custom **Development Build** which bakes your `google-services.json`/`GoogleService-Info.plist` and signing keys into the native client:
  ```bash
  # 1. Install dev client
  npx expo install expo-dev-client
  
  # 2. Run local native build (requires Android SDK / Xcode)
  npx expo run:android
  # or
  npx expo run:ios
  ```

---

## 3. Running Integration Tests

To verify that all components are talking to each other and the agent pipeline executes successfully:
1. Ensure your FastAPI server is running.
2. From the `backend` directory, run:
   ```bash
   python test.py
   ```
   This will execute the multi-stage intent discovery and booking simulation pipeline.
