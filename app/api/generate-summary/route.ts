import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { callId, userId, transcript } = await request.json();

    if (!callId || !userId || !transcript) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if user has AI memory enabled
    const { data: user } = await supabase
      .from("users")
      .select("ai_memory_enabled")
      .eq("id", userId)
      .single();

    if (!user?.ai_memory_enabled) {
      return NextResponse.json({
        skipped: true,
        reason: "AI memory disabled",
      });
    }

    // Check if summary already exists for this call
    const { data: existingSummary } = await supabase
      .from("conversation_summaries")
      .select("id")
      .eq("call_id", callId)
      .single();

    if (existingSummary) {
      return NextResponse.json({
        skipped: true,
        reason: "Summary already exists",
      });
    }

    // Generate summary using Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `You are analyzing a conversation between a healthcare worker and "Doc", an AI companion for venting about the healthcare system.

Analyze this conversation and extract:
1. A brief summary (2-3 sentences) capturing the main points and emotional tone
2. Key topics discussed (as a list of 2-5 short phrases)
3. The person's emotional state (choose ONE: frustrated, venting, seeking_advice, reflective, hopeful, overwhelmed)

Respond ONLY with valid JSON in this exact format:
{
  "summary": "Brief summary here",
  "key_topics": ["topic 1", "topic 2", "topic 3"],
  "emotional_state": "frustrated"
}

Conversation transcript:
${transcript}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text()?.trim();

    let summary: string;
    let keyTopics: string[] | null = null;
    let emotionalState: string | null = null;

    try {
      const cleanJson = responseText.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      summary = parsed.summary;
      keyTopics = parsed.key_topics;
      emotionalState = parsed.emotional_state;
    } catch {
      // If JSON parsing fails, use the response as the summary
      console.error("Failed to parse summary response:", responseText);
      summary = responseText.slice(0, 500);
    }

    // Save summary to database
    const { data: savedSummary, error: insertError } = await supabase
      .from("conversation_summaries")
      .insert({
        user_id: userId,
        call_id: callId,
        summary,
        key_topics: keyTopics,
        emotional_state: emotionalState as any,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to save summary:", insertError);
      return NextResponse.json(
        { error: "Failed to save summary" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      summary: savedSummary,
    });
  } catch (error) {
    console.error("Generate summary error:", error);
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 }
    );
  }
}
