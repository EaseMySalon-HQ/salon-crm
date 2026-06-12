/**
 * Capture GMB UTM params from URL for booking attribution.
 */

export function captureGmbUtmFromUrl(): {
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
} {
  if (typeof window === "undefined") {
    return { utmSource: null, utmMedium: null, utmCampaign: null }
  }
  const params = new URLSearchParams(window.location.search)
  return {
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
  }
}

export function appendGmbBookingUtm(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.set("utm_source", "google")
    u.searchParams.set("utm_medium", "gmb")
    u.searchParams.set("utm_campaign", "book_button")
    return u.toString()
  } catch {
    return url
  }
}
