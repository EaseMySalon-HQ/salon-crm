import type { BookingHeroThemeId } from "@/lib/booking-hero-themes"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

export type WeekDay =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday"

export interface DayHours {
  open: string
  close: string
  closed: boolean
}

export interface PublicBookingProfile {
  code: string
  name: string
  businessType: string
  address: {
    street?: string
    city?: string
    state?: string
    zipCode?: string
  }
  contact: {
    phone?: string
    email?: string
    website?: string
  }
  timezone: string
  slotIntervalMinutes: number
  advanceBookingDays: number
  operatingHours: Record<WeekDay, DayHours>
  bookingTagline?: string
  showcaseImages?: string[]
  bookingHeroTheme?: BookingHeroThemeId
  logoUrl?: string | null
}

export interface PublicBookingService {
  id: string
  name: string
  category: string
  duration: number
  price: number
  description: string
}

export interface PublicBookingStaff {
  id: string
  name: string
  avatar: string | null
}

export type PublicSlotStatus = "available" | "unavailable" | "fully_booked" | "outside_working_hours"

export type PublicSlotReason = "past" | "closed" | "outside_working_hours"

export interface PublicStaffAssignment {
  serviceId: string
  staffId: string
  staffName: string
}

export interface PublicBookingSlot {
  time: string
  startAt: string
  endAt: string
  status: PublicSlotStatus
  reason?: PublicSlotReason | null
  staffAssignments: PublicStaffAssignment[]
}

export interface PublicCartItem {
  serviceId: string
  staffId?: string | null
}

export interface CartLineItem extends PublicBookingService {
  cartId: string
  staffId: string | null
  staffName?: string
}

async function publicBookingFetch<T>(
  code: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const normalized = encodeURIComponent(code.trim().toUpperCase())
  const res = await fetch(`${API_URL}/public/booking/${normalized}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) {
    const err = new Error(json?.error || `Request failed (${res.status})`) as Error & {
      code?: string
      status?: number
    }
    err.code = json?.code
    err.status = res.status
    throw err
  }
  return json.data as T
}

export async function fetchPublicBookingProfile(code: string): Promise<PublicBookingProfile> {
  return publicBookingFetch(code, "/profile")
}

export async function fetchPublicBookingServices(
  code: string,
  search = ""
): Promise<PublicBookingService[]> {
  const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""
  const data = await publicBookingFetch<{ services: PublicBookingService[] }>(code, `/services${q}`)
  return data.services
}

export async function fetchPublicBookingStaff(code: string): Promise<PublicBookingStaff[]> {
  const data = await publicBookingFetch<{ staff: PublicBookingStaff[] }>(code, "/staff")
  return data.staff
}

export async function fetchPublicBookingStaffForService(
  code: string,
  serviceId: string
): Promise<PublicBookingStaff[]> {
  const data = await publicBookingFetch<{ staff: PublicBookingStaff[] }>(
    code,
    `/services/${encodeURIComponent(serviceId)}/staff`
  )
  return data.staff
}

export async function fetchPublicBookingSlots(
  code: string,
  body: { date: string; items: PublicCartItem[]; holdIds?: string[] }
): Promise<{
  date: string
  timezone: string
  slotIntervalMinutes: number
  totalDurationMinutes: number
  slots: PublicBookingSlot[]
  closed?: boolean
}> {
  return publicBookingFetch(code, "/slots", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export async function createPublicBookingHolds(
  code: string,
  body: { date: string; startAt: string; items: PublicCartItem[] }
): Promise<{
  holdIds: string[]
  expiresAt: string | null
  staffAssignments: PublicStaffAssignment[]
}> {
  return publicBookingFetch(code, "/holds", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export async function submitPublicBooking(
  code: string,
  body: {
    date: string
    startAt: string
    items: PublicCartItem[]
    holdIds?: string[]
    customer: {
      name: string
      phone: string
      email?: string
      notes?: string
    }
  }
): Promise<{
  timezone: string
}> {
  return publicBookingFetch(code, "/book", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function formatBookingPrice(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return `${h} hr`
  return `${h} hr ${m} min`
}

export function formatSlotTimeDisplay(time24: string): string {
  const [hStr, mStr] = time24.split(":")
  let h = Number(hStr)
  const m = Number(mStr)
  const period = h >= 12 ? "PM" : "AM"
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${String(m).padStart(2, "0")} ${period}`
}

export function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function isoToDate(iso: string): Date | undefined {
  if (!iso) return undefined
  const parts = iso.split("-").map(Number)
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return undefined
  return new Date(parts[0], parts[1] - 1, parts[2])
}

export function formatLongDate(iso: string): string {
  const d = isoToDate(iso)
  if (!d) return iso
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

export function isDayClosed(profile: PublicBookingProfile, date: Date): boolean {
  const keys: WeekDay[] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ]
  const key = keys[date.getDay()]
  return profile.operatingHours[key]?.closed === true
}

export function maxBookingDate(advanceDays: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + advanceDays)
  return d
}

const WEEKDAY_KEYS: WeekDay[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]

function formatTime12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":")
  let h = Number(hStr)
  const m = Number(mStr)
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm
  const period = h >= 12 ? "PM" : "AM"
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${String(m).padStart(2, "0")} ${period}`
}

export function formatPublicAddress(profile: PublicBookingProfile): string {
  const parts = [
    profile.address?.street,
    profile.address?.city,
    profile.address?.state,
    profile.address?.zipCode,
  ].filter(Boolean)
  return parts.join(", ")
}

export function formatTodayHoursLabel(profile: PublicBookingProfile): string | null {
  const key = WEEKDAY_KEYS[new Date().getDay()]
  const day = profile.operatingHours[key]
  if (!day) return null
  if (day.closed) return "Closed today"
  if (day.open && day.close) {
    return `${formatTime12h(day.open)} – ${formatTime12h(day.close)}`
  }
  return null
}
