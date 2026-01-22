import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Doc | Voice Therapy for Physicians",
  description: "A sardonic AI companion for burnt-out physicians. Vent about the system with someone who actually gets it.",
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Doc | Voice Therapy for Physicians",
    description: "A sardonic AI companion for burnt-out physicians. Vent about the system with someone who actually gets it.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Doc | Voice Therapy for Physicians",
    description: "A sardonic AI companion for burnt-out physicians. Vent about the system with someone who actually gets it.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
