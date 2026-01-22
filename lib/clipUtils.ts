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

export interface TimedExchange {
  index: number;
  physicianText: string;
  docText: string;
  startSeconds: number;  // When physician started speaking
  endSeconds: number;    // When Doc finished responding
}

// VAPI API types for fetching call details with timestamped transcripts
export interface VapiMessage {
  role: 'user' | 'bot' | 'assistant' | 'system';
  message: string;
  secondsFromStart: number;
  endTime?: string;
  duration?: number;
}

export interface VapiCallDetails {
  id: string;
  artifact?: {
    messages?: VapiMessage[];
    recordingUrl?: string;
  };
}

/**
 * Fetch call details from VAPI API including timestamped transcript.
 */
export async function fetchVapiCallDetails(vapiCallId: string): Promise<VapiCallDetails> {
  const response = await fetch(`https://api.vapi.ai/call/${vapiCallId}`, {
    headers: {
      'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`VAPI API failed: ${response.status} ${errorText}`);
  }

  return response.json();
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
 * Parse VAPI timestamped messages into exchanges with timing info.
 * Each exchange is a user message followed by a bot response.
 *
 * Timing strategy:
 * - Start: 1 second before the user starts speaking (to avoid cutting off first word)
 * - End: When the next user message starts (more reliable than duration field)
 */
export function parseVapiMessagesIntoExchanges(messages: VapiMessage[]): TimedExchange[] {
  const exchanges: TimedExchange[] = [];

  // Filter to only user and bot messages (skip system messages)
  const conversationMessages = messages.filter(
    m => m.role === 'user' || m.role === 'bot' || m.role === 'assistant'
  );

  // First pass: identify exchange boundaries
  // An exchange starts with a user message and ends when the next user message begins
  const exchangeBoundaries: { startIdx: number; endIdx: number }[] = [];
  let currentStartIdx: number | null = null;

  for (let i = 0; i < conversationMessages.length; i++) {
    const msg = conversationMessages[i];
    const isUser = msg.role === 'user';

    if (isUser) {
      // If we had a previous exchange, it ends here
      if (currentStartIdx !== null) {
        exchangeBoundaries.push({ startIdx: currentStartIdx, endIdx: i - 1 });
      }
      currentStartIdx = i;
    }
  }

  // Don't forget the last exchange (ends at last message)
  if (currentStartIdx !== null) {
    exchangeBoundaries.push({ startIdx: currentStartIdx, endIdx: conversationMessages.length - 1 });
  }

  // Second pass: build exchanges with timing
  for (let exchangeIdx = 0; exchangeIdx < exchangeBoundaries.length; exchangeIdx++) {
    const { startIdx, endIdx } = exchangeBoundaries[exchangeIdx];

    const physicianLines: string[] = [];
    const docLines: string[] = [];
    let startSeconds: number | null = null;
    let maxBotEndSeconds: number | null = null;  // Track the latest end time across ALL bot messages

    for (let i = startIdx; i <= endIdx; i++) {
      const msg = conversationMessages[i];
      const isUser = msg.role === 'user';
      const isBot = msg.role === 'bot' || msg.role === 'assistant';

      if (isUser) {
        physicianLines.push(msg.message);
        if (startSeconds === null) {
          // Start 1 second early to avoid cutting off first word
          startSeconds = Math.max(0, msg.secondsFromStart - 1);
        }
      } else if (isBot) {
        docLines.push(msg.message);
        // Calculate when THIS bot message ends and track the maximum
        // Note: VAPI duration is in MILLISECONDS, secondsFromStart is in seconds
        if (msg.duration && msg.duration > 0) {
          const thisMsgEndSeconds = msg.secondsFromStart + (msg.duration / 1000);
          if (maxBotEndSeconds === null || thisMsgEndSeconds > maxBotEndSeconds) {
            maxBotEndSeconds = thisMsgEndSeconds;
          }
        }
      }
    }

    // Only create exchange if we have both user and bot messages
    if (physicianLines.length > 0 && docLines.length > 0 && startSeconds !== null) {
      let endSeconds: number;

      if (maxBotEndSeconds !== null) {
        // Use the maximum end time from all bot messages
        endSeconds = maxBotEndSeconds;
      } else if (exchangeIdx < exchangeBoundaries.length - 1) {
        // Fallback: use next exchange's start time
        const nextExchangeStartIdx = exchangeBoundaries[exchangeIdx + 1].startIdx;
        endSeconds = conversationMessages[nextExchangeStartIdx].secondsFromStart;
      } else {
        // Last resort: estimate from text length
        const allDocText = docLines.join(' ');
        const estimatedDuration = Math.max(3, allDocText.length / 15);
        // Find the last bot message's start time for the estimate
        let lastBotStart = 0;
        for (let i = endIdx; i >= startIdx; i--) {
          const msg = conversationMessages[i];
          if (msg.role === 'bot' || msg.role === 'assistant') {
            lastBotStart = msg.secondsFromStart;
            break;
          }
        }
        endSeconds = lastBotStart + estimatedDuration;
      }

      // Add small buffer (0.5s) to avoid cutting off the end
      endSeconds += 0.5;

      exchanges.push({
        index: exchangeIdx,
        physicianText: physicianLines.join(' '),
        docText: docLines.join(' '),
        startSeconds,
        endSeconds,
      });
    }
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

/**
 * Download a recording and slice it to a specific time range.
 * Uses FFmpeg to extract the audio segment.
 */
export async function sliceRecording(
  recordingUrl: string,
  startSeconds: number,
  endSeconds: number,
  outputPath: string
): Promise<void> {
  const duration = endSeconds - startSeconds;

  // FFmpeg can read directly from URL and slice in one command
  // -ss before -i seeks efficiently, -t specifies duration
  const command = [
    'ffmpeg -y',
    `-ss ${startSeconds}`,
    `-i "${recordingUrl}"`,
    `-t ${duration}`,
    '-c:a aac -b:a 192k',  // Re-encode to AAC for compatibility
    `"${outputPath}"`,
  ].join(' ');

  try {
    await execAsync(command);
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    throw new Error(`FFmpeg slice failed: ${err.stderr || err.message}`);
  }
}
