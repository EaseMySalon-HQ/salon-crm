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

/** Dropdown options: with empty search, show at least Walk-in; otherwise filter + keep Walk-in when it matches. */
export function customerDropdownList(allClients: Client[], searchRaw: string): Client[] {
  const walkIn = findWalkInClient(allClients)
  const trimmed = searchRaw.trim()
  if (!trimmed) {
    return walkIn ? [walkIn] : []
  }
  const q = trimmed.toLowerCase()
  const filtered = allClients.filter(
    (client) =>
      client.name.toLowerCase().startsWith(q) ||
      (client.phone && client.phone.startsWith(trimmed)) ||
      (client.email && client.email.toLowerCase().startsWith(q)),
  )
  if (!walkIn) return filtered
  const wid = String(walkIn._id || walkIn.id)
  const withoutDup = filtered.filter((c) => String(c._id || c.id) !== wid)
  const walkInMatches =
    walkIn.name.toLowerCase().startsWith(q) ||
    (walkIn.phone && walkIn.phone.startsWith(trimmed)) ||
    (walkIn.email && walkIn.email.toLowerCase().startsWith(q))
  if (walkInMatches) return [walkIn, ...withoutDup]
  return filtered
}

export function prependWalkInIfMissing(walkIn: Client | undefined, rowClients: Client[]): Client[] {
  if (!walkIn) return rowClients
  const wid = String(walkIn._id || walkIn.id)
  if (rowClients.some((c) => String(c._id || c.id) === wid)) return rowClients
  return [walkIn, ...rowClients]
}
