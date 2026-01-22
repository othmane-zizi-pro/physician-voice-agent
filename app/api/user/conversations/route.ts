import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSession } from "@/lib/auth";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get query params for filtering
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type"); // 'voice' | 'text' | null (all)
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Build query
    let query = supabase
      .from("calls")
      .select("id, transcript, quotable_quote, frustration_score, recording_url, duration_seconds, session_type, created_at, city, region, country")
      .eq("user_id", session.userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by session type if specified
    if (type === "voice" || type === "text") {
      query = query.eq("session_type", type);
    }

    const { data: conversations, error } = await query;

    if (error) {
      console.error("Failed to fetch conversations:", error);
      return NextResponse.json(
        { error: "Failed to fetch conversations" },
        { status: 500 }
      );
    }

    // Get total count for pagination
    let countQuery = supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("user_id", session.userId);

    if (type === "voice" || type === "text") {
      countQuery = countQuery.eq("session_type", type);
    }

    const { count } = await countQuery;

    return NextResponse.json({
      conversations: conversations || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Get conversations error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
