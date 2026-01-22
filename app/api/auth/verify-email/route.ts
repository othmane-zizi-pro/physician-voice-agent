import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");

    if (!token) {
      return NextResponse.redirect(new URL("/?error=invalid_token", request.url));
    }

    // Find user with this verification token
    const { data: user, error: findError } = await supabase
      .from("users")
      .select("id, verification_token_expires")
      .eq("verification_token", token)
      .single();

    if (findError || !user) {
      return NextResponse.redirect(new URL("/?error=invalid_token", request.url));
    }

    // Check if token has expired
    if (user.verification_token_expires && new Date(user.verification_token_expires) < new Date()) {
      return NextResponse.redirect(new URL("/?error=token_expired", request.url));
    }

    // Mark email as verified
    const { error: updateError } = await supabase
      .from("users")
      .update({
        email_verified: true,
        verification_token: null,
        verification_token_expires: null,
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("Failed to verify email:", updateError);
      return NextResponse.redirect(new URL("/?error=verification_failed", request.url));
    }

    // Redirect to home with success message
    return NextResponse.redirect(new URL("/?verified=true", request.url));
  } catch (error) {
    console.error("Email verification error:", error);
    return NextResponse.redirect(new URL("/?error=verification_failed", request.url));
  }
}
