# PRD: Retell Migration & Scalable Video Pipeline

**Date:** 2026-01-23
**Status:** Draft
**Author:** Claude Code

---

## Executive Summary

This PRD covers two interconnected initiatives:
1. **Migrate from VAPI to Retell** for scalable voice calls (20 → unlimited concurrent calls)
2. **Build a Vercel-compatible video generation pipeline** using AWS Lambda for FFmpeg processing

These changes will:
- Remove the 10 concurrent call limit blocking scale
- Enable video clip generation in production (Vercel)
- Improve timestamp accuracy for clips (Retell has word-level timing)
- Enable voice anonymization (Retell has multi-channel recordings)

---

## Problem Statement

### Current Limitations

1. **VAPI Concurrency Cap**: Limited to 10 concurrent calls. Scaling requires contacting sales.

2. **FFmpeg on Vercel**: The video clip feature uses `child_process.exec('ffmpeg')` which won't work on Vercel's serverless runtime (no FFmpeg binary).

3. **Timestamp Inaccuracy**: VAPI's `duration` field for bot messages is inaccurate (reflects text generation time, not TTS audio end time), causing clips to include dead air or cut off audio.

4. **No Voice Anonymization**: Currently uses the original recording. Physicians may want their voice anonymized when sharing clips.

---

## Proposed Solution

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 1: Retell Migration                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Browser                        Next.js Backend                     │
│  ┌──────────────┐              ┌──────────────────┐                │
│  │ RetellWebSDK │◄────────────►│ /api/retell/     │                │
│  │              │  accessToken │ create-call      │                │
│  └──────────────┘              └────────┬─────────┘                │
│                                         │                           │
│                                         ▼                           │
│                                ┌──────────────────┐                │
│                                │ Retell API       │                │
│                                │ (20+ concurrent) │                │
│                                └──────────────────┘                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 2: Video Pipeline (AWS Lambda)                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Next.js (Vercel)                     AWS                           │
│  ┌──────────────────┐                ┌──────────────────┐          │
│  │ /api/generate-   │───POST JSON───►│ Lambda Function  │          │
│  │ clip             │                │ (FFmpeg Layer)   │          │
│  └──────────────────┘                └────────┬─────────┘          │
│           ▲                                   │                     │
│           │                                   ▼                     │
│           │                          ┌──────────────────┐          │
│           │                          │ S3 Bucket        │          │
│           │                          │ (temp storage)   │          │
│           │                          └────────┬─────────┘          │
│           │                                   │                     │
│           └────────────clipUrl────────────────┘                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 3: Queue System (Optional - for viral scale)                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐       │
│  │ User clicks  │────►│ Check slots  │────►│ Start call   │       │
│  │ "Talk to Doc"│     │ available?   │     │ immediately  │       │
│  └──────────────┘     └──────┬───────┘     └──────────────┘       │
│                              │ NO                                   │
│                              ▼                                      │
│                       ┌──────────────┐     ┌──────────────┐       │
│                       │ Add to queue │────►│ Notify when  │       │
│                       │ Show position│     │ slot opens   │       │
│                       └──────────────┘     └──────────────┘       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Retell Migration

### 1.1 Objectives
- Replace VAPI SDK with Retell SDK
- Maintain feature parity (voice calls, transcripts, recordings)
- Improve timestamp accuracy for clip generation
- Enable multi-channel recordings for future anonymization

### 1.2 Technical Requirements

#### 1.2.1 New Dependencies
```bash
npm install retell-client-js-sdk retell-sdk
npm uninstall @vapi-ai/web
```

#### 1.2.2 Environment Variables
```env
# Remove
NEXT_PUBLIC_VAPI_PUBLIC_KEY=xxx
VAPI_API_KEY=xxx
NEXT_PUBLIC_VAPI_ASSISTANT_ID=xxx

# Add
RETELL_API_KEY=xxx
RETELL_AGENT_ID=xxx
```

#### 1.2.3 Retell Dashboard Setup
1. Create account at dashboard.retellai.com
2. Create new agent with:
   - **Name**: Doc
   - **LLM Provider**: OpenAI
   - **Model**: gpt-4o
   - **Temperature**: 0.9
   - **System Prompt**: Copy from `lib/persona.ts`
   - **First Message**: "Hey. Long day? I've got nowhere to be if you need to vent about the latest circle of healthcare hell."
   - **Voice**: Select warm female voice (similar to Deepgram Asteria)
3. Enable "Record Call" in agent settings
4. Set webhook URL to `https://your-domain.com/api/retell-webhook`
5. Copy Agent ID to environment variables

#### 1.2.4 Database Migration
```sql
-- Migration: Add retell_call_id column
ALTER TABLE calls ADD COLUMN retell_call_id TEXT;
CREATE INDEX idx_calls_retell_call_id ON calls(retell_call_id);

-- Optional: Keep vapi_call_id for historical data, or rename
-- ALTER TABLE calls RENAME COLUMN vapi_call_id TO legacy_vapi_call_id;
```

### 1.3 Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `app/api/retell/create-call/route.ts` | CREATE | Backend endpoint to get access token |
| `app/api/retell-webhook/route.ts` | CREATE | Handle Retell webhooks |
| `components/VoiceAgent.tsx` | MODIFY | Replace VAPI SDK with Retell SDK |
| `lib/clipUtils.ts` | MODIFY | Update to use Retell API for call details |
| `lib/retellClient.ts` | CREATE | Retell API client utilities |
| `types/retell.ts` | CREATE | TypeScript types for Retell responses |

### 1.4 Detailed Implementation

#### 1.4.1 `app/api/retell/create-call/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import Retell from 'retell-sdk';
import { getSession } from '@/lib/auth';

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY! });

export async function POST(request: NextRequest) {
  const session = await getSession();

  // Build dynamic variables for personalization
  const dynamicVariables: Record<string, string> = {};

  if (session?.userId) {
    // Fetch AI context for returning users
    try {
      const contextRes = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/ai-context`,
        { headers: { cookie: request.headers.get('cookie') || '' } }
      );
      const contextData = await contextRes.json();
      if (contextData.context) {
        dynamicVariables.user_context = contextData.context;
        dynamicVariables.user_name = session.name || '';
      }
    } catch (e) {
      console.error('Failed to fetch AI context:', e);
    }
  }

  try {
    const webCallResponse = await retell.call.createWebCall({
      agent_id: process.env.RETELL_AGENT_ID!,
      metadata: {
        user_id: session?.userId || null,
        ip_address: request.headers.get('x-forwarded-for') || 'unknown',
      },
      retell_llm_dynamic_variables: dynamicVariables,
    });

    return NextResponse.json({
      accessToken: webCallResponse.access_token,
      callId: webCallResponse.call_id,
    });
  } catch (error) {
    console.error('Failed to create Retell call:', error);
    return NextResponse.json(
      { error: 'Failed to create call' },
      { status: 500 }
    );
  }
}
```

#### 1.4.2 `app/api/retell-webhook/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface RetellWebhookPayload {
  event: 'call_started' | 'call_ended' | 'call_analyzed';
  call: {
    call_id: string;
    call_status: string;
    transcript?: string;
    recording_url?: string;
    recording_multi_channel_url?: string;
    start_timestamp?: number;
    end_timestamp?: number;
    metadata?: {
      user_id?: string;
      ip_address?: string;
    };
  };
}

export async function POST(request: NextRequest) {
  try {
    const payload: RetellWebhookPayload = await request.json();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    if (payload.event === 'call_ended') {
      const { call } = payload;
      const durationMs = call.end_timestamp && call.start_timestamp
        ? call.end_timestamp - call.start_timestamp
        : null;

      // Upsert call record (handles race with client save)
      const { error } = await supabase
        .from('calls')
        .upsert({
          retell_call_id: call.call_id,
          transcript: call.transcript || '',
          recording_url: call.recording_url,
          duration_seconds: durationMs ? Math.round(durationMs / 1000) : null,
          user_id: call.metadata?.user_id || null,
          ip_address: call.metadata?.ip_address || null,
        }, {
          onConflict: 'retell_call_id',
        });

      if (error) {
        console.error('Failed to upsert call:', error);
      }

      // Trigger background tasks
      if (call.transcript && call.metadata?.user_id) {
        // Generate summary for logged-in users
        fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/generate-summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            retellCallId: call.call_id,
            userId: call.metadata.user_id,
            transcript: call.transcript,
          }),
        }).catch(console.error);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Retell webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'retell-webhook' });
}
```

#### 1.4.3 VoiceAgent.tsx Changes (Key Sections)

```typescript
// Replace import
import { RetellWebClient } from "retell-client-js-sdk";

// Replace ref
const retellRef = useRef<RetellWebClient | null>(null);
const retellCallIdRef = useRef<string | null>(null);

// Replace initialization useEffect
useEffect(() => {
  const retellClient = new RetellWebClient();
  retellRef.current = retellClient;

  retellClient.on("call_started", () => {
    setCallStatus("active");
    setTranscript([]);
    fullTranscriptRef.current = [];
    callStartTimeRef.current = Date.now();
  });

  retellClient.on("call_ended", async () => {
    setCallStatus("idle");
    setCurrentSpeaker(null);

    // Rate limit tracking
    const callDuration = callStartTimeRef.current
      ? Math.round((Date.now() - callStartTimeRef.current) / 1000)
      : 0;

    if (callDuration > 0) {
      fetch("/api/rate-limit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds: callDuration }),
      }).catch(console.error);
    }

    // Save transcript
    const transcriptText = fullTranscriptRef.current.join("\n");
    setLastTranscript(transcriptText);

    if (!hasCompletedFormRef.current) {
      setShowPostCallForm(true);
    }

    // Save call to database
    const callId = await saveCallToDatabase();
    if (callId) {
      setLastCallId(callId);
      // Background tasks...
    }
  });

  retellClient.on("agent_start_talking", () => {
    setCurrentSpeaker("assistant");
  });

  retellClient.on("agent_stop_talking", () => {
    setCurrentSpeaker(null);
  });

  retellClient.on("update", (update) => {
    // Retell sends transcript updates differently
    // update.transcript contains recent utterances
    if (update.transcript) {
      const lines = update.transcript.split('\n').filter(Boolean);
      const lastLine = lines[lines.length - 1];
      if (lastLine && !fullTranscriptRef.current.includes(lastLine)) {
        fullTranscriptRef.current.push(lastLine);
        setTranscript(prev => [...prev.slice(-6), lastLine]);
      }
    }
  });

  retellClient.on("error", (error) => {
    console.error("Retell error:", error);
    setCallStatus("idle");
  });

  return () => {
    retellClient.stopCall();
  };
}, [saveCallToDatabase]);

// Replace startCall
const startCall = useCallback(async () => {
  if (!retellRef.current) return;

  const usage = getUsageData();
  if (usage.usedSeconds >= RATE_LIMIT_SECONDS) {
    setIsRateLimited(true);
    setUsageData(usage);
    return;
  }

  setCallStatus("connecting");

  try {
    // Get access token from backend
    const response = await fetch('/api/retell/create-call', {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to create call');
    }

    const { accessToken, callId } = await response.json();
    retellCallIdRef.current = callId;

    await retellRef.current.startCall({
      accessToken,
      sampleRate: 24000,
    });
  } catch (error) {
    console.error("Failed to start call:", error);
    setCallStatus("idle");
  }
}, []);

// Replace endCall
const endCall = useCallback(() => {
  if (!retellRef.current) return;
  setCallStatus("ending");
  retellRef.current.stopCall();
}, []);

// Replace toggleMute
const toggleMute = useCallback(() => {
  if (!retellRef.current) return;
  const newMuteState = !isMuted;
  retellRef.current.setMuted(newMuteState);
  setIsMuted(newMuteState);
}, [isMuted]);
```

### 1.5 Testing Checklist
- [ ] Create Retell account and agent
- [ ] Configure environment variables
- [ ] Test call start/end lifecycle
- [ ] Verify transcript capture
- [ ] Confirm webhook receives events
- [ ] Test rate limiting still works
- [ ] Verify recordings are captured
- [ ] Test with logged-in user (personalization)
- [ ] Test with anonymous user

---

## Phase 2: AWS Lambda Video Pipeline

### 2.1 Objectives
- Move FFmpeg processing to AWS Lambda
- Enable video clip generation on Vercel
- Reduce Next.js API route timeout risk
- Prepare for voice anonymization feature

### 2.2 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  1. User clicks "Create Clip"                                       │
│     │                                                               │
│     ▼                                                               │
│  2. Next.js /api/generate-clip                                      │
│     - Fetches call details from Retell                              │
│     - Generates chat bubble image (Vercel OG)                       │
│     - Uploads image to S3                                           │
│     - Invokes Lambda with job payload                               │
│     │                                                               │
│     ▼                                                               │
│  3. Lambda Function                                                 │
│     - Downloads recording from Retell URL                           │
│     - Downloads chat image from S3                                  │
│     - Slices audio to exchange timestamps                           │
│     - Combines image + audio into MP4                               │
│     - Uploads MP4 to S3                                             │
│     - Returns S3 URL                                                │
│     │                                                               │
│     ▼                                                               │
│  4. Next.js returns clip URL to client                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 AWS Resources Required

| Resource | Purpose | Estimated Cost |
|----------|---------|----------------|
| Lambda Function | FFmpeg processing | ~$0.20/1000 invocations |
| S3 Bucket | Temp storage + final clips | ~$0.023/GB/month |
| IAM Role | Lambda permissions | Free |
| FFmpeg Layer | Binary for Lambda | Free (public layer) |

### 2.4 Lambda Function Implementation

#### 2.4.1 Directory Structure
```
lambda/
├── video-generator/
│   ├── index.mjs           # Handler
│   ├── package.json
│   └── deploy.sh           # Deployment script
```

#### 2.4.2 `lambda/video-generator/index.mjs`
```javascript
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'fs';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET;

export async function handler(event) {
  const workDir = '/tmp/work-' + Date.now();
  mkdirSync(workDir, { recursive: true });

  try {
    const {
      recordingUrl,
      imageS3Key,
      startSeconds,
      endSeconds,
      outputKey,
      anonymize,
      multiChannelUrl,
      physicianText,
    } = event;

    // Download chat bubble image from S3
    const imagePath = `${workDir}/chat.png`;
    const imageObj = await s3.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: imageS3Key,
    }));
    writeFileSync(imagePath, await imageObj.Body.transformToByteArray());

    // Prepare audio
    const audioPath = `${workDir}/audio.m4a`;
    const duration = endSeconds - startSeconds;

    if (anonymize && multiChannelUrl) {
      // Voice anonymization: extract agent channel, generate TTS for user
      const agentAudioPath = `${workDir}/agent.m4a`;
      const userTtsPath = `${workDir}/user_tts.mp3`;
      const mixedAudioPath = `${workDir}/mixed.m4a`;

      // Extract agent channel (channel 0) from multi-channel recording
      execSync(`ffmpeg -y -ss ${startSeconds} -i "${multiChannelUrl}" -t ${duration} -map_channel 0.0.0 -c:a aac -b:a 192k "${agentAudioPath}"`, { timeout: 60000 });

      // Generate TTS for physician text (using Deepgram or ElevenLabs)
      await generateTTS(physicianText, userTtsPath);

      // Mix the two audio tracks
      execSync(`ffmpeg -y -i "${agentAudioPath}" -i "${userTtsPath}" -filter_complex "[0:a][1:a]amerge=inputs=2[a]" -map "[a]" -c:a aac -b:a 192k "${mixedAudioPath}"`, { timeout: 60000 });

      // Use mixed audio
      execSync(`cp "${mixedAudioPath}" "${audioPath}"`);
    } else {
      // Standard: slice the recording
      execSync(`ffmpeg -y -ss ${startSeconds} -i "${recordingUrl}" -t ${duration} -c:a aac -b:a 192k "${audioPath}"`, { timeout: 60000 });
    }

    // Generate video: static image + audio
    const outputPath = `${workDir}/output.mp4`;
    execSync(`ffmpeg -y -loop 1 -i "${imagePath}" -i "${audioPath}" -c:v libx264 -tune stillimage -pix_fmt yuv420p -c:a aac -b:a 192k -shortest "${outputPath}"`, { timeout: 120000 });

    // Upload to S3
    const videoBuffer = readFileSync(outputPath);
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: outputKey,
      Body: videoBuffer,
      ContentType: 'video/mp4',
    }));

    // Generate presigned URL for access
    const signedUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: BUCKET,
      Key: outputKey,
    }), { expiresIn: 86400 }); // 24 hours

    // Cleanup
    unlinkSync(imagePath);
    unlinkSync(audioPath);
    unlinkSync(outputPath);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        clipUrl: signedUrl,
        s3Key: outputKey,
      }),
    };
  } catch (error) {
    console.error('Video generation failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  }
}

async function generateTTS(text, outputPath) {
  // Use Deepgram TTS
  const response = await fetch('https://api.deepgram.com/v1/speak?model=aura-orpheus-en', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`Deepgram TTS failed: ${response.status}`);
  }

  const audioBuffer = await response.arrayBuffer();
  writeFileSync(outputPath, Buffer.from(audioBuffer));
}
```

#### 2.4.3 `lambda/video-generator/package.json`
```json
{
  "name": "video-generator",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@aws-sdk/client-s3": "^3.0.0",
    "@aws-sdk/s3-request-presigner": "^3.0.0"
  }
}
```

#### 2.4.4 Deployment Script
```bash
#!/bin/bash
# lambda/video-generator/deploy.sh

FUNCTION_NAME="doc-video-generator"
REGION="us-east-1"
ROLE_ARN="arn:aws:iam::YOUR_ACCOUNT:role/lambda-video-generator-role"
FFMPEG_LAYER="arn:aws:lambda:us-east-1:YOUR_ACCOUNT:layer:ffmpeg:1"

# Install dependencies
npm install --production

# Create deployment package
zip -r function.zip index.mjs node_modules/

# Update or create function
aws lambda update-function-code \
  --function-name $FUNCTION_NAME \
  --zip-file fileb://function.zip \
  --region $REGION

# If creating new:
# aws lambda create-function \
#   --function-name $FUNCTION_NAME \
#   --runtime nodejs20.x \
#   --handler index.handler \
#   --role $ROLE_ARN \
#   --zip-file fileb://function.zip \
#   --timeout 120 \
#   --memory-size 1024 \
#   --layers $FFMPEG_LAYER \
#   --environment Variables="{S3_BUCKET=doc-clips,DEEPGRAM_API_KEY=xxx}" \
#   --region $REGION

rm function.zip
echo "Deployed!"
```

### 2.5 Updated Next.js API Route

#### 2.5.1 `app/api/generate-clip/route.ts` (Updated)
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSession } from '@/lib/auth';
import { fetchRetellCallDetails, parseRetellIntoExchanges } from '@/lib/clipUtils';

const lambda = new LambdaClient({ region: process.env.AWS_REGION });
const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET!;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { callId, exchangeIndex, anonymize = false } = await request.json();

    // Verify ownership
    const { data: call, error: callError } = await supabase
      .from('calls')
      .select('retell_call_id, user_id')
      .eq('id', callId)
      .single();

    if (callError || !call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    if (call.user_id !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!call.retell_call_id) {
      return NextResponse.json({ error: 'No Retell call ID' }, { status: 400 });
    }

    // Fetch call details from Retell
    const retellDetails = await fetchRetellCallDetails(call.retell_call_id);

    if (!retellDetails.transcript_object?.length) {
      return NextResponse.json({ error: 'No transcript available' }, { status: 400 });
    }

    if (!retellDetails.recording_url) {
      return NextResponse.json({ error: 'No recording available' }, { status: 400 });
    }

    // Parse into exchanges with accurate timestamps
    const exchanges = parseRetellIntoExchanges(retellDetails.transcript_object);
    const exchange = exchanges[exchangeIndex];

    if (!exchange) {
      return NextResponse.json({ error: `Exchange ${exchangeIndex} not found` }, { status: 400 });
    }

    // Generate chat bubble image
    const imageUrl = new URL('/api/generate-clip/image', request.url);
    imageUrl.searchParams.set('physicianText', exchange.physicianText);
    imageUrl.searchParams.set('docText', exchange.docText);

    const imageResponse = await fetch(imageUrl.toString());
    if (!imageResponse.ok) {
      throw new Error('Failed to generate chat image');
    }
    const imageBuffer = await imageResponse.arrayBuffer();

    // Upload image to S3
    const imageKey = `images/${callId}_${exchangeIndex}_${Date.now()}.png`;
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: imageKey,
      Body: Buffer.from(imageBuffer),
      ContentType: 'image/png',
    }));

    // Invoke Lambda for video generation
    const outputKey = `clips/${callId}_${exchangeIndex}_${Date.now()}.mp4`;

    const lambdaPayload = {
      recordingUrl: retellDetails.recording_url,
      imageS3Key: imageKey,
      startSeconds: exchange.startSeconds,
      endSeconds: exchange.endSeconds,
      outputKey,
      anonymize,
      multiChannelUrl: anonymize ? retellDetails.recording_multi_channel_url : undefined,
      physicianText: anonymize ? exchange.physicianText : undefined,
    };

    const lambdaResponse = await lambda.send(new InvokeCommand({
      FunctionName: process.env.LAMBDA_VIDEO_FUNCTION!,
      Payload: JSON.stringify(lambdaPayload),
    }));

    const result = JSON.parse(
      new TextDecoder().decode(lambdaResponse.Payload)
    );
    const body = JSON.parse(result.body);

    if (!body.success) {
      throw new Error(body.error || 'Lambda failed');
    }

    return NextResponse.json({ clipUrl: body.clipUrl });
  } catch (error) {
    console.error('Generate clip error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate clip' },
      { status: 500 }
    );
  }
}
```

### 2.6 AWS Setup Steps

1. **Create S3 Bucket**
   ```bash
   aws s3 mb s3://doc-clips --region us-east-1
   ```

2. **Create IAM Role for Lambda**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "s3:GetObject",
           "s3:PutObject"
         ],
         "Resource": "arn:aws:s3:::doc-clips/*"
       },
       {
         "Effect": "Allow",
         "Action": [
           "logs:CreateLogGroup",
           "logs:CreateLogStream",
           "logs:PutLogEvents"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

3. **Add FFmpeg Layer**
   - Use public layer: `arn:aws:lambda:us-east-1:678847051903:layer:ffmpeg:1`
   - Or build your own from: https://github.com/serverlesspub/ffmpeg-aws-lambda-layer

4. **Create Lambda Function**
   - Runtime: Node.js 20.x
   - Memory: 1024 MB
   - Timeout: 120 seconds
   - Environment variables: `S3_BUCKET`, `DEEPGRAM_API_KEY`

5. **Environment Variables for Next.js**
   ```env
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=xxx
   AWS_SECRET_ACCESS_KEY=xxx
   S3_BUCKET=doc-clips
   LAMBDA_VIDEO_FUNCTION=doc-video-generator
   ```

### 2.7 Testing Checklist
- [ ] S3 bucket created and accessible
- [ ] Lambda function deployed with FFmpeg layer
- [ ] Lambda can read/write to S3
- [ ] Lambda can download from Retell recording URL
- [ ] Video generation completes within timeout
- [ ] Presigned URLs work for clip access
- [ ] Anonymization mode works (if multi-channel available)

---

## Phase 3: Queue System (Future - For Viral Scale)

### 3.1 Objectives
- Handle traffic spikes gracefully
- Provide visibility into wait times
- Ensure fair access when at capacity

### 3.2 Implementation Approach

#### Database Table
```sql
CREATE TABLE call_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  ip_address TEXT NOT NULL,
  position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting', -- waiting, ready, expired
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_call_queue_status ON call_queue(status);
CREATE INDEX idx_call_queue_position ON call_queue(position);
```

#### Queue Manager
```typescript
// lib/callQueue.ts

export async function getQueuePosition(userId?: string, ipAddress: string) {
  // Check current active calls
  const { count: activeCalls } = await supabase
    .from('calls')
    .select('*', { count: 'exact', head: true })
    .gt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()) // Last 30 min
    .is('ended_at', null);

  const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_CALLS || '20');

  if (activeCalls < MAX_CONCURRENT) {
    return { canStart: true, position: 0 };
  }

  // Add to queue or get existing position
  const { data: existing } = await supabase
    .from('call_queue')
    .select('position')
    .eq('ip_address', ipAddress)
    .eq('status', 'waiting')
    .single();

  if (existing) {
    return { canStart: false, position: existing.position };
  }

  // Get next position
  const { data: lastInQueue } = await supabase
    .from('call_queue')
    .select('position')
    .eq('status', 'waiting')
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const nextPosition = (lastInQueue?.position || 0) + 1;

  await supabase.from('call_queue').insert({
    user_id: userId,
    ip_address: ipAddress,
    position: nextPosition,
    expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 min expiry
  });

  return { canStart: false, position: nextPosition };
}

export async function notifyNextInQueue() {
  // Called when a call ends
  const { data: next } = await supabase
    .from('call_queue')
    .select('*')
    .eq('status', 'waiting')
    .order('position', { ascending: true })
    .limit(1)
    .single();

  if (next) {
    await supabase
      .from('call_queue')
      .update({ status: 'ready', notified_at: new Date().toISOString() })
      .eq('id', next.id);

    // Could use Supabase Realtime or push notification here
    return next;
  }
}
```

### 3.3 UI Changes
- Show queue position when slots full
- Estimated wait time based on average call duration
- "Your turn!" notification when slot opens
- 2-minute window to start call before position expires

---

## Phase 4: Improved Clip Generation with Retell

### 4.1 Updated `lib/clipUtils.ts`

```typescript
// Types for Retell API responses
export interface RetellWord {
  word: string;
  start: number;
  end: number;
}

export interface RetellUtterance {
  role: 'agent' | 'user';
  content: string;
  words: RetellWord[];
}

export interface RetellCallDetails {
  call_id: string;
  call_status: string;
  transcript: string;
  transcript_object: RetellUtterance[];
  recording_url: string;
  recording_multi_channel_url?: string;
  start_timestamp: number;
  end_timestamp: number;
  duration_ms: number;
}

export interface TimedExchange {
  index: number;
  physicianText: string;
  docText: string;
  startSeconds: number;
  endSeconds: number;
}

/**
 * Fetch call details from Retell API
 */
export async function fetchRetellCallDetails(callId: string): Promise<RetellCallDetails> {
  const response = await fetch(`https://api.retellai.com/v2/get-call/${callId}`, {
    headers: {
      'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Retell API failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * Parse Retell transcript_object into exchanges with precise timestamps.
 * Uses word-level timing for accurate clip boundaries.
 */
export function parseRetellIntoExchanges(utterances: RetellUtterance[]): TimedExchange[] {
  const exchanges: TimedExchange[] = [];
  let currentExchange: {
    userTexts: string[];
    agentTexts: string[];
    startTime: number | null;
    endTime: number | null;
  } | null = null;
  let exchangeIndex = 0;

  for (const utterance of utterances) {
    // Get precise timing from words array
    const startTime = utterance.words[0]?.start ?? 0;
    const endTime = utterance.words[utterance.words.length - 1]?.end ?? startTime;

    if (utterance.role === 'user') {
      // If we have a complete exchange (has agent response), save it
      if (currentExchange && currentExchange.agentTexts.length > 0) {
        exchanges.push({
          index: exchangeIndex++,
          physicianText: currentExchange.userTexts.join(' '),
          docText: currentExchange.agentTexts.join(' '),
          startSeconds: Math.max(0, (currentExchange.startTime ?? 0) - 0.3), // Small buffer
          endSeconds: (currentExchange.endTime ?? 0) + 0.3,
        });
      }

      // Start new exchange or add to existing user turn
      if (!currentExchange || currentExchange.agentTexts.length > 0) {
        currentExchange = {
          userTexts: [utterance.content],
          agentTexts: [],
          startTime,
          endTime,
        };
      } else {
        currentExchange.userTexts.push(utterance.content);
        currentExchange.endTime = endTime;
      }
    } else if (utterance.role === 'agent' && currentExchange) {
      currentExchange.agentTexts.push(utterance.content);
      currentExchange.endTime = endTime;
    }
  }

  // Don't forget the last exchange
  if (currentExchange && currentExchange.agentTexts.length > 0) {
    exchanges.push({
      index: exchangeIndex,
      physicianText: currentExchange.userTexts.join(' '),
      docText: currentExchange.agentTexts.join(' '),
      startSeconds: Math.max(0, (currentExchange.startTime ?? 0) - 0.3),
      endSeconds: (currentExchange.endTime ?? 0) + 0.3,
    });
  }

  return exchanges;
}

// Keep legacy VAPI functions for backward compatibility with existing calls
export { parseTranscriptIntoExchanges, parseVapiMessagesIntoExchanges } from './clipUtils.legacy';
```

---

## Implementation Timeline

| Phase | Description | Complexity | Dependencies |
|-------|-------------|------------|--------------|
| **1** | Retell Migration | Medium | Retell account, env vars |
| **2** | Lambda Video Pipeline | Medium-High | AWS account, IAM setup |
| **3** | Queue System | Low | Phase 1 complete |
| **4** | Improved Clips | Low | Phase 1 + 2 complete |

### Recommended Order

1. **Phase 1 first** - Unblocks scaling, needed for Phase 4
2. **Phase 2 second** - Unblocks Vercel deployment of clips
3. **Phase 4 third** - Leverages Retell's better data
4. **Phase 3 last** - Only if you actually hit scale limits

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Retell API changes | High | Pin SDK versions, monitor changelog |
| Lambda cold starts | Medium | Provision concurrency, or accept 1-2s delay |
| S3 costs spike | Low | Set lifecycle policy to delete old clips |
| Multi-channel not available | Medium | Graceful fallback to single recording |
| Retell voice quality differs | Medium | Test extensively before full migration |

---

## Success Metrics

- [ ] Concurrent calls: 10 → 20+ (Retell migration)
- [ ] Video generation works on Vercel (Lambda pipeline)
- [ ] Clip timestamp accuracy improved (Retell word-level timing)
- [ ] Voice anonymization available (multi-channel recordings)
- [ ] No degradation in call quality or latency

---

## Appendix: Environment Variables Summary

```env
# Retell (Phase 1)
RETELL_API_KEY=your_retell_api_key
RETELL_AGENT_ID=your_agent_id

# AWS (Phase 2)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET=doc-clips
LAMBDA_VIDEO_FUNCTION=doc-video-generator

# Existing (keep)
DEEPGRAM_API_KEY=your_deepgram_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Remove after migration
NEXT_PUBLIC_VAPI_PUBLIC_KEY=xxx
VAPI_API_KEY=xxx
NEXT_PUBLIC_VAPI_ASSISTANT_ID=xxx
```
