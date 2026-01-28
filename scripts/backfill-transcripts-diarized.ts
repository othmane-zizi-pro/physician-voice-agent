/**
 * Re-backfill transcripts with speaker diarization using Deepgram
 * Identifies calls that were transcribed without speaker labels and re-transcribes them
 *
 * Usage: npx tsx scripts/backfill-transcripts-diarized.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Load .env.local manually
const envPath = resolve(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').replace(/^["']|["']$/g, '');
    process.env[key] = value;
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY!;
const TEMP_DIR = resolve(process.cwd(), '.tmp-transcripts-diarized');

async function getPresignedUrl(s3Url: string): Promise<string> {
  const url = new URL(s3Url);
  let bucket: string;
  let key: string;

  if (url.hostname.includes('.s3.')) {
    bucket = url.hostname.split('.s3.')[0];
    key = url.pathname.slice(1);
  } else {
    const parts = url.pathname.slice(1).split('/');
    bucket = parts[0];
    key = parts.slice(1).join('/');
  }

  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

async function downloadFile(url: string, filename: string): Promise<string> {
  const presignedUrl = await getPresignedUrl(url);
  const response = await fetch(presignedUrl);

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const filePath = resolve(TEMP_DIR, filename);
  writeFileSync(filePath, Buffer.from(buffer));
  return filePath;
}

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  speaker: number;
  punctuated_word: string;
}

interface DeepgramResponse {
  results: {
    channels: Array<{
      alternatives: Array<{
        words: DeepgramWord[];
        transcript: string;
      }>;
    }>;
  };
}

async function transcribeWithDiarization(filePath: string): Promise<string> {
  const audioData = readFileSync(filePath);

  const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&punctuate=true', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${DEEPGRAM_API_KEY}`,
      'Content-Type': 'audio/mp4',
    },
    body: audioData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Deepgram API error: ${response.status} - ${error}`);
  }

  const data: DeepgramResponse = await response.json();
  const words = data.results?.channels?.[0]?.alternatives?.[0]?.words || [];

  if (words.length === 0) {
    return '';
  }

  // Group words by speaker and create formatted transcript
  const lines: string[] = [];
  let currentSpeaker: number | null = null;
  let currentText: string[] = [];

  for (const word of words) {
    if (word.speaker !== currentSpeaker) {
      // Save previous speaker's text
      if (currentText.length > 0 && currentSpeaker !== null) {
        // Speaker 0 is typically the AI (Doc), Speaker 1 is the user
        const speakerLabel = currentSpeaker === 0 ? 'Doc' : 'You';
        lines.push(`${speakerLabel}: ${currentText.join(' ')}`);
      }
      currentSpeaker = word.speaker;
      currentText = [];
    }
    currentText.push(word.punctuated_word || word.word);
  }

  // Don't forget the last speaker's text
  if (currentText.length > 0 && currentSpeaker !== null) {
    const speakerLabel = currentSpeaker === 0 ? 'Doc' : 'You';
    lines.push(`${speakerLabel}: ${currentText.join(' ')}`);
  }

  return lines.join('\n');
}

async function backfillDiarizedTranscripts() {
  console.log('Fetching voice calls without speaker labels...\n');

  // Ensure temp directory exists
  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR, { recursive: true });
  }

  // Get voice calls that have transcripts without speaker labels
  const { data: calls, error } = await supabase
    .from('calls')
    .select('id, recording_url, transcript, duration_seconds, created_at')
    .eq('session_type', 'voice')
    .not('transcript', 'is', null)
    .not('recording_url', 'is', null)
    .gt('duration_seconds', 10)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch calls:', error);
    process.exit(1);
  }

  // Filter to only calls without speaker labels
  const callsNeedingDiarization = calls?.filter(
    (c) => c.transcript && !c.transcript.includes('You:') && !c.transcript.includes('Doc:')
  ) || [];

  if (callsNeedingDiarization.length === 0) {
    console.log('No calls found that need diarized transcription.');
    return;
  }

  console.log(`Found ${callsNeedingDiarization.length} calls to re-transcribe with diarization.\n`);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const call of callsNeedingDiarization) {
    process.stdout.write(`Processing ${call.id} (${call.duration_seconds}s)... `);

    const tempFile = `${call.id}.mp4`;
    let filePath: string | null = null;

    try {
      // Download the file
      filePath = await downloadFile(call.recording_url!, tempFile);

      // Transcribe with diarization
      const transcript = await transcribeWithDiarization(filePath);

      if (!transcript || transcript.trim().length === 0) {
        console.log('SKIPPED (empty transcript)');
        skipped++;
        continue;
      }

      // Update database
      const { error: updateError } = await supabase
        .from('calls')
        .update({ transcript: transcript.trim() })
        .eq('id', call.id);

      if (updateError) {
        console.log(`FAILED (db): ${updateError.message}`);
        failed++;
      } else {
        const preview = transcript.trim().slice(0, 50).replace(/\n/g, ' | ');
        console.log(`OK ("${preview}...")`);
        success++;
      }
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : 'Unknown error'}`);
      failed++;
    } finally {
      // Clean up temp file
      if (filePath) {
        try {
          unlinkSync(filePath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Clean up temp directory
  try {
    const { rmdirSync } = await import('fs');
    rmdirSync(TEMP_DIR);
  } catch {
    // Ignore if not empty or doesn't exist
  }

  console.log(`\nDone! Success: ${success}, Failed: ${failed}, Skipped: ${skipped}`);
}

backfillDiarizedTranscripts();
