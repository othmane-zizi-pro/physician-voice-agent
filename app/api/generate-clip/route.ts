// app/api/generate-clip/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { getSession } from '@/lib/auth';
import { parseLiveKitIntoExchanges } from '@/lib/clipUtils';

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Lambda endpoint for FFmpeg processing (deployed via SAM)
const LAMBDA_ENDPOINT = process.env.CLIP_LAMBDA_URL;

export async function POST(request: NextRequest) {
  // Allow anonymous users to create clips (removed auth requirement)
  const session = await getSession();

  try {
    const { callId, exchangeIndex } = await request.json();

    if (!callId || exchangeIndex === undefined) {
      return NextResponse.json(
        { error: 'callId and exchangeIndex are required' },
        { status: 400 }
      );
    }

    // Fetch the call from our database
    console.log('Fetching call:', callId, 'for user:', session?.userId || 'anonymous');

    const { data: call, error: callError } = await supabase
      .from('calls')
      .select('user_id, recording_url, transcript_object, livekit_room_name')
      .eq('id', callId)
      .single();

    if (callError) {
      console.error('Call lookup error:', { callId, error: callError.message, code: callError.code });
      return NextResponse.json({ error: `Call not found: ${callError.message}` }, { status: 404 });
    }

    if (!call) {
      console.error('Call not found in database:', callId);
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    console.log('Call found:', { user_id: call.user_id, has_recording: !!call.recording_url, has_transcript: !!call.transcript_object });

    // Note: Allowing anonymous clip creation for all calls (no ownership check)
    // This enables the post-call form video clip feature for anonymous users

    // Check for timestamped transcript
    if (!call.transcript_object || !Array.isArray(call.transcript_object) || call.transcript_object.length === 0) {
      return NextResponse.json(
        { error: 'No timestamped transcript available for this call' },
        { status: 400 }
      );
    }

    // Check for recording
    if (!call.recording_url) {
      return NextResponse.json(
        { error: 'No recording available for this call. LiveKit Cloud recording may need to be enabled.' },
        { status: 400 }
      );
    }

    // Parse transcript into timed exchanges
    const exchanges = parseLiveKitIntoExchanges(call.transcript_object);
    const exchange = exchanges[exchangeIndex];

    if (!exchange) {
      return NextResponse.json(
        { error: `Exchange ${exchangeIndex} not found. Available: 0-${exchanges.length - 1}` },
        { status: 400 }
      );
    }

    // Generate chat bubble image locally (doesn't need FFmpeg)
    const imageUrl = new URL('/api/generate-clip/image', request.url);
    imageUrl.searchParams.set('physicianText', exchange.physicianText);
    imageUrl.searchParams.set('docText', exchange.docText);

    const imageResponse = await fetch(imageUrl.toString());
    if (!imageResponse.ok) {
      throw new Error('Failed to generate chat image');
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const chatImageBase64 = Buffer.from(imageBuffer).toString('base64');

    // Check if Lambda is configured
    if (!LAMBDA_ENDPOINT) {
      return NextResponse.json(
        { error: 'Clip generation not configured. Set CLIP_LAMBDA_URL environment variable.' },
        { status: 503 }
      );
    }

    // Call Lambda for FFmpeg processing
    console.log('Calling Lambda for clip generation:', {
      callId,
      exchangeIndex,
      startSeconds: exchange.startSeconds,
      endSeconds: exchange.endSeconds
    });

    const lambdaResponse = await fetch(LAMBDA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recording_url: call.recording_url,
        start_seconds: exchange.startSeconds,
        end_seconds: exchange.endSeconds,
        chat_image_base64: chatImageBase64,
        call_id: callId,
        exchange_index: exchangeIndex,
      }),
    });

    if (!lambdaResponse.ok) {
      const errorBody = await lambdaResponse.text();
      console.error('Lambda error:', lambdaResponse.status, errorBody);
      throw new Error(`Lambda processing failed: ${lambdaResponse.status}`);
    }

    const lambdaResult = await lambdaResponse.json();

    if (lambdaResult.error) {
      throw new Error(lambdaResult.error);
    }

    return NextResponse.json({ clipUrl: lambdaResult.clipUrl });
  } catch (error) {
    console.error('Generate clip error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate clip' },
      { status: 500 }
    );
  }
}
