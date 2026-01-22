# PRD: Virality, Engagement & Rate Limiting

## Overview
Three feature sets to increase virality, improve user engagement, and manage usage sustainably.

---

## Feature 1: Social Sharing ("Meroka Billboards")

### Goal
Turn every user into a potential billboard by making quotes easy to share on social media.

### Phase 1.1: Share Buttons on Featured Quotes ✅ Quick Win
- Add share button to each featured quote on the homepage
- Support: Twitter/X, LinkedIn, Copy Link
- Share text: `"{quote}" - Anonymous Healthcare Worker | Talk to Doc: [link]`

### Phase 1.2: Shareable Quote Cards
- Create `/share/[quoteId]` page with beautiful quote card
- Social meta tags (og:image, twitter:card) for link previews
- Generate quote card image dynamically (use `@vercel/og` or similar)
- Card includes: quote text, "Doc - AI for burnt-out physicians", Meroka branding

### Phase 1.3: Share from Post-Call Form
- After call, if user consents to share quote, show "Share your quote" option
- They can share their own extracted quote immediately
- Pre-populated social share with their anonymized quote

---

## Feature 2: Engaging Landing Page

### Goal
Make the landing page more compelling and conversion-focused for both mobile and web.

### Phase 2.1: Live Quote Feed ✅ Quick Win
- Show rotating/scrolling feed of recent anonymized quotes
- Auto-refresh every 30 seconds
- Creates sense of community and activity
- Mobile: vertical scroll, Web: horizontal carousel or grid

### Phase 2.2: Visual Improvements
- Animated background (subtle pulse/gradient)
- Better typography hierarchy
- Testimonial-style quote cards with avatars (generic healthcare icons)
- "X healthcare workers have vented today" counter
- Mobile-first responsive design audit

### Phase 2.3: Engagement Hooks
- "What others are saying" section expansion
- Call-to-action improvements
- Sound preview button (hear Doc's voice before calling)
- Trust signals: "Anonymous", "No account needed", "Free"

---

## Feature 3: Rate Limiting (7 min / 24 hours)

### Goal
Prevent abuse while ensuring fair access. Limit each user to 7 minutes of call time per 24-hour period.

### Technical Challenges
- Track time across sessions (browser close/reopen)
- Handle multiple tabs/devices from same IP
- Accurate time tracking during calls
- Graceful handling when limit reached

### Phase 3.1: Client-Side Tracking (Basic) ✅ MVP
**Storage:** localStorage + IP-based backend tracking

**Implementation:**
1. Store in localStorage: `{ usedSeconds: number, windowStart: timestamp }`
2. On call start: check remaining time, show warning if <2 min left
3. During call: update used time every second
4. On call end: sync to backend (calls table already has duration_seconds)
5. If limit reached: disable call button, show countdown to reset

**Limitations:** Can be bypassed with incognito/clearing storage

### Phase 3.2: Backend Enforcement (Robust)
**New table: `usage_limits`**
```sql
CREATE TABLE usage_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  fingerprint TEXT, -- browser fingerprint for extra tracking
  used_seconds INTEGER DEFAULT 0,
  window_start TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(ip_address)
);
```

**Implementation:**
1. Before call start: API check `/api/check-limit` returns remaining seconds
2. During call: Vapi webhook updates usage in real-time (or sync on call end)
3. Server-side enforcement: Vapi assistant config can include max duration
4. 24-hour window: Reset `used_seconds` when `window_start` > 24 hours ago

### Phase 3.3: UX Polish
- Show remaining time prominently before call
- Warning at 1 minute remaining during call
- Auto-end call when limit reached (with friendly message from Doc)
- "Your time resets in X hours" message when limited
- Email notification option: "Notify me when my time resets"

### Phase 3.4: Premium Upsell (Future)
- "Want unlimited venting? Join the Meroka collective"
- Bypass limit for verified healthcare workers
- Different limits for different user segments

---

## Implementation Order (Recommended)

### Sprint 1: Quick Wins
1. **Phase 1.1** - Share buttons on quotes (2 hours)
2. **Phase 2.1** - Live quote feed (2 hours)
3. **Phase 3.1** - Basic client-side rate limiting (3 hours)

### Sprint 2: Core Features
4. **Phase 1.2** - Shareable quote cards with OG images (4 hours)
5. **Phase 3.2** - Backend rate limit enforcement (4 hours)
6. **Phase 2.2** - Visual improvements (4 hours)

### Sprint 3: Polish
7. **Phase 1.3** - Share from post-call form (2 hours)
8. **Phase 2.3** - Engagement hooks (3 hours)
9. **Phase 3.3** - Rate limit UX polish (3 hours)

---

## Success Metrics
- **Virality:** # of social shares, referral traffic
- **Engagement:** Time on page, call start rate, return visits
- **Rate Limiting:** Abuse reduction, user complaints, conversion to collective

---

## Ready to Implement?

Start with **Sprint 1: Quick Wins** to get immediate value:
1. Share buttons on featured quotes
2. Live quote feed on homepage
3. Basic rate limiting (localStorage + IP tracking)
