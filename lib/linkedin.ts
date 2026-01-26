/**
 * LinkedIn Conversion API utilities
 */

/**
 * Get the li_fat_id cookie value (LinkedIn First-party Ad Tracking ID)
 * This cookie is set when users click on LinkedIn ads
 */
export function getLiFatId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/li_fat_id=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Track a LinkedIn conversion event
 * Fire-and-forget: doesn't block UI, silently fails
 */
export async function trackLinkedInConversion(params: {
  eventType?: string;
  callId?: string | null;
  pageUrl?: string;
  referrer?: string;
}): Promise<void> {
  try {
    const liFatId = getLiFatId();

    await fetch("/api/linkedin/conversion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: params.eventType || "call_started",
        liFatId,
        callId: params.callId || null,
        pageUrl: params.pageUrl || window.location.href,
        referrer: params.referrer || document.referrer,
      }),
    });
  } catch {
    // Fire and forget - don't let tracking errors affect UX
  }
}
