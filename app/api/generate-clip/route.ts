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
  fetchVapiCallDetails,
  parseVapiMessagesIntoExchanges,
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

    // Fetch the call from our database to get vapi_call_id and verify ownership
    const { data: call, error: callError } = await supabase
      .from('calls')
      .select('vapi_call_id, user_id, recording_url')
      .eq('id', callId)
      .single();

    if (callError || !call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    if (call.user_id !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!call.vapi_call_id) {
      return NextResponse.json(
        { error: 'Call has no VAPI ID (text-only session?)' },
        { status: 400 }
      );
    }

    // Fetch timestamped transcript from VAPI
    const vapiDetails = await fetchVapiCallDetails(call.vapi_call_id);

    if (
      !vapiDetails.artifact?.messages ||
      vapiDetails.artifact.messages.length === 0
    ) {
      return NextResponse.json(
        { error: 'No transcript available from VAPI' },
        { status: 400 }
      );
    }

    // Get recording URL - prefer from VAPI response, fallback to our stored URL
    const recordingUrl =
      vapiDetails.artifact?.recordingUrl || call.recording_url;
    if (!recordingUrl) {
      return NextResponse.json(
        { error: 'No recording available for this call' },
        { status: 400 }
      );
    }

    // Parse into timed exchanges
    const exchanges = parseVapiMessagesIntoExchanges(
      vapiDetails.artifact.messages
    );
    const exchange = exchanges[exchangeIndex];

    if (!exchange) {
      return NextResponse.json(
        { error: `Exchange ${exchangeIndex} not found` },
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
      recordingUrl,
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
      [paths.slicedAudio], // Now just one audio file
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
