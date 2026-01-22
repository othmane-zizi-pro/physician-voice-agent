import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RATE_LIMIT_SECONDS = 420; // 7 minutes

// GET: Check current usage
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";

  try {
    const { data, error } = await supabase.rpc("check_and_reset_usage", {
      p_ip_address: ip,
    });

    if (error) {
      console.error("Rate limit check error:", error);
      // Return permissive response on error
      return NextResponse.json({
        usedSeconds: 0,
        remainingSeconds: RATE_LIMIT_SECONDS,
        isLimited: false,
        windowStart: new Date().toISOString(),
      });
    }

    const result = data?.[0] || {
      used_seconds: 0,
      remaining_seconds: RATE_LIMIT_SECONDS,
      window_start: new Date().toISOString(),
    };

    return NextResponse.json({
      usedSeconds: result.used_seconds,
      remainingSeconds: result.remaining_seconds,
      isLimited: result.remaining_seconds <= 0,
      windowStart: result.window_start,
    });
  } catch (error) {
    console.error("Rate limit error:", error);
    return NextResponse.json({
      usedSeconds: 0,
      remainingSeconds: RATE_LIMIT_SECONDS,
      isLimited: false,
      windowStart: new Date().toISOString(),
    });
  }
}

// POST: Add usage time
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";

  try {
    const body = await request.json();
    const seconds = Math.max(0, Math.min(body.seconds || 0, 600)); // Cap at 10 minutes

    const { data, error } = await supabase.rpc("add_usage_time", {
      p_ip_address: ip,
      p_seconds: seconds,
    });

    if (error) {
      console.error("Rate limit update error:", error);
      return NextResponse.json({ error: "Failed to update usage" }, { status: 500 });
    }

    const result = data?.[0] || {
      used_seconds: seconds,
      remaining_seconds: RATE_LIMIT_SECONDS - seconds,
      is_limited: false,
    };

    return NextResponse.json({
      usedSeconds: result.used_seconds,
      remainingSeconds: result.remaining_seconds,
      isLimited: result.is_limited,
    });
  } catch (error) {
    console.error("Rate limit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
