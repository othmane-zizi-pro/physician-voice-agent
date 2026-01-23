import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const physicianText = searchParams.get("physicianText") || "";
  const docText = searchParams.get("docText") || "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "48px",
          backgroundColor: "#0a0a0a",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Physician bubble - right aligned */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              maxWidth: "80%",
            }}
          >
            <span
              style={{
                fontSize: "14px",
                color: "#60a5fa",
                marginBottom: "8px",
              }}
            >
              You
            </span>
            <div
              style={{
                backgroundColor: "rgba(59, 130, 246, 0.2)",
                color: "#bfdbfe",
                padding: "16px 20px",
                borderRadius: "16px",
                fontSize: "18px",
                lineHeight: 1.5,
              }}
            >
              {physicianText}
            </div>
          </div>
        </div>

        {/* Doc bubble - left aligned */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-start",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              maxWidth: "80%",
            }}
          >
            <span
              style={{
                fontSize: "14px",
                color: "#c8a97e",
                marginBottom: "8px",
              }}
            >
              Doc
            </span>
            <div
              style={{
                backgroundColor: "#1f2937",
                color: "#e5e7eb",
                padding: "16px 20px",
                borderRadius: "16px",
                fontSize: "18px",
                lineHeight: 1.5,
              }}
            >
              {docText}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
    }
  );
}
