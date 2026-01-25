import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  // Check admin authentication
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith("@meroka.com")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const roleType = searchParams.get("roleType");
    const workplaceType = searchParams.get("workplaceType");
    const sortBy = searchParams.get("sortBy") || "created_at";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from("users")
      .select("*", { count: "exact" });

    // Search filter
    if (search) {
      query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);
    }

    // Role type filter
    if (roleType && roleType !== "all") {
      query = query.eq("role_type", roleType as "physician" | "nurse" | "admin_staff" | "other");
    }

    // Workplace type filter
    if (workplaceType && workplaceType !== "all") {
      query = query.eq("workplace_type", workplaceType as "independent" | "hospital" | "other");
    }

    // Sorting
    const ascending = sortOrder === "asc";
    query = query.order(sortBy as any, { ascending });

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data: users, error, count } = await query;

    if (error) {
      console.error("Fetch users error:", error);
      return NextResponse.json(
        { error: "Failed to fetch users" },
        { status: 500 }
      );
    }

    // Get conversation counts for each user
    const userIds = users?.map((u) => u.id) || [];
    const { data: conversationCounts } = await supabase
      .from("calls")
      .select("user_id")
      .in("user_id", userIds);

    // Count conversations per user
    const countMap: Record<string, number> = {};
    conversationCounts?.forEach((c) => {
      if (c.user_id) {
        countMap[c.user_id] = (countMap[c.user_id] || 0) + 1;
      }
    });

    // Add conversation count to users
    const usersWithCounts = users?.map((u) => ({
      ...u,
      conversation_count: countMap[u.id] || 0,
    }));

    return NextResponse.json({
      users: usersWithCounts,
      total: count,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    console.error("Admin users error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
