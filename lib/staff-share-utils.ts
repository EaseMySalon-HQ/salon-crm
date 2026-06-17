import type { StaffContribution } from "@/components/ui/multi-staff-selector"

export const STAFF_SHARE_VALIDATION_MESSAGE =
  "Total staff share must be exactly 100%."

/** Equal split that always sums to 100 (e.g. 3 → 34, 33, 33). */
export function equalStaffSharePercentages(count: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [100]
  const base = Math.floor(100 / count)
  const remainder = 100 - base * count
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0))
}

export function staffContributionsTotalPercent(
  contributions: Array<{ percentage?: number }>
): number {
  return contributions.reduce((sum, c) => sum + (Number(c.percentage) || 0), 0)
}

export function isStaffShareValid(
  contributions: Array<{ percentage?: number }>
): boolean {
  if (contributions.length === 0) return false
  if (contributions.length === 1) return true
  return Math.abs(staffContributionsTotalPercent(contributions) - 100) < 0.01
}

export function buildStaffContributions(
  staffIds: string[],
  staffList: Array<{ _id?: string; id?: string; name: string }>,
  percentages: number[],
  serviceTotal = 0
): StaffContribution[] {
  return staffIds.map((staffId, i) => {
    const staff = staffList.find((s) => (s._id || s.id) === staffId)
    const pct = Number(percentages[i]) || 0
    return {
      staffId,
      staffName: staff?.name || "Unknown Staff",
      percentage: pct,
      amount: serviceTotal > 0 ? (serviceTotal * pct) / 100 : 0,
    }
  })
}

export function contributionsFromLegacyStaff(
  staffId: string,
  staffName: string,
  existing?: StaffContribution[] | null
): StaffContribution[] {
  if (existing && existing.length > 0) {
    return existing.map((c) => ({
      staffId: c.staffId,
      staffName: c.staffName,
      percentage: Number(c.percentage) || 0,
      amount: Number(c.amount) || 0,
    }))
  }
  if (!staffId) return []
  return [{ staffId, staffName, percentage: 100, amount: 0 }]
}

export function primaryStaffIdFromContributions(
  contributions: StaffContribution[] | undefined
): string {
  return contributions?.[0]?.staffId || ""
}

export function formatStaffContributionsLabel(
  contributions: StaffContribution[] | undefined,
  fallbackName = "Select Staff"
): string {
  if (!contributions?.length) return fallbackName
  if (contributions.length === 1) {
    return contributions[0].staffName || fallbackName
  }
  return contributions
    .map((c) => `${c.staffName} ${Math.round(Number(c.percentage) || 0)}%`)
    .join(" · ")
}
