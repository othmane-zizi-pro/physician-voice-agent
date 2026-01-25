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

    // Pre-filter to only include USER lines (exclude Doc's responses entirely)
    const userOnlyLines = transcript
      .split("\n")
      .filter((line: string) => line.startsWith("You:"))
      .map((line: string) => line.replace(/^You:\s*/, "").trim())
      .filter((line: string) => line.length > 10) // Skip very short utterances
      .join("\n");

    if (userOnlyLines.length < 50) {
      return NextResponse.json({ quote: null, reason: "Not enough user content" });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `You are an expert at finding powerful, quotable moments from healthcare workers venting about their experiences. Below are ONLY the user's statements (the AI's responses have been removed).

Extract a single compelling quote that captures the emotional truth of their experience with the healthcare system.

Rules:
- Choose something raw, honest, and relatable to other healthcare workers
- Keep it to 1-2 sentences max
- Rate frustration with the healthcare system on a scale of 0-10 (10 = extremely frustrated)
- Consider: complaints about insurance, admin burden, bureaucracy, burnout, pay, work-life balance

Respond ONLY with valid JSON in this exact format:
{"quote": "the extracted quote here", "frustration_score": 7}

If there's nothing quotable, respond with:
{"quote": null, "frustration_score": 0}

User statements:

${userOnlyLines}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text()?.trim();

    // Parse the JSON response
    let quote: string | null = null;
    let frustrationScore = 0;

    try {
      // Remove markdown code blocks if present
      const cleanJson = responseText.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      quote = parsed.quote;
      frustrationScore = parsed.frustration_score || 0;
    } catch {
      console.error("Failed to parse quote response:", responseText);
      return NextResponse.json({ quote: null, reason: "Failed to parse response" });
    }

    // Check if no quote was found
    if (!quote) {
      return NextResponse.json({ quote: null, reason: "No quotable content found" });
    }

    // Update the call record with the quote and frustration score
    const { error } = await supabase
      .from("calls")
      .update({ quotable_quote: quote, frustration_score: frustrationScore })
      .eq("id", callId);

    if (error) {
      console.error("Failed to update call with quote:", error);
      return NextResponse.json(
        { error: "Failed to save quote" },
        { status: 500 }
      );
    }

    return NextResponse.json({ quote, frustrationScore });
  } catch (error) {
    console.error("Quote extraction error:", error);
    return NextResponse.json(
      { error: "Failed to extract quote" },
      { status: 500 }
    );
  }
}
