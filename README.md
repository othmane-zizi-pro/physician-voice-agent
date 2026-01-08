# Doc - Voice Therapy for Physicians

A sardonic AI voice companion for burnt-out physicians. Vent about PE acquisitions, prior auth hell, and EHR nightmares with someone who actually gets it.

## Quick Start

### 1. Get a Vapi API Key

1. Go to [dashboard.vapi.ai](https://dashboard.vapi.ai)
2. Sign up / log in
3. Copy your **Public Key** from the dashboard

### 2. Set Up Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
NEXT_PUBLIC_VAPI_PUBLIC_KEY=your_public_key_here
```

### 3. Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deploy to Vercel

### Option A: One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/physician-voice-agent)

### Option B: Manual Deploy

1. Push to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your repo
4. Add environment variable:
   - `NEXT_PUBLIC_VAPI_PUBLIC_KEY` = your Vapi public key
5. Deploy

## Configuration

### Using Vapi Dashboard (Recommended for Production)

Instead of inline configuration, you can create an Assistant in the Vapi dashboard:

1. Go to [dashboard.vapi.ai](https://dashboard.vapi.ai) → Assistants
2. Create new assistant
3. Copy the system prompt from `lib/persona.ts`
4. Configure voice (recommend: ElevenLabs "Adam")
5. Copy the Assistant ID
6. Add to `.env.local`:
   ```
   NEXT_PUBLIC_VAPI_ASSISTANT_ID=your_assistant_id
   ```

### Voice Options

The default uses ElevenLabs "Adam" voice. Other good options:
- `pNInz6obpgDQGcFmaJgB` - Adam (warm, conversational)
- `21m00Tcm4TlvDq8ikWAM` - Rachel (calm, empathetic)
- `AZnzlk1XvdvUeBnXmlld` - Domi (energetic)

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Voice**: Vapi.ai (orchestration)
- **LLM**: GPT-4o via Vapi
- **Speech**: Deepgram (STT) + ElevenLabs (TTS)
- **Styling**: Tailwind CSS
- **Hosting**: Vercel

## The Persona

Doc is designed to:
- Use gallows humor physicians actually use
- Validate frustration without toxic positivity
- Know the specific pain points (PE, prior auth, EHR, burnout)
- Never suggest "just meditate" or other wellness BS
- Feel like that colleague you grab drinks with after a brutal shift

See `lib/persona.ts` for the full system prompt.

## Disclaimer

This is for entertainment and venting purposes only. Doc is not a licensed therapist, medical professional, or substitute for actual mental health care.

## Cost Estimate

Vapi pricing (as of 2024):
- ~$0.05/minute for voice calls
- A 10-minute vent session ≈ $0.50

For a demo/PoC, the free tier should be sufficient.
