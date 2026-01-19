import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { callId, ipAddress } = await request.json();

    if (!callId || !ipAddress) {
      return NextResponse.json(
        { error: "Missing callId or ipAddress" },
        { status: 400 }
      );
    }

    // Skip localhost/private IPs
    if (
      ipAddress === "unknown" ||
      ipAddress.startsWith("127.") ||
      ipAddress.startsWith("192.168.") ||
      ipAddress.startsWith("10.") ||
      ipAddress === "::1"
    ) {
      return NextResponse.json({ skipped: true, reason: "Private IP" });
    }

    // Use ip-api.com (free, no API key needed, 45 requests/minute)
    const geoRes = await fetch(`http://ip-api.com/json/${ipAddress}?fields=status,city,regionName,country,lat,lon`);
    const geoData = await geoRes.json();

    if (geoData.status !== "success") {
      return NextResponse.json({ error: "Geolocation failed" }, { status: 500 });
    }

    // Update the call record with geolocation
    const { error } = await supabase
      .from("calls")
      .update({
        latitude: geoData.lat,
        longitude: geoData.lon,
        city: geoData.city,
        region: geoData.regionName,
        country: geoData.country,
      })
      .eq("id", callId);

    if (error) {
      console.error("Failed to update call with geolocation:", error);
      return NextResponse.json({ error: "Failed to save geolocation" }, { status: 500 });
    }

    return NextResponse.json({
      latitude: geoData.lat,
      longitude: geoData.lon,
      city: geoData.city,
      region: geoData.regionName,
      country: geoData.country,
    });
  } catch (error) {
    console.error("Geolocation error:", error);
    return NextResponse.json({ error: "Geolocation failed" }, { status: 500 });
  }
}
