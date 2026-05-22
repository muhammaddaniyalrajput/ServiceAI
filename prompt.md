You are an expert full-stack engineer and AI systems architect working on "ServiceFlow AI" — an agentic service booking platform for Pakistan's informal economy. This project is submitted to a hackathon where Google Antigravity MUST be the core orchestration engine.

CRITICAL CONTEXT:
- Backend: FastAPI + Python 3.11, located in /backend
- Mobile: React Native + Expo SDK 54 + NativeWind v4, located in /mobile
- The backend has a working 6-agent pipeline (Intent → Discovery → Ranking → Booking → Notification → FollowUp)
- The mobile app has multiple critical bugs preventing it from running
- Google Antigravity is mentioned in comments but NOT actually integrated — this must be fixed immediately

YOUR MISSION:
Fix all bugs, integrate Google Antigravity as the real orchestration layer, and make the full demo work end-to-end.

RULES:
1. Read and analyze every file before changing anything
2. Never delete working logic — only fix or extend it
3. Apply fixes in the exact order below
4. Explain every change with a brief inline comment
5. After each section, verify no existing tests or imports are broken

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1: GOOGLE ANTIGRAVITY INTEGRATION (HIGHEST PRIORITY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The current workflow.py is sequential Python masquerading as an orchestrator. Replace it with a real Antigravity DAG.

Step 1a: Add Antigravity to backend/requirements.txt
  - Add the correct Google Antigravity Python SDK package (check PyPI for the current package name — it may be `google-labs-antigravity`, `antigravity-sdk`, or similar)
  - If Antigravity uses a different installation method, document it

Step 1b: Rewrite backend/app/orchestrator/workflow.py

The new file must:
  - Import the Antigravity SDK and initialize a workflow/DAG client using an API key from settings
  - Define the pipeline as a proper Antigravity DAG with these named nodes:
      Node 1: "intent_extraction" — wraps run_intent_agent()
      Node 2: "provider_discovery" — wraps run_discovery_agent(), depends on Node 1
      Node 3: "provider_ranking" — wraps run_ranking_agent(), depends on Node 2
      Node 4: "booking_confirmation" — wraps run_booking_agent(), depends on Node 3
      Node 5: "send_notification" — wraps run_notification_agent(), depends on Node 4, runs in parallel with Node 6
      Node 6: "schedule_followup" — wraps run_followup_agent(), depends on Node 4, runs in parallel with Node 5
  - Each node must receive the outputs of its dependencies as inputs
  - The DAG must emit traceable execution logs that can be retrieved per booking_id
  - Preserve all existing function signatures — agents themselves do not change
  - The three orchestrate_*() functions (orchestrate_analyze, orchestrate_find_providers, orchestrate_book_service) must still exist and be callable from the API routes
  - Each orchestrate function must now invoke the relevant Antigravity DAG segment instead of calling agents directly

Step 1c: Add ANTIGRAVITY_API_KEY to backend/.env.example and backend/app/core/config.py
  - Add: ANTIGRAVITY_API_KEY: str = ""
  - If Antigravity uses a different auth mechanism (service account, ADC), implement it correctly

Step 1d: Update backend/app/core/logger.py to also emit Antigravity-compatible trace events
  - When Antigravity provides a trace/span mechanism, wrap log_agent() to also emit to Antigravity tracing
  - If Antigravity provides its own logging, bridge the existing structured logs into it

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2: MOBILE CRITICAL BUG FIXES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 2a: Fix mobile/package.json
  - Change "main" from "expo/AppEntry.js" to "index.ts"
  - Verify all dependencies are correct for Expo SDK 54

Step 2b: Delete mobile/src/api.ts entirely
  - This file hardcodes localhost:8000, ignores env vars, and conflicts with mobile/src/services/api.ts
  - mobile/src/services/api.ts is the correct API client — keep it

Step 2c: Fix mobile/src/screens/HomeScreen.tsx
  - Remove: import apiClient from '../api'  (delete this file was deleted in 2b)
  - Remove: import { analyzeRequest } from '../services/api'  (dead import)
  - Add: import { analyzeRequest } from '../services/api'  (but actually USE it)
  - Change the handleSend function to call: analyzeRequest('anonymous_user', inputText.trim())
    NOT: apiClient.post('/analyze', {...})
  - The analyzeRequest function in services/api.ts posts to /analyze-request with { user_id, text } — this is correct
  - After receiving the result, store it in intentResult state
  - The intentResult shape from the backend is: { success, booking_id, intent: { service_type, location, urgency, language, confidence, datetime_hint }, logs }
  - Fix the display mapping to match this exact shape
  - When navigating to Providers, pass: { intentResult: result, bookingId: result.booking_id }
  - Attach the Firebase auth token: before calling analyzeRequest, get the current Firebase user token and add it as an Authorization header. Modify services/api.ts to accept an optional token parameter or use an interceptor

Step 2d: Fix mobile/src/services/api.ts
  - Add a Firebase auth token interceptor:
```typescript
    import { auth } from '../firebase';
    
    apiClient.interceptors.request.use(async (config) => {
      const user = auth.currentUser;
      if (user) {
        const token = await user.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
```
  - Add timeout: timeout: 30000 to the axios.create config
  - Improve error messages: if error.response?.status === 404, say "Service not found"; if 500, say "AI processing error — please retry"

Step 2e: Fix mobile/src/firebase.ts
  - Replace ALL placeholder values with real Firebase credentials
  - The project ID is serviceflowai-4181f — use the real values from Firebase Console
  - If real credentials are not available, add clear TODO comments explaining exactly what to replace and where to get the values
  - Add error handling: wrap initializeApp in try/catch

Step 2f: Fix mobile/src/screens/BookingSuccessScreen.tsx
  - The screen receives `confirmation` in route.params
  - The backend's book-service response shape is: { success, booking: BookingResult, notification, follow_up, logs }
  - BookingResult shape: { booking_id, provider: Provider, status, scheduled_at, eta_minutes, total_estimated_cost, confirmation_code }
  - Provider shape: { name, service, location, rating, hourly_rate, ... }
  - Fix all field references:
    - provider_name → confirmation?.booking?.provider?.name
    - service_type → confirmation?.booking?.provider?.service
    - scheduled_time → confirmation?.booking?.scheduled_at
    - estimated_price → `PKR ${confirmation?.booking?.total_estimated_cost}`
    - booking_id → confirmation?.booking?.confirmation_code (show the SFW-XXXXXX code)
  - Also show: eta_minutes if available

Step 2g: Fix mobile/src/screens/ProvidersScreen.tsx
  - After findProviders returns, the ranked array has shape: [{ provider: Provider, score: float, score_reason: string }]
  - The current mapping does `{ ...r.provider, score_reason: r.score_reason }` — this is correct, keep it
  - Fix provider_id lookup: after mapping, item.provider_id comes from the spread provider object — verify this works
  - The bookService call passes (bookingId, provId, intentPayload) — verify intentPayload is intentResult.intent, not intentResult itself
  - Fix the confirmation parameter passed to BookingSuccess: pass the full bookService response, not a manually constructed object

Step 2h: Fix mobile/google-services.json and mobile/GoogleService-Info.plist
  - Replace all PLACEHOLDER values with real values from Firebase Console
  - If real values unavailable, add clear TODO comments

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3: BUILD AGENT LOG VIEWER (HACKATHON SHOWCASE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This is the most visually impressive feature for judges — showing agents thinking in real time.

Step 3a: Create mobile/src/components/AgentLogViewer.tsx
  - Props: { bookingId: string }
  - Fetches from GET /api/v1/agent-logs/{bookingId} using the API service
  - Polls every 2 seconds while status is not "confirmed" or "failed"
  - Renders a vertical timeline of agent steps
  - Each step shows:
    - Agent name (colored badge): Intent Agent=blue, Discovery=green, Ranking=yellow, Booking=purple, Notification=orange, FollowUp=pink
    - Action text
    - Status icon: processing=spinner, success=✅, error=❌
    - Reasoning text (truncated to 2 lines, expandable on tap)
    - Timestamp
  - Animate each new step appearing with a slide-in from left
  - Use NativeWind v4 classes for all styling

Step 3b: Integrate AgentLogViewer into HomeScreen.tsx
  - After calling analyzeRequest, show AgentLogViewer below the intent result
  - Pass the booking_id returned by analyzeRequest
  - Show a "Live Workflow" header above it
  - Continue polling as user proceeds through the flow

Step 3c: Add agentLogs service function to mobile/src/services/api.ts
```typescript
  export const getAgentLogs = async (bookingId: string) => {
    const response = await apiClient.get(`/agent-logs/${bookingId}`);
    return response.data;
  };
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4: ZUSTAND STATE MANAGEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 4a: Create mobile/src/store/bookingStore.ts
```typescript
  interface BookingState {
    bookingId: string | null;
    intent: IntentOutput | null;
    rankedProviders: RankedProvider[];
    selectedProvider: Provider | null;
    bookingResult: BookingResult | null;
    agentLogs: AgentTraceStep[];
    status: 'idle' | 'analyzing' | 'finding' | 'booking' | 'confirmed' | 'error';
    error: string | null;
    // Actions
    setAnalysisResult: (bookingId: string, intent: IntentOutput) => void;
    setProviders: (providers: RankedProvider[]) => void;
    setBookingResult: (result: BookingResult) => void;
    appendLogs: (logs: AgentTraceStep[]) => void;
    reset: () => void;
  }
```
  - Use zustand with immer for immutable updates
  - Export a useBookingStore hook

Step 4b: Refactor HomeScreen, ProvidersScreen to use the store
  - Replace local useState for intentResult, bookingId with store selectors
  - Dispatch store actions after each API call

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5: BACKEND IMPROVEMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 5a: Add Google Maps service (backend/app/services/google_maps.py)
  - Create this file that the system_capability.md references but doesn't exist
  - Implement get_distance_km(origin_lat, origin_lon, dest_lat, dest_lon) -> float
  - When USE_MOCK_MAPS=False, use googlemaps Python SDK with GOOGLE_MAPS_API_KEY
  - When USE_MOCK_MAPS=True, fall back to haversine (import from discovery_agent)
  - Update discovery_agent.py to use this service instead of its internal haversine

Step 5b: Fix the _ranked_cache memory leak in backend/app/api/v1/bookings.py
  - Add LRU cache with max 1000 entries and 1-hour TTL
  - Use functools.lru_cache or a simple dict with timestamp tracking
  - Clear entries older than 2 hours

Step 5c: Add request timeout to all Gemini calls
  - In intent_agent.py and ranking_agent.py, add timeout parameter to generate_content calls
  - Default timeout: 15 seconds
  - On timeout, fall back to the existing fallback logic (don't crash)

Step 5d: Add async support to the main endpoints
  - The three orchestrate functions are synchronous but called from async FastAPI handlers
  - Wrap them with asyncio.to_thread() to avoid blocking the event loop:
```python
    result = await asyncio.to_thread(orchestrate_analyze, user_id=effective_user_id, text=payload.text)
```

Step 5e: Fix CORS for production
  - Add the Expo web URL (exp://, http://192.168.x.x:*) patterns to CORS_ORIGINS
  - Document that production deployment needs actual domain names

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 6: QUALITY OF LIFE IMPROVEMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 6a: Remove mobile/src/api.ts from git (already deleted in 2b)
  - Also remove the dead import from HomeScreen
  - Add src/api.ts to .gitignore to prevent re-adding

Step 6b: Fix mobile/.env — do not commit real IP addresses
  - Add mobile/.env to .gitignore
  - Create mobile/.env.example with: EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:8000/api/v1

Step 6c: Add loading states to ProvidersScreen
  - Show skeleton cards while loading (3 placeholder cards with animated shimmer)
  - Show retry button on error

Step 6d: Add haptic feedback to booking confirmation
  - Use expo-haptics on successful booking: Haptics.notificationAsync(NotificationFeedbackType.Success)

Step 6e: Fix the service alias for "rangswaz" in mock_providers.py
  - "rangswaz": "Painter" → "rangsaz": "Painter" (correct Urdu romanization)
  - Add more Roman Urdu aliases: "mistri": "Carpenter", "mistry": "Carpenter", "plumbing wala": "Plumber"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 7: VERIFICATION CHECKLIST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After all changes, verify:

Backend:
  [ ] `uvicorn app.main:app --reload --port 8000` starts without errors
  [ ] GET /health returns {"status": "ok"}
  [ ] POST /api/v1/analyze-request with {"user_id":"test","text":"Mujhe G-13 mein plumber chahiye"} returns intent with service_type="Plumber"
  [ ] POST /api/v1/find-providers returns ranked providers with score_reason
  [ ] POST /api/v1/book-service returns booking with confirmation_code starting "SFW-"
  [ ] GET /api/v1/agent-logs/{booking_id} returns steps array with all 6 agents
  [ ] Antigravity DAG executes and traces are emitted (verify with Antigravity console)

Mobile:
  [ ] `npx expo start -c` starts without bundling errors
  [ ] App opens to HomeScreen on Android emulator (use 10.0.2.2 in .env)
  [ ] Typing "I need a plumber in G-13" and pressing Send calls the correct endpoint
  [ ] Intent result displays correctly (service, location, urgency, language, confidence)
  [ ] AgentLogViewer shows agent steps appearing sequentially
  [ ] Navigating to Providers shows ranked provider cards with score_reason
  [ ] Pressing Book Now navigates to BookingSuccess with real data (not all N/A)
  [ ] BookingSuccess shows provider name, service, scheduled_at, cost, confirmation code

Do NOT:
  - Change any Pydantic schema field names without updating all usages
  - Remove the Firebase mock fallback from firebase_db.py
  - Break the existing Swagger docs
  - Change the WEIGHTS dict in ranking_agent.py (judges may verify these)
  - Commit real API keys or credentials to git

The most important change is Section 1 (Antigravity). If time is limited, prioritize:
  1. Antigravity DAG in workflow.py
  2. HomeScreen endpoint fix
  3. Firebase config
  4. AgentLogViewer
  
Everything else is secondary to those four.