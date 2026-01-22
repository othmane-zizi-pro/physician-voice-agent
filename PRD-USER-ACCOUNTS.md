# PRD: User Accounts & Conversation History

## Overview

Enable healthcare workers to create accounts, maintain a library of their conversations (voice and text), and receive AI responses informed by their history. Update admin panel for user management.

## Current State

- All confessions are anonymous (IP-based tracking only)
- No user identity persistence for end-users
- Admin auth exists (Google OAuth, @meroka.com only)
- Calls stored in `calls` table without user association
- No conversation context passed to AI between sessions

## Goals

1. **Optional accounts** - Users can choose to create an account or remain anonymous
2. **Conversation library** - Logged-in users see their history
3. **AI memory** - Doc remembers context from previous conversations
4. **Admin visibility** - View user profiles, history, location in admin panel

---

## Phase 1: Database Schema & Authentication Infrastructure

### Scope
Set up the foundation: user table, authentication providers, and basic signup/login flow.

### Database Changes

```sql
-- New table: users (end-users, NOT admins)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  auth_provider TEXT NOT NULL, -- 'google' | 'email'
  password_hash TEXT, -- NULL for OAuth users
  email_verified BOOLEAN DEFAULT FALSE,
  verification_token TEXT,
  reset_token TEXT,
  reset_token_expires TIMESTAMP,

  -- Profile info
  role_type TEXT, -- 'physician' | 'nurse' | 'admin_staff' | 'other'
  workplace_type TEXT, -- 'independent' | 'hospital' | 'other'

  -- Location (from IP on signup or profile)
  city TEXT,
  region TEXT,
  country TEXT,

  -- Preferences
  ai_memory_enabled BOOLEAN DEFAULT TRUE, -- opt-in/out of AI context

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP
);

-- Index for quick lookups
CREATE INDEX idx_users_email ON users(email);
```

### TypeScript Types

```typescript
// types/database.ts additions
users: {
  Row: {
    id: string;
    email: string;
    name: string | null;
    avatar_url: string | null;
    auth_provider: 'google' | 'email';
    password_hash: string | null;
    email_verified: boolean;
    role_type: 'physician' | 'nurse' | 'admin_staff' | 'other' | null;
    workplace_type: 'independent' | 'hospital' | 'other' | null;
    city: string | null;
    region: string | null;
    country: string | null;
    ai_memory_enabled: boolean;
    created_at: string;
    updated_at: string;
    last_login_at: string | null;
  };
  // ... Insert, Update types
}
```

### Authentication Flow

**Option A: Google OAuth (Easy SSO)**
- Extend existing NextAuth setup
- Remove @meroka.com domain restriction for end-users
- Create user record on first OAuth login
- Separate session handling: admin vs end-user

**Option B: Email/Password**
- New API routes: `/api/auth/register`, `/api/auth/login`, `/api/auth/verify-email`
- Password hashing with bcrypt
- Email verification flow (optional for MVP)
- Password reset flow

### New Components

```
components/
  auth/
    LoginModal.tsx        # Modal for login (Google + email/password)
    RegisterModal.tsx     # Account creation form
    AuthProvider.tsx      # Context for user session state
```

### New API Routes

```
app/api/
  auth/
    register/route.ts     # POST - create email/password account
    login/route.ts        # POST - email/password login
    verify-email/route.ts # GET - verify email token
    reset-password/route.ts # POST - request/complete reset
    me/route.ts           # GET - current user profile
```

### UI Changes

- Add "Sign in" / "Create account" link in header (subtle, non-intrusive)
- Login modal with Google button + email/password form
- Registration modal with minimal fields (email, password, optional name)

### Deliverables
- [ ] Create `users` table migration
- [ ] Update TypeScript types
- [ ] Extend NextAuth for end-user Google OAuth
- [ ] Implement email/password auth routes
- [ ] Create LoginModal and RegisterModal components
- [ ] Add AuthProvider context
- [ ] Add sign-in UI to VoiceAgent (non-intrusive)

### Success Criteria
- User can sign up with Google or email/password
- User can log in and see their name/avatar
- Session persists across page refreshes
- Anonymous usage still works (no account required)

---

## Phase 2: Link Conversations to Users

### Scope
Associate calls/confessions with user accounts (when logged in).

### Database Changes

```sql
-- Add user_id to calls table
ALTER TABLE calls ADD COLUMN user_id UUID REFERENCES users(id);
CREATE INDEX idx_calls_user_id ON calls(user_id);

-- Existing anonymous calls remain with user_id = NULL
```

### API Changes

**Update `/api/submit-confession/route.ts`:**
- Check for authenticated user session
- If logged in, set `user_id` on the call record
- Anonymous submissions continue to work (user_id = NULL)

**Update Vapi webhook handling:**
- Pass user context to Vapi call initiation
- Store user_id when call record is created

### VoiceAgent Changes

- Pass user session to `startCall()` if logged in
- Include user_id in call metadata for Vapi
- Update `saveCallToDatabase()` to include user_id

### Deliverables
- [ ] Add `user_id` column to calls table
- [ ] Update calls TypeScript types
- [ ] Modify submit-confession to link user
- [ ] Modify voice call flow to link user
- [ ] Ensure anonymous usage still works

### Success Criteria
- Logged-in user's confessions have user_id set
- Anonymous confessions have user_id = NULL
- No breaking changes to existing flow

---

## Phase 3: User Dashboard - Conversation Library

### Scope
Create a user-facing dashboard where users can view their conversation history.

### New Pages

```
app/
  dashboard/
    page.tsx              # Main dashboard - conversation list
    layout.tsx            # Auth-protected layout
    settings/
      page.tsx            # User preferences (AI memory, profile)
```

### Dashboard Features

**Conversation List:**
- Chronological list of user's calls/confessions
- Filter by type (voice/text)
- Search transcripts
- Date range filter

**Conversation Detail:**
- Full transcript view
- Audio playback for voice calls (if recording_url exists)
- Extracted quote highlight
- Frustration score visualization
- Date, duration, location

**User Settings:**
- Toggle AI memory on/off
- Update profile info (name, role, workplace)
- Delete account option
- Export data (GDPR compliance)

### Components

```
components/
  dashboard/
    ConversationList.tsx
    ConversationCard.tsx
    ConversationDetail.tsx
    AudioPlayer.tsx
    UserSettings.tsx
```

### API Routes

```
app/api/
  user/
    conversations/route.ts  # GET - list user's conversations
    conversations/[id]/route.ts # GET - single conversation detail
    settings/route.ts       # GET/PATCH - user preferences
    export/route.ts         # GET - export all user data
    delete/route.ts         # DELETE - delete account
```

### Deliverables
- [ ] Create dashboard page with auth protection
- [ ] Implement conversation list with filters
- [ ] Create conversation detail view with audio playback
- [ ] Build user settings page
- [ ] Implement data export endpoint
- [ ] Add account deletion flow

### Success Criteria
- User can see all their past conversations
- User can play back voice recordings
- User can search/filter their history
- User can toggle AI memory preference
- User can export/delete their data

---

## Phase 4: AI Context from Previous Conversations

### Scope
Enable Doc to remember context from previous conversations for logged-in users.

### Approach

**Context Summarization:**
- After each conversation, generate a summary using Gemini
- Store summary in new `conversation_summaries` table
- Keep last N summaries for context window management

### Database Changes

```sql
CREATE TABLE conversation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  call_id UUID REFERENCES calls(id) NOT NULL,
  summary TEXT NOT NULL,           -- AI-generated summary
  key_topics TEXT[],               -- Extracted topics/themes
  emotional_state TEXT,            -- 'frustrated' | 'venting' | 'seeking_advice'
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_summaries_user_id ON conversation_summaries(user_id);
```

### New API Route

```
app/api/
  ai-context/route.ts  # GET - retrieve user's conversation context for AI
```

### Context Retrieval Logic

```typescript
async function getUserContext(userId: string): Promise<string> {
  // Get last 5 conversation summaries
  const summaries = await supabase
    .from('conversation_summaries')
    .select('summary, key_topics, emotional_state, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  // Format for AI prompt
  return formatContextForPrompt(summaries);
}
```

### Vapi/AI Integration

**Update PHYSICIAN_THERAPIST_PERSONA in `lib/persona.ts`:**
- Add dynamic context injection point
- Include user's previous topics and emotional patterns

**Context Prompt Addition:**
```
You're continuing a conversation with a returning user. Here's what you know about them from previous sessions:
- They've discussed: [key_topics]
- Previous emotional states: [emotional_states]
- Recent summary: [latest_summary]

Use this context naturally - reference past conversations when relevant, but don't force it.
```

### Privacy Controls

- Respect `ai_memory_enabled` user preference
- Clear context on user request
- Don't include context for anonymous users

### Post-Conversation Processing

After each call ends:
1. Generate summary via Gemini
2. Extract key topics
3. Determine emotional state
4. Store in conversation_summaries
5. (Background job, non-blocking)

### Deliverables
- [ ] Create conversation_summaries table
- [ ] Implement summary generation after calls
- [ ] Build context retrieval API
- [ ] Integrate context into Vapi call initiation
- [ ] Update persona with context injection
- [ ] Respect user privacy preferences
- [ ] Add "clear my history" option in settings

### Success Criteria
- Doc references previous conversations naturally
- User can opt out of AI memory
- Context improves conversation quality
- No context leakage between users

---

## Phase 5: Admin Panel Updates

### Scope
Extend admin panel to view and manage user accounts.

### New Admin Tabs

**Users Tab:**
- List all registered users
- Search by email/name
- Filter by role_type, workplace_type
- Sort by created_at, last_login_at, conversation count

**User Profile View:**
- User details (email, name, role, workplace)
- Location (city, region, country)
- Account status (verified, AI memory enabled)
- Conversation count and last activity

**User Conversation History:**
- All conversations for a specific user
- Same features as user dashboard but admin view
- Ability to view any user's history

### Admin Features

- **User Stats:** Total users, new users today/week, active users
- **User Map:** Geographic distribution of registered users
- **Conversation Stats per User:** Average frustration score, frequency
- **Export User List:** CSV download of user data

### API Routes

```
app/api/admin/
  users/route.ts           # GET - list all users (paginated)
  users/[id]/route.ts      # GET - single user profile
  users/[id]/conversations/route.ts # GET - user's conversations
  users/stats/route.ts     # GET - user statistics
```

### UI Components

```
components/admin/
  UsersTab.tsx
  UserProfileModal.tsx
  UserConversationHistory.tsx
  UserStatsCard.tsx
```

### Deliverables
- [ ] Add Users tab to admin panel
- [ ] Create user list with search/filter
- [ ] Build user profile modal
- [ ] Show user conversation history in admin
- [ ] Add user statistics dashboard
- [ ] Add user location to existing Map tab

### Success Criteria
- Admin can see all registered users
- Admin can view any user's profile and history
- Admin can search/filter users
- User stats visible on admin dashboard

---

## Phase 6: Polish & Security Hardening

### Scope
Security audit, performance optimization, and UX polish.

### Security

- [ ] Implement Row Level Security (RLS) in Supabase
- [ ] Add rate limiting to auth endpoints
- [ ] Audit all API routes for proper auth checks
- [ ] Add CSRF protection
- [ ] Implement account lockout after failed attempts
- [ ] Add admin audit logging

### Performance

- [ ] Add pagination to conversation lists
- [ ] Implement infinite scroll in dashboard
- [ ] Optimize database queries with proper indexes
- [ ] Add caching for user context retrieval

### UX Polish

- [ ] Add loading states throughout
- [ ] Implement optimistic updates
- [ ] Add toast notifications for actions
- [ ] Mobile-responsive dashboard
- [ ] Keyboard navigation support

### Compliance

- [ ] Privacy policy update for accounts
- [ ] Terms of service for accounts
- [ ] GDPR data export compliance
- [ ] Account deletion compliance (right to be forgotten)

---

## Implementation Order

| Phase | Dependencies | Estimated Complexity |
|-------|-------------|---------------------|
| Phase 1 | None | High (auth foundation) |
| Phase 2 | Phase 1 | Low (schema + API changes) |
| Phase 3 | Phase 1, 2 | Medium (new UI) |
| Phase 4 | Phase 1, 2, 3 | High (AI integration) |
| Phase 5 | Phase 1, 2 | Medium (admin UI) |
| Phase 6 | All phases | Medium (hardening) |

---

## Decisions

1. **Email verification required?** - Yes, but only for email/password signups. Google OAuth users are auto-verified.
2. **Password requirements?** - Minimum 8 characters
3. **Session duration?** - 365 days
4. **Context window size?** - Doc remembers last 3 conversations for AI context. UI sidebar shows up to 100 conversations.
5. **Data retention?** - Keep all conversation summaries indefinitely (user can delete)
6. **Account types?** - No tiers for now, all features free

---

## Out of Scope (Future)

- Social features (sharing anonymized stories)
- Therapist referral integration
- Team/organization accounts
- API access for third parties
- Mobile app

---

## Approval

Ready to proceed with Phase 1?

- [ ] Product Owner Approval
- [ ] Technical Review Complete
- [ ] Security Review Complete
