import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  hashPassword,
  isValidEmail,
  isValidPassword,
  generateToken,
  createSessionToken,
  setSessionCookie,
} from "@/lib/auth";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json();

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    if (!isValidPassword(password)) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id, auth_provider")
      .eq("email", email.toLowerCase())
      .single();

    if (existingUser) {
      if (existingUser.auth_provider === "google") {
        return NextResponse.json(
          { error: "This email is registered with Google. Please sign in with Google." },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate verification token
    const verificationToken = generateToken();
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    // Get IP for geolocation
    const forwarded = request.headers.get("x-forwarded-for");
    const ipAddress = forwarded ? forwarded.split(",")[0].trim() : null;

    // Create user
    const { data: user, error: insertError } = await supabase
      .from("users")
      .insert({
        email: email.toLowerCase(),
        name: name || null,
        auth_provider: "email",
        password_hash: passwordHash,
        email_verified: false,
        verification_token: verificationToken,
        verification_token_expires: verificationTokenExpires,
      })
      .select()
      .single();

    if (insertError || !user) {
      console.error("Failed to create user:", insertError);
      return NextResponse.json(
        { error: "Failed to create account" },
        { status: 500 }
      );
    }

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

    // TODO: Send verification email
    // For now, we'll log the verification link
    console.log(`Verification link for ${email}: /api/auth/verify-email?token=${verificationToken}`);

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
      message: "Account created. Please check your email to verify your account.",
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
