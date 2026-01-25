# PRD: User Authentication & Conversation History Panel

## Overview

Add public user authentication (Google OAuth) and a ChatGPT-style left sidebar showing conversation history. This allows users to sign up, log in, and access their past voice calls and text confessions.

## Current State

- **Admin Auth**: NextAuth with Google OAuth, restricted to `@meroka.com` emails
- **User Auth**: Custom JWT system exists but is underutilized
- **Calls Table**: Has `user_id` field (nullable) to link conversations to users
- **Dashboard**: Currently admin-only at `/dashboard`

## Goals

1. Allow any user to sign up/login with Google (all domains)
2. Show a collapsible left sidebar with conversation history (like ChatGPT)
3. Link new conversations to authenticated users automatically
4. Keep admin panel (`/admin`) restricted to `@meroka.com`

---

## Phase 1: Public Google OAuth Authentication

**Objective**: Enable any user to sign up/login with Google OAuth

### Tasks

1. **Create separate NextAuth config for public users**
   - New route: `/api/auth/user/[...nextauth]/route.ts`
   - No domain restriction (allow all Google accounts)
   - Store users in `users` table with `auth_provider: 'google'`

2. **Add Login/Signup buttons to main page**
   - Location: Top-right corner of VoiceAgent component
   - Show user avatar + name when logged in
   - Dropdown menu: "My History", "Sign Out"

3. **Create user record on first login**
   - Use NextAuth `signIn` callback to upsert user in `users` table
   - Populate: `email`, `name`, `avatar_url`, `auth_provider`

4. **Update session handling**
   - Modify `getSession()` in `lib/auth.ts` to check public NextAuth session
   - Return user UUID for linking calls

### Files to Create/Modify

| File | Action |
|------|--------|
| `app/api/auth/user/[...nextauth]/route.ts` | Create - Public NextAuth config |
| `components/VoiceAgent.tsx` | Modify - Add auth buttons |
| `lib/auth.ts` | Modify - Handle public user sessions |
| `components/auth/UserAuthButton.tsx` | Create - Login/signup button component |

### Acceptance Criteria

- [ ] Users can sign in with any Google account
- [ ] User record created in `users` table on first login
- [ ] Login button visible on main page
- [ ] User menu shows when logged in

---

## Phase 2: Link Conversations to Users

**Objective**: Automatically associate calls/confessions with logged-in users

### Tasks

1. **Update call creation to include user_id**
   - Modify `/api/livekit/token` to pass user ID to agent
   - Modify call save logic in `VoiceAgent.tsx` to include `user_id`
   - Modify `/api/submit-confession` to include `user_id`

2. **Create migration for user_id index**
   - Add index on `calls.user_id` for faster queries

3. **Update API endpoints**
   - Ensure `/api/user/conversations` works for public users
   - Filter by authenticated user's ID

### Files to Create/Modify

| File | Action |
|------|--------|
| `components/VoiceAgent.tsx` | Modify - Pass user_id when saving calls |
| `app/api/submit-confession/route.ts` | Modify - Include user_id |
| `app/api/user/conversations/route.ts` | Modify - Support public user auth |
| `supabase/migrations/014_add_user_id_index.sql` | Create - Index for user_id |

### Acceptance Criteria

- [ ] New calls linked to logged-in user's ID
- [ ] Text confessions linked to logged-in user's ID
- [ ] Anonymous calls still work (user_id = null)
- [ ] Users can only see their own conversations via API

---

## Phase 3: Conversation History Sidebar

**Objective**: Add ChatGPT-style left panel showing past conversations

### Tasks

1. **Create sidebar component**
   - Collapsible panel (hidden on mobile by default)
   - List of conversations grouped by date (Today, Yesterday, Previous 7 Days, etc.)
   - Each item shows: preview text, timestamp, session type icon
   - Click to view full transcript

2. **Add sidebar toggle**
   - Hamburger menu icon in top-left
   - Sidebar slides in from left
   - Overlay on mobile, persistent on desktop

3. **Create conversation detail view**
   - Full transcript display
   - Option to continue conversation (start new call with context)
   - Delete conversation button

4. **Update main layout**
   - Flex layout with sidebar + main content
   - Responsive: sidebar hidden on mobile, toggle to show

### Components to Create

| Component | Purpose |
|-----------|---------|
| `components/ConversationSidebar.tsx` | Main sidebar container |
| `components/ConversationList.tsx` | List of conversations |
| `components/ConversationItem.tsx` | Single conversation preview |
| `components/ConversationView.tsx` | Full transcript view |

### UI Specifications

```
┌─────────────────────────────────────────────────────┐
│ ☰  Doc                              [Avatar] John ▼ │
├──────────┬──────────────────────────────────────────┤
│ Today    │                                          │
│ ├─ Call  │                                          │
│ ├─ Text  │          [Main VoiceAgent UI]            │
│          │                                          │
│ Yesterday│                                          │
│ ├─ Call  │                                          │
│          │                                          │
│ Nov 2025 │                                          │
│ ├─ Call  │                                          │
│ ├─ Text  │                                          │
└──────────┴──────────────────────────────────────────┘
```

### Acceptance Criteria

- [ ] Sidebar shows conversation history when logged in
- [ ] Conversations grouped by date
- [ ] Click conversation to view full transcript
- [ ] Sidebar collapsible on all screen sizes
- [ ] Empty state when no conversations

---

## Phase 4: Polish & Enhancements

**Objective**: Refine UX and add quality-of-life features

### Tasks

1. **Search conversations**
   - Search by keyword in transcript
   - Filter by date range

2. **Conversation actions**
   - Delete conversation
   - Export transcript as text/PDF

3. **Onboarding flow**
   - Prompt to sign up after first conversation
   - Benefits: "Save your conversations", "Continue where you left off"

4. **Loading states & animations**
   - Skeleton loaders for conversation list
   - Smooth sidebar transitions

### Acceptance Criteria

- [ ] Users can search their conversations
- [ ] Users can delete conversations
- [ ] New users prompted to sign up after first call
- [ ] Smooth animations throughout

---

## Technical Considerations

### Authentication Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   User      │────▶│ Google OAuth │────▶│  NextAuth   │
│ clicks      │     │   Consent    │     │  Callback   │
│ "Sign In"   │     └──────────────┘     └──────┬──────┘
└─────────────┘                                 │
                                                ▼
                                    ┌───────────────────┐
                                    │ Upsert user in    │
                                    │ users table       │
                                    └─────────┬─────────┘
                                              │
                                              ▼
                                    ┌───────────────────┐
                                    │ Return session    │
                                    │ with user UUID    │
                                    └───────────────────┘
```

### Session Handling

- Public users: NextAuth session at `/api/auth/user/[...nextauth]`
- Admin users: NextAuth session at `/api/auth/[...nextauth]` (existing)
- Both return compatible session format with `userId`

### Database

No new tables needed. Use existing:
- `users` - Store user accounts
- `calls` - Link via `user_id` foreign key

### Security

- Public auth endpoint has no domain restriction
- Admin auth endpoint keeps `@meroka.com` restriction
- Users can only access their own conversations
- Rate limiting on auth endpoints

---

## Timeline Estimate

| Phase | Scope |
|-------|-------|
| Phase 1 | Auth buttons, Google OAuth setup |
| Phase 2 | Link conversations to users |
| Phase 3 | Sidebar UI implementation |
| Phase 4 | Polish and enhancements |

---

## Success Metrics

- User signup rate after using the app
- % of conversations linked to authenticated users
- Return user rate (users who come back and use history)
- Conversation view rate (% who view past transcripts)
