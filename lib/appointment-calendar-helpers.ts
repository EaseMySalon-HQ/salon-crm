/**
 * Pure helpers shared by appointments list + grid (display, duration, Raise Sale payload).
 */

export type SaleServiceLine = {
  serviceId: string
  staffId: string
  staffName: string
  price: number
}

/**
 * Statuses that should be hidden from active calendar views (Kanban time columns,
 * grid time slots, conflict checks). 'cancelled_at_billing' joins 'cancelled' here
 * so services dropped during the Raise Sale confirmation step disappear from the
 * day view but remain queryable for reports / audit.
 */
export const INACTIVE_STATUSES: ReadonlySet<string> = new Set(["cancelled", "cancelled_at_billing"])

export function isHiddenAppointment(apt: { status?: string } | null | undefined): boolean {
  if (!apt || !apt.status) return false
  return INACTIVE_STATUSES.has(apt.status)
}

export const ONLINE_BOOKING_MARKER = "online_booking"

/** True when the appointment was created via the public online booking flow. */
export function isOnlineBookingAppointment(
  apt: { leadSource?: string | null; createdBy?: string | null } | null | undefined
): boolean {
  if (!apt) return false
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase()
  const marker = ONLINE_BOOKING_MARKER
  return norm(apt.leadSource) === marker || norm(apt.createdBy) === marker
}

/** Compact pill for calendar appointment cards (grid + list). */
export const ONLINE_BOOKING_PILL_CLASS =
  "text-[10px] font-semibold leading-none text-violet-800 bg-violet-50 px-1.5 py-0.5 rounded-md border border-violet-200 shrink-0"

/**
 * Normalizes `_id` values from API responses for URLs and comparisons.
 * Occasionally nested `{ _id }` objects or BSON-like `.toString()` ids slip through —
 * mismatches broke calendar → edit-drawer hydrate (wrong "edit-service" row / wrong GET URL).
 */
export function toMongoIdString(raw: unknown): string {
  if (raw == null) return ""
  if (typeof raw === "string") return raw.trim()
  if (typeof raw === "object" && raw !== null && "_id" in (raw as Record<string, unknown>)) {
    const inner = (raw as { _id: unknown })._id
    return inner !== undefined && inner !== raw ? toMongoIdString(inner) : ""
  }
  if (typeof raw === "object" && raw !== null && typeof (raw as { toString?: () => unknown }).toString === "function") {
    try {
      return String((raw as { toString: () => unknown }).toString()).trim()
    } catch {
      return ""
    }
  }
  return String(raw).trim()
}

/**
 * Compact pill styling for appointment status (e.g. edit drawer header).
 * Background/border tones align with calendar grid card fills.
 */
export function getAppointmentStatusPillClass(status: string | null | undefined): string {
  const s = typeof status === "string" && status.length > 0 ? status : "scheduled"
  switch (s) {
    case "scheduled":
      return "border-slate-300/90 bg-slate-100/95 text-slate-800 shadow-none hover:bg-slate-200/90"
    case "confirmed":
      return "border-cyan-300/90 bg-cyan-100/95 text-cyan-950 shadow-none hover:bg-cyan-200/90"
    case "arrived":
      return "border-blue-300/90 bg-blue-100/95 text-blue-950 shadow-none hover:bg-blue-200/90"
    case "partial_payment":
      return "border-amber-300/90 bg-amber-100/95 text-amber-950 shadow-none hover:bg-amber-200/90"
    case "service_started":
      return "border-indigo-300/90 bg-indigo-100/95 text-indigo-950 shadow-none hover:bg-indigo-200/90"
    case "completed":
      return "border-emerald-300/90 bg-emerald-100/95 text-emerald-950 shadow-none hover:bg-emerald-200/90"
    case "missed":
      return "border-rose-300/90 bg-rose-100/95 text-rose-950 shadow-none hover:bg-rose-200/90"
    case "cancelled":
      return "border-red-300/90 bg-red-100/95 text-red-950 shadow-none hover:bg-red-200/90"
    case "cancelled_at_billing":
      return "border-zinc-300/90 bg-zinc-100/95 text-zinc-900 shadow-none hover:bg-zinc-200/80"
    default:
      return "border-slate-200/90 bg-slate-50/95 text-slate-800 shadow-none hover:bg-slate-100/90"
  }
}

/** True when a sale is partially paid (matches grid calendar tint + payment arrays). */
export function saleRecordIsPartialPayment(s: unknown): boolean {
  const rec = s as {
    status?: string
    paymentStatus?: { paidAmount?: number; remainingAmount?: number; totalAmount?: number }
    payments?: Array<{ amount?: number }>
    tip?: number
    grossTotal?: number
    netTotal?: number
  }
  const st = String(rec?.status ?? "").toLowerCase()
  const ps = rec?.paymentStatus
  const paidFromPayments = Array.isArray(rec?.payments)
    ? rec.payments.reduce((sum, p) => sum + (Number(p?.amount) || 0), 0)
    : 0
  const paidRaw = ps != null ? Number(ps.paidAmount) : NaN
  const paid = Number.isFinite(paidRaw) && paidRaw > 0 ? paidRaw : paidFromPayments

  const tip = Number(rec?.tip) || 0
  const total =
    (ps != null && Number.isFinite(Number(ps.totalAmount)) && Number(ps.totalAmount) > 0
      ? Number(ps.totalAmount)
      : NaN) ||
    (Number(rec?.grossTotal) || 0) + tip ||
    Number(rec?.netTotal) ||
    0

  let rem = ps != null ? Number(ps.remainingAmount) : NaN
  if (!Number.isFinite(rem)) rem = Math.max(0, total - paid)

  const collected = paid > 0.05
  const owes = rem > 0.05
  if (st === "partial" && collected && total > 0.05 && paid < total - 0.05) return true
  return collected && owes
}

/** Appointment ids linked to a sale with partial payment (`SalesAPI` rows for a given day). */
export function collectPartialPaymentAppointmentIdsFromSales(sales: unknown[]): Set<string> {
  const ids = new Set<string>()
  const add = (raw: unknown) => {
    if (raw == null) return
    const id =
      typeof raw === "object" && (raw as { _id?: unknown })?._id != null
        ? String((raw as { _id: unknown })._id)
        : String(raw)
    if (id) ids.add(id)
  }
  for (const s of sales) {
    if (!saleRecordIsPartialPayment(s)) continue
    const sale = s as { appointmentId?: unknown; linkedAppointmentIds?: unknown[] }
    add(sale.appointmentId)
    const linked = sale.linkedAppointmentIds
    if (Array.isArray(linked)) linked.forEach(add)
  }
  return ids
}

/**
 * Card / list tone: base `apt.status`, or derived `partial_payment` / `missed`
 * when a same-day sale marks this appointment as partially paid.
 */
export function getCalendarCardVisualStatus(
  apt: { _id?: unknown; status?: string },
  partialPaymentIds: Set<string>
): string {
  const st = apt.status || "scheduled"
  if (st === "missed") return "missed"
  const rawId = apt._id
  const aptId =
    rawId != null
      ? typeof rawId === "object" && (rawId as { _id?: unknown })?._id != null
        ? String((rawId as { _id: unknown })._id)
        : String(rawId)
      : ""
  if (
    aptId &&
    partialPaymentIds.has(aptId) &&
    st !== "cancelled" &&
    st !== "cancelled_at_billing" &&
    st !== "missed"
  ) {
    return "partial_payment"
  }
  return st
}

/** DB statuses that open the appointment edit drawer from calendar / list. */
export const APPOINTMENT_EDITABLE_STATUSES: ReadonlySet<string> = new Set([
  "scheduled",
  "confirmed",
  "arrived",
  "service_started",
])

/** Values allowed from appointment card context menu (right-click). */
export type AppointmentCardContextStatus = "scheduled" | "confirmed" | "arrived" | "service_started"

export const APPOINTMENT_CARD_CONTEXT_STATUS_OPTIONS: ReadonlyArray<{
  value: AppointmentCardContextStatus
  label: string
}> = [
  { value: "scheduled", label: "Scheduled" },
  { value: "confirmed", label: "Confirmed" },
  { value: "arrived", label: "Arrived" },
  { value: "service_started", label: "Service started" },
]

/** Whether the appointment can switch among {@link APPOINTMENT_CARD_CONTEXT_STATUS_OPTIONS} from the UI. */
export function canChangeAppointmentStatusViaContextMenu(apt: { status?: string } | null | undefined): boolean {
  const s = apt?.status
  if (!s) return false
  return APPOINTMENT_EDITABLE_STATUSES.has(s)
}

/**
 * Appointment IDs to update when setting status from a booking card context menu.
 * - `service_started` → only the card that was acted on.
 * - `scheduled`, `confirmed`, `arrived`, `missed` → same-day siblings sharing `bookingGroupId` only.
 */
export function normalizeAppointmentDateStr(date: unknown): string {
  if (date == null) return ""
  const s = String(date).trim()
  if (!s) return ""
  return s.slice(0, 10)
}

/** Same calendar day for status/linking — multi-date bookings are independent per day. */
export function appointmentsOnSameVisitDate(
  a: { date?: unknown },
  b: { date?: unknown },
): boolean {
  const da = normalizeAppointmentDateStr(a.date)
  const db = normalizeAppointmentDateStr(b.date)
  if (!da || !db) return true
  return da === db
}

export function getAppointmentIdsForCardStatusUpdate(
  anchor: { _id: string; bookingGroupId?: string | null | undefined; date?: unknown },
  loadedAppointments: Array<{ _id: string; bookingGroupId?: string | null | undefined; date?: unknown }>,
  newStatus: AppointmentCardContextStatus,
): string[] {
  const anchorId = toMongoIdString(anchor._id) || String(anchor._id)
  if (newStatus === "service_started") {
    return anchorId ? [anchorId] : []
  }
  const raw = anchor.bookingGroupId
  if (raw == null || String(raw).trim() === "") {
    return anchorId ? [anchorId] : []
  }
  const bg = String(raw).trim()
  const out = new Set<string>()
  for (const a of loadedAppointments) {
    const aid = toMongoIdString(a._id) || String(a._id)
    if (!aid) continue
    const ag = a.bookingGroupId
    if (ag != null && String(ag).trim() === bg && appointmentsOnSameVisitDate(a, anchor)) {
      out.add(aid)
    }
  }
  if (out.size === 0 && anchorId) out.add(anchorId)
  return [...out]
}

export type AppointmentCalendarOpenIntent =
  | { type: "details" }
  | { type: "edit_form"; appointmentId: string }

export function getAppointmentCalendarOpenIntent(
  apt: { _id: string; status: string; clientId?: { _id?: string } | string | null },
  partialPaymentIds: Set<string>
): AppointmentCalendarOpenIntent {
  const visual = getCalendarCardVisualStatus(apt, partialPaymentIds)
  if (visual === "partial_payment") {
    const appointmentId = toMongoIdString(apt._id)
    if (appointmentId) return { type: "edit_form", appointmentId }
    return { type: "details" }
  }
  if (apt.status === "completed") {
    const appointmentId = toMongoIdString(apt._id)
    if (appointmentId) return { type: "edit_form", appointmentId }
    return { type: "details" }
  }
  if (APPOINTMENT_EDITABLE_STATUSES.has(apt.status)) {
    const appointmentId = toMongoIdString(apt._id)
    if (appointmentId) return { type: "edit_form", appointmentId }
    return { type: "details" }
  }
  return { type: "details" }
}

/**
 * Status used for edit-drawer chrome (pill + header): billing partial overlays active appointment
 * statuses the same way as the calendar card visual status.
 */
export function getAppointmentEditAppearanceStatus(
  appointmentStatus: string | null | undefined,
  linkedSale: unknown | null
): string {
  const base =
    typeof appointmentStatus === "string" && appointmentStatus.length > 0 ? appointmentStatus : "scheduled"
  if (base === "missed") return "missed"
  if (
    linkedSale &&
    saleRecordIsPartialPayment(linkedSale) &&
    base !== "completed" &&
    base !== "cancelled" &&
    base !== "cancelled_at_billing" &&
    base !== "missed"
  ) {
    return "partial_payment"
  }
  return base
}

/**
 * Full-width sheet header strip (edit drawer): background + bottom border aligned with calendar tones.
 */
export function getAppointmentStatusSheetHeaderClass(status: string | null | undefined): string {
  const s = typeof status === "string" && status.length > 0 ? status : "scheduled"
  switch (s) {
    case "scheduled":
      return "bg-slate-100/90 border-b border-slate-300/80"
    case "confirmed":
      return "bg-cyan-100/90 border-b border-cyan-300/80"
    case "arrived":
      return "bg-blue-100/90 border-b border-blue-300/80"
    case "partial_payment":
      return "bg-amber-100/90 border-b border-amber-300/80"
    case "service_started":
      return "bg-indigo-100/90 border-b border-indigo-300/80"
    case "completed":
      return "bg-emerald-100/90 border-b border-emerald-300/80"
    case "missed":
      return "bg-rose-100/90 border-b border-rose-300/80"
    case "cancelled":
      return "bg-red-100/90 border-b border-red-300/80"
    case "cancelled_at_billing":
      return "bg-zinc-100/90 border-b border-zinc-300/80"
    default:
      return "bg-slate-50/90 border-b border-slate-200/75"
  }
}

export function getServiceDisplayNames(apt: {
  serviceId?: { name?: string; _id?: unknown }
  additionalServices?: Array<{ name?: string }>
}): string[] {
  const svc = apt?.serviceId
  const primary = (typeof svc === "object" && svc?.name) || "Service"
  const additional = (apt?.additionalServices || []).map((s) => s?.name).filter(Boolean) as string[]
  return [primary, ...additional]
}

/** List view: primary duration = service duration, else appointment duration, else 60; + additional rows. */
export function getAppointmentTotalDurationList(apt: {
  duration?: number
  serviceId?: { duration?: number }
  additionalServices?: Array<{ duration?: number }>
}): number {
  const primary = apt?.serviceId?.duration ?? apt?.duration ?? 60
  const additional = (apt?.additionalServices || []).reduce((sum, s) => sum + (s.duration ?? 0), 0)
  return primary + additional
}

/**
 * Grid view: if `apt.duration` is set and positive, treat it as full duration (e.g. resize override).
 * Otherwise primary = service default or 60, + additional services.
 */
export function getAppointmentTotalDurationGrid(apt: {
  duration?: number
  serviceId?: { duration?: number }
  additionalServices?: Array<{ duration?: number }>
}): number {
  if (apt?.duration != null && apt.duration > 0) return apt.duration
  const primary = apt?.serviceId?.duration ?? 60
  const additional = (apt?.additionalServices || []).reduce((sum, s) => sum + (s.duration ?? 0), 0)
  return primary + additional
}

/**
 * Wall-clock window (minutes from local midnight) for calendar layout and labels.
 * Prefers `startAt`/`endAt` when they fall on `apt.date` so the grid matches server conflict math;
 * otherwise returns null so callers use `time` + duration.
 */
export function getAppointmentGridWindowMinutes(apt: {
  date?: string
  startAt?: string | Date | null
  endAt?: string | Date | null
}): { startM: number; endM: number } | null {
  const raw = apt.date?.slice?.(0, 10)
  if (!raw) return null
  const parts = raw.split("-").map((x) => parseInt(x, 10))
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null
  const [y, mo, d] = parts

  if (apt.startAt == null || apt.endAt == null) return null
  const s = typeof apt.startAt === "string" ? new Date(apt.startAt) : apt.startAt
  const e = typeof apt.endAt === "string" ? new Date(apt.endAt) : apt.endAt
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null

  if (s.getFullYear() !== y || s.getMonth() + 1 !== mo || s.getDate() !== d) return null

  const startM = s.getHours() * 60 + s.getMinutes() + s.getSeconds() / 60
  let endM = e.getHours() * 60 + e.getMinutes() + e.getSeconds() / 60

  const endY = e.getFullYear()
  const endMo = e.getMonth() + 1
  const endD = e.getDate()
  if (endY !== y || endMo !== mo || endD !== d) {
    const startOrd = s.getFullYear() * 400 + (s.getMonth() + 1) * 32 + s.getDate()
    const endOrd = endY * 400 + endMo * 32 + endD
    if (endOrd > startOrd) endM += 24 * 60
    else return null
  }

  if (endM <= startM) endM += 24 * 60
  const span = endM - startM
  if (span <= 0 || span > 24 * 60) return null

  return { startM, endM }
}

export function getBookingGroupSiblings<T extends { bookingGroupId?: string | null; date?: unknown }>(
  appointments: T[],
  anchor: T
): T[] {
  const bg = anchor.bookingGroupId
  if (!bg) return [anchor]
  return appointments.filter(
    (apt) => apt.bookingGroupId === bg && appointmentsOnSameVisitDate(apt, anchor)
  )
}

/** Lines for Quick Sale prefill — one card may expand to primary + additional services. */
export function collectSaleLinesFromAppointmentCard(card: any): SaleServiceLine[] {
  const sid = card.staffId?._id || card.staffId
  const sname = card.staffId?.name || ""
  const result: SaleServiceLine[] = []
  if (card.additionalServices && card.additionalServices.length > 0) {
    const primary = card.serviceId
    const primaryId =
      typeof primary === "object" && primary && "_id" in primary && (primary as { _id?: unknown })._id != null
        ? String((primary as { _id: unknown })._id)
        : String(primary ?? "")
    result.push({
      serviceId: primaryId,
      staffId: String(sid ?? ""),
      staffName: sname,
      price: (typeof primary === "object" && primary && "price" in primary ? (primary as { price?: number }).price : undefined) ?? card.price ?? 0,
    })
    for (const s of card.additionalServices) {
      result.push({
        serviceId: s._id != null ? String(s._id) : String(s),
        staffId: String(sid ?? ""),
        staffName: sname,
        price: s.price ?? 0,
      })
    }
  } else {
    const svc = card.serviceId
    const svcId =
      typeof svc === "object" && svc && "_id" in svc && (svc as { _id?: unknown })._id != null
        ? String((svc as { _id: unknown })._id)
        : String(svc ?? "")
    result.push({
      serviceId: svcId,
      staffId: String(sid ?? ""),
      staffName: sname,
      price: card.price ?? (typeof svc === "object" && svc && "price" in svc ? (svc as { price?: number }).price : undefined) ?? 0,
    })
  }
  return result
}

/** Payload encoded in `?appointment=` for `/quick-sale` (Raise Sale from calendar). */
export function buildRaiseSaleAppointmentPayload(
  anchor: any,
  siblings: any[],
  allServices: SaleServiceLine[]
): Record<string, unknown> {
  const allAppointmentIds = siblings.map((sib) => sib._id)
  return {
    appointmentId: anchor._id,
    linkedAppointmentIds: allAppointmentIds,
    bookingGroupId: anchor.bookingGroupId || undefined,
    clientId: anchor.clientId?._id || anchor.clientId,
    clientName: anchor.clientId?.name || "",
    date: anchor.date,
    time: anchor.time,
    services: allServices.length > 0 ? allServices : undefined,
    serviceId: allServices.length === 1 ? allServices[0].serviceId : undefined,
    serviceName: anchor.serviceId?.name || "",
    servicePrice: anchor.price || 0,
    serviceDuration: anchor.duration || 0,
    staffId: anchor.staffId?._id || anchor.staffId || "",
    staffName: anchor.staffId?.name || "",
  }
}
