import type { Client } from "@/lib/client-store"

/** Reserved phone value stored server-side for the system Walk-in profile (not shown as a real number). */
export const WALK_IN_SYSTEM_PHONE = "__EMS_WALK_IN__"

export function isWalkInClient(c: Pick<Client, "phone" | "name"> & { isWalkIn?: boolean }): boolean {
  if (c.isWalkIn === true) return true
  if (c.phone === WALK_IN_SYSTEM_PHONE) return true
  return /^walk-?in$/i.test(String(c.name || "").trim())
}

export function findWalkInClient(clients: Client[]): Client | undefined {
  return clients.find(isWalkInClient)
}

/** Hide sentinel phone in UI and receipts-style displays. */
export function formatClientPhoneForDisplay(c: Pick<Client, "phone" | "name"> & { isWalkIn?: boolean }): string {
  if (isWalkInClient(c)) return "No contact"
  return (c.phone || "").trim() || "—"
}

/**
 * Dropdown options for client search.
 * - Empty search: Walk-in only (when available).
 * - Non-empty search: matching real clients only — Walk-in is never shown while typing.
 */
export function customerDropdownList(
  allClients: Client[],
  searchRaw: string,
  walkInOverride?: Client | null,
): Client[] {
  const walkIn = walkInOverride ?? findWalkInClient(allClients)
  const trimmed = searchRaw.trim()
  if (!trimmed) {
    return walkIn ? [walkIn] : []
  }
  const q = trimmed.toLowerCase()
  return allClients.filter(
    (client) =>
      !isWalkInClient(client) &&
      (client.name.toLowerCase().startsWith(q) ||
        (client.phone && client.phone.startsWith(trimmed)) ||
        (client.email && client.email.toLowerCase().startsWith(q))),
  )
}

/** @deprecated Use customerDropdownList with walkInOverride; kept for callers that merge lists manually. */
export function prependWalkInIfMissing(walkIn: Client | undefined, rowClients: Client[]): Client[] {
  if (!walkIn) return rowClients
  const wid = String(walkIn._id || walkIn.id)
  if (rowClients.some((c) => String(c._id || c.id) === wid)) return rowClients
  return [walkIn, ...rowClients]
}

/** Label for Walk-in rows in client pickers. */
export const WALK_IN_UI_BADGE = "System default"
