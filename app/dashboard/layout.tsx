"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { Home, MessageSquare, Settings, LogOut } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isLoading = status === "loading";
  const user = session?.user;

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/admin/login");
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-meroka-secondary flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-meroka-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-meroka-secondary">
      {/* Top navigation */}
      <nav className="bg-gray-900/50 border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <svg className="w-6 h-6 text-white" viewBox="0 0 100 100" fill="none">
                <path d="M50 12 L22 70 L35 70 L35 58 L50 58 L50 70 L78 70 Z" fill="currentColor" />
                <path d="M65 28 L82 70 L68 70 Z" fill="currentColor" />
                <path d="M10 64 Q20 64 28 64 L32 58 L38 70 L44 50 L50 78 L56 58 L62 64 Q75 64 90 64" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              <span className="text-white font-semibold">Doc</span>
            </Link>

            {/* Nav links */}
            <div className="flex items-center gap-1">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                <MessageSquare size={16} />
                <span className="hidden sm:inline">Conversations</span>
              </Link>
              <Link
                href="/dashboard/settings"
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                <Settings size={16} />
                <span className="hidden sm:inline">Settings</span>
              </Link>
            </div>

            {/* User menu */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2">
                {user.image ? (
                  <img src={user.image} alt="" className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-meroka-primary flex items-center justify-center text-white text-xs font-medium">
                    {(user.name || user.email || "U")[0].toUpperCase()}
                  </div>
                )}
                <span className="text-sm text-gray-300">{user.name || user.email?.split("@")[0]}</span>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
