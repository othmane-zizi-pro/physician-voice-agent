/**
 * Re-extract quotes for all voice calls with diarized transcripts
 * This will overwrite existing quotes with potentially better ones
 *
 * Usage: npx tsx scripts/reextract-quotes.ts
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
  if (transcript.length < 50) {
    return { quote: null, frustrationScore: 0 };
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // Filter to only user content (You: lines)
  const userLines = transcript
    .split('\n')
    .filter((line: string) => line.startsWith('You:'))
    .map((line: string) => line.replace(/^You:\s*/, '').trim())
    .filter((line: string) => line.length > 10)
    .join('\n');

  if (userLines.length < 30) {
    return { quote: null, frustrationScore: 0 };
  }

  const prompt = `You are an expert at finding powerful, quotable moments from healthcare workers (or anyone) venting about their frustrations.

Below are statements from a user talking to an AI companion about their struggles. Extract a single compelling quote that captures their emotional truth.

Rules:
- Choose something raw, honest, and relatable
- Keep it to 1-2 sentences max (clean up any grammar/speech issues)
- Rate frustration on a scale of 0-10 (10 = extremely frustrated)
- Consider: work stress, healthcare system issues, burnout, life challenges, relationship struggles

Respond ONLY with valid JSON:
{"quote": "the extracted quote here", "frustration_score": 7}

If nothing quotable, respond:
{"quote": null, "frustration_score": 0}

User statements:

${userLines}`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text()?.trim();
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

async function reextractQuotes() {
  console.log('Fetching voice calls with diarized transcripts...\n');

  // Get all voice calls with diarized transcripts (containing "You:")
  const { data: calls, error } = await supabase
    .from('calls')
    .select('id, transcript, duration_seconds, quotable_quote, created_at')
    .eq('session_type', 'voice')
    .not('transcript', 'is', null)
    .gt('duration_seconds', 15)
    .like('transcript', '%You:%')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch calls:', error);
    process.exit(1);
  }

  if (!calls || calls.length === 0) {
    console.log('No diarized calls found.');
    return;
  }

  console.log(`Found ${calls.length} diarized voice calls to process.\n`);

  let updated = 0;
  let unchanged = 0;
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
        } else {
          const preview = quote.slice(0, 45).replace(/\n/g, ' ');
          const status = call.quotable_quote ? 'UPDATED' : 'NEW';
          console.log(`${status} (score: ${frustrationScore}) "${preview}..."`);
          updated++;
        }
      } else {
        if (call.quotable_quote) {
          // Keep existing quote
          console.log(`KEPT EXISTING`);
          unchanged++;
        } else {
          console.log('NO QUOTE');
          noQuote++;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  console.log(`\nDone! Updated: ${updated}, Kept existing: ${unchanged}, No quote: ${noQuote}`);
}

reextractQuotes();
