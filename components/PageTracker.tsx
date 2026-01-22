"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export default function PageTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const trackVisit = async () => {
      try {
        // Get UTM parameters
        const utmSource = searchParams.get("utm_source");
        const utmMedium = searchParams.get("utm_medium");
        const utmCampaign = searchParams.get("utm_campaign");

        // Get referrer
        const referrer = document.referrer || null;

        await fetch("/api/track-visit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pagePath: pathname,
            referrer,
            utmSource,
            utmMedium,
            utmCampaign,
          }),
        });
      } catch (error) {
        // Silently fail - don't block the user experience
        console.error("Failed to track visit:", error);
      }
    };

    trackVisit();
  }, [pathname, searchParams]);

  return null;
}
