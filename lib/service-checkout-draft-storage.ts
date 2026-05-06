import type {
  ServiceCheckoutLine,
  ServiceCheckoutMembershipLine,
  ServiceCheckoutPackageLine,
  ServiceCheckoutPrepaidLine,
  ServiceCheckoutProductLine,
} from "@/components/appointments/service-checkout-dialog"

/** Legacy: one key per client + appointment */
const V1_PREFIX = "salon-crm:service-checkout-draft:v1:"
/** New: one UUID key per save (multiple drafts allowed). */
const V2_PREFIX = "salon-crm:service-checkout-draft:v2:"

export const SERVICE_CHECKOUT_DRAFT_CHANGED_EVENT = "service-checkout-draft-changed"

/** Serialized draft body (v1 and v2 files). */
export type ServiceCheckoutDraftPayload = {
  clientId: string
  clientName?: string
  appointmentId: string | null
  bookingSnapshot: ServiceCheckoutLine[]
  lines: ServiceCheckoutLine[]
  productLines: ServiceCheckoutProductLine[]
  membershipLines: ServiceCheckoutMembershipLine[]
  packageLines: ServiceCheckoutPackageLine[]
  prepaidLines: ServiceCheckoutPrepaidLine[]
  savedAt: string
}

export type ServiceCheckoutDraftV1 = ServiceCheckoutDraftPayload & { v: 1 }

type StoredDraftFile = ServiceCheckoutDraftPayload & { v: 1 | 2; draftId?: string }

export type ServiceCheckoutDraftChipMeta = {
  /** Opaque token: `2|uuid` (new) or `1|clientId|aid` (legacy key). */
  draftRef: string
  clientId: string
  appointmentId: string | null
  clientName: string
  savedAt: string
}

export function encodeV1DraftRef(clientId: string, appointmentId: string | null | undefined): string {
  const aid = appointmentId ? String(appointmentId) : "new"
  return `1|${clientId}|${aid}`
}

function decodeV1DraftRef(ref: string): { clientId: string; appointmentId: string | null } | null {
  if (!ref.startsWith("1|")) return null
  const parts = ref.split("|")
  if (parts.length < 3) return null
  const clientId = parts[1]
  const aid = parts.slice(2).join("|")
  if (!clientId || !aid) return null
  return { clientId, appointmentId: aid === "new" ? null : aid }
}

export function encodeV2DraftRef(draftId: string): string {
  return `2|${draftId}`
}

function decodeV2DraftRef(ref: string): string | null {
  if (!ref.startsWith("2|")) return null
  const id = ref.slice(2)
  return id || null
}

function v1StorageKey(clientId: string, appointmentId: string | null | undefined): string {
  const aid = appointmentId ? String(appointmentId) : "new"
  return `${V1_PREFIX}${clientId}:${aid}`
}

function parseDraftFile(raw: string): ServiceCheckoutDraftPayload | null {
  try {
    const parsed = JSON.parse(raw) as StoredDraftFile
    if (!parsed || (parsed.v !== 1 && parsed.v !== 2) || !Array.isArray(parsed.lines)) return null
    return {
      clientId: parsed.clientId,
      clientName: parsed.clientName,
      appointmentId: parsed.appointmentId,
      bookingSnapshot: parsed.bookingSnapshot,
      lines: parsed.lines,
      productLines: parsed.productLines,
      membershipLines: parsed.membershipLines,
      packageLines: parsed.packageLines,
      prepaidLines: parsed.prepaidLines,
      savedAt: parsed.savedAt,
    }
  } catch {
    return null
  }
}

/** Read a draft by storage token from a pill or active session. */
export function readServiceCheckoutDraftByRef(draftRef: string): ServiceCheckoutDraftPayload | null {
  if (typeof window === "undefined" || !draftRef) return null
  const v2Id = decodeV2DraftRef(draftRef)
  if (v2Id) {
    const raw = localStorage.getItem(V2_PREFIX + v2Id)
    if (!raw) return null
    return parseDraftFile(raw)
  }
  const v1 = decodeV1DraftRef(draftRef)
  if (v1) {
    const raw = localStorage.getItem(v1StorageKey(v1.clientId, v1.appointmentId))
    if (!raw) return null
    return parseDraftFile(raw)
  }
  return null
}

/** Each save creates a new v2 entry (does not overwrite previous pills). Returns `draftRef` for the session. */
export function createServiceCheckoutDraft(payload: ServiceCheckoutDraftPayload): string {
  if (typeof window === "undefined") return ""
  const draftId = crypto.randomUUID()
  const full: StoredDraftFile = {
    v: 2,
    draftId,
    ...payload,
  }
  localStorage.setItem(V2_PREFIX + draftId, JSON.stringify(full))
  return encodeV2DraftRef(draftId)
}

export function clearServiceCheckoutDraftByRef(draftRef: string): void {
  if (typeof window === "undefined" || !draftRef) return
  const v2Id = decodeV2DraftRef(draftRef)
  if (v2Id) {
    localStorage.removeItem(V2_PREFIX + v2Id)
    return
  }
  const v1 = decodeV1DraftRef(draftRef)
  if (v1) {
    localStorage.removeItem(v1StorageKey(v1.clientId, v1.appointmentId))
  }
}

/** All saved drafts (legacy v1 keys + v2 UUID keys), newest first. */
export function listServiceCheckoutDrafts(): ServiceCheckoutDraftChipMeta[] {
  if (typeof window === "undefined") return []
  const out: ServiceCheckoutDraftChipMeta[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    if (key.startsWith(V2_PREFIX)) {
      const draftId = key.slice(V2_PREFIX.length)
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const body = parseDraftFile(raw)
      if (!body) continue
      const name = body.clientName?.trim() || "Saved checkout"
      out.push({
        draftRef: encodeV2DraftRef(draftId),
        clientId: body.clientId,
        appointmentId: body.appointmentId,
        clientName: name,
        savedAt: body.savedAt,
      })
    } else if (key.startsWith(V1_PREFIX)) {
      const rest = key.slice(V1_PREFIX.length)
      const colon = rest.lastIndexOf(":")
      if (colon <= 0) continue
      const clientIdFromKey = rest.slice(0, colon)
      const aidRaw = rest.slice(colon + 1)
      const appointmentId = aidRaw === "new" ? null : aidRaw
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const body = parseDraftFile(raw)
      if (!body) continue
      const name = body.clientName?.trim() || "Saved checkout"
      out.push({
        draftRef: encodeV1DraftRef(clientIdFromKey, appointmentId),
        clientId: body.clientId || clientIdFromKey,
        appointmentId,
        clientName: name,
        savedAt: body.savedAt,
      })
    }
  }
  out.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
  return out
}

export function dispatchServiceCheckoutDraftChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(SERVICE_CHECKOUT_DRAFT_CHANGED_EVENT))
}

export function subscribeServiceCheckoutDraftChanged(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const wrap = () => handler()
  window.addEventListener(SERVICE_CHECKOUT_DRAFT_CHANGED_EVENT, wrap)
  window.addEventListener("storage", wrap)
  return () => {
    window.removeEventListener(SERVICE_CHECKOUT_DRAFT_CHANGED_EVENT, wrap)
    window.removeEventListener("storage", wrap)
  }
}
