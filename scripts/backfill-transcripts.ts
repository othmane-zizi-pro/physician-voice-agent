/**
 * Backfill transcripts for calls that have recordings but no transcript
 * Uses OpenAI Whisper API for transcription
 *
 * Usage: npx tsx scripts/backfill-transcripts.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import OpenAI from 'openai';

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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Temp directory for downloaded files
const TEMP_DIR = resolve(process.cwd(), '.tmp-transcripts');

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

async function transcribeFile(filePath: string): Promise<string> {
  const fs = await import('fs');

  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: 'whisper-1',
    response_format: 'text',
  });

  return transcription;
}

async function backfillTranscripts() {
  console.log('Fetching calls with recordings but no transcript...\n');

  // Ensure temp directory exists
  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR, { recursive: true });
  }

  // Get all calls that have a recording but no transcript
  const { data: calls, error } = await supabase
    .from('calls')
    .select('id, recording_url, duration_seconds, created_at')
    .is('transcript', null)
    .not('recording_url', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch calls:', error);
    process.exit(1);
  }

  if (!calls || calls.length === 0) {
    console.log('No calls found that need transcript backfill.');
    return;
  }

  console.log(`Found ${calls.length} calls to process.\n`);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const call of calls) {
    // Skip very short calls (less than 5 seconds) - likely no meaningful audio
    if (call.duration_seconds && call.duration_seconds < 5) {
      console.log(`Skipping ${call.id} (${call.duration_seconds}s - too short)`);
      skipped++;
      continue;
    }

    process.stdout.write(`Processing ${call.id} (${call.duration_seconds || '?'}s)... `);

    const tempFile = `${call.id}.mp4`;
    let filePath: string | null = null;

    try {
      // Download the file
      filePath = await downloadFile(call.recording_url!, tempFile);

      // Transcribe
      const transcript = await transcribeFile(filePath);

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
        const preview = transcript.trim().slice(0, 50).replace(/\n/g, ' ');
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

backfillTranscripts();
