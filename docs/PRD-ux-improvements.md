# Doc UX Improvements PRD

## Problem Statement
Current conversion rate from page visit to starting a call is low. Key friction points identified:
- Voice-first UI may feel inaccessible to some users
- Phone button may not be recognized as clickable
- Users are accustomed to text input patterns (ChatGPT, etc.)
- No immediate engagement when landing on page

## Goal
Increase conversion rate by reducing friction to start a conversation through familiar UI patterns and lower-commitment entry points.

---

## Phase 1: ChatGPT-Style Input Bar (High Priority)

### Overview
Replace the current phone button + text input layout with a unified input bar that matches patterns users already know.

### Design
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    Ready when you are.                      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  + │ What's on your mind?              │ 🎤 │ 🎙️ │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│              ◆ ANONYMOUS  ◆ NO ACCOUNT  ◆ FREE             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Requirements
- [ ] Unified input bar with:
  - Text input field with placeholder (e.g., "What's on your mind?")
  - Microphone icon (🎤) - tap to start voice call
  - Audio waveform icon (🎙️) - tap to start voice conversation mode
- [ ] Remove standalone phone button
- [ ] Keep trust badges below input
- [ ] Centered, minimal layout
- [ ] Mobile-responsive (full-width on mobile)

### Behavior
| Action | Result |
|--------|--------|
| Type + Enter/Send | Start text conversation |
| Click mic icon | Request mic permission → Start voice call |
| Click waveform icon | Start voice-first mode (Doc speaks first) |

### Success Metrics
- Increase in call start rate
- Decrease in bounce rate
- A/B test against current UI

---

## Phase 2: Conversation Log UI (Medium Priority)

### Overview
Show an iMessage-style chat log to make users feel like they're already in a conversation, reducing the "cold start" friction.

### Design
```
┌─────────────────────────────────────────────────────────────┐
│                         Doc                                 │
│                                                             │
│     ┌────────────────────────────────────┐                 │
│     │ Hey, long day? I've got nowhere    │                 │
│     │ to be if you need to vent.         │                 │
│     └────────────────────────────────────┘                 │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ What's on your mind?                   │ 🎤 │ 🎙️ │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Requirements
- [ ] Show Doc's opening message as a chat bubble on page load
- [ ] iMessage-style alternating bubbles (Doc = left/gray, User = right/blue)
- [ ] Animate Doc's message appearing (typing indicator → message)
- [ ] Conversation history persists during session
- [ ] Smooth transition from landing → active conversation

### Opening Messages (Rotate randomly)
- "Hey, long day? I've got nowhere to be if you need to vent."
- "Rough shift? I'm here to listen."
- "What's weighing on you today?"

### Success Metrics
- Time to first interaction
- Completion rate of conversations

---

## Phase 3: Auto-Play Doc Greeting (Experimental)

### Overview
Have Doc start speaking automatically when the page loads to create immediate engagement.

### ⚠️ Considerations
- Auto-playing audio is contentious and often blocked by browsers
- May annoy users who didn't expect sound
- Should be opt-in or have clear mute control

### Requirements
- [ ] Optional setting: "Let Doc greet you" toggle
- [ ] If enabled and mic permission granted: Doc speaks opening line
- [ ] Prominent mute/unmute button
- [ ] Remember user preference in localStorage
- [ ] Fallback: Show text bubble if audio blocked

### Alternative: Click-to-Play
- Show a "Play" button on Doc's avatar
- User clicks → Doc speaks greeting → Conversation starts
- Lower friction than full voice call but still engages audio

---

## Phase 4: Mobile Optimization

### Requirements
- [ ] Full-width input bar on mobile
- [ ] Larger touch targets for mic buttons (min 44x44px)
- [ ] Sticky input bar at bottom of screen
- [ ] Native keyboard handling for text input
- [ ] Haptic feedback on button press (if supported)

---

## Implementation Order

| Phase | Priority | Effort | Impact |
|-------|----------|--------|--------|
| Phase 1: ChatGPT Input Bar | High | Medium | High |
| Phase 2: Conversation Log | Medium | Medium | Medium |
| Phase 4: Mobile Optimization | Medium | Low | High |
| Phase 3: Auto-Play (Experimental) | Low | Low | Unknown |

### Recommended Approach
1. **Sprint 1**: Implement Phase 1 (Input Bar) + basic Phase 4 (mobile)
2. **Sprint 2**: A/B test Phase 1 vs current UI
3. **Sprint 3**: If successful, add Phase 2 (Chat Log)
4. **Sprint 4**: Experiment with Phase 3 as opt-in feature

---

## Technical Notes

### Components to Modify
- `components/VoiceAgent.tsx` - Main UI component
- `app/page.tsx` - Landing page layout
- `components/TextConfession.tsx` - Text input handling

### New Components Needed
- `components/UnifiedInputBar.tsx` - Combined text/voice input
- `components/ChatBubble.tsx` - Message bubble component
- `components/ConversationLog.tsx` - Chat history display

### State Management
- Conversation mode: `'idle' | 'text' | 'voice'`
- Messages array for chat log
- Persist to localStorage for returning users

---

## Open Questions
1. Should we show social proof ("1,537 healthcare workers vented today") in new UI?
2. What should the voice waveform icon do vs. the microphone icon?
3. Should text conversations transition to voice seamlessly?
4. Do we keep the "Doc" branding header or go minimal?
