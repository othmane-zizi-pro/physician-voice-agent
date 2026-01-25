import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSession } from "@/lib/auth";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // Check authentication
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;

    // Fetch all user data
    const [userResult, conversationsResult, summariesResult] = await Promise.all([
      // User profile
      supabase
        .from("users")
        .select("id, email, name, avatar_url, auth_provider, email_verified, role_type, workplace_type, city, region, country, ai_memory_enabled, created_at, last_login_at")
        .eq("id", userId)
        .single(),
      // All conversations
      supabase
        .from("calls")
        .select("id, transcript, quotable_quote, frustration_score, duration_seconds, session_type, city, region, country, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      // All conversation summaries
      supabase
        .from("conversation_summaries")
        .select("id, summary, key_topics, emotional_state, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);

    if (userResult.error) {
      console.error("Export user data error:", userResult.error);
      return NextResponse.json({ error: "Failed to export data" }, { status: 500 });
    }

    // Compile export data
    const exportData = {
      exportedAt: new Date().toISOString(),
      profile: userResult.data,
      conversations: conversationsResult.data || [],
      conversationSummaries: summariesResult.data || [],
      statistics: {
        totalConversations: conversationsResult.data?.length || 0,
        voiceConversations: conversationsResult.data?.filter((c) => c.session_type !== "text").length || 0,
        textConversations: conversationsResult.data?.filter((c) => c.session_type === "text").length || 0,
        totalSummaries: summariesResult.data?.length || 0,
      },
    };

    // Return as downloadable JSON
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="doc-data-export-${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  } catch (error) {
    console.error("Export data error:", error);
    return NextResponse.json({ error: "Failed to export data" }, { status: 500 });
  }
}
