/**
 * Pure helpers for the Raise Sale → confirmation flow.
 *
 * Spec: when a user opens the per-service confirmation modal before billing they
 * decide which services were actually performed. Cancelled services are removed
 * from the booking; if **any** service is unchecked, later performed slots move up
 * to close the gap **without** shortening already-completed services (they stay anchored
 * in wall time — see computeCompression).
 *
 * These helpers are pure (no IO) so they can be unit tested and reused on both
 * the modal (live preview) and the backend payload builder.
 */

export type FinalizeDecision = "perform" | "cancel"

/** Status values the modal needs to reason about. Other statuses are valid but treated like 'scheduled'. */
export type FinalizeStatus =
  | "scheduled"
  | "confirmed"
  | "arrived"
  | "service_started"
  | "completed"
  | "cancelled"
  | "cancelled_at_billing"
  | "missed"

export type SvcRow = {
  appointmentId: string
  staffId: string
  /** Original start time as minutes-since-midnight. Sorted callers should supply this. */
  startMinutes: number
  duration: number
  status: FinalizeStatus
  decision: FinalizeDecision
}

export type CompressionShift = {
  appointmentId: string
  newStartMinutes: number
}

/**
 * Sort rows by their original start time (stable for equal values via appointmentId).
 */
export function sortByStart(rows: SvcRow[]): SvcRow[] {
  return [...rows].sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes
    return a.appointmentId.localeCompare(b.appointmentId)
  })
}

export function isAllCancelled(rows: SvcRow[]): boolean {
  if (rows.length === 0) return false
  return rows.every((r) => r.decision === "cancel")
}

/**
 * Compression runs when cancelling at least one service still leaves remaining
 * work to bill—**including** cancelling a middle service so the timeline can pack:
 * remaining performed rows keep their chronological order but lose empty gaps left
 * by cancelled rows (e.g. 3rd service starts where the cancelled 2nd used to).
 */
export function shouldCompress(rows: SvcRow[]): boolean {
  if (rows.length === 0) return false
  const anyCancel = rows.some((r) => r.decision === "cancel")
  const performed = rows.filter((r) => r.decision === "perform")
  if (!anyCancel || performed.length === 0) return false
  const bookingStartMinutes = sortByStart(rows)[0].startMinutes
  return computeCompression(rows, bookingStartMinutes).length > 0
}

/**
 * Compute new start times for performed rows.
 *
 * - Performed rows that are already 'completed' keep their original start time
 *   (Edge Case 4: "Service already completed earlier — do NOT modify its timing").
 * - Other performed rows are packed sequentially starting at appointmentStartMinutes,
 *   in their original time order.
 * - When a frozen 'completed' row collides with the moving cursor, the cursor
 *   resumes at the end of that frozen row (we never push a frozen row).
 *
 * Returns ONLY shifts where the new start differs from the original start.
 */
export function computeCompression(
  rows: SvcRow[],
  appointmentStartMinutes: number
): CompressionShift[] {
  const sorted = sortByStart(rows).filter((r) => r.decision === "perform")
  const shifts: CompressionShift[] = []

  let cursor = appointmentStartMinutes

  for (const row of sorted) {
    if (row.status === "completed") {
      // Frozen absolute window — completed services are never slid earlier/later.
      const rowEnd = row.startMinutes + row.duration
      cursor = Math.max(cursor, rowEnd)
      continue
    }
    const newStart = cursor
    if (newStart !== row.startMinutes) {
      shifts.push({ appointmentId: row.appointmentId, newStartMinutes: newStart })
    }
    cursor = newStart + row.duration
  }

  return shifts
}

/**
 * Convenience: returns the full timeline (performed only) after applying decisions.
 * Used by the modal's "After confirmation" preview panel so it can render before/after
 * times even when no compression occurs.
 */
export function buildFinalTimeline(
  rows: SvcRow[],
  appointmentStartMinutes: number
): Array<{ appointmentId: string; startMinutes: number; endMinutes: number; shifted: boolean }> {
  const compress = shouldCompress(rows)
  const shiftMap = new Map<string, number>()
  if (compress) {
    for (const s of computeCompression(rows, appointmentStartMinutes)) {
      shiftMap.set(s.appointmentId, s.newStartMinutes)
    }
  }
  const performed = sortByStart(rows).filter((r) => r.decision === "perform")
  return performed.map((r) => {
    const newStart = shiftMap.get(r.appointmentId) ?? r.startMinutes
    return {
      appointmentId: r.appointmentId,
      startMinutes: newStart,
      endMinutes: newStart + r.duration,
      shifted: shiftMap.has(r.appointmentId),
    }
  })
}

/* ------------------------- time-string helpers ------------------------- */

/**
 * Parse a time string like "9:00", "09:00", "9:00 AM" or an ISO date string
 * into minutes-since-midnight. Mirrors the loose parser used by the calendars
 * so the modal accepts whatever shape the appointment carries.
 */
export function parseTimeToMinutesLoose(time: string | null | undefined): number {
  if (!time || typeof time !== "string") return 0
  const str = time.trim()
  const isoMatch = str.match(/T(\d{1,2}):(\d{2})/)
  if (isoMatch) {
    const h = parseInt(isoMatch[1], 10)
    const m = parseInt(isoMatch[2], 10)
    return h >= 0 && h < 24 && m >= 0 && m < 60 ? h * 60 + m : 0
  }
  const cleaned = str.replace(/\s*(am|pm)/i, "").trim()
  const parts = cleaned.split(":")
  const h = parseInt(parts[0] || "0", 10)
  const m = parseInt(parts[1] || "0", 10)
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return 0
  const isPm = /pm/i.test(str) && h < 12
  const hour = isPm ? h + 12 : /am/i.test(str) && h === 12 ? 0 : h
  return hour * 60 + m
}

export function minutesToHHMM(mins: number): string {
  const wrapped = ((mins % (24 * 60)) + 24 * 60) % (24 * 60)
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** "9:00 AM" / "12:30 PM" — matches the canonical format the appointments API uses. */
export function minutesToApiTime(mins: number): string {
  const wrapped = ((mins % (24 * 60)) + 24 * 60) % (24 * 60)
  const h24 = Math.floor(wrapped / 60)
  const m = wrapped % 60
  const period = h24 >= 12 ? "PM" : "AM"
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, "0")} ${period}`
}

export function formatRange(startMinutes: number, endMinutes: number): string {
  return `${minutesToApiTime(startMinutes)} – ${minutesToApiTime(endMinutes)}`
}
