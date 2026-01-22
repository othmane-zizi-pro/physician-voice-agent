// lib/clipUtils.ts

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface AudioSegment {
  speaker: 'physician' | 'doc';
  text: string;
  audioPath: string;
}

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
