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

/** Canonical shape for detecting drift from Raise Sale confirmation → Quick Sale checkout. */
export type RaiseSaleLinkageSnapshot = {
  clientId: string
  dateYYYYMMDD: string
  remarksNorm: string
  serviceRowsJson: string
  extraProducts: number
  extraMemberships: number
  extraPackages: number
  extraPrepaid: number
}

/** Local-calendar YYYY-MM-DD (matches Quick Sale date picker). */
export function calendarYmdLocal(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ""
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function raiseSaleLinkageSnapshotFromCheckoutState(input: {
  clientId: string
  dateYYYYMMDD: string
  remarksNormalized: string
  serviceLines: Array<{ serviceId: string; staffId: string; quantity: number }>
  extraProducts: number
  extraMemberships: number
  extraPackages: number
  extraPrepaid: number
}): RaiseSaleLinkageSnapshot {
  type Row = { sid: string; staff: string; qty: number }
  const rows: Row[] = input.serviceLines.map((r) => ({
    sid: String(r.serviceId || ""),
    staff: String(r.staffId || ""),
    qty: Math.max(1, Math.floor(Number(r.quantity) || 1)),
  }))
  rows.sort((a, b) => {
    const c = a.sid.localeCompare(b.sid)
    if (c !== 0) return c
    const s = a.staff.localeCompare(b.staff)
    if (s !== 0) return s
    return a.qty - b.qty
  })
  return {
    clientId: String(input.clientId || "").trim(),
    dateYYYYMMDD: input.dateYYYYMMDD,
    remarksNorm: String(input.remarksNormalized || "").trim().toLowerCase(),
    serviceRowsJson: JSON.stringify(rows),
    extraProducts: Math.max(0, Math.floor(Number(input.extraProducts) || 0)),
    extraMemberships: Math.max(0, Math.floor(Number(input.extraMemberships) || 0)),
    extraPackages: Math.max(0, Math.floor(Number(input.extraPackages) || 0)),
    extraPrepaid: Math.max(0, Math.floor(Number(input.extraPrepaid) || 0)),
  }
}

export function areRaiseSaleLinkageSnapshotsEqual(
  a: RaiseSaleLinkageSnapshot,
  b: RaiseSaleLinkageSnapshot
): boolean {
  return (
    a.clientId === b.clientId &&
    a.dateYYYYMMDD === b.dateYYYYMMDD &&
    a.remarksNorm === b.remarksNorm &&
    a.serviceRowsJson === b.serviceRowsJson &&
    a.extraProducts === b.extraProducts &&
    a.extraMemberships === b.extraMemberships &&
    a.extraPackages === b.extraPackages &&
    a.extraPrepaid === b.extraPrepaid
  )
}

export function isLikelyMongoObjectId(id: string | null | undefined): boolean {
  return !!id && /^[a-f\d]{24}$/i.test(String(id))
}

export function walletExpiryEndMs(w: { effectiveExpiryDate?: unknown; expiryDate?: unknown }): number {
  const raw = w?.effectiveExpiryDate ?? w?.expiryDate
  if (!raw) return 0
  const t = new Date(raw as string).getTime()
  return Number.isFinite(t) ? t : 0
}

/**
 * Active prepaid wallets with usable balance (Quick Sale + service checkout payment picker).
 */
export function filterWalletsForQuickSaleDisplay(wallets: any[] | undefined, nowMs: number = Date.now()): any[] {
  if (!wallets?.length) return []
  const GRACE_MS = 120_000
  return wallets.filter((w) => {
    if (String(w.status || "").toLowerCase() !== "active") return false
    if (Number(w.remainingBalance) <= 0) return false
    const end = walletExpiryEndMs(w)
    if (!end) return false
    return end >= nowMs - GRACE_MS
  })
}

/** Prefer soonest-expiring wallet (Quick Sale + service checkout). */
export function pickDefaultClientWalletId(wallets: any[]): string {
  if (!wallets?.length) return ""
  const sorted = [...wallets].sort((a, b) => walletExpiryEndMs(a) - walletExpiryEndMs(b))
  return String(sorted[0]._id)
}

/** Single display row for combined-wallet mode; redeem still uses primary _id + server FIFO. */
export function buildCombinedQuickSaleWalletRow(usable: any[]) {
  const sorted = [...usable].sort((a, b) => walletExpiryEndMs(a) - walletExpiryEndMs(b))
  const sum = sorted.reduce((s, w) => s + (Number(w.remainingBalance) || 0), 0)
  const primary = sorted[0]
  return {
    ...primary,
    _id: primary._id,
    remainingBalance: sum,
    effectiveExpiryDate: primary.effectiveExpiryDate,
    planSnapshot: {
      ...(primary.planSnapshot || {}),
      planName: "Combined prepaid balance",
    },
    _combinedSources: sorted,
  }
}

/**
 * Bill `notes` may include a multi-staff tip summary appended by checkout (see historical
 * `Tip: …` blocks). Customer note UIs should only show appointment + sale remarks.
 */
export function billNotesForCustomerDisplay(raw: unknown): string {
  const t = String(raw ?? "").trim()
  if (!t) return ""
  return t.replace(/(\r?\n){2}Tip:[\s\S]*$/i, "").trim()
}
