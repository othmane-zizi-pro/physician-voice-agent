import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function GET() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  try {
    // Fetch quotes with frustration score >= 6, or if no scores yet, just get quotes
    const { data: quotes, error } = await supabase
      .from("calls")
      .select("id, quotable_quote, city, region, frustration_score")
      .not("quotable_quote", "is", null)
      .gt("duration_seconds", 30) // Filter out very short calls
      .order("frustration_score", { ascending: false, nullsFirst: false })
      .limit(20); // Fetch more than needed to filter

    if (error) {
      console.error("Error fetching quotes:", error);
      return NextResponse.json({ error: "Failed to fetch quotes" }, { status: 500 });
    }

    // Filter to only quotes with frustration score >= 6, or all if none have scores
    let filteredQuotes = quotes?.filter(q => (q.frustration_score ?? 0) >= 6) || [];

    // If we don't have enough high-frustration quotes, include others
    if (filteredQuotes.length < 7 && quotes) {
      filteredQuotes = quotes.slice(0, 7);
    }

    // Shuffle and take 7
    const shuffled = filteredQuotes.sort(() => Math.random() - 0.5);
    const featured = shuffled.slice(0, 7).map(q => ({
      quote: q.quotable_quote,
      location: q.city && q.region ? `${q.city}, ${q.region}` : q.region || q.city || "Anonymous",
    }));

    return NextResponse.json({ quotes: featured });
  } catch (error) {
    console.error("Featured quotes error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
