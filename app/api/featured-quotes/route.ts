import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Service role client for admin operations
const getServiceClient = () => {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
};

// Anon client for public reads
const getAnonClient = () => {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
};

export async function GET() {
  const supabase = getAnonClient();

  try {
    // First, try to get curated featured quotes
    const { data: curatedQuotes, error: curatedError } = await supabase
      .from("featured_quotes")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .limit(7);

    // If we have at least 7 curated quotes, use those
    if (!curatedError && curatedQuotes && curatedQuotes.length >= 7) {
      const featured = curatedQuotes.map(q => ({
        id: q.id,
        quote: q.quote,
        location: q.location || "Anonymous",
      }));
      return NextResponse.json({ quotes: featured });
    }

    // Otherwise, fall back to the old behavior (random high-frustration quotes)
    const { data: quotes, error } = await supabase
      .from("calls")
      .select("id, quotable_quote, city, region, frustration_score")
      .not("quotable_quote", "is", null)
      .gt("duration_seconds", 30)
      .order("frustration_score", { ascending: false, nullsFirst: false })
      .limit(20);

    if (error) {
      console.error("Error fetching quotes:", error);
      return NextResponse.json({ error: "Failed to fetch quotes" }, { status: 500 });
    }

    // Start with curated quotes if any
    const curatedList = (curatedQuotes || []).map(q => ({
      id: q.id,
      quote: q.quote,
      location: q.location || "Anonymous",
    }));

    // Filter to high-frustration quotes
    let filteredQuotes = quotes?.filter(q => (q.frustration_score ?? 0) >= 6) || [];

    if (filteredQuotes.length < 7 - curatedList.length && quotes) {
      filteredQuotes = quotes.slice(0, 7 - curatedList.length);
    }

    // Shuffle and take remaining needed
    const shuffled = filteredQuotes.sort(() => Math.random() - 0.5);
    const fromCalls = shuffled.slice(0, 7 - curatedList.length).map(q => ({
      id: `call-${q.id}`,
      quote: q.quotable_quote,
      location: q.city && q.region ? `${q.city}, ${q.region}` : q.region || q.city || "Anonymous",
    }));

    // Combine: curated first, then random
    const featured = [...curatedList, ...fromCalls].slice(0, 7);

    return NextResponse.json({ quotes: featured });
  } catch (error) {
    console.error("Featured quotes error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: Add a quote to featured list
export async function POST(request: NextRequest) {
  const supabase = getServiceClient();

  try {
    const body = await request.json();
    const { call_id, quote, location } = body;

    if (!quote) {
      return NextResponse.json({ error: "Quote is required" }, { status: 400 });
    }

    // Get all existing quotes to shift them down
    const { data: existingQuotes } = await supabase
      .from("featured_quotes")
      .select("id, display_order")
      .order("display_order", { ascending: true });

    // Shift all existing quotes down by 1 to make room at the top
    if (existingQuotes && existingQuotes.length > 0) {
      for (const q of existingQuotes) {
        await supabase
          .from("featured_quotes")
          .update({ display_order: q.display_order + 1 })
          .eq("id", q.id);
      }
    }

    // Insert the new featured quote at position 1 (top)
    const { data, error } = await supabase
      .from("featured_quotes")
      .insert({
        call_id,
        quote,
        location: location || null,
        display_order: 1,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error adding featured quote:", error);
      return NextResponse.json({ error: "Failed to add featured quote" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Add featured quote error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
