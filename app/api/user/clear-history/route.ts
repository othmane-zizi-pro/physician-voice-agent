import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSession } from "@/lib/auth";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function DELETE() {
  try {
    // Check authentication
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;

    // Delete all conversation summaries
    const { error: summaryError } = await supabase
      .from("conversation_summaries")
      .delete()
      .eq("user_id", userId);

    if (summaryError) {
      console.error("Clear summaries error:", summaryError);
    }

    // Count calls before clearing
    const { count } = await supabase
      .from("calls")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    // Remove user_id from all calls (keep anonymous data for analytics)
    const { error: callsError } = await supabase
      .from("calls")
      .update({ user_id: null })
      .eq("user_id", userId);

    if (callsError) {
      console.error("Clear calls error:", callsError);
      return NextResponse.json(
        { error: "Failed to clear conversation history" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Your conversation history has been cleared.",
      clearedCount: count || 0,
    });
  } catch (error) {
    console.error("Clear history error:", error);
    return NextResponse.json(
      { error: "Failed to clear conversation history" },
      { status: 500 }
    );
  }
}
