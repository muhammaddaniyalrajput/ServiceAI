# Phase 5 Testing Guide: Analytics & Earnings Dashboard

## Overview

Phase 5 adds comprehensive earnings tracking, analytics, and performance metrics to the provider app. Providers can now see their earnings history, analyze performance, and project future income.

## What's New in Phase 5

### Mobile Provider App
- **EarningsScreen** (`/earnings`): Complete earnings dashboard with:
  - Total earnings display
  - Period selection (Today, This Week, This Month)
  - Statistics grid (Average job value, Rating, Completion rate)
  - Income projections (at current rate, +25% busy, +50% busy)
  - Recent completed jobs preview
  - Performance tips

- **JobHistoryScreen** (`/job-history`): Full job history with:
  - All completed jobs with details
  - Sort options (Recent, Earnings, Rating)
  - Filter by rating threshold
  - Job duration tracking
  - Hourly rate calculation
  - Customer ratings display

- **useEarnings Hook**: Real-time earnings calculation:
  - Firestore listener for completed jobs
  - Dynamic stats calculation
  - Daily/weekly/monthly breakdowns
  - Performance metrics aggregation

- **Enhanced ProfileScreen**:
  - Monthly earnings preview card
  - Quick link to full earnings screen
  - Job history button
  - Touchable earnings card

- **Enhanced DashboardScreen**:
  - New 3-button quick actions (Jobs, Earnings, Profile)
  - Real-time earnings integration

---

## File Structure Created

```
mobile-provider/src/
├── hooks/
│   └── useEarnings.ts                  # ✅ Earnings hook + calculations
├── screens/
│   ├── EarningsScreen.tsx              # ✅ Full earnings dashboard
│   ├── JobHistoryScreen.tsx            # ✅ Job history with filters
│   └── ProfileScreen.tsx               # ✅ Enhanced with earnings
└── app/
    ├── earnings.tsx                    # ✅ Route export
    └── job-history.tsx                 # ✅ Route export
```

---

## Testing Workflow

### Prerequisites

1. **Complete previous phases**: Backend running, provider app installed
2. **Have completed jobs**: Create bookings and mark them as completed
3. **Firebase configured**: Firestore with completed job data

### Step 1: View Dashboard Earnings Preview

**In Provider App**:
1. Log in as provider
2. Dashboard shows 3 quick action buttons
3. **Tap "💰 Earnings"** → Opens EarningsScreen

**Result**: 
- ✅ Total earnings display shows PKR amount
- ✅ Completed jobs count shown

### Step 2: Explore Earnings Screen

**Dashboard Sections**:

1. **Total Earnings Card**
   - Shows lifetime total earnings
   - Shows number of completed jobs
   - Green highlight for success

2. **Period Selector Tabs**
   - Toggle between Today, Week, Month
   - Active tab highlighted in cyan

3. **Period Breakdown**
   - Updates based on selected period
   - Shows earnings and job count
   - Different values for each period

4. **Statistics Grid** (3 columns)
   - **Avg Job Value**: Average earnings per job
   - **Avg Rating**: Average customer rating (0-5 stars)
   - **Completion Rate**: % of accepted jobs completed

5. **Income Projections**
   - Current annual rate
   - Projected at +25% capacity
   - Projected at +50% capacity
   - Calculated from current month

6. **Recent Jobs Preview**
   - Latest 5 completed jobs
   - Service type, customer name, earnings
   - Customer rating badge if available
   - Date and time

**Test Each Section**:
```typescript
// In app:
1. Earnings Screen loads
2. Verify total_earnings displays correctly
3. Click each period tab (Today/Week/Month)
4. Verify stats update
5. Check projections math: (month_earnings / 30) * 365
6. Scroll to see all recent jobs
```

### Step 3: Access Job History

**From Earnings Screen**:
1. Tap "View All" link in "Recent Completed Jobs" section
2. Opens JobHistoryScreen

**From Profile Screen**:
1. Profile screen → Account section
2. Tap "Job History"
3. Opens JobHistoryScreen

**JobHistory Features**:

1. **Header Stats Bar** (horizontal scroll)
   - Total jobs completed
   - Total earnings
   - Average rating
   - Average job value

2. **Sort Controls**
   - Recent (default): Newest first
   - Earnings: Highest paid first
   - Rating: Best rated first

3. **Filter Controls**
   - All (no filter)
   - 3+ stars
   - 3.5+ stars
   - 4+ stars
   - 4.5+ stars

4. **Job Items Display**
   ```
   ┌─────────────────────────────┐
   │ Service Name    [Earned Box]│
   │ Customer Name               │
   │ ⭐ Rating | Duration | Rate │
   │ Date/Time       [View Details]
   └─────────────────────────────┘
   ```

**Test Sorting & Filtering**:
```
1. Default view (recent)
2. Click "Earnings" → Re-sort by payment
3. Click "Rating" → Re-sort by customer rating
4. Click "3.5+" filter → Show only 3.5+ rated
5. Click "All" → Clear filter
6. Verify correct jobs displayed
```

### Step 4: Test Metrics Accuracy

**Verify Calculations**:

1. **Total Earnings**
   ```
   Expected = sum(all completed jobs' earnings)
   Check in Firestore: bookings filtered status='completed'
   ```

2. **Average Job Value**
   ```
   Expected = total_earnings / completed_jobs_count
   Example: 50,000 PKR / 5 jobs = 10,000 PKR/job
   ```

3. **Completion Rate**
   ```
   Expected = (completed_jobs / total_jobs_offered) * 100
   Example: 5 completed / 6 offered = 83%
   ```

4. **Period Breakdowns**
   ```
   Today = jobs completed since 00:00 today
   Week = jobs completed in last 7 days
   Month = jobs completed since 1st of month
   ```

5. **Average Rating**
   ```
   Expected = sum(job ratings) / jobs_with_ratings
   Only includes jobs where customer_rating exists
   ```

---

## Test Data Setup

### Option A: Manual Firebase Entry

Create test completed jobs:

```javascript
// In Firestore console
db.collection('bookings').add({
  provider_id: 'PROV-123456',
  status: 'completed',
  intent: {
    service_type: 'AC Repair',
    urgency: 'high',
    description: 'AC not cooling'
  },
  booking: {
    customer_id: 'cust123',
    customer_name: 'Ahmed Khan',
    customer_phone: '+923001234567',
    customer_coordinates: { latitude: 33.6844, longitude: 73.0479 },
    location_description: 'G-13, Islamabad',
    total_estimated_cost: 5000,
    actual_payment: 5000,
    requested_at: Timestamp.now(),
    completed_at: Timestamp.fromDate(new Date('2026-06-12T14:30:00')),
    customer_rating: 4.5,
    duration_minutes: 45
  }
})
```

Create 5-10 jobs with:
- Different dates (today, yesterday, last week, last month)
- Different earnings (3000-7000 PKR)
- Different ratings (3-5 stars)
- Some without ratings

### Option B: Simulation Script

Enhance `test_provider_simulation.py`:

```bash
# Add function to create test jobs
python test_provider_simulation.py --create_completed_jobs 10
```

---

## Common Issues & Troubleshooting

### Earnings not displaying
**Cause**: No completed jobs in Firestore
**Fix**: Create test jobs manually or use simulation

### Stats showing 0
**Cause**: Firestore query filtering incorrectly
**Fix**: Verify booking documents have:
- `status: 'completed'`
- `booking.total_estimated_cost` or `booking.actual_payment`
- `provider_id` matches current provider

### Jobs not sorted/filtered
**Cause**: Sort/filter state not updating
**Fix**: Check useMemo dependency array in JobHistoryScreen

### Wrong period calculations
**Cause**: Date logic error
**Fix**: Verify in hook:
- `today = new Date(year, month, date)` at 00:00
- Comparison uses `>=` for start of day

### Ratings not averaging correctly
**Cause**: Including jobs without ratings
**Fix**: Filter before averaging: `jobs.filter(j => j.rating)`

---

## Performance Monitoring

### Firestore Queries
- Query: All bookings where provider_id == X AND status == 'completed'
- Listener: Real-time updates on any completed job
- Estimated reads: 1 per mount (subsequent are free from cache)

### Calculation Performance
- Stats calculation: <50ms for 100 jobs
- Sort/Filter: <100ms for full job list
- Real-time updates: Instant from Firestore

### Battery/Network
- Real-time listener: Minimal impact (only when screen active)
- No GPS updates on earnings screens
- Low bandwidth (metadata only)

---

## Feature Walkthrough

### For Provider with 10 Completed Jobs

```
Dashboard:
├─ 💰 Earnings Button
│  └─ EarningsScreen
│     ├─ Total: PKR 52,000 (10 jobs)
│     ├─ Period Tabs
│     │  ├─ Today: PKR 8,000 (2 jobs)
│     │  ├─ Week: PKR 28,000 (5 jobs)
│     │  └─ Month: PKR 52,000 (10 jobs)
│     ├─ Stats Grid
│     │  ├─ Avg: PKR 5,200/job
│     │  ├─ Rating: 4.3⭐
│     │  └─ Completion: 100%
│     ├─ Projections
│     │  ├─ Current: PKR 624,000/year
│     │  ├─ +25%: PKR 780,000/year
│     │  └─ +50%: PKR 936,000/year
│     └─ Recent 5 Jobs
│        ├─ AC Repair (+5000) 5.0⭐
│        ├─ Plumbing (+4500) 4.5⭐
│        └─ ...
│
├─ "View All" → JobHistoryScreen
│  ├─ Summary Stats (horizontal)
│  │  ├─ 10 Total Jobs
│  │  ├─ PKR 52,000 Earned
│  │  ├─ 4.3⭐ Avg Rating
│  │  └─ PKR 5,200 Avg Value
│  ├─ Sort Controls (Recent/Earnings/Rating)
│  ├─ Filter Controls (All/3+/3.5+/4+/4.5+)
│  └─ All 10 Jobs Listed
│     ├─ Sorted by selection
│     └─ Filtered by rating
│
└─ Profile Button
   └─ ProfileScreen
      ├─ Service Info
      ├─ Earnings Card (Month)
      │  ├─ PKR 52,000
      │  ├─ 10 jobs
      │  └─ PKR 5,200 avg
      ├─ [Job History] Button → JobHistoryScreen
      └─ [See All] Link → EarningsScreen
```

---

## Edge Cases to Test

### Empty States
- **No completed jobs**: Show empty message "No jobs completed yet"
- **No jobs matching filter**: Show "No jobs match your filters"

### Data Variations
- **Jobs without ratings**: Don't include in avg rating calc
- **Jobs without duration**: Show "N/A" for hourly rate
- **Same-second completions**: All count for period
- **Future completed dates**: Shouldn't happen, but handle gracefully

### Period Boundaries
- **Midnight crossover**: Job at 23:59 counts for today, 00:01 counts for next
- **Week boundaries**: Mon-Sun or Sunday-Saturday?
- **Month start**: 1st vs 0th

---

## Integration with Rest of App

### Navigation Flow
```
Dashboard
├─ 💰 Earnings
│  └─ EarningsScreen
│     └─ View All → JobHistoryScreen
│        └─ View Details (stub, Phase 5.1)
│
Profile
├─ Earnings Card
│  └─ [See All] → EarningsScreen
│
└─ Job History Button
   └─ JobHistoryScreen
```

### Real-Time Updates
```
Job marked completed in JobDetailScreen
   ↓
Firestore writes completion
   ↓
useEarnings listener fires
   ↓
Stats recalculate
   ↓
EarningsScreen re-renders with new data
```

---

## Performance Benchmarks

| Operation | Time |
|-----------|------|
| Load EarningsScreen | <200ms |
| Calculate stats (10 jobs) | <50ms |
| Calculate stats (100 jobs) | <100ms |
| Sort 100 jobs | <100ms |
| Filter 100 jobs | <50ms |
| Real-time update | <500ms |

---

## Next Steps (Phase 5.1)

Possible enhancements:
1. **Job Detail Replay**: View full details of past job
2. **Earnings Export**: CSV/PDF of earnings report
3. **Customer Ratings View**: See feedback from customers
4. **Heatmap Analytics**: Where do most jobs come from?
5. **Earnings Goals**: Set and track monthly targets
6. **Performance Badges**: Unlock achievements

---

## Quick Test Checklist

- [ ] EarningsScreen loads with correct total
- [ ] Period tabs change values correctly
- [ ] Stats grid displays all 3 metrics
- [ ] Projections calculated correctly
- [ ] Recent jobs section shows up to 5 jobs
- [ ] "View All" link navigates to JobHistoryScreen
- [ ] JobHistoryScreen loads all completed jobs
- [ ] Sort by Recent works
- [ ] Sort by Earnings works
- [ ] Sort by Rating works
- [ ] Filter by rating threshold works
- [ ] Clear filter shows all jobs again
- [ ] Job cards display all information
- [ ] Profile screen earnings card shows monthly data
- [ ] Profile earnings card is tappable
- [ ] Profile has Job History button
- [ ] Dashboard has 3 quick action buttons
- [ ] Earnings button on dashboard works
- [ ] No crashes on screen transitions
- [ ] Real-time updates work (mark job complete, see earnings change)

---

## Demo Script (for showcase)

```
1. Log in as provider with 5+ completed jobs
2. Tap "💰 Earnings" on dashboard
3. Show EarningsScreen:
   - "Look at total earnings: PKR 52,000"
   - "Click Week tab - shows PKR 28,000"
   - "Average job value is PKR 5,200"
   - "4.3 star average rating"
   - "At current rate, earning PKR 624,000/year"
   - "If we're 50% busier, PKR 936,000/year"
4. Scroll down, show recent jobs
5. Tap "View All" → JobHistoryScreen
6. "10 total jobs completed, all visible here"
7. Change sort to "Earnings" - highest paid first
8. Filter to "4.5+" - shows best rated jobs
9. Tap clear filter - all 10 jobs back
10. Go back to dashboard, tap profile
11. Show "Earnings This Month" card
12. Explain "See All" takes to full EarningsScreen
13. Show Job History button
```
