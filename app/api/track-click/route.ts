import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { linkType, linkUrl } = await request.json();

    // Get IP address
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

    // Get user agent
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Log the click
    await supabase.from("link_clicks").insert({
      link_type: linkType,
      link_url: linkUrl,
      ip_address: ip,
      user_agent: userAgent,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to track click:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
