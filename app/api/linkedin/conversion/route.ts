import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LINKEDIN_ACCESS_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN;
const LINKEDIN_CONVERSION_RULE_ID = process.env.LINKEDIN_CONVERSION_RULE_ID;

interface ConversionRequest {
  eventType?: string;
  liFatId?: string | null;
  callId?: string | null;
  pageUrl?: string;
  referrer?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ConversionRequest = await request.json();
    const { eventType = "call_started", liFatId, callId, pageUrl, referrer } = body;

    // Get IP address and user agent
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    let linkedinResponseStatus: number | null = null;
    let linkedinResponseBody: Record<string, unknown> | null = null;
    let success = false;

    // Only call LinkedIn API if we have the required config and a li_fat_id
    if (LINKEDIN_ACCESS_TOKEN && LINKEDIN_CONVERSION_RULE_ID && liFatId) {
      try {
        const conversionPayload = {
          conversion: `urn:lla:llaPartnerConversion:${LINKEDIN_CONVERSION_RULE_ID}`,
          conversionHappenedAt: Date.now(),
          user: {
            userIds: [
              {
                idType: "LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID",
                idValue: liFatId,
              },
            ],
          },
        };

        const linkedinResponse = await fetch(
          "https://api.linkedin.com/rest/conversionEvents",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
              "LinkedIn-Version": "202401",
            },
            body: JSON.stringify(conversionPayload),
          }
        );

        linkedinResponseStatus = linkedinResponse.status;

        // Try to parse response body
        try {
          linkedinResponseBody = await linkedinResponse.json();
        } catch {
          linkedinResponseBody = { raw: await linkedinResponse.text() };
        }

        success = linkedinResponse.ok;

        if (!success) {
          console.error("LinkedIn API error:", linkedinResponseStatus, linkedinResponseBody);
        }
      } catch (apiError) {
        console.error("LinkedIn API call failed:", apiError);
        linkedinResponseBody = { error: String(apiError) };
      }
    } else if (!liFatId) {
      // No li_fat_id means user didn't come from LinkedIn ad
      // Still log the event for tracking purposes
      linkedinResponseBody = { skipped: "no_li_fat_id" };
    } else {
      // Missing configuration
      linkedinResponseBody = { skipped: "missing_config" };
    }

    // Store the conversion attempt in our database
    const { error: dbError } = await supabase.from("linkedin_conversions").insert({
      event_type: eventType,
      li_fat_id: liFatId || null,
      ip_address: ip,
      user_agent: userAgent,
      linkedin_response_status: linkedinResponseStatus,
      linkedin_response_body: linkedinResponseBody,
      success,
      call_id: callId || null,
      page_url: pageUrl || null,
      referrer: referrer || null,
    });

    if (dbError) {
      console.error("Failed to store LinkedIn conversion:", dbError);
    }

    return NextResponse.json({ success, liFatId: !!liFatId });
  } catch (error) {
    console.error("LinkedIn conversion tracking error:", error);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
