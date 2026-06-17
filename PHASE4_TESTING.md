# Phase 4 Testing Guide: Active Job Management

## Overview

Phase 4 adds real-time GPS tracking and live job management to the provider app. This guide walks through testing the complete job lifecycle from acceptance to completion.

## What's New in Phase 4

### Mobile Provider App
- **GPS Tracking Hook** (`useGPSTracking`): Collects location every 10 seconds
- **Live Tracking Screen** (`LiveTrackingScreen`): Full map view with:
  - Provider location (blue marker)
  - Customer destination (red marker)
  - Route visualization
  - Distance and ETA calculation
  - Real-time status updates
- **Enhanced Job Detail**: "View Live Tracking" button for active jobs
- **Location Streaming**: Every update sent to backend for dual Firestore sync

### Backend
- **Provider Simulation Script**: Test tool for auto-accepting jobs and updating locations
- **Location Endpoint**: `POST /api/v1/provider/location` handles continuous GPS updates

---

## Full End-to-End Testing Flow

### Prerequisites

1. **Backend running**:
   ```bash
   cd backend
   python -m pip install -r requirements.txt
   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

2. **Firebase configured**: Service account JSON in `backend/firebase-admin.json`

3. **Provider app installed**:
   ```bash
   cd mobile-provider
   npm install  # Install new dependencies (expo-location, react-native-maps, etc.)
   npx expo start
   ```

---

## Test Scenario: Complete Job Workflow

### Step 1: Register Provider

**Option A: Manual Registration (Mobile App)**
1. Open provider app
2. Sign up with email/password
3. Verify email
4. Complete profile setup:
   - Name: "Ahmed Khan"
   - Service: "AC Installation & Repair"
   - Rate: 3000 PKR/hr
   - Experience: 5 years
5. **Result**: Provider dashboard shows 🟢 Online ready

**Option B: Auto-Register (Script)**
```bash
cd backend
python test_provider_simulation.py --register --name "Test Provider"
```
Output shows registered `PROV-XXXXX` ID

### Step 2: Create a Test Job

Use the customer app or create manually via Firebase:

```bash
# Create booking in Firestore (firestore-admin dashboard or script)
bookings collection:
{
  "intent": {
    "service_type": "AC Installation & Repair",
    "urgency": "high",
    "preferred_time": "now",
    "description": "AC needs repair"
  },
  "booking": {
    "customer_id": "user123",
    "customer_name": "Hassan Ali",
    "customer_phone": "+923001112222",
    "customer_coordinates": {
      "latitude": 33.6844,
      "longitude": 73.0479
    },
    "location_description": "G-13, Islamabad",
    "total_estimated_cost": 3000,
    "requested_at": <current_timestamp>
  },
  "provider_id": "PROV-XXXXX",  # The registered provider
  "status": "pending_acceptance"
}
```

### Step 3: Accept Job in Provider App

**Option A: Manual (Mobile)**
1. Dashboard shows new job badge
2. Tap "View Jobs" → See pending request
3. Modal appears automatically OR tap job card
4. **Accept** the job
5. Redirected to job detail screen
6. **Result**: Status changes to "accepted"

**Option B: Auto-Accept (Script)**
```bash
python test_provider_simulation.py \
  --provider_id PROV-XXXXX \
  --auto_accept
```
Script monitors and auto-accepts jobs

### Step 4: Start Navigation

**Prerequisites**:
- **Location permissions**: App requests on first launch
  - iOS: "Allow while using app"
  - Android: Grant location permission
- **Real device or emulator with location simulation**: Simulator mode won't auto-update

**In App**:
1. From job detail screen, tap "🗺️ View Live Tracking"
2. Map loads with:
   - 📍 Your location (blue pin)
   - 🔴 Customer location (red pin)
   - Blue dashed line connecting them
3. Distance and ETA shown at bottom
4. Location updates every 10 seconds

**Result**: 
- Firestore `provider.current_coordinates` updates
- Firestore `booking.provider_live_coordinates` updates
- Real-time listeners on customer app show provider moving

### Step 5: Progress Job Status

**Manual Status Updates**:
1. From live tracking screen: Tap "📍 I Have Arrived"
   - Status changes to "arrived"
2. From job detail: Tap "🔧 Start Work"
   - Status changes to "in_progress"
3. From job detail: Tap "✓ Complete Job"
   - Status changes to "completed"
   - Shows completion screen

**Auto-Progress (Script)**:
```bash
python test_provider_simulation.py \
  --provider_id PROV-XXXXX \
  --auto_accept \
  --auto_location
```
Script randomly progresses status every 5-30 seconds

---

## Testing Each Feature

### GPS Tracking Hook

**Test location permissions**:
```typescript
// DashboardScreen or JobDetailScreen
const { isTracking, error } = useGPSTracking({
  bookingId: 'SFW-123456',
  enabled: true,
  interval: 10000
});

// Check console/alerts for:
// ✅ Permission granted
// ❌ Permission denied (expected on first launch)
```

**Expected behavior**:
1. First call requests location permission
2. Upon permission grant, starts collecting coordinates
3. Updates sent to `providerAPI.updateLocation(lat, lon, bookingId)`
4. Cleanup on component unmount

### Live Tracking Screen

**Test map rendering**:
```bash
# In app, navigate to job with status "on_the_way"
# Should see:
✓ Map loads successfully
✓ Provider marker (blue) at current location
✓ Customer marker (red) at destination
✓ Blue dashed line between them
✓ Distance in km (bottom left)
✓ ETA in minutes (bottom center)
✓ Customer name (bottom right)
✓ Action button changes based on status
```

**Test distance calculation**:
- Manual: Check Firestore coordinates
- Formula: Haversine (converts lat/lon to km)
- Example: G-13 to G-14 ≈ 1.2 km

**Test ETA**:
- Formula: (distance_km / 30) * 60 = minutes
- Default fallback: Uses job.eta_minutes if location unavailable

### Location Streaming

**Monitor Firestore updates**:
```javascript
// In Firestore console, watch these collections:
bookings/SFW-XXXXX/provider_live_coordinates
// Should update every 10 seconds with new coordinates

provider/PROV-XXXXX/current_coordinates
// Should update simultaneously
```

**Test with script**:
```bash
python test_provider_simulation.py \
  --provider_id PROV-XXXXX \
  --auto_location

# Console output:
# 📡 Location: 33.6844, 73.0479
# 📡 Location: 33.6851, 73.0482  (updated every 5s in script)
# (Backend forwards to Firestore)
```

### Status Progression

**Test all transitions**:
```
accepted → on_the_way  (▶️ Start Journey button)
on_the_way → arrived   (📍 I Have Arrived button)
arrived → in_progress  (🔧 Start Work button)
in_progress → completed (✓ Complete Job button)
```

**Verify in Firestore**:
- After each button tap, check `booking.status` updates
- Timestamps recorded in `booking.updated_at`

---

## Common Issues & Troubleshooting

### Maps won't load
**Cause**: `react-native-maps` not installed
**Fix**:
```bash
cd mobile-provider
npm install react-native-maps
npx expo install react-native-maps
```

### Location updates don't appear on map
**Cause**: Location permission denied
**Fix**: Grant location permission in app settings and restart

### "Unable to find provider" in LiveTrackingScreen
**Cause**: No location permission or GPS disabled
**Fix**: Check device location is turned on and app has permission

### API calls fail with 404
**Cause**: Backend endpoint not registered
**Fix**: Verify `app/main.py` includes:
```python
from app.api.v1.provider import router as provider_router
app.include_router(provider_router, prefix=API_V1, tags=["Provider Operations"])
```

### Job status doesn't update in real-time
**Cause**: Firestore listener not updating
**Fix**: Check that `useSingleJobListener` is properly subscribed in JobDetailScreen

---

## Performance Monitoring

### Battery & Network
- GPS updates: Every 10 seconds (moderate battery impact)
- Location accuracy: Balanced mode (good for urban areas)
- Network: ~2KB per update (location + job ID)

### Firestore Quota
- Writes: 1 per 10 seconds per active job
- Reads: Real-time listeners (continuous cost)
- Daily estimate: ~8640 writes per provider per day

---

## Next Phase: Analytics & Earnings (Phase 5)

After Phase 4 testing passes, Phase 5 will add:
- Earnings dashboard with completed jobs
- Performance metrics (ratings, completion rate)
- Job history and replay
- Analytics integration

---

## Quick Start Script

For fastest testing, use this script:

```bash
#!/bin/bash

# 1. Start backend
cd backend
python -m uvicorn app.main:app --reload &
BACKEND_PID=$!

# 2. Start provider app
cd ../mobile-provider
npm install
npx expo start --web &
EXPO_PID=$!

# 3. Register provider (give expo 5s to start)
sleep 5
python ../backend/test_provider_simulation.py --register

# 4. Keep running
wait $BACKEND_PID $EXPO_PID
```

Run: `bash test_phase4.sh`
