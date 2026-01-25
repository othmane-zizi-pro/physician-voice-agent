// app/api/livekit-webhook/route.ts
// Receives webhooks from LiveKit Cloud for events like recording completion

import { NextRequest, NextResponse } from 'next/server';
import { WebhookReceiver } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      console.error('LiveKit credentials not configured');
      return NextResponse.json({ error: 'Not configured' }, { status: 500 });
    }

    const receiver = new WebhookReceiver(apiKey, apiSecret);

    // Get the raw body and authorization header
    const body = await request.text();
    const authHeader = request.headers.get('authorization') || '';

    // Verify and parse the webhook
    const event = await receiver.receive(body, authHeader);

    console.log('LiveKit webhook event:', event.event, event);

    // Handle different event types
    switch (event.event) {
      case 'egress_ended': {
        // Recording finished - save the URL to our database
        const egress = event.egressInfo;
        console.log('Egress ended event received:', JSON.stringify(egress, null, 2));

        if (egress && egress.roomName) {
          const roomName = egress.roomName;

          // Get the recording URL from file results
          let recordingUrl: string | null = null;

          if (egress.fileResults && egress.fileResults.length > 0) {
            const fileResult = egress.fileResults[0];
            console.log('File result:', JSON.stringify(fileResult, null, 2));

            // The location might be an S3 URI (s3://bucket/path) - convert to HTTPS URL
            let location = fileResult.location || fileResult.filename || null;

            if (location) {
              // Convert s3:// URI to https:// URL if needed
              if (location.startsWith('s3://')) {
                const s3Match = location.match(/^s3:\/\/([^/]+)\/(.+)$/);
                if (s3Match) {
                  const bucket = s3Match[1];
                  const key = s3Match[2];
                  const region = process.env.AWS_REGION || 'us-east-1';
                  location = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
                }
              }
              recordingUrl = location;
            }
          } else if (egress.streamResults && egress.streamResults.length > 0) {
            recordingUrl = egress.streamResults[0].url || null;
          }

          console.log(`Recording URL for room ${roomName}: ${recordingUrl}`);

          if (recordingUrl) {
            // Update the call record with the recording URL
            const { data, error } = await supabase
              .from('calls')
              .update({ recording_url: recordingUrl })
              .eq('livekit_room_name', roomName)
              .select('id');

            if (error) {
              console.error('Failed to update recording URL:', error);
            } else if (data && data.length > 0) {
              console.log(`Recording URL saved for room ${roomName}, call id: ${data[0].id}`);
            } else {
              console.warn(`No call found with livekit_room_name: ${roomName}`);
            }
          } else {
            console.warn('No recording URL found in egress results');
          }
        } else {
          console.warn('Egress ended but no room name in event');
        }
        break;
      }

      case 'room_finished': {
        // Room ended - could trigger any cleanup here
        console.log('Room finished:', event.room?.name);
        break;
      }

      case 'participant_left': {
        // Participant left the room
        console.log('Participant left:', event.participant?.identity, 'from room:', event.room?.name);
        break;
      }

      default:
        console.log('Unhandled LiveKit event:', event.event);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('LiveKit webhook error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
