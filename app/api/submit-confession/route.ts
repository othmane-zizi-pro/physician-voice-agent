import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getCurrentUserId } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

  // Get user ID if logged in (null for anonymous)
  const userId = await getCurrentUserId();

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  try {
    const { content, sessionType } = await request.json();

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid content" },
        { status: 400 }
      );
    }

    // Validate content length
    if (content.length < 1) {
      return NextResponse.json(
        { error: "Please write something" },
        { status: 400 }
      );
    }

    // Allow longer content for chat transcripts (50k chars), shorter for single messages (5k chars)
    const maxLength = sessionType === "chat" ? 50000 : 5000;
    if (content.length > maxLength) {
      return NextResponse.json(
        { error: `Content is too long. Please keep it under ${maxLength} characters.` },
        { status: 400 }
      );
    }

    // Get IP address from headers
    const forwarded = request.headers.get("x-forwarded-for");
    const ipAddress = forwarded ? forwarded.split(",")[0].trim() : "unknown";

    // Step 1: Create the confession record
    const { data: confessionData, error: insertError } = await supabase
      .from("calls")
      .insert({
        transcript: content,
        session_type: sessionType || "text", // "text" for single message, "chat" for full conversation
        ip_address: ipAddress,
        user_id: userId, // Link to user if logged in, null if anonymous
      })
      .select()
      .single();

    if (insertError || !confessionData) {
      console.error("Failed to insert confession:", insertError);
      return NextResponse.json(
        { error: "Failed to save confession" },
        { status: 500 }
      );
    }

    const callId = confessionData.id;

    // Step 2: Geolocate IP (non-blocking, don't fail if this fails)
    if (
      ipAddress !== "unknown" &&
      !ipAddress.startsWith("127.") &&
      !ipAddress.startsWith("192.168.") &&
      !ipAddress.startsWith("10.") &&
      ipAddress !== "::1"
    ) {
      try {
        const geoRes = await fetch(
          `http://ip-api.com/json/${ipAddress}?fields=status,city,regionName,country,lat,lon`
        );
        const geoData = await geoRes.json();

        if (geoData.status === "success") {
          await supabase
            .from("calls")
            .update({
              latitude: geoData.lat,
              longitude: geoData.lon,
              city: geoData.city,
              region: geoData.regionName,
              country: geoData.country,
            })
            .eq("id", callId);
        }
      } catch (geoError) {
        console.error("Geolocation failed (non-critical):", geoError);
      }
    }

    // Step 3: Extract quotable quote using Gemini
    let quote: string | null = null;
    let frustrationScore = 0;

    if (content.length >= 50) {
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `You are an expert at finding powerful, quotable moments from text confessions by burnt-out healthcare workers venting about the healthcare system.

Extract a single compelling quote that captures the emotional truth of their experience. This is written text (not a conversation transcript).

Rules:
- Choose something raw, honest, and relatable to other healthcare workers
- Keep it to 1-2 sentences max
- Clean up any typos or grammatical errors in the quote
- Rate frustration with the healthcare system on a scale of 0-10 (10 = extremely frustrated)
- Consider: complaints about insurance, admin burden, bureaucracy, burnout, pay, work-life balance, patient care challenges

Respond ONLY with valid JSON in this exact format:
{"quote": "the extracted quote here", "frustration_score": 7}

If there's nothing quotable or it's too short/incoherent, respond with:
{"quote": null, "frustration_score": 0}

Extract from this confession:

${content}`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text()?.trim();

        try {
          const cleanJson = responseText.replace(/```json\n?|\n?```/g, "").trim();
          const parsed = JSON.parse(cleanJson);
          quote = parsed.quote;
          frustrationScore = parsed.frustration_score || 0;

          // Update the record with quote and frustration score
          if (quote || frustrationScore > 0) {
            await supabase
              .from("calls")
              .update({
                quotable_quote: quote,
                frustration_score: frustrationScore,
              })
              .eq("id", callId);
          }
        } catch {
          console.error("Failed to parse quote response:", responseText);
        }
      } catch (quoteError) {
        console.error("Quote extraction failed (non-critical):", quoteError);
      }
    }

    // Step 4: Generate summary for AI context (only for logged-in users)
    if (userId && content.length >= 50) {
      try {
        // Fire and forget - don't block the response
        fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/generate-summary`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callId,
            userId,
            transcript: content,
          }),
        }).catch((err) => {
          console.error("Summary generation failed (non-critical):", err);
        });
      } catch (summaryError) {
        console.error("Summary generation failed (non-critical):", summaryError);
      }
    }

    return NextResponse.json({
      callId,
      quote,
      frustrationScore,
    });
  } catch (error) {
    console.error("Submit confession error:", error);
    return NextResponse.json(
      { error: "Failed to submit confession" },
      { status: 500 }
    );
  }
}
