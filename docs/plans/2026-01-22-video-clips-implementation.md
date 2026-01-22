# Video Clips Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to create shareable video clips from conversation exchanges (physician vent + Doc response).

**Architecture:** API endpoint generates video by: parsing transcript into exchanges, generating TTS audio via Deepgram, rendering chat bubble image, combining with FFmpeg, uploading to Supabase Storage.

**Tech Stack:** Next.js API routes, Deepgram TTS API, FFmpeg (local), Supabase Storage, @vercel/og for image generation.

---

## Task 1: Transcript Parser Utility

**Files:**
- Create: `lib/clipUtils.ts`

**Step 1: Create the exchange parser**

```typescript
// lib/clipUtils.ts

export interface Exchange {
  index: number;
  physicianText: string;
  docText: string;
}

/**
 * Parses a transcript into exchanges.
 * Each exchange is a physician turn followed by Doc's response.
 *
 * Transcript format:
 * You: first thing physician says
 * Doc: doc's response
 * You: second thing
 * Doc: another response
 */
export function parseTranscriptIntoExchanges(transcript: string): Exchange[] {
  const lines = transcript.split('\n').filter(line => line.trim());
  const exchanges: Exchange[] = [];

  let currentExchange: { physicianLines: string[]; docLines: string[] } | null = null;
  let exchangeIndex = 0;

  for (const line of lines) {
    const isPhysician = line.startsWith('You:');
    const isDoc = line.startsWith('Doc:');
    const content = line.replace(/^(You:|Doc:)\s*/, '').trim();

    if (isPhysician) {
      // If we have a complete exchange (has doc response), save it
      if (currentExchange && currentExchange.docLines.length > 0) {
        exchanges.push({
          index: exchangeIndex,
          physicianText: currentExchange.physicianLines.join(' '),
          docText: currentExchange.docLines.join(' '),
        });
        exchangeIndex++;
      }
      // Start new exchange or add to existing physician turn
      if (!currentExchange || currentExchange.docLines.length > 0) {
        currentExchange = { physicianLines: [content], docLines: [] };
      } else {
        currentExchange.physicianLines.push(content);
      }
    } else if (isDoc && currentExchange) {
      currentExchange.docLines.push(content);
    }
  }

  // Don't forget the last exchange
  if (currentExchange && currentExchange.docLines.length > 0) {
    exchanges.push({
      index: exchangeIndex,
      physicianText: currentExchange.physicianLines.join(' '),
      docText: currentExchange.docLines.join(' '),
    });
  }

  return exchanges;
}
```

**Step 2: Commit**

```bash
git add lib/clipUtils.ts
git commit -m "feat: add transcript parser for video clips"
```

---

## Task 2: Deepgram TTS Utility

**Files:**
- Modify: `lib/clipUtils.ts`

**Step 1: Add TTS function**

Add to `lib/clipUtils.ts`:

```typescript
export interface AudioSegment {
  speaker: 'physician' | 'doc';
  text: string;
  audioPath: string;
}

/**
 * Generate audio from text using Deepgram TTS API.
 *
 * Voice IDs:
 * - Doc: aura-asteria-en (same as live calls)
 * - Physician: aura-orpheus-en (male, distinct)
 */
export async function generateTTSAudio(
  text: string,
  speaker: 'physician' | 'doc',
  outputPath: string
): Promise<void> {
  const voiceId = speaker === 'doc' ? 'aura-asteria-en' : 'aura-orpheus-en';

  const response = await fetch(
    `https://api.deepgram.com/v1/speak?model=${voiceId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Deepgram TTS failed: ${response.status} ${errorText}`);
  }

  const audioBuffer = await response.arrayBuffer();
  const fs = await import('fs/promises');
  await fs.writeFile(outputPath, Buffer.from(audioBuffer));
}
```

**Step 2: Commit**

```bash
git add lib/clipUtils.ts
git commit -m "feat: add Deepgram TTS audio generation"
```

---

## Task 3: Chat Bubble Image Generator

**Files:**
- Create: `app/api/generate-clip/image/route.tsx`

**Step 1: Create OG image endpoint for chat bubbles**

This uses `@vercel/og` (already installed) to render chat bubbles as a PNG.

```tsx
// app/api/generate-clip/image/route.tsx
import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const physicianText = searchParams.get('physicianText') || '';
  const docText = searchParams.get('docText') || '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '48px',
          backgroundColor: '#0a0a0a',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Physician bubble - right aligned */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              maxWidth: '80%',
            }}
          >
            <span
              style={{
                fontSize: '14px',
                color: '#60a5fa',
                marginBottom: '8px',
              }}
            >
              You
            </span>
            <div
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                color: '#bfdbfe',
                padding: '16px 20px',
                borderRadius: '16px',
                fontSize: '18px',
                lineHeight: 1.5,
              }}
            >
              {physicianText}
            </div>
          </div>
        </div>

        {/* Doc bubble - left aligned */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-start',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              maxWidth: '80%',
            }}
          >
            <span
              style={{
                fontSize: '14px',
                color: '#c8a97e',
                marginBottom: '8px',
              }}
            >
              Doc
            </span>
            <div
              style={{
                backgroundColor: '#1f2937',
                color: '#e5e7eb',
                padding: '16px 20px',
                borderRadius: '16px',
                fontSize: '18px',
                lineHeight: 1.5,
              }}
            >
              {docText}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
    }
  );
}
```

**Step 2: Commit**

```bash
git add app/api/generate-clip/image/route.tsx
git commit -m "feat: add chat bubble image generator endpoint"
```

---

## Task 4: FFmpeg Video Generation Utility

**Files:**
- Modify: `lib/clipUtils.ts`

**Step 1: Add FFmpeg video generation function**

Add to `lib/clipUtils.ts`:

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Combine a static image with audio segments into an MP4 video.
 * Requires FFmpeg installed locally (brew install ffmpeg).
 */
export async function generateVideo(
  imagePath: string,
  audioSegments: string[],
  outputPath: string
): Promise<void> {
  // Build FFmpeg input arguments for audio files
  const audioInputs = audioSegments.map(seg => `-i "${seg}"`).join(' ');

  // Build concat filter for N audio files
  // [1:a] is first audio (index 0 is the image), [2:a] is second, etc.
  const filterInputs = audioSegments.map((_, i) => `[${i + 1}:a]`).join('');
  const concatFilter = `${filterInputs}concat=n=${audioSegments.length}:v=0:a=1[audio]`;

  const command = [
    'ffmpeg -y',
    `-loop 1 -i "${imagePath}"`,
    audioInputs,
    `-filter_complex "${concatFilter}"`,
    '-map 0:v -map "[audio]"',
    '-c:v libx264 -tune stillimage -pix_fmt yuv420p',
    '-c:a aac -b:a 192k',
    '-shortest',
    `"${outputPath}"`,
  ].join(' ');

  try {
    await execAsync(command);
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    throw new Error(`FFmpeg failed: ${err.stderr || err.message}`);
  }
}
```

**Step 2: Commit**

```bash
git add lib/clipUtils.ts
git commit -m "feat: add FFmpeg video generation utility"
```

---

## Task 5: Main Generate Clip API Endpoint

**Files:**
- Create: `app/api/generate-clip/route.ts`

**Step 1: Create the main API endpoint**

```typescript
// app/api/generate-clip/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import type { Database } from '@/types/database';
import { getSession } from '@/lib/auth';
import {
  parseTranscriptIntoExchanges,
  generateTTSAudio,
  generateVideo,
} from '@/lib/clipUtils';

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  // Auth check
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let workDir: string | null = null;

  try {
    const { callId, exchangeIndex } = await request.json();

    if (!callId || exchangeIndex === undefined) {
      return NextResponse.json(
        { error: 'callId and exchangeIndex are required' },
        { status: 400 }
      );
    }

    // Fetch the call
    const { data: call, error: callError } = await supabase
      .from('calls')
      .select('transcript, user_id')
      .eq('id', callId)
      .single();

    if (callError || !call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    // Verify ownership
    if (call.user_id !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!call.transcript) {
      return NextResponse.json(
        { error: 'Call has no transcript' },
        { status: 400 }
      );
    }

    // Parse exchanges
    const exchanges = parseTranscriptIntoExchanges(call.transcript);
    const exchange = exchanges[exchangeIndex];

    if (!exchange) {
      return NextResponse.json(
        { error: `Exchange ${exchangeIndex} not found` },
        { status: 400 }
      );
    }

    // Create work directory
    workDir = join(tmpdir(), `clip-${randomUUID()}`);
    await mkdir(workDir, { recursive: true });

    const paths = {
      physicianAudio: join(workDir, 'audio_0.mp3'),
      docAudio: join(workDir, 'audio_1.mp3'),
      chatImage: join(workDir, 'chat.png'),
      outputVideo: join(workDir, 'output.mp4'),
    };

    // Generate TTS audio for both speakers
    await Promise.all([
      generateTTSAudio(exchange.physicianText, 'physician', paths.physicianAudio),
      generateTTSAudio(exchange.docText, 'doc', paths.docAudio),
    ]);

    // Generate chat bubble image
    const imageUrl = new URL('/api/generate-clip/image', request.url);
    imageUrl.searchParams.set('physicianText', exchange.physicianText);
    imageUrl.searchParams.set('docText', exchange.docText);

    const imageResponse = await fetch(imageUrl.toString());
    if (!imageResponse.ok) {
      throw new Error('Failed to generate chat image');
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    await writeFile(paths.chatImage, Buffer.from(imageBuffer));

    // Generate video with FFmpeg
    await generateVideo(
      paths.chatImage,
      [paths.physicianAudio, paths.docAudio],
      paths.outputVideo
    );

    // Upload to Supabase Storage
    const videoBuffer = await readFile(paths.outputVideo);
    const fileName = `${callId}_${exchangeIndex}_${Date.now()}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from('clips')
      .upload(fileName, videoBuffer, {
        contentType: 'video/mp4',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('clips')
      .getPublicUrl(fileName);

    return NextResponse.json({ clipUrl: urlData.publicUrl });
  } catch (error) {
    console.error('Generate clip error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate clip' },
      { status: 500 }
    );
  } finally {
    // Cleanup temp files
    if (workDir) {
      try {
        await rm(workDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
```

**Step 2: Commit**

```bash
git add app/api/generate-clip/route.ts
git commit -m "feat: add main generate-clip API endpoint"
```

---

## Task 6: Create Supabase Storage Bucket

**Manual step - do this in Supabase dashboard:**

1. Go to Supabase Dashboard → Storage
2. Create new bucket named `clips`
3. Set it to **Public** bucket
4. No RLS policies needed for public read access

**Or via SQL:**

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('clips', 'clips', true);
```

---

## Task 7: Add DEEPGRAM_API_KEY to Environment

**Files:**
- Modify: `.env.local` (if exists) or create it

**Step 1: Add the environment variable**

Add to your `.env.local`:

```
DEEPGRAM_API_KEY=your_deepgram_api_key_here
```

Get your API key from: https://console.deepgram.com/

---

## Task 8: UI - Add Create Clip Button and Exchange Selector

**Files:**
- Modify: `components/dashboard/ConversationDetail.tsx`

**Step 1: Add state and imports**

At the top of the file, add to imports:

```typescript
import { Film, Download, Link2, ArrowLeft, Loader2 } from "lucide-react";
```

Inside the component, add state after existing state declarations:

```typescript
const [clipMode, setClipMode] = useState<'view' | 'select' | 'generating' | 'result'>('view');
const [exchanges, setExchanges] = useState<Array<{ index: number; physicianText: string; docText: string }>>([]);
const [clipUrl, setClipUrl] = useState<string | null>(null);
const [clipError, setClipError] = useState<string | null>(null);
```

**Step 2: Add exchange parsing function**

Add this function inside the component:

```typescript
const parseExchanges = (transcript: string) => {
  const lines = transcript.split('\n').filter(line => line.trim());
  const result: Array<{ index: number; physicianText: string; docText: string }> = [];

  let current: { physicianLines: string[]; docLines: string[] } | null = null;
  let idx = 0;

  for (const line of lines) {
    const isPhysician = line.startsWith('You:');
    const isDoc = line.startsWith('Doc:');
    const content = line.replace(/^(You:|Doc:)\s*/, '').trim();

    if (isPhysician) {
      if (current && current.docLines.length > 0) {
        result.push({
          index: idx,
          physicianText: current.physicianLines.join(' '),
          docText: current.docLines.join(' '),
        });
        idx++;
      }
      if (!current || current.docLines.length > 0) {
        current = { physicianLines: [content], docLines: [] };
      } else {
        current.physicianLines.push(content);
      }
    } else if (isDoc && current) {
      current.docLines.push(content);
    }
  }

  if (current && current.docLines.length > 0) {
    result.push({
      index: idx,
      physicianText: current.physicianLines.join(' '),
      docText: current.docLines.join(' '),
    });
  }

  return result;
};

const handleCreateClip = () => {
  if (conversation.transcript) {
    setExchanges(parseExchanges(conversation.transcript));
    setClipMode('select');
  }
};

const handleSelectExchange = async (exchangeIndex: number) => {
  setClipMode('generating');
  setClipError(null);

  try {
    const response = await fetch('/api/generate-clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callId: conversation.id,
        exchangeIndex,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to generate clip');
    }

    setClipUrl(data.clipUrl);
    setClipMode('result');
  } catch (error) {
    setClipError(error instanceof Error ? error.message : 'Failed to generate clip');
    setClipMode('select');
  }
};

const handleCopyLink = async () => {
  if (clipUrl) {
    await navigator.clipboard.writeText(clipUrl);
  }
};

const handleBackToView = () => {
  setClipMode('view');
  setClipUrl(null);
  setClipError(null);
};
```

**Step 3: Add Create Clip button to header**

In the header section (around line 163), after the close button, add:

```typescript
{conversation.transcript && conversation.session_type === 'voice' && clipMode === 'view' && (
  <button
    onClick={handleCreateClip}
    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-meroka-primary hover:bg-meroka-primary-hover text-white rounded-lg transition-colors mr-2"
  >
    <Film size={16} />
    Create Clip
  </button>
)}
```

**Step 4: Add conditional rendering for clip modes**

Replace the content section (the `<div className="flex-1 overflow-y-auto p-4 space-y-4">` div) with conditional rendering:

```typescript
{/* Content */}
<div className="flex-1 overflow-y-auto p-4 space-y-4">
  {clipMode === 'select' && (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={handleBackToView}
          className="p-1 text-gray-400 hover:text-white"
        >
          <ArrowLeft size={20} />
        </button>
        <h3 className="text-lg font-medium text-white">Select an exchange to clip</h3>
      </div>
      {clipError && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
          {clipError}
        </div>
      )}
      <div className="space-y-3">
        {exchanges.map((exchange) => (
          <button
            key={exchange.index}
            onClick={() => handleSelectExchange(exchange.index)}
            className="w-full text-left p-4 bg-gray-800/50 hover:bg-gray-800 rounded-xl transition-colors"
          >
            <div className="mb-2">
              <span className="text-xs text-blue-400 font-medium">You</span>
              <p className="text-gray-300 text-sm line-clamp-2">{exchange.physicianText}</p>
            </div>
            <div>
              <span className="text-xs text-meroka-primary font-medium">Doc</span>
              <p className="text-gray-400 text-sm line-clamp-2">{exchange.docText}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )}

  {clipMode === 'generating' && (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 size={48} className="text-meroka-primary animate-spin mb-4" />
      <p className="text-gray-300">Creating your clip...</p>
      <p className="text-gray-500 text-sm mt-1">This may take a few moments</p>
    </div>
  )}

  {clipMode === 'result' && clipUrl && (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={handleBackToView}
          className="p-1 text-gray-400 hover:text-white"
        >
          <ArrowLeft size={20} />
        </button>
        <h3 className="text-lg font-medium text-white">Your clip is ready!</h3>
      </div>
      <div className="bg-gray-800/50 rounded-xl p-4 mb-4">
        <video
          src={clipUrl}
          controls
          className="w-full rounded-lg"
        />
      </div>
      <div className="flex gap-3">
        <a
          href={clipUrl}
          download
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-meroka-primary hover:bg-meroka-primary-hover text-white rounded-lg transition-colors"
        >
          <Download size={18} />
          Download
        </a>
        <button
          onClick={handleCopyLink}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
        >
          <Link2 size={18} />
          Copy Link
        </button>
      </div>
      <button
        onClick={() => setClipMode('select')}
        className="w-full mt-3 px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm"
      >
        Create another clip
      </button>
    </div>
  )}

  {clipMode === 'view' && (
    <>
      {/* Original content - Meta info, Audio player, Quote, Transcript */}
      {/* ... keep all the existing JSX for the view mode ... */}
    </>
  )}
</div>
```

**Step 5: Commit**

```bash
git add components/dashboard/ConversationDetail.tsx
git commit -m "feat: add clip creation UI to conversation detail"
```

---

## Task 9: Test End-to-End

**Prerequisites:**
- FFmpeg installed (`brew install ffmpeg`)
- DEEPGRAM_API_KEY in `.env.local`
- Supabase `clips` bucket created

**Steps:**

1. Run `npm run dev`
2. Go to dashboard, click a conversation with a voice transcript
3. Click "Create Clip" button
4. Select an exchange
5. Wait for generation
6. Verify video plays and download works

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Transcript parser | `lib/clipUtils.ts` |
| 2 | Deepgram TTS utility | `lib/clipUtils.ts` |
| 3 | Chat bubble image generator | `app/api/generate-clip/image/route.tsx` |
| 4 | FFmpeg video generation | `lib/clipUtils.ts` |
| 5 | Main API endpoint | `app/api/generate-clip/route.ts` |
| 6 | Supabase storage bucket | Manual/SQL |
| 7 | Environment variable | `.env.local` |
| 8 | UI components | `components/dashboard/ConversationDetail.tsx` |
| 9 | End-to-end test | Manual |
