import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { pagePath, referrer, utmSource, utmMedium, utmCampaign } = await request.json();

    // Get IP address
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

    // Get user agent
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Log the visit
    await supabase.from("page_visits").insert({
      page_path: pagePath,
      ip_address: ip,
      user_agent: userAgent,
      referrer: referrer || null,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to track visit:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
