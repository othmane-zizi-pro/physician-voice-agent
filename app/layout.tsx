import type { Metadata } from "next";
import { Suspense } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import PageTracker from "@/components/PageTracker";
import { AuthProvider } from "@/components/auth/AuthProvider";
import SessionProvider from "@/components/SessionProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Doc | Voice Therapy for Physicians",
  description: "An AI companion for burnt-out physicians. Vent about the system with someone who actually gets it.",
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.svg",
  },
  openGraph: {
    title: "Doc | Voice Therapy for Physicians",
    description: "An AI companion for burnt-out physicians. Vent about the system with someone who actually gets it.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Doc | Voice Therapy for Physicians",
    description: "An AI companion for burnt-out physicians. Vent about the system with someone who actually gets it.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        {/* LinkedIn Insight Tag */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              _linkedin_partner_id = "519323189";
              window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
              window._linkedin_data_partner_ids.push(_linkedin_partner_id);
            `,
          }}
        />
        <script
          async
          src="https://snap.licdn.com/li.lms-analytics/insight.min.js"
        />
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            alt=""
            src="https://px.ads.linkedin.com/collect/?pid=519323189&fmt=gif"
          />
        </noscript>
      </head>
      <body className="antialiased min-h-screen font-sans">
        <SessionProvider>
          <AuthProvider>
            <Suspense fallback={null}>
              <PageTracker />
            </Suspense>
            {children}
          </AuthProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
