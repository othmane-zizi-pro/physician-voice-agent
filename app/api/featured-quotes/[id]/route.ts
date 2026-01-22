import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const getServiceClient = () => {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
};

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServiceClient();
  const { id } = await params;

  try {
    const { error } = await supabase
      .from("featured_quotes")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting featured quote:", error);
      return NextResponse.json({ error: "Failed to delete featured quote" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete featured quote error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
