import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  // Check admin authentication
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith("@meroka.com")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get total users count
    const { count: totalUsers } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true });

    // Get users created today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: newToday } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .gte("created_at", today.toISOString());

    // Get users created this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { count: newThisWeek } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekAgo.toISOString());

    // Get active users (users who had a conversation in the last 7 days)
    const { data: recentCalls } = await supabase
      .from("calls")
      .select("user_id")
      .gte("created_at", weekAgo.toISOString())
      .not("user_id", "is", null);

    const activeUserIds = new Set(recentCalls?.map((c) => c.user_id) || []);
    const activeUsersCount = activeUserIds.size;

    // Get users with AI memory enabled
    const { count: aiMemoryEnabled } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("ai_memory_enabled", true);

    // Get users by role type
    const { data: roleData } = await supabase
      .from("users")
      .select("role_type");

    const roleBreakdown: Record<string, number> = {
      physician: 0,
      nurse: 0,
      admin_staff: 0,
      other: 0,
      unspecified: 0,
    };
    roleData?.forEach((u) => {
      const role = u.role_type || "unspecified";
      roleBreakdown[role] = (roleBreakdown[role] || 0) + 1;
    });

    // Get users by workplace type
    const { data: workplaceData } = await supabase
      .from("users")
      .select("workplace_type");

    const workplaceBreakdown: Record<string, number> = {
      independent: 0,
      hospital: 0,
      other: 0,
      unspecified: 0,
    };
    workplaceData?.forEach((u) => {
      const workplace = u.workplace_type || "unspecified";
      workplaceBreakdown[workplace] = (workplaceBreakdown[workplace] || 0) + 1;
    });

    // Get users by auth provider
    const { data: authData } = await supabase
      .from("users")
      .select("auth_provider");

    const authBreakdown: Record<string, number> = {
      google: 0,
      email: 0,
    };
    authData?.forEach((u) => {
      authBreakdown[u.auth_provider] = (authBreakdown[u.auth_provider] || 0) + 1;
    });

    // Get users with verified emails
    const { count: verifiedUsers } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("email_verified", true);

    // Get geographic distribution (top countries)
    const { data: locationData } = await supabase
      .from("users")
      .select("country")
      .not("country", "is", null);

    const countryBreakdown: Record<string, number> = {};
    locationData?.forEach((u) => {
      if (u.country) {
        countryBreakdown[u.country] = (countryBreakdown[u.country] || 0) + 1;
      }
    });

    // Sort by count and take top 10
    const topCountries = Object.entries(countryBreakdown)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([country, count]) => ({ country, count }));

    return NextResponse.json({
      totalUsers: totalUsers || 0,
      newToday: newToday || 0,
      newThisWeek: newThisWeek || 0,
      activeUsers: activeUsersCount,
      aiMemoryEnabled: aiMemoryEnabled || 0,
      verifiedUsers: verifiedUsers || 0,
      roleBreakdown,
      workplaceBreakdown,
      authBreakdown,
      topCountries,
    });
  } catch (error) {
    console.error("Admin user stats error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
