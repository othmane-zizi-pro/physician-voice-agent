import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database, User } from "@/types/database";
import { createSessionToken, setSessionCookie } from "@/lib/auth";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Handle Google OAuth callback
export async function POST(request: NextRequest) {
  try {
    const { credential } = await request.json();

    if (!credential) {
      return NextResponse.json(
        { error: "No credential provided" },
        { status: 400 }
      );
    }

    // Decode the JWT credential from Google
    // The credential is a JWT from Google Identity Services
    const parts = credential.split(".");
    if (parts.length !== 3) {
      return NextResponse.json(
        { error: "Invalid credential format" },
        { status: 400 }
      );
    }

    const payload = JSON.parse(
      Buffer.from(parts[1], "base64").toString("utf-8")
    );

    const { email, name, picture, sub: googleId } = payload;

    if (!email) {
      return NextResponse.json(
        { error: "Email not provided by Google" },
        { status: 400 }
      );
    }

    // Check if user exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("*")
      .eq("email", email.toLowerCase())
      .single();

    let user: User;

    if (existingUser) {
      // User exists - update last login and avatar if needed
      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update({
          last_login_at: new Date().toISOString(),
          avatar_url: picture || existingUser.avatar_url,
          name: name || existingUser.name,
        })
        .eq("id", existingUser.id)
        .select()
        .single();

      if (updateError) {
        console.error("Failed to update user:", updateError);
        return NextResponse.json(
          { error: "Failed to sign in" },
          { status: 500 }
        );
      }

      user = updatedUser;
    } else {
      // Create new user
      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert({
          email: email.toLowerCase(),
          name: name || null,
          avatar_url: picture || null,
          auth_provider: "google",
          email_verified: true, // Google accounts are pre-verified
        })
        .select()
        .single();

      if (insertError || !newUser) {
        console.error("Failed to create user:", insertError);
        return NextResponse.json(
          { error: "Failed to create account" },
          { status: 500 }
        );
      }

      user = newUser;

      // Get IP for geolocation
      const forwarded = request.headers.get("x-forwarded-for");
      const ipAddress = forwarded ? forwarded.split(",")[0].trim() : null;

      // Geolocate IP in background (non-blocking)
      if (ipAddress && !ipAddress.startsWith("127.") && !ipAddress.startsWith("192.168.") && ipAddress !== "::1") {
        fetch(`http://ip-api.com/json/${ipAddress}?fields=status,city,regionName,country`)
          .then((res) => res.json())
          .then((geoData) => {
            if (geoData.status === "success") {
              supabase
                .from("users")
                .update({
                  city: geoData.city,
                  region: geoData.regionName,
                  country: geoData.country,
                })
                .eq("id", user.id)
                .then(() => {});
            }
          })
          .catch(() => {});
      }
    }

    // Create session token and set cookie
    const sessionToken = await createSessionToken(user);
    await setSessionCookie(sessionToken);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        emailVerified: user.email_verified,
      },
    });
  } catch (error) {
    console.error("Google auth error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
