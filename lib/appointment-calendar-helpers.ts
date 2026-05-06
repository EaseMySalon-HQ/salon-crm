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

/** True when a sale record has both paid and remaining balance (matches calendar partial tint). */
export function saleRecordIsPartialPayment(s: unknown): boolean {
  const ps = (s as { paymentStatus?: { paidAmount?: number; remainingAmount?: number } })?.paymentStatus
  if (!ps) return false
  const paid = Number(ps.paidAmount) || 0
  const rem = Number(ps.remainingAmount) || 0
  return paid > 0 && rem > 0.005
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

export function getBookingGroupSiblings<T extends { bookingGroupId?: string | null }>(
  appointments: T[],
  anchor: T
): T[] {
  const bg = anchor.bookingGroupId
  if (!bg) return [anchor]
  return appointments.filter((apt) => apt.bookingGroupId === bg)
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
