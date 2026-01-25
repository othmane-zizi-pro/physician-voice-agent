import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSession, verifyPassword } from "@/lib/auth";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;
    const { password, confirmation } = await request.json();

    // Require confirmation text
    if (confirmation !== "DELETE MY ACCOUNT") {
      return NextResponse.json(
        { error: "Please type 'DELETE MY ACCOUNT' to confirm" },
        { status: 400 }
      );
    }

    // Get user to verify password (for email auth)
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("auth_provider, password_hash")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // For email auth, verify password
    if (user.auth_provider === "email") {
      if (!password) {
        return NextResponse.json(
          { error: "Password is required to delete your account" },
          { status: 400 }
        );
      }

      if (!user.password_hash) {
        return NextResponse.json({ error: "Invalid account state" }, { status: 500 });
      }

      const isValid = await verifyPassword(password, user.password_hash);
      if (!isValid) {
        return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
      }
    }

    // Delete all user data in order (respecting foreign key constraints)
    // 1. Delete conversation summaries
    await supabase
      .from("conversation_summaries")
      .delete()
      .eq("user_id", userId);

    // 2. Update calls to remove user_id (keep anonymous for analytics)
    await supabase
      .from("calls")
      .update({ user_id: null })
      .eq("user_id", userId);

    // 3. Delete user account
    const { error: deleteError } = await supabase
      .from("users")
      .delete()
      .eq("id", userId);

    if (deleteError) {
      console.error("Delete user error:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete account" },
        { status: 500 }
      );
    }

    // Clear session cookie
    const cookieStore = await cookies();
    cookieStore.delete("session");

    return NextResponse.json({
      success: true,
      message: "Your account and all associated data have been permanently deleted.",
    });
  } catch (error) {
    console.error("Delete account error:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
