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
  parseLiveKitIntoExchanges,
  sliceRecording,
  generateVideo,
} from '@/lib/clipUtils';

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
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

    // Fetch the call from our database
    const { data: call, error: callError } = await supabase
      .from('calls')
      .select('user_id, recording_url, transcript_object, livekit_room_name')
      .eq('id', callId)
      .single();

    if (callError || !call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    if (call.user_id !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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

    // Create work directory
    workDir = join(tmpdir(), `clip-${randomUUID()}`);
    await mkdir(workDir, { recursive: true });

    const paths = {
      slicedAudio: join(workDir, 'audio.m4a'),
      chatImage: join(workDir, 'chat.png'),
      outputVideo: join(workDir, 'output.mp4'),
    };

    // Slice the recording to get just this exchange
    await sliceRecording(
      call.recording_url,
      exchange.startSeconds,
      exchange.endSeconds,
      paths.slicedAudio
    );

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

    // Generate video with single audio track
    await generateVideo(
      paths.chatImage,
      [paths.slicedAudio],
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
    if (workDir) {
      try {
        await rm(workDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
