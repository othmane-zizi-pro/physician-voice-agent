import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  verifyPassword,
  isValidEmail,
  createSessionToken,
  setSessionCookie,
} from "@/lib/auth";
import {
  checkRateLimit,
  checkLockout,
  recordFailedLogin,
  clearFailedLogins,
} from "@/lib/rateLimit";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Get IP for rate limiting
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

    // Check rate limit
    const rateLimit = checkRateLimit(ip, "login");
    if (rateLimit.isLimited) {
      return NextResponse.json(
        { error: `Too many login attempts. Please try again in ${Math.ceil(rateLimit.retryAfter / 60)} minutes.` },
        { status: 429 }
      );
    }

    const { email, password } = await request.json();

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

    // Check if account is locked out
    const lockout = checkLockout(email.toLowerCase());
    if (lockout.isLocked) {
      return NextResponse.json(
        { error: `Account temporarily locked. Please try again in ${Math.ceil(lockout.lockoutRemaining / 60)} minutes.` },
        { status: 423 }
      );
    }

    // Find user
    const { data: user, error: findError } = await supabase
      .from("users")
      .select("*")
      .eq("email", email.toLowerCase())
      .single();

    if (findError || !user) {
      // Record failed attempt
      const failedResult = recordFailedLogin(email.toLowerCase());
      if (failedResult.isLocked) {
        return NextResponse.json(
          { error: `Too many failed attempts. Account locked for ${Math.ceil(failedResult.lockoutRemaining / 60)} minutes.` },
          { status: 423 }
        );
      }
      return NextResponse.json(
        { error: `Invalid email or password. ${failedResult.attemptsRemaining} attempts remaining.` },
        { status: 401 }
      );
    }

    // Check if user registered with Google
    if (user.auth_provider === "google") {
      return NextResponse.json(
        { error: "This account uses Google sign-in. Please sign in with Google." },
        { status: 400 }
      );
    }

    // Verify password
    if (!user.password_hash) {
      // Record failed attempt
      const failedResult = recordFailedLogin(email.toLowerCase());
      if (failedResult.isLocked) {
        return NextResponse.json(
          { error: `Too many failed attempts. Account locked for ${Math.ceil(failedResult.lockoutRemaining / 60)} minutes.` },
          { status: 423 }
        );
      }
      return NextResponse.json(
        { error: `Invalid email or password. ${failedResult.attemptsRemaining} attempts remaining.` },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      // Record failed attempt
      const failedResult = recordFailedLogin(email.toLowerCase());
      if (failedResult.isLocked) {
        return NextResponse.json(
          { error: `Too many failed attempts. Account locked for ${Math.ceil(failedResult.lockoutRemaining / 60)} minutes.` },
          { status: 423 }
        );
      }
      return NextResponse.json(
        { error: `Invalid email or password. ${failedResult.attemptsRemaining} attempts remaining.` },
        { status: 401 }
      );
    }

    // Clear failed login attempts on success
    clearFailedLogins(email.toLowerCase());

    // Update last login
    await supabase
      .from("users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id);

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
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
