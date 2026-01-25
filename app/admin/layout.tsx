"use client";

import SessionProvider from "@/components/SessionProvider";
import { motion } from "framer-motion";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <div className="min-h-screen relative text-brand-navy-900 font-sans selection:bg-brand-ice">
        {/* Animated gradient background - Shared with main app for consistency */}
        <motion.div
          className="fixed inset-0 -z-10"
          animate={{
            background: [
              "radial-gradient(circle at 0% 0%, rgba(154,70,22,0.05) 0%, transparent 50%), radial-gradient(circle at 100% 100%, rgba(212,228,244,0.3) 0%, transparent 50%)",
              "radial-gradient(circle at 100% 0%, rgba(154,70,22,0.05) 0%, transparent 50%), radial-gradient(circle at 0% 100%, rgba(212,228,244,0.3) 0%, transparent 50%)",
              "radial-gradient(circle at 0% 0%, rgba(154,70,22,0.05) 0%, transparent 50%), radial-gradient(circle at 100% 100%, rgba(212,228,244,0.3) 0%, transparent 50%)",
            ],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        />

        {children}
      </div>
    </SessionProvider>
  );
}
