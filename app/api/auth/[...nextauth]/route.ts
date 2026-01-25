import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Create supabase client for server-side auth operations
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      const email = user.email;
      if (!email) return false;

      // Allow all users to sign in with Google
      // Upsert user in our users table
      try {
        const { data: existingUser } = await supabase
          .from("users")
          .select("id")
          .eq("email", email)
          .single();

        if (existingUser) {
          // Update last login
          await supabase
            .from("users")
            .update({
              last_login_at: new Date().toISOString(),
              name: user.name || undefined,
              avatar_url: user.image || undefined,
            })
            .eq("id", existingUser.id);
        } else {
          // Create new user
          await supabase
            .from("users")
            .insert({
              email,
              name: user.name || null,
              avatar_url: user.image || null,
              auth_provider: "google",
              email_verified: true, // Google emails are verified
            });
        }
      } catch (error) {
        console.error("Error upserting user:", error);
        // Don't block sign in if DB upsert fails
      }

      return true;
    },
    async session({ session, token }) {
      // Add user ID from our database to the session
      if (session.user?.email) {
        try {
          const { data: dbUser } = await supabase
            .from("users")
            .select("id")
            .eq("email", session.user.email)
            .single();

          if (dbUser) {
            (session as any).userId = dbUser.id;
          }
        } catch (error) {
          console.error("Error fetching user ID:", error);
        }
      }
      return session;
    },
    async jwt({ token, user }) {
      // Persist user info in token
      if (user) {
        token.email = user.email;
      }
      return token;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});

export { handler as GET, handler as POST };
