import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSession } from "@/lib/auth";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Number of recent conversations to include in context
const CONTEXT_LIMIT = 3;

export async function GET() {
  try {
    // Check authentication
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ context: null });
    }

    // Check if user has AI memory enabled
    const { data: user } = await supabase
      .from("users")
      .select("ai_memory_enabled, name")
      .eq("id", session.userId)
      .single();

    if (!user?.ai_memory_enabled) {
      return NextResponse.json({ context: null, reason: "AI memory disabled" });
    }

    // Get last 3 conversation summaries
    const { data: summaries, error } = await supabase
      .from("conversation_summaries")
      .select("summary, key_topics, emotional_state, created_at")
      .eq("user_id", session.userId)
      .order("created_at", { ascending: false })
      .limit(CONTEXT_LIMIT);

    if (error || !summaries || summaries.length === 0) {
      return NextResponse.json({ context: null, reason: "No previous conversations" });
    }

    // Format context for the AI prompt
    const contextParts: string[] = [];

    // Add user name if available
    if (user.name) {
      contextParts.push(`The user's name is ${user.name}.`);
    }

    // Collect all topics and emotional states
    const allTopics = new Set<string>();
    const emotionalStates: string[] = [];

    summaries.forEach((s, index) => {
      if (s.key_topics) {
        s.key_topics.forEach((topic) => allTopics.add(topic));
      }
      if (s.emotional_state) {
        emotionalStates.push(s.emotional_state);
      }
    });

    // Add topics context
    if (allTopics.size > 0) {
      contextParts.push(`In recent conversations, they've discussed: ${Array.from(allTopics).slice(0, 8).join(", ")}.`);
    }

    // Add emotional pattern
    if (emotionalStates.length > 0) {
      const primaryState = emotionalStates[0]; // Most recent
      contextParts.push(`Their recent emotional state has been primarily ${primaryState}.`);
    }

    // Add most recent summary
    if (summaries[0]) {
      contextParts.push(`Last conversation summary: ${summaries[0].summary}`);
    }

    // Combine into final context
    const formattedContext = `
You're continuing a conversation with a returning user. Here's what you know about them from previous sessions:

${contextParts.join("\n")}

Use this context naturally - reference past conversations when relevant, but don't force it. If they mention something you discussed before, acknowledge it. Be warm and remember they're a returning visitor who trusts you.
`.trim();

    return NextResponse.json({
      context: formattedContext,
      summaryCount: summaries.length,
    });
  } catch (error) {
    console.error("Get AI context error:", error);
    return NextResponse.json({ context: null });
  }
}
