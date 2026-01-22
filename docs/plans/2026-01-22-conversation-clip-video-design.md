# Conversation Clip Video Feature

## Overview

A feature that lets users transform a conversation exchange into a shareable video clip. The video shows a chat bubble mockup with audio of both speakers - the physician venting, then Doc responding.

## User Flow

1. User goes to "My Conversations" dashboard
2. Clicks a conversation to open the detail modal
3. Clicks new "Create Clip" button
4. Sees a list of exchanges to pick from
5. Selects an exchange (one physician turn + Doc's response)
6. System generates video:
   - Renders chat bubbles as static image
   - Generates audio for each speaker turn via Deepgram TTS
   - Combines image + audio into mp4 via FFmpeg
7. Video uploads to Supabase Storage
8. User gets shareable URL and download option

## Scope for V1

- Single exchange per video (no combining multiple)
- Static image (no animation)
- Two distinct Deepgram voices
- Basic chat bubble styling (matches existing transcript UI)

## Technical Architecture

### API Endpoint

```
POST /api/generate-clip
Body: { callId: string, exchangeIndex: number }
Returns: { clipUrl: string }
```

### Processing Pipeline

1. **Fetch conversation** - Get transcript from `calls` table by `callId`

2. **Parse transcript into exchanges** - Split stored transcript into exchanges where each exchange = consecutive "You:" lines + following "Doc:" lines

3. **Generate audio segments** - Call Deepgram TTS API for each speaker turn:
   - Physician text → `aura-orpheus-en` (male voice)
   - Doc text → `aura-asteria-en` (same voice as live calls)
   - Save as sequential mp3 files

4. **Render chat bubble image** - Generate PNG using `@vercel/og` or `node-canvas`:
   - Style to match existing transcript UI
   - Right-aligned bubbles for physician
   - Left-aligned bubbles for Doc

5. **Combine with FFmpeg** - Concatenate audio segments and overlay on static image

6. **Upload to Supabase Storage** - Store in `clips` bucket, return public URL

7. **Cleanup** - Delete temp files

### File Handling

Temp files use OS temp directory with unique work folder:

```typescript
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

const workDir = join(tmpdir(), `clip-${randomUUID()}`);

const paths = {
  workDir,
  chatImage: join(workDir, 'chat.png'),
  audioSegments: [
    join(workDir, 'audio_0.mp3'),
    join(workDir, 'audio_1.mp3'),
    // ... as many as needed
  ],
  outputVideo: join(workDir, 'output.mp4'),
};
```

Lifecycle:
1. `fs.mkdir(workDir, { recursive: true })` - Create work directory
2. Write files during processing
3. Upload `output.mp4` to Supabase
4. `fs.rm(workDir, { recursive: true })` - Delete everything

### FFmpeg Command

```bash
ffmpeg -y \
  -loop 1 -i chat.png \
  -i audio_0.mp3 \
  -i audio_1.mp3 \
  -filter_complex "[1:a][2:a]concat=n=2:v=0:a=1[audio]" \
  -map 0:v -map "[audio]" \
  -c:v libx264 -tune stillimage -pix_fmt yuv420p \
  -c:a aac -b:a 192k \
  -shortest \
  output.mp4
```

For N audio segments, build dynamically:

```typescript
const inputs = audioSegments.map((seg) => `-i ${seg}`).join(' ');
const filterInputs = audioSegments.map((_, i) => `[${i + 1}:a]`).join('');
const filter = `${filterInputs}concat=n=${audioSegments.length}:v=0:a=1[audio]`;
```

### Deepgram TTS Integration

```typescript
const response = await fetch(
  'https://api.deepgram.com/v1/speak?model=aura-asteria-en',
  {
    method: 'POST',
    headers: {
      'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: "Text to speak..." }),
  }
);

const audioBuffer = await response.arrayBuffer();
await fs.writeFile(audioPath, Buffer.from(audioBuffer));
```

Voice assignments:
- Doc: `aura-asteria-en` (matches live calls)
- Physician: `aura-orpheus-en` (male voice, distinct from Doc)

### Storage

- Bucket: `clips` (Supabase Storage, public access)
- Path: `{call_id}_{exchange_index}_{timestamp}.mp4`

No database table needed - video generation is transient, only the final mp4 persists in storage.

## UI Changes

### ConversationDetail.tsx

1. **Add "Create Clip" button** - In modal header/footer alongside existing controls

2. **Exchange selector view** - When clicked, show transcript split into selectable exchanges:
   - Each exchange as a card/row
   - Preview of physician text + Doc response (truncated)
   - Click to select and trigger generation

3. **Loading state** - Spinner with "Creating your clip..."

4. **Result view** - Once complete:
   - Video preview player
   - "Download" button
   - "Copy Link" button
   - "Create Another" to return to exchange list

## Dependencies

- FFmpeg (installed locally via `brew install ffmpeg`)
- Deepgram API key (`DEEPGRAM_API_KEY` env var)
- Supabase Storage bucket (`clips`)

## Future Considerations

- Animation (text revealing, bubbles appearing) - would require Remotion
- Combining multiple exchanges into one clip
- Custom voice selection
- Branding/watermark options
