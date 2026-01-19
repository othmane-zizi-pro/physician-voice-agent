import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function POST(request: NextRequest) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  try {
    const { callId, transcript } = await request.json();

    if (!callId || !transcript) {
      return NextResponse.json(
        { error: "Missing callId or transcript" },
        { status: 400 }
      );
    }

    // Skip if transcript is too short
    if (transcript.length < 100) {
      return NextResponse.json({ quote: null, reason: "Transcript too short" });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const prompt = `You are an expert at finding powerful, quotable moments from conversations between burnt-out physicians and an AI companion. Extract a single compelling quote that captures the emotional truth of their experience with the healthcare system.

Rules:
- Only extract quotes from the physician (lines starting with "You:")
- Choose something raw, honest, and relatable to other physicians
- Keep it to 1-2 sentences max
- Remove the "You:" prefix from the quote
- If there's nothing quotable, respond with just: NONE
- Only respond with the quote itself, no explanation or formatting

Extract the most powerful quote from this conversation:

${transcript}`;

    const result = await model.generateContent(prompt);
    const quote = result.response.text()?.trim();

    // Check if no quote was found
    if (!quote || quote === "NONE") {
      return NextResponse.json({ quote: null, reason: "No quotable content found" });
    }

    // Update the call record with the quote
    const { error } = await supabase
      .from("calls")
      .update({ quotable_quote: quote })
      .eq("id", callId);

    if (error) {
      console.error("Failed to update call with quote:", error);
      return NextResponse.json(
        { error: "Failed to save quote" },
        { status: 500 }
      );
    }

    return NextResponse.json({ quote });
  } catch (error) {
    console.error("Quote extraction error:", error);
    return NextResponse.json(
      { error: "Failed to extract quote" },
      { status: 500 }
    );
  }
}
