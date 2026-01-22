export async function trackClick(linkType: string, linkUrl: string) {
  try {
    await fetch("/api/track-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkType, linkUrl }),
    });
  } catch (error) {
    // Silently fail - don't block navigation
    console.error("Failed to track click:", error);
  }
}

export function createTrackedLink(
  linkType: string,
  linkUrl: string,
  openInNewTab = true
) {
  return () => {
    trackClick(linkType, linkUrl);
    if (openInNewTab) {
      window.open(linkUrl, "_blank", "noopener,noreferrer");
    } else {
      window.location.href = linkUrl;
    }
  };
}
