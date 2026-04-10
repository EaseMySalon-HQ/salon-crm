export type CommissionProfileType = "target_based" | "item_based" | "service_based"

export interface ServiceCommissionRule {
  serviceId: string
  calculateBy: "percent" | "fixed"
  value: number
}

export interface CommissionProfile {
  id?: string
  _id?: string
  name: string
  type: CommissionProfileType
  description?: string

  // Common fields
  calculationInterval: "daily" | "weekly" | "monthly"
  qualifyingItems: string[] // Service, Product, Package, Membership, Prepaid
  includeTax: boolean

  // Target-Based Profile
  cascadingCommission?: boolean
  targetTiers?: Array<{
    from: number
    to: number
    calculateBy: "percent" | "fixed"
    value: number
  }>

  // Item-Based Profile (legacy)
  itemRates?: Array<{
    itemType: string
    rate: number
    calculateBy: "percent" | "fixed"
  }>

  // Service-Based Profile
  serviceRules?: ServiceCommissionRule[]

  isActive: boolean
  createdAt: string
  updatedAt: string
  createdBy?: string
}

export interface CommissionProfileFormData {
  name: string
  type: CommissionProfileType
  description?: string
  calculationInterval: "daily" | "weekly" | "monthly"
  qualifyingItems: string[]
  includeTax: boolean
  cascadingCommission?: boolean
  targetTiers?: Array<{
    from: number
    to: number
    calculateBy: "percent" | "fixed"
    value: number
  }>
  serviceRules?: ServiceCommissionRule[]
}

export const COMMISSION_PROFILE_TYPES = {
  target_based: "Commission by Target",
  item_based: "Commission by Item",
  service_based: "Commission by Service"
} as const

export const CALCULATION_INTERVALS = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly"
} as const

export const QUALIFYING_ITEMS = [
  "Service",
  "Product",
  "Package",
  "Membership",
  "Prepaid"
] as const

// No default profiles should be created automatically.
export const DEFAULT_COMMISSION_PROFILES: CommissionProfile[] = []

/** Normalize form data for create/update API (type-specific fields). */
export function toCommissionProfileApiBody(data: CommissionProfileFormData): Record<string, unknown> {
  const base = {
    name: data.name.trim(),
    type: data.type,
    description: (data.description ?? "").trim(),
    calculationInterval: data.calculationInterval
  }

  if (data.type === "service_based") {
    const serviceRules = (data.serviceRules ?? [])
      .filter((r) => r.serviceId && String(r.serviceId).trim() !== "")
      .map((r) => ({
        serviceId: String(r.serviceId),
        calculateBy: r.calculateBy,
        value: Number(r.value)
      }))
    return {
      ...base,
      qualifyingItems: [],
      includeTax: false,
      cascadingCommission: false,
      targetTiers: [],
      itemRates: [],
      serviceRules
    }
  }

  return {
    ...base,
    qualifyingItems: data.qualifyingItems,
    includeTax: data.includeTax,
    cascadingCommission: data.cascadingCommission ?? false,
    targetTiers: data.targetTiers ?? [],
    itemRates: [],
    serviceRules: []
  }
}
