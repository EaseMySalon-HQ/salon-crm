import {
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns"

import type { CommissionProfile } from "@/lib/commission-profile-types"
import { CALCULATION_INTERVALS } from "@/lib/commission-profile-types"
import { CommissionProfileCalculator } from "@/lib/commission-profile-calculator"

export interface StaffTargetProgress {
  progressPercent: number
  currentRevenue: number
  targetAmount: number
  profileName: string
}

export interface StaffTargetProgressRow extends StaffTargetProgress {
  staffId: string
  staffName: string
  profileId: string
  calculationInterval: CommissionProfile["calculationInterval"]
  periodLabel: string
  dateFrom: string
  dateTo: string
}

const CANCELLED_STATUSES = new Set(["cancelled", "Cancelled"])

export function commissionIntervalRange(
  interval: CommissionProfile["calculationInterval"],
  anchorYmd: string
): { dateFrom: string; dateTo: string } {
  const anchor = parseISO(`${anchorYmd}T12:00:00`)
  if (interval === "daily") {
    return { dateFrom: anchorYmd, dateTo: anchorYmd }
  }
  if (interval === "weekly") {
    return {
      dateFrom: format(startOfWeek(anchor, { weekStartsOn: 0 }), "yyyy-MM-dd"),
      dateTo: format(endOfWeek(anchor, { weekStartsOn: 0 }), "yyyy-MM-dd"),
    }
  }
  return {
    dateFrom: format(startOfMonth(anchor), "yyyy-MM-dd"),
    dateTo: format(endOfMonth(anchor), "yyyy-MM-dd"),
  }
}

export function formatCommissionPeriodLabel(
  interval: CommissionProfile["calculationInterval"],
  anchorYmd: string
): string {
  const anchor = parseISO(`${anchorYmd}T12:00:00`)
  if (interval === "daily") {
    return format(anchor, "d MMM yyyy")
  }
  if (interval === "weekly") {
    const start = startOfWeek(anchor, { weekStartsOn: 0 })
    const end = endOfWeek(anchor, { weekStartsOn: 0 })
    return `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`
  }
  return format(anchor, "MMMM yyyy")
}

export function profileKey(p: CommissionProfile): string {
  return String(p.id ?? p._id ?? "")
}

export function getTargetProfilesForStaff(
  profileIds: string[],
  profiles: CommissionProfile[]
): CommissionProfile[] {
  const out: CommissionProfile[] = []
  for (const id of profileIds) {
    const profile = profiles.find((p) => profileKey(p) === String(id))
    if (
      profile?.type === "target_based" &&
      profile.isActive !== false &&
      profile.targetTiers?.length
    ) {
      out.push(profile)
    }
  }
  return out
}

export function getPrimaryTargetProfile(
  profileIds: string[],
  profiles: CommissionProfile[]
): CommissionProfile | null {
  return getTargetProfilesForStaff(profileIds, profiles)[0] ?? null
}

/** Lowest positive tier `from` is the target amount for progress tracking. */
export function getTargetAmountFromProfile(profile: CommissionProfile): number | null {
  const tiers = profile.targetTiers
  if (!tiers?.length) return null
  const sorted = [...tiers]
    .filter((t) => t.from > 0)
    .sort((a, b) => a.from - b.from)
  const amount = sorted[0]?.from ?? 0
  return amount > 0 ? amount : null
}

export function unionIntervalForTargetStaff(
  anchorYmd: string,
  staffList: Array<{ commissionProfileIds?: string[] }>,
  profiles: CommissionProfile[]
): { dateFrom: string; dateTo: string } | null {
  let dateFrom: string | null = null
  let dateTo: string | null = null

  for (const staff of staffList) {
    for (const targetProfile of getTargetProfilesForStaff(staff.commissionProfileIds ?? [], profiles)) {
      const range = commissionIntervalRange(targetProfile.calculationInterval, anchorYmd)
      if (!dateFrom || range.dateFrom < dateFrom) dateFrom = range.dateFrom
      if (!dateTo || range.dateTo > dateTo) dateTo = range.dateTo
    }
  }

  if (!dateFrom || !dateTo) return null
  return { dateFrom, dateTo }
}

function filterSalesForRange(
  sales: Array<Record<string, unknown>>,
  dateFrom: string,
  dateTo: string
): Array<Record<string, unknown>> {
  return sales.filter((sale) => {
    const d = String(sale.date || "").slice(0, 10)
    if (!d || d < dateFrom || d > dateTo) return false
    const status = sale.status != null ? String(sale.status) : ""
    if (status && CANCELLED_STATUSES.has(status)) return false
    return true
  })
}

function progressForStaffProfile(
  staff: { _id: string; name: string },
  profile: CommissionProfile,
  sales: Array<Record<string, unknown>>,
  anchorYmd: string
): StaffTargetProgressRow | null {
  const targetAmount = getTargetAmountFromProfile(profile)
  if (!targetAmount) return null

  const { dateFrom, dateTo } = commissionIntervalRange(profile.calculationInterval, anchorYmd)
  const filtered = filterSalesForRange(sales, dateFrom, dateTo)
  const staffId = String(staff._id)
  const pid = profileKey(profile)

  const result = CommissionProfileCalculator.calculateMultipleSalesCommission(
    filtered as Parameters<typeof CommissionProfileCalculator.calculateMultipleSalesCommission>[0],
    [profile],
    staffId,
    staff.name
  )

  const breakdown = result?.profileBreakdown?.find(
    (b) => b.profileType === "target_based" && b.profileId === pid
  )
  const currentRevenue = breakdown?.revenue ?? 0
  const progressPercent = Math.min(100, Math.max(0, (currentRevenue / targetAmount) * 100))

  return {
    staffId,
    staffName: staff.name,
    profileId: pid,
    profileName: profile.name,
    calculationInterval: profile.calculationInterval,
    periodLabel: formatCommissionPeriodLabel(profile.calculationInterval, anchorYmd),
    dateFrom,
    dateTo,
    progressPercent,
    currentRevenue,
    targetAmount,
  }
}

export function buildStaffTargetProgressMap(
  staffList: Array<{ _id: string; name: string; commissionProfileIds?: string[] }>,
  profiles: CommissionProfile[],
  sales: Array<Record<string, unknown>>,
  anchorYmd: string
): Map<string, StaffTargetProgress> {
  const map = new Map<string, StaffTargetProgress>()
  for (const staff of staffList) {
    const targetProfile = getPrimaryTargetProfile(staff.commissionProfileIds ?? [], profiles)
    if (!targetProfile) continue
    const row = progressForStaffProfile(staff, targetProfile, sales, anchorYmd)
    if (row) map.set(String(staff._id), row)
  }
  return map
}

export function buildStaffTargetProgressRows(
  staffList: Array<{ _id: string; name: string; commissionProfileIds?: string[] }>,
  profiles: CommissionProfile[],
  sales: Array<Record<string, unknown>>,
  anchorYmd: string
): StaffTargetProgressRow[] {
  const rows: StaffTargetProgressRow[] = []

  for (const staff of staffList) {
    const targetProfiles = getTargetProfilesForStaff(staff.commissionProfileIds ?? [], profiles)
    for (const profile of targetProfiles) {
      const row = progressForStaffProfile(staff, profile, sales, anchorYmd)
      if (row) rows.push(row)
    }
  }

  return rows.sort((a, b) => {
    const nameCmp = a.staffName.localeCompare(b.staffName)
    if (nameCmp !== 0) return nameCmp
    return a.profileName.localeCompare(b.profileName)
  })
}

export function formatTargetProgressInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

export function intervalLabel(interval: CommissionProfile["calculationInterval"]): string {
  return CALCULATION_INTERVALS[interval] ?? interval
}
