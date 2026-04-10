/**
 * Pure helpers for Quick Sale: appointment URL payload and linked-appointment completion.
 * Kept framework-free for unit testing.
 */

function decodeBase64ToUtf8(base64: string): string {
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(base64)
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(base64, "base64").toString("utf8")
  }
  throw new Error("Cannot decode base64 in this environment")
}

/**
 * Decode the `appointment` search param (base64 JSON) from the calendar → Quick Sale flow.
 */
export function decodeQuickSaleAppointmentParam(base64: string): Record<string, unknown> | null {
  try {
    const json = decodeBase64ToUtf8(base64)
    const data = JSON.parse(json) as unknown
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

export function extractAppointmentIdsFromPayload(data: Record<string, unknown>): {
  primaryId?: string
  linkedIds: string[]
} {
  const raw = data.appointmentId ?? data.appointmentID ?? data.id
  const primaryId = raw !== undefined && raw !== null ? String(raw) : undefined

  const linkedRaw = data.linkedAppointmentIds
  const linkedIds = Array.isArray(linkedRaw)
    ? linkedRaw.filter((x) => x != null && x !== "").map(String)
    : []

  return { primaryId, linkedIds }
}

/**
 * After checkout: prefer `linkedAppointmentIds` when present, else the single primary id.
 */
export function resolveAppointmentIdsToComplete(
  linkedAppointmentIds: string[],
  linkedAppointmentId: string | null | undefined
): string[] {
  if (linkedAppointmentIds.length > 0) return [...linkedAppointmentIds]
  if (linkedAppointmentId) return [linkedAppointmentId]
  return []
}
