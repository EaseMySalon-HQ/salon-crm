/**
 * Pinned (quick-access) services for the checkout dialog.
 *
 * Stores a per-browser list of service IDs the user wants surfaced beside the
 * default "Top 10" cards in {@link ServiceCheckoutDialog}. The list is opaque
 * to the backend — it's just a UX shortcut, so device-local persistence is
 * sufficient. If a stored ID is no longer in the live catalog (service
 * deleted/disabled), the renderer simply skips it.
 */

const STORAGE_KEY = "salon-ems:pinned-checkout-services:v1"

export const PINNED_CHECKOUT_SERVICES_EVENT = "pinned-checkout-services-changed"

function sanitize(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of ids) {
    if (typeof raw !== "string") continue
    const id = raw.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function readPinnedServiceIds(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return sanitize(JSON.parse(raw))
  } catch {
    return []
  }
}

export function writePinnedServiceIds(ids: string[]): void {
  if (typeof window === "undefined") return
  try {
    const cleaned = sanitize(ids)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned))
    window.dispatchEvent(new CustomEvent(PINNED_CHECKOUT_SERVICES_EVENT))
  } catch {
    /* quota exceeded or storage disabled — ignore */
  }
}
