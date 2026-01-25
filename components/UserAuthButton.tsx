"use client";

import { useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { User, LogOut, History, ChevronDown } from "lucide-react";

export default function UserAuthButton() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);

  if (status === "loading") {
    return (
      <div className="w-8 h-8 rounded-full bg-brand-neutral-100 animate-pulse" />
    );
  }

  if (!session?.user) {
    return (
      <button
        onClick={() => signIn("google")}
        className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-brand-neutral-100 rounded-full hover:bg-white transition-colors shadow-sm text-sm font-medium text-brand-navy-800"
      >
        Sign in
      </button>
    );
  }

  const user = session.user;

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 px-3 py-1.5 bg-white/80 backdrop-blur-sm border border-brand-navy-300 rounded-full hover:bg-brand-neutral-100 transition-colors shadow-sm"
      >
        {user.image ? (
          <img
            src={user.image}
            alt={user.name || "User"}
            className="w-6 h-6 rounded-full"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-brand-brown flex items-center justify-center">
            <User size={14} className="text-white" />
          </div>
        )}
        <span className="text-brand-navy-800 text-sm hidden sm:inline max-w-[100px] truncate">
          {user.name || user.email?.split("@")[0]}
        </span>
        <ChevronDown size={14} className="text-brand-navy-600" />
      </button>

      {/* Dropdown menu */}
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-0 mt-2 w-56 bg-white border border-brand-neutral-100 rounded-lg shadow-xl z-50 py-1">
            <div className="px-3 py-2 border-b border-brand-neutral-100">
              <p className="text-sm text-brand-navy-900 font-medium truncate">
                {user.name || "User"}
              </p>
              <p className="text-xs text-brand-navy-600 truncate">{user.email}</p>
            </div>
            <button
              onClick={() => {
                setShowMenu(false);
                router.push("/history");
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-brand-navy-800 hover:bg-brand-neutral-100 transition-colors"
            >
              <History size={16} />
              My conversations
            </button>
            <button
              onClick={() => {
                setShowMenu(false);
                signOut({ callbackUrl: "/" });
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-brand-navy-800 hover:bg-brand-neutral-100 transition-colors"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
