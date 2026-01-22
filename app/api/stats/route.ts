import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    // Get today's call count
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count: todayCount } = await supabase
      .from("calls")
      .select("*", { count: "exact", head: true })
      .gte("created_at", today.toISOString());

    // Get total call count
    const { count: totalCount } = await supabase
      .from("calls")
      .select("*", { count: "exact", head: true });

    return NextResponse.json({
      todayCount: todayCount || 0,
      totalCount: totalCount || 0,
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json({ todayCount: 0, totalCount: 0 });
  }
}
