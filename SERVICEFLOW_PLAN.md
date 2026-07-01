# KaamEasy AI — Master Audit & Implementation Plan

> Generated from a full read-only audit of `backend/`, `mobile/` (customer), and `mobile-provider/` (provider).
> Status legend: `[ ]` todo · `[~]` in progress · `[x]` done
> Severity: 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low/Polish

---


## 0. Audit Summary

| Subproject | Stack | Compiles? | Headline finding |
|---|---|---|---|
| `backend` | FastAPI + multi-agent DAG + Firebase | ✅ (runs in mock mode) | Unhandled crash in discovery, most routes unauthenticated, customer data dropped on simulated path |
| `mobile` (customer) | Expo SDK 54, NativeWind v4, Zustand | ❌ **1 blocker** | `tsconfig` `ignoreDeprecations:"6.0"` invalid for TS 5.9 → typecheck fails. Otherwise clean. |
| `mobile-provider` | Expo SDK 56, Expo Router, Zustand | ✅ (tsc clean) | Rules-of-Hooks violation in Dashboard, hardcoded chat IDs, dead/orphaned starter code |

**The single thing breaking the build right now:** `mobile/tsconfig.json:5` sets `"ignoreDeprecations": "6.0"`, but the customer app is on TypeScript 5.9.3 where the only accepted value is `"5.0"`. With it corrected, `tsc --noEmit` reports **0 errors**. (Provider app is on TS 6.0.3, so the value is only wrong for the customer app.)

---

## Phase 1 — 🔴 Critical Bugs & Build Blockers
*Goal: make everything compile and stop the crashes/data-loss.*

### 1A. Build / compile
- [x] **C1** `mobile/tsconfig.json:5` — change `"ignoreDeprecations": "6.0"` → `"5.0"` (TS 5.9 only accepts `"5.0"`). Unblocks customer-app typecheck.

### 1B. Backend crashes & data integrity
- [x] **C2** `backend/app/agents/discovery_agent.py:193` — `get_providers_from_google()` is **not** wrapped in try/except. Missing/failing Maps key raises `RuntimeError` and kills Stage 2. Wrap it like the registered-provider fetch above it; fall back to mock/registered list.
- [x] **C3** `backend/app/orchestrator/workflow.py` — **customer data dropped on the simulated-provider path.** Real path writes `customer_name/phone/address/coordinates` (≈L326–336); simulated path (≈L360–368) does not. Also key mismatch: simulation reads `user_coordinates` (`provider_simulation_agent.py:104`) but orchestrator writes `customer_coordinates`. Write both / unify the key so simulated bookings & tracking have customer info.
- [x] **C4** `backend/app/agents/ranking_agent.py:140` (`top = scored[0]`) and `backend/app/orchestrator/workflow.py:273` (`ranked_providers[0]`) — guard against empty provider lists (`IndexError`). *(workflow.py:273 was already guarded; fixed ranking_agent.)*
- [x] **C5** `backend/app/api/v1/provider.py:364,483` — `payload` defaults to `None`; a missing request body → `AttributeError` on `payload.action`. Make body required or null-check.
- [x] **C6** `backend/app/services/firebase_db.py:533,557` — operator-precedence bug in service matching: `a and a in b or b in a` mis-parses. Add parentheses: `a and (a in b or b in a)`.

### 1C. Mobile runtime crashes
- [x] **C7** `mobile-provider/src/screens/DashboardScreen.tsx:57–72` — **Rules of Hooks violation**: `usePushNotifications()` / `useEffect` called *after* an early `return` on `!profile`. Move all hooks above the early return.
- [x] **C8** `mobile-provider/src/screens/EarningsScreen.tsx:265` — `backgroundColor: 'linear-gradient(...)'` is invalid in RN StyleSheet (renders transparent). Replace with `expo-linear-gradient` `<LinearGradient>` or a solid token color. *(Used solid `#003366` — no new dependency.)*
- [x] **C9** `mobile-provider/src/hooks/useEarnings.ts:132` — `0/0 = NaN` when jobs exist but none have ratings. Guard the divisor; default rating to `0`.
- [x] **C10** `mobile-provider/src/screens/RegisterScreen.tsx:76` & `EmailVerificationScreen.tsx:98` — `Alert.alert(..., error)` uses **stale** `error` state (setState is async). Use the local `err.message` directly.

### 1D. Identity correctness (chat attribution)
- [x] **C11** Hardcoded sender IDs — every chat message is mis-attributed:
  - `mobile/src/screens/ChatScreen.tsx:64` (`currentUserId='user_id_placeholder'`) → `auth.currentUser?.uid`
  - `mobile/src/components/ui/NegotiationChatSheet.tsx:38` (`currentUserId='customer'`) → `auth.currentUser?.uid`
  - `mobile-provider/src/screens/ChatScreen.tsx:59` (`currentUserId='provider_id_placeholder'`) → store `providerId` ➜ `auth.currentUser?.uid`
  Source the real UID from Firebase Auth (`auth.currentUser?.uid`) / store, not component props (Expo Router & the stack render these without props).

> **✅ Phase 1 complete (2026-06-28).** Verification: customer `tsc --noEmit` = 0 errors; provider `tsc --noEmit` = 0 errors; backend imports clean (incl. `app.main` router wiring); runtime smoke tests pass — C4 empty-list ranking returns `[]` (no IndexError), C6 parenthesized matching rejects empty-vs-empty. No new dependencies added.

---

## Phase 2 — 🟠 High: Functional Correctness & Data Flow
*Goal: the booking lifecycle actually works end-to-end.*

- [x] **H1** `mobile/src/screens/ProvidersScreen.tsx:255` — `bookService(...)` omits `deviceToken`; backend gets `device_token:null` → no push. Pass the stored FCM token.
- [x] **H2** `mobile-provider/src/app/_layout.tsx:38–49` — FCM token is fetched then only `console.log`'d, never sent to backend → provider never receives job pushes. Register it via `providerAPI.updateProfile({ fcm_token })`.
- [x] **H3** **Unify job-accept API.** `JobRequestModal.tsx:62` calls `respondToJob(id,'accept')` (`/respond`); `JobsScreen.tsx:54` calls `acceptJob(id)` (`/accept`). Pick one path and use it everywhere; confirm it matches the backend handler.
- [x] **H4** `mobile/src/screens/ChatScreen.tsx` & `NegotiationChatSheet.tsx` — chat writes now route through `POST /{id}/chat`; Firestore remains the realtime read layer. `confirmBooking` also goes through the backend so the booking confirmation message is emitted server-side.
- [x] **H5** `mobile/src/screens/BookingHistoryScreen.tsx:234` — query has `limit(50)` but no `orderBy('created_at','desc')`, so it returns an arbitrary 50, not the newest. Add ordering (keep the existing `failed-precondition` fallback for the composite-index case).
- [x] **H6** `mobile-provider/src/screens/JobsScreen.tsx:120` — `styles['status_'+status]` has no `status_pending` entry (status is in the filter) → undefined badge color. Add the style or normalize the status key.
- [x] **H7** `mobile-provider/src/hooks/useGPSTracking.ts:164` — effect deps `[enabled]` only; `startTracking` closes over `bookingId`/`interval`. Changing booking mid-track keeps streaming the old one. Add deps or restructure.
- [x] **H8** Backend auth gap (`backend/app/api/v1/*`) — booking, tracking, chat, confirm, and all `/provider/*` routes now verify Firebase auth; provider routes additionally enforce token-owned `provider_id`.

---

## Phase 3 — UI/UX Overhaul
*Goal: consistent, modern, low-friction, clear provider/customer distinction.*

### 3A. 🟠 Layout safety & dead ends
- [x] **X1** `mobile/src/screens/ChatScreen.tsx` (hardcoded `paddingTop`) and **all** provider screens lack `SafeAreaView`/`useSafeAreaInsets` → content under notch/Dynamic Island. Standardize on `react-native-safe-area-context`.
- [x] **X2** `mobile-provider/src/screens/JobsScreen.tsx` — root is a `View`, not scrollable; long lists overflow. Convert to `FlatList`/`ScrollView` + add `RefreshControl` (X-refresh).
- [x] **X3** Wire up dead buttons: provider LiveTracking "Call Customer" (`LiveTrackingScreen.tsx:280`), JobHistory "View Details" (`:201`), Profile "Support & Help" (`:473`). Hook to `Linking.openURL('tel:')`, navigation, and a help action respectively (or hide if out of scope).

### 3B. ⚪ Visual consistency / design tokens
- [x] **X4** Provider app: introduce a shared tokens module (colors, spacing, radius, type scale) and replace hardcoded hex/px. Resolve the jarring ChatScreen slate/indigo vs. app-wide grey/cyan palette (`UX-7`). Reuse existing `constants/theme.ts`.
- [x] **X5** Customer app: unify status presentation — reusable StatusBadge/ProgressSteps; fix **static** BookingSuccess pills (`BookingSuccessScreen.tsx:231`) to reflect real status; align step order across BookingSuccess / LiveTracking / History.
- [x] **X6** Customer `AgentLogViewer` mixes NativeWind `className` while the app uses `StyleSheet` elsewhere — confirm it renders, or unify (`U1`).
- [x] **X7** Typography hierarchy passes (tiny 10–11px labels, oversized jumps) in Home/History/LiveTracking (`U10`).

### 3C. ⚪ Flow & feedback
- [x] **X8** Empty/loading/error states: customer ChatScreen empty messages (`U5`), provider Dashboard initial "0/0" before snapshot (`UX-9`), spinner clarity on ProvidersScreen "Book Now" Firestore read (`U7`).
- [x] **X9** Map-in-ScrollView gesture conflict on customer LiveTracking (`U6`) — isolate map gestures / fixed-height container.
- [x] **X10** `JobRequestModal`: add decline confirmation (`UX-3`) and a request timeout/countdown (`UX-13`).
- [x] **X11** Consistent back-navigation after `navigation.reset` chains (customer `ChatScreen.tsx:360`, `U9`).

> **✅ Phase 3 complete (2026-06-28).** Verification: customer `tsc --noEmit` = 0 errors; provider `tsc --noEmit` = 0 errors; all 11 items implemented.

---

## Phase 4 — 🟡 Code Quality & Cleanup
- [x] **Q1** Delete dead code: ~190 dead sheet styles from customer `LiveTrackingScreen.tsx`; orphaned `mobile-provider/src/app/explore.tsx`; dead `AgentLogsResponse` import in `bookings.py`.
- [x] **Q2** Type safety: replace `useNavigation<any>()`/`useRoute<any>()` in 5 customer screens with typed `NativeStackNavigationProp<RootStackParamList>` and `RouteProp`; bonus fixed `navigate('Home')` → `navigate('MainTabs')` for type-correct tab navigation.
- [x] **Q3** Backend hygiene: replaced `detail=str(exc)` with generic safe messages across bookings.py, provider.py, providers.py, analyze.py; replaced `datetime.utcnow()` → `datetime.now(timezone.utc)` across firebase_db.py and provider.py; removed `google-antigravity` from requirements.txt.
- [x] **Q4** Effect-dependency correctness: `BookingHistoryScreen.tsx` — wrapped useEffect dep on `fetchBookings` (useCallback-memoised) for correct reactive behaviour.

> **✅ Phase 4 complete (2026-06-28).** Verification: customer `tsc --noEmit` = 0 errors; provider `tsc --noEmit` = 0 errors; Python `ast.parse` clean on all 3 backend files.

---

## Phase 5 — ⚪ Remaining / Incomplete Features (backlog — confirm scope)
- [ ] **F1** Real-time tracking is REST-poll only; provider broadcast is single-target not multi-provider (`TODO-1/2`).
- [ ] **F2** Job rejection has no re-assignment to next-ranked provider (`TODO-3`).
- [ ] **F3** Concurrent job-accept race (`RACE-3`) — needs Firestore transaction.
- [ ] **F4** Follow-up/survey + loyalty points are payload-only stubs (`TODO-4/5`).
- [ ] **F5** In-app "your booking was accepted" banner when the customer isn't on BookingSuccess (depends on H1/H2 push working) (`U8`).

---

## Suggested Execution Order
1. **Phase 1** (C1–C11) — unblock build, stop crashes & data loss. *Verify: both apps `tsc` clean; backend boots in mock mode; a booking round-trips with correct customer data.*
2. **Phase 2** (H1–H8) — booking lifecycle correctness. *Verify: customer→provider job appears, accept works via one path, chat attributed correctly.*
3. **Phase 3** (X1–X11) — UI/UX overhaul.
4. **Phase 4** (Q1–Q4) — cleanup.
5. **Phase 5** — feature backlog, scoped per your call.

Each item will be done as an isolated micro-step with a verification note before moving on.

---

## Decisions (locked 2026-06-28)
1. **H4 — Chat source of truth:** ✅ **Route through backend.** `POST /{id}/chat` is the write path (fires provider notifications / AI mediation); Firestore remains the realtime read layer. Keep & wire `sendChatMessage`; do NOT delete it.
2. **H8 — Auth:** ✅ **Enforce token-owned `provider_id`.** Verify the Firebase token and that the caller owns the `provider_id` on every `/provider/*` + booking route. Touches both apps' request headers.
3. **F3 — Concurrent accept race:** ✅ **In scope** — add a Firestore transaction so two providers can't both accept the same job.
4. **Other Phase 5 (F1/F2/F4/F5):** backlog only this pass.

## Execution checkpoint
- ✅ Approved: fix **C1 (build blocker) only**, then **pause for review** before C2–C11.
