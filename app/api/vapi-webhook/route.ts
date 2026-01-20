import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Vapi webhook payload types
interface VapiWebhookPayload {
  message: {
    type: string;
    call?: {
      id: string;
    };
    recordingUrl?: string;
    transcript?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const payload: VapiWebhookPayload = await request.json();

    // Only process end-of-call-report messages
    if (payload.message?.type !== "end-of-call-report") {
      return NextResponse.json({ received: true });
    }

    const vapiCallId = payload.message.call?.id;
    const recordingUrl = payload.message.recordingUrl;

    if (!vapiCallId) {
      console.error("Vapi webhook: Missing call ID");
      return NextResponse.json({ error: "Missing call ID" }, { status: 400 });
    }

    if (!recordingUrl) {
      console.log("Vapi webhook: No recording URL for call", vapiCallId);
      return NextResponse.json({ received: true, noRecording: true });
    }

    // Initialize Supabase client with service role for updates
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Vapi webhook: Missing Supabase credentials");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Update the call record with the recording URL
    const { data, error } = await supabase
      .from("calls")
      .update({ recording_url: recordingUrl })
      .eq("vapi_call_id", vapiCallId)
      .select("id")
      .single();

    if (error) {
      // Call might not exist yet if webhook arrives before client saves
      // This is expected in some race conditions
      console.log("Vapi webhook: Could not update call", vapiCallId, error.message);
      return NextResponse.json({ received: true, updated: false });
    }

    console.log("Vapi webhook: Updated call", data.id, "with recording URL");
    return NextResponse.json({ received: true, updated: true, callId: data.id });
  } catch (error) {
    console.error("Vapi webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Vapi may send GET requests to verify the endpoint
export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "vapi-webhook" });
}
