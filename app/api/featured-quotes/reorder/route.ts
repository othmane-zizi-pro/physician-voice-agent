import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const getServiceClient = () => {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
};

export async function PATCH(request: NextRequest) {
  const supabase = getServiceClient();

  try {
    const body = await request.json();
    const { orderedIds } = body as { orderedIds: string[] };

    if (!orderedIds || !Array.isArray(orderedIds)) {
      return NextResponse.json(
        { error: "orderedIds array is required" },
        { status: 400 }
      );
    }

    // Update each quote's display_order based on position in array
    const updates = orderedIds.map((id, index) => ({
      id,
      display_order: index + 1,
      updated_at: new Date().toISOString(),
    }));

    // Perform updates in a batch
    for (const update of updates) {
      const { error } = await supabase
        .from("featured_quotes")
        .update({
          display_order: update.display_order,
          updated_at: update.updated_at,
        })
        .eq("id", update.id);

      if (error) {
        console.error("Error updating quote order:", error);
        return NextResponse.json(
          { error: "Failed to update quote order" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reorder error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
