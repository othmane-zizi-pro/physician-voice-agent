import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

// Meroka brand colors
const COLORS = {
  primary: "#9b420f",      // Burnt orange-brown
  secondary: "#18212d",    // Dark slate
  cream: "#F7F5F2",        // Light beige
  warm: "#FBF5EB",         // Warm peachy beige
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const quote = searchParams.get("quote") || "Healthcare workers are venting here.";
  const location = searchParams.get("location") || "Anonymous";

  // Truncate quote if too long
  const displayQuote = quote.length > 200 ? quote.slice(0, 197) + "..." : quote;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: COLORS.secondary,
          backgroundImage: `radial-gradient(circle at 25% 25%, rgba(155, 66, 15, 0.15) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(247, 245, 242, 0.05) 0%, transparent 50%)`,
          padding: "60px",
        }}
      >
        {/* Quote marks */}
        <div
          style={{
            position: "absolute",
            top: "40px",
            left: "60px",
            fontSize: "120px",
            color: COLORS.primary,
            opacity: 0.4,
            fontFamily: "Georgia, serif",
          }}
        >
          &ldquo;
        </div>

        {/* Main quote */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            maxWidth: "1000px",
          }}
        >
          <p
            style={{
              fontSize: displayQuote.length > 100 ? "36px" : "44px",
              color: COLORS.cream,
              textAlign: "center",
              lineHeight: 1.4,
              fontStyle: "italic",
              marginBottom: "30px",
            }}
          >
            &ldquo;{displayQuote}&rdquo;
          </p>

          <p
            style={{
              fontSize: "24px",
              color: "#9ca3af",
              marginBottom: "40px",
            }}
          >
            — {location}
          </p>
        </div>

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            bottom: "40px",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: COLORS.primary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "28px", fontWeight: "bold", color: "white" }}>
              Doc
            </span>
            <span style={{ fontSize: "16px", color: "#9ca3af" }}>
              AI companion for burnt-out healthcare workers
            </span>
          </div>
        </div>

        {/* Meroka branding */}
        <div
          style={{
            position: "absolute",
            bottom: "40px",
            right: "60px",
            fontSize: "14px",
            color: COLORS.primary,
          }}
        >
          by Meroka
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
