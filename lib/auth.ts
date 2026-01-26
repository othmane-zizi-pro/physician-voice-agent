import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify, JWTPayload } from "jose";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import type { User } from "@/types/database";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);

const SESSION_COOKIE_NAME = "doc_session";
const SESSION_DURATION_DAYS = 365;

export interface SessionPayload extends JWTPayload {
  userId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

// Password hashing
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// JWT token management
export async function createSessionToken(user: User): Promise<string> {
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatar_url,
  };

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_DAYS}d`)
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

// Cookie management
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
    path: "/",
  });
}

export async function getSessionCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value || null;
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

// Get current session from cookie (checks both custom auth and NextAuth)
export async function getSession(): Promise<SessionPayload | null> {
  // First check custom auth cookie
  const token = await getSessionCookie();
  if (token) {
    const session = await verifySessionToken(token);
    if (session) return session;
  }

  // Fall back to NextAuth session (for all users now)
  try {
    const nextAuthSession = await getServerSession();
    if (nextAuthSession?.user?.email) {
      // Look up the user ID from the database
      // (getServerSession without authOptions doesn't run the session callback)
      let userId: string | null = null;
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data: dbUser } = await supabase
          .from("users")
          .select("id")
          .eq("email", nextAuthSession.user.email)
          .single();
        userId = dbUser?.id || null;
      } catch {
        // DB lookup failed - userId will be null
      }

      // Only return session if we have a valid UUID
      if (userId) {
        return {
          userId,
          email: nextAuthSession.user.email,
          name: nextAuthSession.user.name || null,
          avatarUrl: nextAuthSession.user.image || null,
        };
      }
    }
  } catch {
    // NextAuth not available or error - ignore
  }

  return null;
}

// Generate random token for email verification / password reset
export function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Email validation
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Password validation (minimum 8 characters)
export function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

// Get user ID from current session (for API routes)
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.userId || null;
}
