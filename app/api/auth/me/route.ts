import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSession } from "@/lib/auth";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ user: null });
    }

    // Get fresh user data from database
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, name, avatar_url, email_verified, role_type, workplace_type, ai_memory_enabled, created_at")
      .eq("id", session.userId)
      .single();

    if (error || !user) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        emailVerified: user.email_verified,
        roleType: user.role_type,
        workplaceType: user.workplace_type,
        aiMemoryEnabled: user.ai_memory_enabled,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json({ user: null });
  }
}
