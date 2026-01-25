import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSession } from "@/lib/auth";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// DELETE /api/user/conversations/[id] - Delete a conversation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check authentication
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if this is an admin (@meroka.com email)
    const isAdmin = session.email?.endsWith("@meroka.com") || false;

    // First, verify the conversation belongs to the user (unless admin)
    const { data: conversation, error: fetchError } = await supabase
      .from("calls")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (fetchError || !conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Check ownership (admins can delete any conversation)
    if (!isAdmin && conversation.user_id !== session.userId) {
      return NextResponse.json(
        { error: "You can only delete your own conversations" },
        { status: 403 }
      );
    }

    // Delete the conversation
    const { error: deleteError } = await supabase
      .from("calls")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("Failed to delete conversation:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete conversation" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete conversation error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
