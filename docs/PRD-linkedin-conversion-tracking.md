# PRD: LinkedIn Conversion API Integration

## Overview
Track "Start a Call" button clicks as LinkedIn conversions to measure campaign effectiveness. Display conversion analytics in the admin panel.

## User Identifier
**li_fat_id cookie** - LinkedIn click ID captured from ad clicks (requires reading the `li_fat_id` cookie set by LinkedIn when users arrive from ads).

---

## Phase 1: Core Infrastructure

### 1.1 Database Schema
Create `linkedin_conversions` table to track all events sent to LinkedIn:

```sql
CREATE TABLE linkedin_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Event data
  event_type TEXT NOT NULL DEFAULT 'call_started',
  li_fat_id TEXT,                    -- LinkedIn click ID from cookie
  ip_address TEXT,
  user_agent TEXT,

  -- Response tracking
  linkedin_response_status INTEGER,   -- HTTP status code
  linkedin_response_body JSONB,       -- Full response for debugging
  success BOOLEAN NOT NULL DEFAULT FALSE,

  -- Link to internal data
  call_id UUID REFERENCES calls(id),

  -- Metadata
  page_url TEXT,
  referrer TEXT
);

CREATE INDEX idx_linkedin_conversions_created_at ON linkedin_conversions(created_at);
CREATE INDEX idx_linkedin_conversions_success ON linkedin_conversions(success);
```

### 1.2 API Route: `/api/linkedin/conversion`
Server-side endpoint to send conversion events to LinkedIn.

**Request:**
```typescript
{
  eventType: 'call_started';
  liFatId?: string;      // from cookie
  callId?: string;       // internal reference
  pageUrl: string;
  referrer?: string;
}
```

**LinkedIn API Call:**
```typescript
POST https://api.linkedin.com/rest/conversionEvents
Authorization: Bearer ${LINKEDIN_ACCESS_TOKEN}
LinkedIn-Version: 202401

{
  "conversion": "urn:lla:llaPartnerConversion:{CONVERSION_RULE_ID}",
  "conversionHappenedAt": timestamp,
  "user": {
    "userIds": [
      { "idType": "LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID", "idValue": "{li_fat_id}" }
    ]
  }
}
```

### 1.3 Frontend: li_fat_id Cookie Capture
Utility function to read the `li_fat_id` cookie when users arrive from LinkedIn ads.

```typescript
// lib/linkedin.ts
export function getLiFatId(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/li_fat_id=([^;]+)/);
  return match ? match[1] : null;
}
```

---

## Phase 2: Event Tracking Implementation

### 2.1 Track "Start a Call" Click
Modify `VoiceAgent.tsx` to fire conversion event when user clicks the call button.

**Location:** `startCall()` function (~line 421)

**Trigger point:** After rate limit check passes, before LiveKit connection.

```typescript
// Track LinkedIn conversion (non-blocking)
const liFatId = getLiFatId();
fetch('/api/linkedin/conversion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    eventType: 'call_started',
    liFatId,
    callId: null, // Set after call record created
    pageUrl: window.location.href,
    referrer: document.referrer
  })
}).catch(() => {}); // Fire and forget
```

---

## Phase 3: Admin Panel Analytics

### 3.1 New "LinkedIn" Tab in Admin Dashboard
Add a dedicated tab in `/app/admin/page.tsx` to display LinkedIn conversion metrics.

**Metrics to display:**
- **Total conversions sent** (all time)
- **Successful conversions** (LinkedIn returned 2xx)
- **Failed conversions** (for debugging)
- **Conversions today / this week / this month**
- **Success rate** (percentage)
- **Conversions with li_fat_id** vs **without** (indicates LinkedIn ad attribution)

### 3.2 Stats Cards
```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Total Sent     │  │  Success Rate   │  │  With li_fat_id │
│     142         │  │     94.3%       │  │     67 (47%)    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### 3.3 Recent Conversions Table
Display last 50 conversion events with:
- Timestamp
- Event type
- li_fat_id (truncated)
- Success status
- LinkedIn response code
- Linked call ID (clickable)

### 3.4 Hourly Chart
Similar to existing page visits chart - show conversions over last 24 hours.

---

## Phase 4: Error Handling & Monitoring

### 4.1 Retry Logic
If LinkedIn API returns 5xx or network error:
- Store event with `success: false`
- Optionally: background job to retry failed events

### 4.2 Token Expiration Handling
LinkedIn tokens expire. Add monitoring:
- Log warning when API returns 401
- Display banner in admin panel when token needs refresh

### 4.3 Rate Limiting
LinkedIn has rate limits. Implement:
- Basic client-side deduplication (don't fire twice for same session)
- Server-side rate limit tracking

---

## Implementation Checklist

### Phase 1 (Core Infrastructure)
- [ ] Create `linkedin_conversions` migration
- [ ] Create `/api/linkedin/conversion` route
- [ ] Create `lib/linkedin.ts` utility
- [ ] Add TypeScript types to `types/database.ts`

### Phase 2 (Event Tracking)
- [ ] Modify `VoiceAgent.tsx` to track call starts
- [ ] Test with actual li_fat_id cookie

### Phase 3 (Admin Panel)
- [ ] Add "LinkedIn" tab to admin dashboard
- [ ] Create stats fetching API route
- [ ] Build stats cards component
- [ ] Build recent conversions table
- [ ] Build hourly chart

### Phase 4 (Production Readiness)
- [ ] Add retry logic for failed events
- [ ] Add token expiration monitoring
- [ ] Test end-to-end with LinkedIn Campaign Manager

---

## Environment Variables Required
```
LINKEDIN_ACCESS_TOKEN=<your_token>
LINKEDIN_CONVERSION_RULE_ID=<your_rule_id>
```

---

## Dependencies
- None new - uses existing `fetch` for API calls
- Existing Supabase client for database

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Token expires | Monitor 401 responses, alert in admin |
| No li_fat_id (organic traffic) | Still track event, mark as unattributed |
| LinkedIn API down | Store locally, surface in admin panel |
| Rate limits | Dedupe events, batch if needed |

---

## Success Metrics
1. **Attribution visibility** - Know which calls came from LinkedIn ads
2. **Campaign optimization** - LinkedIn can optimize ad delivery based on conversions
3. **ROI tracking** - Connect ad spend to actual call engagement
