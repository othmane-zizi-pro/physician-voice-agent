/**
 * Backfill durations for calls that have recordings but no duration_seconds
 * Uses ffprobe to get duration from S3 recording URLs
 *
 * Usage: npx tsx scripts/backfill-durations.ts
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
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

async function getPresignedUrl(s3Url: string): Promise<string> {
  // Extract bucket and key from URL
  // Format: https://bucket.s3.amazonaws.com/key or https://s3.amazonaws.com/bucket/key
  const url = new URL(s3Url);
  let bucket: string;
  let key: string;

  if (url.hostname.includes('.s3.')) {
    // Format: bucket.s3.amazonaws.com/key
    bucket = url.hostname.split('.s3.')[0];
    key = url.pathname.slice(1); // Remove leading /
  } else {
    // Format: s3.amazonaws.com/bucket/key
    const parts = url.pathname.slice(1).split('/');
    bucket = parts[0];
    key = parts.slice(1).join('/');
  }

  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

async function getDurationFromUrl(url: string): Promise<number | null> {
  try {
    // Get presigned URL for private S3 file
    const presignedUrl = await getPresignedUrl(url);

    // Use ffprobe to get duration from the presigned URL
    const result = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${presignedUrl}"`,
      { encoding: 'utf-8', timeout: 60000 }
    );
    const duration = parseFloat(result.trim());
    return isNaN(duration) ? null : Math.round(duration);
  } catch (error) {
    console.error(`\nFailed to get duration for ${url}:`, error);
    return null;
  }
}

async function backfillDurations() {
  console.log('Fetching calls with recordings but no duration...\n');

  // Get all calls that have a recording but no duration
  const { data: calls, error } = await supabase
    .from('calls')
    .select('id, recording_url, created_at')
    .is('duration_seconds', null)
    .not('recording_url', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch calls:', error);
    process.exit(1);
  }

  if (!calls || calls.length === 0) {
    console.log('No calls found that need duration backfill.');
    return;
  }

  console.log(`Found ${calls.length} calls to process.\n`);

  let success = 0;
  let failed = 0;

  for (const call of calls) {
    process.stdout.write(`Processing ${call.id}... `);

    const duration = await getDurationFromUrl(call.recording_url!);

    if (duration !== null) {
      const { error: updateError } = await supabase
        .from('calls')
        .update({ duration_seconds: duration })
        .eq('id', call.id);

      if (updateError) {
        console.log(`FAILED (db update): ${updateError.message}`);
        failed++;
      } else {
        console.log(`OK (${duration}s)`);
        success++;
      }
    } else {
      console.log('FAILED (ffprobe)');
      failed++;
    }
  }

  console.log(`\nDone! Success: ${success}, Failed: ${failed}`);
}

backfillDurations();
