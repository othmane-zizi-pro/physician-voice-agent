import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSession } from "@/lib/auth";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET user settings
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, name, avatar_url, role_type, workplace_type, ai_memory_enabled, created_at")
      .eq("id", session.userId)
      .single();

    if (error || !user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Get settings error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}

// PATCH update user settings
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, roleType, workplaceType, aiMemoryEnabled } = body;

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updates.name = name;
    if (roleType !== undefined) updates.role_type = roleType;
    if (workplaceType !== undefined) updates.workplace_type = workplaceType;
    if (aiMemoryEnabled !== undefined) updates.ai_memory_enabled = aiMemoryEnabled;

    const { data: user, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", session.userId)
      .select("id, email, name, avatar_url, role_type, workplace_type, ai_memory_enabled")
      .single();

    if (error) {
      console.error("Failed to update settings:", error);
      return NextResponse.json(
        { error: "Failed to update settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Update settings error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
