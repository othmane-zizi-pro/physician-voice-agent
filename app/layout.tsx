import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Doc | Voice Therapy for Physicians",
  description: "A sardonic AI companion for burnt-out physicians. Vent about the system with someone who actually gets it.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
