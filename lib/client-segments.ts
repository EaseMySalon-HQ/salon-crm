export type ClientSegment = "new" | "regular" | "vip" | "at_risk" | "win_back"

export interface ClientSegmentRules {
  newMaxVisits: number
  vipSpendThreshold: number
  atRiskAfterDays: number
  winBackAfterDays: number
}

export const DEFAULT_CLIENT_SEGMENT_RULES: ClientSegmentRules = {
  newMaxVisits: 2,
  vipSpendThreshold: 50_000,
  atRiskAfterDays: 45,
  winBackAfterDays: 90,
}

/** @deprecated Use DEFAULT_CLIENT_SEGMENT_RULES.vipSpendThreshold */
export const DEFAULT_VIP_THRESHOLD = DEFAULT_CLIENT_SEGMENT_RULES.vipSpendThreshold

export function mergeClientSegmentRules(
  input?: Partial<ClientSegmentRules> | null
): ClientSegmentRules {
  const src = input ?? {}
  return {
    newMaxVisits: positiveInt(src.newMaxVisits, DEFAULT_CLIENT_SEGMENT_RULES.newMaxVisits),
    vipSpendThreshold: positiveNumber(
      src.vipSpendThreshold,
      DEFAULT_CLIENT_SEGMENT_RULES.vipSpendThreshold,
    ),
    atRiskAfterDays: positiveInt(src.atRiskAfterDays, DEFAULT_CLIENT_SEGMENT_RULES.atRiskAfterDays),
    winBackAfterDays: positiveInt(src.winBackAfterDays, DEFAULT_CLIENT_SEGMENT_RULES.winBackAfterDays),
  }
}

function positiveInt(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.floor(n)
}

function positiveNumber(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return n
}

export function validateClientSegmentRules(
  input?: Partial<ClientSegmentRules> | null,
): { valid: true; rules: ClientSegmentRules } | { valid: false; error: string } {
  const rules = mergeClientSegmentRules(input)
  if (rules.winBackAfterDays <= rules.atRiskAfterDays) {
    return { valid: false, error: "Win-Back days must be greater than At-Risk start days" }
  }
  return { valid: true, rules }
}

export function buildSegmentOptions(rules: ClientSegmentRules = DEFAULT_CLIENT_SEGMENT_RULES): Array<{
  id: ClientSegment
  label: string
  description: string
}> {
  const atRiskEnd = Math.max(rules.atRiskAfterDays, rules.winBackAfterDays - 1)
  const regularMin = rules.newMaxVisits + 1
  return [
    {
      id: "new",
      label: "New",
      description:
        rules.newMaxVisits <= 1
          ? "First visit"
          : `Up to ${rules.newMaxVisits} visits`,
    },
    {
      id: "regular",
      label: "Regular",
      description: `${regularMin}+ visits, recently engaged`,
    },
    {
      id: "vip",
      label: "VIP",
      description: `Lifetime spend ≥ ₹${rules.vipSpendThreshold.toLocaleString("en-IN")}`,
    },
    {
      id: "at_risk",
      label: "At-Risk",
      description: `No visit in ${rules.atRiskAfterDays}–${atRiskEnd} days`,
    },
    {
      id: "win_back",
      label: "Win-Back",
      description: `No visit in ${rules.winBackAfterDays}+ days`,
    },
  ]
}

export const SEGMENT_OPTIONS = buildSegmentOptions()

export type LastVisitFilter =
  | "any"
  | "under_30"
  | "30_90"
  | "90_180"
  | "over_180"
  | "never"

export const LAST_VISIT_OPTIONS: Array<{ id: LastVisitFilter; label: string }> = [
  { id: "any", label: "Any time" },
  { id: "under_30", label: "Within 30 days" },
  { id: "30_90", label: "30–90 days ago" },
  { id: "90_180", label: "90–180 days ago" },
  { id: "over_180", label: "Over 180 days ago" },
  { id: "never", label: "Never visited" },
]

export type ClientGender = "male" | "female" | "other"

export const GENDER_OPTIONS: Array<{ id: ClientGender; label: string }> = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "other", label: "Other" },
]

export interface ClientFilterState {
  segments: ClientSegment[]
  genders: ClientGender[]
  birthdayThisMonth: boolean
  lastVisit: LastVisitFilter
  spendMin: string
  spendMax: string
  whatsappOptIn: boolean
  hasDues: boolean
}

export const DEFAULT_CLIENT_FILTERS: ClientFilterState = {
  segments: [],
  genders: [],
  birthdayThisMonth: false,
  lastVisit: "any",
  spendMin: "",
  spendMax: "",
  whatsappOptIn: false,
  hasDues: false,
}

export interface ClientSegmentInput {
  totalVisits?: number
  totalSpent?: number
  lastVisit?: string | null
}

export function resolveVipThreshold(settings?: {
  branchManagement?: { vipThreshold?: number }
  vipThreshold?: number
  clientSegmentRules?: Partial<ClientSegmentRules>
} | null): number {
  const fromRules = settings?.clientSegmentRules?.vipSpendThreshold
  if (typeof fromRules === "number" && fromRules > 0) return fromRules
  const fromBranch = settings?.branchManagement?.vipThreshold
  if (typeof fromBranch === "number" && fromBranch > 0) return fromBranch
  const direct = settings?.vipThreshold
  if (typeof direct === "number" && direct > 0) return direct
  return DEFAULT_CLIENT_SEGMENT_RULES.vipSpendThreshold
}

export function resolveClientSegmentRules(settings?: {
  clientSegmentRules?: Partial<ClientSegmentRules>
  branchManagement?: { vipThreshold?: number }
  vipThreshold?: number
} | null): ClientSegmentRules {
  const merged = mergeClientSegmentRules(settings?.clientSegmentRules)
  if (!settings?.clientSegmentRules?.vipSpendThreshold) {
    const legacy = resolveVipThreshold(settings)
    if (legacy !== DEFAULT_CLIENT_SEGMENT_RULES.vipSpendThreshold) {
      return { ...merged, vipSpendThreshold: legacy }
    }
  }
  return merged
}

export function daysSinceLastVisit(lastVisit?: string | null): number | null {
  if (!lastVisit) return null
  const d = new Date(lastVisit)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}

/** Segment rules for marketing / retention filters (v1). */
export function getClientSegment(
  input: ClientSegmentInput,
  rules: ClientSegmentRules = DEFAULT_CLIENT_SEGMENT_RULES,
): ClientSegment {
  const visits = Number(input.totalVisits) || 0
  const spent = Number(input.totalSpent) || 0
  const merged = mergeClientSegmentRules(rules)

  if (visits <= merged.newMaxVisits) return "new"
  if (spent >= merged.vipSpendThreshold) return "vip"

  const days = daysSinceLastVisit(input.lastVisit)
  if (days != null) {
    if (days >= merged.atRiskAfterDays && days < merged.winBackAfterDays) return "at_risk"
    if (days >= merged.winBackAfterDays) return "win_back"
  }

  return "regular"
}

export function segmentLabel(
  segment: ClientSegment,
  rules: ClientSegmentRules = DEFAULT_CLIENT_SEGMENT_RULES,
): string {
  return buildSegmentOptions(rules).find((o) => o.id === segment)?.label ?? segment
}

export function isBirthdayThisMonth(birthdate?: string | null): boolean {
  if (!birthdate) return false
  const d = new Date(birthdate)
  if (Number.isNaN(d.getTime())) return false
  const now = new Date()
  return d.getMonth() === now.getMonth()
}

export function matchesLastVisitFilter(
  lastVisit: string | undefined | null,
  filter: LastVisitFilter,
): boolean {
  if (filter === "any") return true
  if (filter === "never") return !lastVisit
  const days = daysSinceLastVisit(lastVisit)
  if (days == null) return filter === "never"
  switch (filter) {
    case "under_30":
      return days < 30
    case "30_90":
      return days >= 30 && days < 90
    case "90_180":
      return days >= 90 && days < 180
    case "over_180":
      return days >= 180
    default:
      return true
  }
}

export function countActiveClientFilters(filters: ClientFilterState): number {
  let n = 0
  if (filters.segments.length) n += 1
  if (filters.genders.length) n += 1
  if (filters.birthdayThisMonth) n += 1
  if (filters.lastVisit !== "any") n += 1
  if (filters.spendMin.trim() || filters.spendMax.trim()) n += 1
  if (filters.whatsappOptIn) n += 1
  if (filters.hasDues) n += 1
  return n
}

export function hasActiveClientFilters(filters: ClientFilterState): boolean {
  return countActiveClientFilters(filters) > 0
}
