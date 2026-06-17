# Developer Quick Reference — Provider App

## Project Structure

```
ServiceAI/
├── backend/
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── provider.py          # 6 provider endpoints
│   │   │   └── ...
│   │   ├── models/
│   │   │   └── schemas.py           # 10 Pydantic models
│   │   ├── services/
│   │   │   ├── firebase_db.py       # 11 DB functions
│   │   │   ├── fcm_service.py
│   │   │   └── ...
│   │   └── main.py                  # FastAPI app
│   ├── test_provider_simulation.py  # Testing script
│   └── requirements.txt
│
├── mobile-provider/
│   ├── src/
│   │   ├── app/
│   │   │   ├── _layout.tsx          # Root layout with auth
│   │   │   ├── auth/                # Auth stack
│   │   │   │   ├── _layout.tsx
│   │   │   │   ├── register.tsx
│   │   │   │   ├── verify-email.tsx
│   │   │   │   ├── profile-setup.tsx
│   │   │   │   └── login.tsx
│   │   │   └── [dashboard|jobs|profile|earnings|job-history|job-detail|live-tracking].tsx
│   │   ├── screens/
│   │   │   ├── [Dashboard|Jobs|Profile|Earnings|JobHistory|JobDetail|LiveTracking]Screen.tsx
│   │   │   ├── [Register|EmailVerification|ProfileSetup|Login]Screen.tsx
│   │   │   └── ...
│   │   ├── hooks/
│   │   │   ├── useProviderJobs.ts   # Firestore listeners
│   │   │   ├── useEarnings.ts       # Analytics hook
│   │   │   ├── useGPSTracking.ts    # GPS tracking
│   │   │   └── ...
│   │   ├── services/
│   │   │   ├── providerAPI.ts       # API singleton
│   │   │   ├── pushNotifications.ts # FCM service
│   │   │   └── ...
│   │   ├── components/
│   │   │   ├── JobRequestModal.tsx
│   │   │   └── ...
│   │   ├── store/
│   │   │   └── providerStore.ts     # Zustand state
│   │   ├── types/
│   │   │   └── ...
│   │   └── firebase.ts              # Firebase SDK
│   ├── package.json
│   └── app.json
│
├── PROVIDER_APP_COMPLETE.md         # Full summary (this)
├── PHASE4_TESTING.md                # GPS/maps testing
├── PHASE5_TESTING.md                # Analytics testing
└── README.md
```

## Key Files Reference

### Backend

**`app/api/v1/provider.py`** (320 lines)
```typescript
// Endpoints:
POST   /api/v1/provider/register
POST   /api/v1/provider/status
POST   /api/v1/provider/location
GET    /api/v1/provider/jobs
POST   /api/v1/provider/jobs/{booking_id}/respond
POST   /api/v1/provider/jobs/{booking_id}/status
```

**`app/models/schemas.py`** (250 lines)
```typescript
// Models:
ProviderProfile, ProviderRegisterRequest, ProviderStatusRequest,
ProviderLocationUpdate, ProviderJob, ProviderJobsResponse,
ProviderJobRespondRequest, ProviderJobStatusUpdateRequest
```

**`app/services/firebase_db.py`** (400 lines)
```typescript
// Functions:
create_provider(), get_provider_by_id(), update_provider_availability(),
update_provider_location(), get_provider_assigned_jobs(),
respond_to_job(), update_job_status(), ...
```

### Mobile Provider App

**Screens** (600+ lines each)
```
EarningsScreen.tsx       # Analytics dashboard
JobHistoryScreen.tsx     # Job history with filters
JobDetailScreen.tsx      # Full job details + status
LiveTrackingScreen.tsx   # Map view with GPS
DashboardScreen.tsx      # Home screen
ProfileScreen.tsx        # Provider profile
JobsScreen.tsx          # Jobs list
[Auth screens]          # Register, Email verification, etc.
```

**Hooks** (200-300 lines each)
```
useEarnings.ts          # Earnings calculation
useProviderJobs.ts      # Firestore listeners
useGPSTracking.ts       # GPS + permissions
```

**Services** (150-200 lines each)
```
providerAPI.ts          # HTTP client
pushNotifications.ts    # FCM handling
```

**Store**
```
providerStore.ts        # Zustand (13 actions)
```

## Common Patterns

### Using the API Service
```typescript
import { providerAPI } from '@/services/providerAPI';

// Register
await providerAPI.registerProvider({
  name, phone, service, hourly_rate, experience_yrs, fcm_token
});

// Get jobs
const response = await providerAPI.getAssignedJobs();

// Update location
await providerAPI.updateLocation(lat, lon, booking_id);

// Respond to job
await providerAPI.respondToJob(booking_id, 'accept' | 'reject');

// Update status
await providerAPI.updateJobStatus(booking_id, status);
```

### Using Zustand Store
```typescript
import { useProviderStore } from '@/store/providerStore';

// Read state
const profile = useProviderStore((s) => s.profile);
const jobs = useProviderStore((s) => s.assignedJobs);

// Update state
const setProfile = useProviderStore((s) => s.setProfile);
setProfile(profileData);
```

### Real-Time Listeners
```typescript
import { useProviderJobs, useSingleJobListener } from '@/hooks/useProviderJobs';

// Watch all jobs
useProviderJobs(providerId); // Auto-syncs to store

// Watch single job
const { job, loading } = useSingleJobListener(booking_id);
```

### GPS Tracking
```typescript
import { useGPSTracking } from '@/hooks/useGPSTracking';

const { isTracking, error } = useGPSTracking({
  bookingId: booking_id,
  enabled: true,
  interval: 10000
});
```

### Earnings Analytics
```typescript
import { useEarningsStats } from '@/hooks/useEarnings';

const { stats, loading, error, jobs } = useEarningsStats(
  providerId,
  completedCount,
  totalJobsOffered
);

// stats object:
// - total_earnings, completed_jobs_count, average_job_value
// - average_rating, completion_rate
// - today_earnings, week_earnings, month_earnings
// - jobs_completed_today, jobs_completed_week, jobs_completed_month
```

## State Flow

```
User Registration
    ↓
Firebase Auth (createUserWithEmailAndPassword)
    ↓
Email Verification (user.emailVerified polling)
    ↓
Profile Setup (POST /provider/register)
    ↓
Zustand Store Updated (setProfile, setProviderId)
    ↓
Root Layout Auth Check (onAuthStateChanged)
    ↓
Redirect to Dashboard
    ↓
useProviderJobs listener started
    ↓
Jobs auto-sync to store
    ↓
Components re-render with fresh data
```

## Navigation Flow

```
_layout.tsx (Root)
├─ Auth Check
├─ Conditional Routing
│
├─ Auth Stack (if not authenticated)
│  ├─ register
│  ├─ verify-email
│  ├─ profile-setup
│  └─ login
│
└─ App Stack (if authenticated)
   ├─ dashboard
   ├─ jobs
   ├─ profile
   ├─ earnings
   ├─ job-history
   ├─ job-detail
   └─ live-tracking
```

## Type Definitions

### ProviderJob
```typescript
{
  booking_id: string;
  service_type: string;
  customer_name: string;
  customer_phone?: string;
  customer_coordinates: { latitude: number; longitude: number };
  location_description: string;
  total_estimated_cost: number;
  urgency: 'high' | 'medium' | 'low';
  eta_minutes: number;
  status: 'pending_acceptance' | 'accepted' | 'on_the_way' | 'arrived' | 'in_progress' | 'completed';
  requested_at: Date;
}
```

### ProviderProfile
```typescript
{
  provider_id: string;
  name: string;
  phone: string;
  service: string;
  hourly_rate: number;
  experience_yrs: number;
  is_available: boolean;
  is_verified: boolean;
  rating: number;
  current_coordinates?: { latitude: number; longitude: number };
  fcm_token?: string;
  updated_at: Date;
}
```

### EarningsStats
```typescript
{
  total_earnings: number;
  completed_jobs_count: number;
  average_job_value: number;
  average_rating: number;
  today_earnings: number;
  week_earnings: number;
  month_earnings: number;
  completion_rate: number;
  jobs_completed_today: number;
  jobs_completed_week: number;
  jobs_completed_month: number;
}
```

## API Endpoints

### Registration & Status
```
POST /api/v1/provider/register
  Request: { name, phone, service, hourly_rate, experience_yrs, fcm_token }
  Response: { profile: ProviderProfile }

POST /api/v1/provider/status
  Request: { is_available: boolean }
  Response: { status: "success", updated_at: timestamp }
```

### Location Tracking
```
POST /api/v1/provider/location
  Request: { latitude, longitude, booking_id? }
  Response: { status: "success", coordinates_saved: true }
```

### Job Management
```
GET /api/v1/provider/jobs
  Response: { jobs: ProviderJob[], total_count: number }

POST /api/v1/provider/jobs/{booking_id}/respond
  Request: { action: "accept" | "reject" }
  Response: { status: "updated", job: ProviderJob }

POST /api/v1/provider/jobs/{booking_id}/status
  Request: { status: "on_the_way" | "arrived" | "in_progress" | "completed" }
  Response: { status: "updated", job: ProviderJob }
```

## Testing Commands

```bash
# Run provider simulation (auto-accept & location updates)
python backend/test_provider_simulation.py --register --auto_accept --auto_location

# Start backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Start provider app
cd mobile-provider
npm install
npx expo start
```

## Common Debugging

**Provider not receiving jobs**
- Check `provider_id` in Firestore bookings
- Verify booking `status = 'pending_acceptance'`
- Check `useProviderJobs` hook is mounted
- Verify Firestore query works in console

**Location not updating**
- Check location permissions in device settings
- Verify GPS is enabled
- Check network connectivity
- Look for errors in `useGPSTracking` hook

**Earnings not calculating**
- Verify bookings have `status = 'completed'`
- Check `booking.total_estimated_cost` or `booking.actual_payment` exists
- Verify `completed_at` timestamp is set
- Check Firestore query filter criteria

**Real-time updates not working**
- Verify Firestore listener is mounted
- Check network connectivity
- Look at browser console for errors
- Verify Firestore rules allow read access

## Git Workflow

```bash
# Latest provider implementation
git log --oneline mobile-provider/src/

# View changes in specific phase
git show <commit>:mobile-provider/src/screens/EarningsScreen.tsx

# Compare Firebase vs mock mode
grep -r "mock_mode" backend/
```

## Performance Tips

1. **Reduce real-time listeners** — Only subscribe when needed
2. **Batch Firestore writes** — Use transactions for multi-doc updates
3. **Memoize calculations** — Use useMemo for stats
4. **Lazy load screens** — Split code with Expo Router
5. **Optimize images** — Use expo-image for provider avatars
6. **Cache API responses** — Store in Zustand until refresh

## Security Notes

- ✅ Firebase Auth validation on backend
- ✅ Provider ID verification via header
- ✅ Firestore security rules (implement!)
- ✅ No sensitive data in logs
- ✅ Environment variables for secrets
- ⚠️ TODO: Implement proper Firestore rules
- ⚠️ TODO: Rate limit API endpoints
- ⚠️ TODO: Add HTTPS in production

## Contact & Support

For questions about this codebase:
1. Check [PROVIDER_APP_COMPLETE.md](PROVIDER_APP_COMPLETE.md) for overview
2. Check [PHASE5_TESTING.md](PHASE5_TESTING.md) for analytics details
3. Check [PHASE4_TESTING.md](PHASE4_TESTING.md) for GPS/maps details
4. Review the code comments in specific files
5. Run `test_provider_simulation.py` to understand API flow

---

**Last Updated**: June 12, 2026
**Version**: 1.0.0
