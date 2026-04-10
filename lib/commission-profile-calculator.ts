import { CommissionProfile, type CommissionProfileType } from './commission-profile-types'
import {
  getAttributedRevenueForStaff,
  staffIsAttributedToLineItem,
} from './staff-line-revenue'

export interface SaleItem {
  id: string
  name: string
  type: 'service' | 'product' | 'package' | 'membership' | 'prepaid'
  quantity: number
  price: number
  total: number
  /** Catalog service id when type === 'service' (ObjectId string or populated shape) */
  serviceId?: string | { _id?: string }
  staffId?: string
  staffName?: string
  discount?: number
  discountType?: 'percentage' | 'fixed'
  priceExcludingGST?: number
  taxRate?: number
  taxAmount?: number
  staffContributions?: Array<{
    staffId?: string
    staffName?: string
    percentage?: number
    amount?: number
  }>
}

function normalizeSaleLineServiceId(
  item: Pick<SaleItem, 'type' | 'serviceId'>
): string | null {
  if (String(item.type).toLowerCase() !== 'service' || item.serviceId == null || item.serviceId === '') {
    return null
  }
  const raw = item.serviceId as string | { _id?: string }
  if (typeof raw === 'object' && raw !== null && raw._id != null) {
    return String(raw._id)
  }
  return String(raw)
}

export interface Sale {
  id: string
  receiptNumber: string
  clientId: string
  clientName: string
  clientPhone: string
  date: string
  time: string
  items: SaleItem[]
  subtotal: number
  tip: number
  discount: number
  tax: number
  total: number
  payments: Array<{
    type: string
    amount: number
  }>
  staffId?: string
  staffName?: string
  notes?: string
}

export interface StaffCommissionResult {
  staffId: string
  staffName: string
  totalCommission: number
  totalRevenue: number
  serviceCommission: number
  productCommission: number
  serviceRevenue: number
  productRevenue: number
  serviceCount: number
  productCount: number
  totalTransactions: number
  averageCommissionPerTransaction: number
  effectiveCommissionRate: number
  profileBreakdown: Array<{
    profileId: string
    profileName: string
    profileType?: CommissionProfileType
    commission: number
    revenue: number
    itemCount: number
  }>
}

/**
 * When sale lines lack serviceId (legacy bills), map service name to catalog id so service-based rules match.
 */
export function enrichSalesWithServiceIdsFromCatalog(
  sales: Array<{ items?: SaleItem[] }>,
  services: Array<{ _id?: string; id?: string; name?: string }>
): void {
  const byName = new Map<string, string>()
  for (const s of services) {
    const id = String(s._id ?? s.id ?? '')
    const nm = String(s.name ?? '').trim().toLowerCase()
    if (!id || !nm) continue
    if (!byName.has(nm)) byName.set(nm, id)
  }
  for (const sale of sales) {
    const items = sale.items
    if (!items || !Array.isArray(items)) continue
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as SaleItem
      if (String(item.type).toLowerCase() !== 'service' || normalizeSaleLineServiceId(item)) continue
      const key = String(item.name ?? '').trim().toLowerCase()
      const sid = byName.get(key)
      if (sid) {
        items[i] = { ...item, serviceId: sid }
      }
    }
  }
}

export class CommissionProfileCalculator {
  /**
   * Calculate commission for a single sale based on staff's commission profiles
   */
  static calculateSaleCommission(
    sale: Sale,
    staffCommissionProfiles: CommissionProfile[],
    staffId: string,
    staffName?: string
  ): StaffCommissionResult | null {
    const saleFallback = { staffId: sale.staffId, staffName: sale.staffName }
    // Attribute line totals by staffContributions (split) or legacy single staff on the line
    const staffItems = sale.items
      .filter((item) =>
        staffIsAttributedToLineItem(item, staffId, staffName, saleFallback)
      )
      .map((item) => ({
        ...item,
        total: getAttributedRevenueForStaff(item, staffId, staffName, saleFallback),
      }))

    if (staffItems.length === 0) {
      return null
    }

    // Group items by type
    const serviceItems = staffItems.filter(item => String(item.type).toLowerCase() === 'service')
    const productItems = staffItems.filter(item => item.type === 'product')
    const packageItems = staffItems.filter(item => item.type === 'package')
    const membershipItems = staffItems.filter(item => item.type === 'membership')
    const prepaidItems = staffItems.filter(item => item.type === 'prepaid')

    // Calculate revenue for each item type
    const serviceRevenue = serviceItems.reduce((sum, item) => sum + item.total, 0)
    const productRevenue = productItems.reduce((sum, item) => sum + item.total, 0)
    const packageRevenue = packageItems.reduce((sum, item) => sum + item.total, 0)
    const membershipRevenue = membershipItems.reduce((sum, item) => sum + item.total, 0)
    const prepaidRevenue = prepaidItems.reduce((sum, item) => sum + item.total, 0)

    const totalRevenue = serviceRevenue + productRevenue + packageRevenue + membershipRevenue + prepaidRevenue

    // Calculate commission for each profile
    let totalCommission = 0
    const profileBreakdown: Array<{
      profileId: string
      profileName: string
      profileType?: CommissionProfileType
      commission: number
      revenue: number
      itemCount: number
    }> = []

    for (const profile of staffCommissionProfiles) {
      if (!profile.isActive) continue

      const profileId = String(profile.id ?? profile._id ?? '')

      if (profile.type === 'service_based') {
        if (!profile.serviceRules?.length) {
          continue
        }
        const { commission: profileCommission, revenue: profileRevenue, itemCount: profileItemCount } =
          this.calculateServiceBasedCommission(serviceItems, profile.serviceRules)

        if (profileCommission === 0 && profileRevenue === 0) {
          continue
        }

        totalCommission += profileCommission

        profileBreakdown.push({
          profileId,
          profileName: profile.name,
          profileType: 'service_based',
          commission: profileCommission,
          revenue: profileRevenue,
          itemCount: profileItemCount
        })
        continue
      }

      const qualifying = profile.qualifyingItems ?? []
      let profileRevenue = 0
      let profileItemCount = 0

      // Calculate revenue for this profile based on qualifying items
      if (qualifying.includes('Service')) {
        profileRevenue += serviceRevenue
        profileItemCount += serviceItems.length
      }
      if (qualifying.includes('Product')) {
        profileRevenue += productRevenue
        profileItemCount += productItems.length
      }
      if (qualifying.includes('Package')) {
        profileRevenue += packageRevenue
        profileItemCount += packageItems.length
      }
      if (qualifying.includes('Membership')) {
        profileRevenue += membershipRevenue
        profileItemCount += membershipItems.length
      }
      if (qualifying.includes('Prepaid')) {
        profileRevenue += prepaidRevenue
        profileItemCount += prepaidItems.length
      }

      if (profileRevenue === 0) continue

      // Calculate commission based on profile type
      let profileCommission = 0

      if (profile.type === 'target_based' && profile.targetTiers) {
        profileCommission = this.calculateTargetBasedCommission(profileRevenue, profile.targetTiers, profile.cascadingCommission)
      } else if (profile.type === 'item_based' && profile.itemRates) {
        profileCommission = this.calculateItemBasedCommission(profileRevenue, profile.itemRates, qualifying)
      }

      totalCommission += profileCommission

      profileBreakdown.push({
        profileId,
        profileName: profile.name,
        profileType: profile.type,
        commission: profileCommission,
        revenue: profileRevenue,
        itemCount: profileItemCount
      })
    }

    // Calculate effective commission rate
    const effectiveCommissionRate = totalRevenue > 0 ? (totalCommission / totalRevenue) * 100 : 0

    return {
      staffId,
      staffName: staffName || staffItems[0]?.staffName || staffId,
      totalCommission,
      totalRevenue,
      serviceCommission: profileBreakdown
        .filter(
          (p) =>
            p.profileType === 'service_based' ||
            (p.profileType === 'target_based' && p.profileName.toLowerCase().includes('service'))
        )
        .reduce((sum, p) => sum + p.commission, 0),
      productCommission: profileBreakdown
        .filter(
          (p) =>
            p.profileType === 'item_based' ||
            (p.profileType === 'target_based' && p.profileName.toLowerCase().includes('product'))
        )
        .reduce((sum, p) => sum + p.commission, 0),
      serviceRevenue,
      productRevenue,
      serviceCount: serviceItems.length,
      productCount: productItems.length,
      totalTransactions: 1,
      averageCommissionPerTransaction: totalCommission,
      effectiveCommissionRate,
      profileBreakdown
    }
  }

  /**
   * Calculate commission for multiple sales
   */
  static calculateMultipleSalesCommission(
    sales: Sale[],
    staffCommissionProfiles: CommissionProfile[],
    staffId: string,
    staffName?: string
  ): StaffCommissionResult | null {
    const results = sales
      .map(sale => this.calculateSaleCommission(sale, staffCommissionProfiles, staffId, staffName))
      .filter(result => result !== null) as StaffCommissionResult[]

    if (results.length === 0) {
      return null
    }

    // Aggregate results
    const totalCommission = results.reduce((sum, result) => sum + result.totalCommission, 0)
    const totalRevenue = results.reduce((sum, result) => sum + result.totalRevenue, 0)
    const serviceCommission = results.reduce((sum, result) => sum + result.serviceCommission, 0)
    const productCommission = results.reduce((sum, result) => sum + result.productCommission, 0)
    const serviceRevenue = results.reduce((sum, result) => sum + result.serviceRevenue, 0)
    const productRevenue = results.reduce((sum, result) => sum + result.productRevenue, 0)
    const serviceCount = results.reduce((sum, result) => sum + result.serviceCount, 0)
    const productCount = results.reduce((sum, result) => sum + result.productCount, 0)
    const totalTransactions = results.length

    // Aggregate profile breakdown
    const profileBreakdownMap = new Map<string, {
      profileId: string
      profileName: string
      profileType?: CommissionProfileType
      commission: number
      revenue: number
      itemCount: number
    }>()

    results.forEach(result => {
      result.profileBreakdown.forEach(breakdown => {
        const existing = profileBreakdownMap.get(breakdown.profileId)
        if (existing) {
          existing.commission += breakdown.commission
          existing.revenue += breakdown.revenue
          existing.itemCount += breakdown.itemCount
        } else {
          profileBreakdownMap.set(breakdown.profileId, { ...breakdown })
        }
      })
    })

    const profileBreakdown = Array.from(profileBreakdownMap.values())

    return {
      staffId,
      staffName: results[0].staffName,
      totalCommission,
      totalRevenue,
      serviceCommission,
      productCommission,
      serviceRevenue,
      productRevenue,
      serviceCount,
      productCount,
      totalTransactions,
      averageCommissionPerTransaction: totalTransactions > 0 ? totalCommission / totalTransactions : 0,
      effectiveCommissionRate: totalRevenue > 0 ? (totalCommission / totalRevenue) * 100 : 0,
      profileBreakdown
    }
  }

  /**
   * Calculate commission for all staff members
   */
  static calculateAllStaffCommission(
    sales: Sale[],
    staffMembers: Array<{ _id: string; name: string; commissionProfileIds: string[] }>,
    commissionProfiles: CommissionProfile[]
  ): StaffCommissionResult[] {
    const results: StaffCommissionResult[] = []

    for (const staff of staffMembers) {
      const profileIdMatch = (profile: CommissionProfile) => {
        const id = profile.id ?? profile._id
        if (id == null) return false
        const pid = String(id)
        return staff.commissionProfileIds.some((cid) => String(cid) === pid)
      }
      const staffProfiles = commissionProfiles.filter(profileIdMatch)

      if (staffProfiles.length === 0) continue

      const result = this.calculateMultipleSalesCommission(sales, staffProfiles, staff._id, staff.name)
      if (result) {
        results.push(result)
      }
    }

    return results
  }

  /**
   * Calculate target-based commission
   */
  private static calculateTargetBasedCommission(
    revenue: number,
    targetTiers: Array<{
      from: number
      to: number
      calculateBy: 'percent' | 'fixed'
      value: number
    }>,
    cascadingCommission: boolean = false
  ): number {
    let totalCommission = 0

    if (cascadingCommission) {
      // Cascading: apply all applicable tiers
      for (const tier of targetTiers) {
        if (revenue >= tier.from) {
          const tierRevenue = Math.min(revenue - tier.from, tier.to - tier.from)
          if (tierRevenue > 0) {
            if (tier.calculateBy === 'percent') {
              totalCommission += (tierRevenue * tier.value) / 100
            } else {
              totalCommission += tier.value
            }
          }
        }
      }
    } else {
      // Non-cascading: apply only the highest applicable tier
      const applicableTier = targetTiers
        .filter(tier => revenue >= tier.from && revenue <= tier.to)
        .sort((a, b) => b.from - a.from)[0]

      if (applicableTier) {
        if (applicableTier.calculateBy === 'percent') {
          totalCommission = (revenue * applicableTier.value) / 100
        } else {
          totalCommission = applicableTier.value
        }
      }
    }

    return totalCommission
  }

  /**
   * Per-catalog-service rules: attributed pre-tax line amount × % or flat ₹ per line row.
   * Lines without serviceId or without a matching rule earn 0.
   */
  private static calculateServiceBasedCommission(
    serviceStaffItems: Array<SaleItem & { total: number }>,
    serviceRules: Array<{
      serviceId: string
      calculateBy: 'percent' | 'fixed'
      value: number
    }>
  ): { commission: number; revenue: number; itemCount: number } {
    const ruleMap = new Map<string, { calculateBy: 'percent' | 'fixed'; value: number }>()
    for (const rule of serviceRules) {
      if (rule?.serviceId) {
        ruleMap.set(String(rule.serviceId), {
          calculateBy: rule.calculateBy === 'fixed' ? 'fixed' : 'percent',
          value: Number(rule.value) || 0
        })
      }
    }

    let commission = 0
    let revenue = 0
    let itemCount = 0

    for (const item of serviceStaffItems) {
      const sid = normalizeSaleLineServiceId(item)
      if (!sid) continue
      const rule = ruleMap.get(sid)
      if (!rule || rule.value <= 0) continue

      const attributed = Math.max(0, Number(item.total) || 0)
      if (attributed <= 0) continue

      let lineCommission = 0
      if (rule.calculateBy === 'percent') {
        lineCommission = (attributed * rule.value) / 100
      } else {
        // Fixed ₹ once per invoice line row (not multiplied by quantity)
        lineCommission = rule.value
      }

      commission += lineCommission
      revenue += attributed
      itemCount += 1
    }

    return { commission, revenue, itemCount }
  }

  /**
   * Calculate item-based commission
   */
  private static calculateItemBasedCommission(
    revenue: number,
    itemRates: Array<{
      itemType: string
      rate: number
      calculateBy: 'percent' | 'fixed'
    }>,
    qualifyingItems: string[]
  ): number {
    let totalCommission = 0

    for (const itemRate of itemRates) {
      if (qualifyingItems.includes(itemRate.itemType)) {
        if (itemRate.calculateBy === 'percent') {
          totalCommission += (revenue * itemRate.rate) / 100
        } else {
          totalCommission += itemRate.rate
        }
      }
    }

    return totalCommission
  }
}
