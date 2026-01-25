// app/api/calls/update/route.ts
// Server-side API to update call records (bypasses RLS with service role key)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { callId, transcript, transcriptObject, durationSeconds } = await request.json();

    if (!callId) {
      return NextResponse.json({ error: 'Call ID is required' }, { status: 400 });
    }

    console.log('Updating call record:', {
      callId,
      durationSeconds,
      transcriptLength: transcript?.length || 0,
      transcriptObjectEntries: transcriptObject?.length || 0,
    });

    const { data, error } = await supabase
      .from('calls')
      .update({
        transcript: transcript || null,
        transcript_object: transcriptObject || null,
        duration_seconds: durationSeconds || null,
      })
      .eq('id', callId)
      .select();

    if (error) {
      console.error('Failed to update call record:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('Call record updated successfully:', data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Update call error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update call' },
      { status: 500 }
    );
  }
}
