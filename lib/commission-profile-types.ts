export interface CommissionProfile {
  id?: string
  _id?: string
  name: string
  type: "target_based" | "item_based"
  description?: string
  
  // Common fields
  calculationInterval: "daily" | "monthly"
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
  
  // Item-Based Profile (for future)
  itemRates?: Array<{
    itemType: string
    rate: number
    calculateBy: "percent" | "fixed"
  }>
  
  isActive: boolean
  createdAt: string
  updatedAt: string
  createdBy?: string
}

export interface CommissionProfileFormData {
  name: string
  type: "target_based" | "item_based"
  description?: string
  calculationInterval: "daily" | "monthly"
  qualifyingItems: string[]
  includeTax: boolean
  cascadingCommission?: boolean
  targetTiers?: Array<{
    from: number
    to: number
    calculateBy: "percent" | "fixed"
    value: number
  }>
}

export const COMMISSION_PROFILE_TYPES = {
  target_based: "Commission by Target",
  item_based: "Commission by Item"
} as const

export const CALCULATION_INTERVALS = {
  daily: "Daily",
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
