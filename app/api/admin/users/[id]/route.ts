import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await params;
  // Check admin authentication
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith("@meroka.com")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get user details
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get conversation count
    const { count: conversationCount } = await supabase
      .from("calls")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    // Get summary count
    const { count: summaryCount } = await supabase
      .from("conversation_summaries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    // Get average frustration score
    const { data: frustrationData } = await supabase
      .from("calls")
      .select("frustration_score")
      .eq("user_id", userId)
      .not("frustration_score", "is", null);

    const avgFrustration =
      frustrationData && frustrationData.length > 0
        ? frustrationData.reduce((sum, c) => sum + (c.frustration_score || 0), 0) /
          frustrationData.length
        : null;

    // Get last conversation date
    const { data: lastCall } = await supabase
      .from("calls")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      user: {
        ...user,
        conversation_count: conversationCount || 0,
        summary_count: summaryCount || 0,
        avg_frustration_score: avgFrustration ? Math.round(avgFrustration * 10) / 10 : null,
        last_conversation_at: lastCall?.created_at || null,
      },
    });
  } catch (error) {
    console.error("Admin user detail error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
