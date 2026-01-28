/**
 * Backfill quotable quotes for calls that have transcripts but no quotes
 * Uses Gemini to extract meaningful quotes
 *
 * Usage: npx tsx scripts/backfill-quotes.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

async function extractQuote(transcript: string): Promise<{ quote: string | null; frustrationScore: number }> {
  // Skip if transcript is too short
  if (transcript.length < 50) {
    return { quote: null, frustrationScore: 0 };
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // For transcripts with speaker labels, filter to user content
  let contentToAnalyze = transcript;

  if (transcript.includes('You:') || transcript.includes('User:')) {
    const userLines = transcript
      .split('\n')
      .filter((line: string) => line.startsWith('You:') || line.startsWith('User:'))
      .map((line: string) => line.replace(/^(You|User):\s*/, '').trim())
      .filter((line: string) => line.length > 10)
      .join('\n');

    if (userLines.length > 30) {
      contentToAnalyze = userLines;
    }
  }

  // Skip if mostly just the AI talking
  if (contentToAnalyze.length < 30) {
    return { quote: null, frustrationScore: 0 };
  }

  const prompt = `You are an expert at finding powerful, quotable moments from healthcare workers venting about their experiences with the healthcare system.

This is a transcript from a voice conversation where a healthcare worker is talking to an AI companion about their frustrations.

Extract a single compelling quote that captures the emotional truth of their experience.

Rules:
- Choose something raw, honest, and relatable to other healthcare workers
- Keep it to 1-2 sentences max (clean up any grammar/speech issues)
- ONLY quote things said by the human user, NOT the AI assistant (which says things like "Hey, long day?" or "I hear you")
- Rate frustration with the healthcare system on a scale of 0-10 (10 = extremely frustrated)
- Consider: complaints about insurance, admin burden, bureaucracy, burnout, pay, work-life balance, patient care challenges

Respond ONLY with valid JSON in this exact format:
{"quote": "the extracted quote here", "frustration_score": 7}

If there's nothing quotable from the USER (not the AI), or the user didn't really vent about anything meaningful, respond with:
{"quote": null, "frustration_score": 0}

Transcript:

${contentToAnalyze}`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text()?.trim();

    // Remove markdown code blocks if present
    const cleanJson = responseText.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    return {
      quote: parsed.quote || null,
      frustrationScore: parsed.frustration_score || 0,
    };
  } catch (error) {
    console.error('Failed to extract quote:', error);
    return { quote: null, frustrationScore: 0 };
  }
}

async function backfillQuotes() {
  console.log('Fetching calls with transcripts but no quotes...\n');

  // Get all calls that have a transcript but no quote
  const { data: calls, error } = await supabase
    .from('calls')
    .select('id, transcript, duration_seconds, created_at')
    .is('quotable_quote', null)
    .not('transcript', 'is', null)
    .gt('duration_seconds', 10) // Only process calls > 10 seconds
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch calls:', error);
    process.exit(1);
  }

  if (!calls || calls.length === 0) {
    console.log('No calls found that need quote backfill.');
    return;
  }

  console.log(`Found ${calls.length} calls to process.\n`);

  let success = 0;
  let failed = 0;
  let noQuote = 0;

  for (const call of calls) {
    process.stdout.write(`Processing ${call.id} (${call.duration_seconds}s)... `);

    try {
      const { quote, frustrationScore } = await extractQuote(call.transcript!);

      if (quote) {
        const { error: updateError } = await supabase
          .from('calls')
          .update({
            quotable_quote: quote,
            frustration_score: frustrationScore,
          })
          .eq('id', call.id);

        if (updateError) {
          console.log(`FAILED (db): ${updateError.message}`);
          failed++;
        } else {
          const preview = quote.slice(0, 50).replace(/\n/g, ' ');
          console.log(`OK (score: ${frustrationScore}) "${preview}..."`);
          success++;
        }
      } else {
        // Update with 0 frustration score to mark as processed
        await supabase
          .from('calls')
          .update({ frustration_score: 0 })
          .eq('id', call.id);
        console.log('NO QUOTE (user didn\'t vent)');
        noQuote++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : 'Unknown error'}`);
      failed++;
    }
  }

  console.log(`\nDone! Success: ${success}, No Quote: ${noQuote}, Failed: ${failed}`);
}

backfillQuotes();
