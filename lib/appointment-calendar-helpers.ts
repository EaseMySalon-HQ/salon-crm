/**
 * Pure helpers shared by appointments list + grid (display, duration, Raise Sale payload).
 */

export type SaleServiceLine = {
  serviceId: string
  staffId: string
  staffName: string
  price: number
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
