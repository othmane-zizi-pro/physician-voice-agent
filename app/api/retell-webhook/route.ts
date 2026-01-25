import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface RetellWebhookPayload {
  event: 'call_started' | 'call_ended' | 'call_analyzed';
  call: {
    call_id: string;
    call_status: string;
    transcript?: string;
    recording_url?: string;
    recording_multi_channel_url?: string;
    start_timestamp?: number;
    end_timestamp?: number;
    metadata?: {
      user_id?: string;
      ip_address?: string;
    };
  };
}

export async function POST(request: NextRequest) {
  try {
    const payload: RetellWebhookPayload = await request.json();

    console.log('Retell webhook received:', payload.event, payload.call.call_id);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    if (payload.event === 'call_ended') {
      const { call } = payload;
      const durationMs = call.end_timestamp && call.start_timestamp
        ? call.end_timestamp - call.start_timestamp
        : null;

      // Try to update existing call first (client may have saved it already)
      const { data: existingCall } = await supabase
        .from('calls')
        .select('id')
        .eq('retell_call_id', call.call_id)
        .single();

      if (existingCall) {
        // Update existing record with recording URL
        const { error: updateError } = await supabase
          .from('calls')
          .update({
            recording_url: call.recording_url,
            duration_seconds: durationMs ? Math.round(durationMs / 1000) : undefined,
          })
          .eq('retell_call_id', call.call_id);

        if (updateError) {
          console.error('Failed to update call:', updateError);
        } else {
          console.log('Updated call with recording URL:', call.call_id);
        }
      } else {
        // Insert new record (webhook arrived before client save)
        const { error: insertError } = await supabase
          .from('calls')
          .insert({
            retell_call_id: call.call_id,
            transcript: call.transcript || '',
            recording_url: call.recording_url,
            duration_seconds: durationMs ? Math.round(durationMs / 1000) : null,
            user_id: call.metadata?.user_id || null,
            ip_address: call.metadata?.ip_address || null,
          });

        if (insertError) {
          console.error('Failed to insert call:', insertError);
        } else {
          console.log('Inserted new call from webhook:', call.call_id);
        }
      }

      // Trigger background tasks for logged-in users
      if (call.transcript && call.metadata?.user_id) {
        const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

        // Get the call ID from our database
        const { data: savedCall } = await supabase
          .from('calls')
          .select('id')
          .eq('retell_call_id', call.call_id)
          .single();

        if (savedCall) {
          // Generate summary in background
          fetch(`${baseUrl}/api/generate-summary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callId: savedCall.id,
              userId: call.metadata.user_id,
              transcript: call.transcript,
            }),
          }).catch(console.error);

          // Extract quote in background
          fetch(`${baseUrl}/api/extract-quote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callId: savedCall.id,
              transcript: call.transcript,
            }),
          }).catch(console.error);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Retell webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// Retell may send GET requests to verify the endpoint
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'retell-webhook' });
}
