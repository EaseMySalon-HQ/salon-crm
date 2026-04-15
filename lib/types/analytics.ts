export type AnalyticsBucket = "day" | "week" | "month"

export interface AnalyticsRevenuePoint {
  key: string
  name: string
  revenue: number
  expenses: number
  profit: number
}

export interface AnalyticsTopService {
  id: string
  name: string
  revenue: number
  units: number
  bookings: number
  percentOfServiceRevenue: number
  color: string
}

export interface AnalyticsMetaBlock {
  dateFrom: string
  dateTo: string
  bucket: AnalyticsBucket
  daysInRange: number
}

export interface AnalyticsBusinessBlock {
  name: string
  currency: string
}

/** GET /api/analytics/revenue */
export interface AnalyticsRevenueTabData {
  business: AnalyticsBusinessBlock
  meta: AnalyticsMetaBlock
  comparison: {
    previousPeriod: { dateFrom: string; dateTo: string }
    revenuePct: number | null
    expensesPct: number | null
    netPct: number | null
  }
  revenue: {
    series: AnalyticsRevenuePoint[]
    totals: {
      totalRevenue: number
      totalExpenses: number
      totalProfit: number
    }
    breakdown: {
      service: number
      product: number
      membership: number
      package: number
      other: number
      lineItemsTotal: number
    }
  }
  averages: {
    avgBillValue: number
    completedBillCount: number
  }
  insights: string[]
}

/** GET /api/analytics/services */
export interface AnalyticsServiceTrendPoint {
  key: string
  name: string
  serviceRevenue: number
}

export interface AnalyticsServicesTabData {
  business: AnalyticsBusinessBlock
  meta: AnalyticsMetaBlock
  comparison: {
    previousPeriod: { dateFrom: string; dateTo: string }
    serviceRevenuePct: number | null
  }
  services: {
    totalServicesCatalog: number
    topServices: AnalyticsTopService[]
    /** Every distinct service line in the period (by revenue), not only the top 8 used for the pie */
    allServicesBreakdown?: AnalyticsTopService[]
    totalServiceLineRevenue: number
    serviceTrends: AnalyticsServiceTrendPoint[]
  }
}

export interface AnalyticsClientTopSpendRow {
  clientId: string
  name: string
  phone: string
  totalSpend: number
}

/** GET /api/analytics/clients */
export interface AnalyticsClientsTabData {
  business: AnalyticsBusinessBlock
  meta: AnalyticsMetaBlock
  comparison: {
    previousPeriod: { dateFrom: string; dateTo: string }
    newClientsPct: number | null
  }
  clients: {
    newProfilesInRange: number
    newClientsSeries: { key: string; name: string; newClients: number }[]
    mix: {
      distinctBuyersWithSale: number
      newBuyersWithSale: number
      returningBuyersWithSale: number
      repeatRatePct: number | null
    }
    /** Branch-scoped counts (backend aggregations) */
    insights: {
      totalClientProfiles: number
      /** Period revenue / distinct buyers in period; null if no buyers */
      avgRevenuePerBuyingClient: number | null
      /** Distinct buyers in period / total branch client profiles */
      conversionRatePct: number | null
      /** Distinct clients with ≥1 sale in rolling 30 days ending meta.dateTo (IST) */
      activeClientsLast30Days: number
    }
    /** Buyers in period by visit count (bills) */
    visitRetention: {
      visits1: number
      visits2to3: number
      visits4plus: number
    }
    /** Days since last sale (any time), relative to insights period end */
    recency: {
      active0to30Days: number
      atRisk30to60Days: number
      lostOver60Days: number
      neverPurchased: number
      asOfDate: string
    }
    topClientsBySpend: AnalyticsClientTopSpendRow[]
  }
}

/** GET /api/analytics/products */
export interface AnalyticsProductTrendPoint {
  key: string
  name: string
  productRevenue: number
}

export interface AnalyticsTopProduct {
  id: string
  name: string
  revenue: number
  units: number
  color: string
}

export interface AnalyticsProductsTabData {
  business: AnalyticsBusinessBlock
  meta: AnalyticsMetaBlock
  comparison: {
    previousPeriod: { dateFrom: string; dateTo: string }
    productRevenuePct: number | null
    unitsSoldPct: number | null
  }
  products: {
    totalProductRevenue: number
    totalUnitsSold: number
    topProducts: AnalyticsTopProduct[]
    productTrends: AnalyticsProductTrendPoint[]
  }
}

/** GET /api/analytics/staff — `lineType` query filters bill line items before attribution */
export type StaffAnalyticsLineType = "all" | "service" | "product" | "membership" | "package"

/** GET /api/analytics/staff */
export interface AnalyticsStaffRow {
  /** Present when revenue is attributed to a branch Staff directory member */
  staffId?: string
  staffName: string
  revenue: number
  bills: number
  serviceUnits: number
  serviceRevenue: number
  /** Attributed quantity (qty ÷ split count) for lines in the current filter */
  attributedUnits: number
  /** revenue ÷ bills when bills &gt; 0 */
  avgBillValue: number
  /** service line revenue ÷ service units when units &gt; 0 */
  avgRevenuePerService: number
  /** service units ÷ calendar days in range */
  servicesPerDay: number
  /** % change vs previous period of same length (attributed revenue) */
  revenueTrendPct: number | null
}

export interface AnalyticsStaffTabInsights {
  /** Mean of per-staff avg bill (staff with bills &gt; 0 only) */
  meanAvgBillValue: number
  /** Branch total service revenue ÷ total service units */
  blendedAvgRevenuePerService: number
  /** Mean of per-staff services per day */
  meanServicesPerDay: number
}

export interface AnalyticsStaffTabData {
  business: AnalyticsBusinessBlock
  meta: AnalyticsMetaBlock & { lineType: StaffAnalyticsLineType }
  comparison: {
    previousPeriod: { dateFrom: string; dateTo: string }
    staffAttributedRevenuePct: number | null
  }
  staff: {
    totalAttributedRevenue: number
    /** All branch staff, sorted by revenue (tax-exclusive attributed); zeros included */
    top: AnalyticsStaffRow[]
    /** Branch-level efficiency rollups (older clients may omit) */
    insights?: AnalyticsStaffTabInsights
  }
}

/** GET /api/analytics/staff/:staffId/trends */
export interface AnalyticsStaffTrendPoint {
  key: string
  name: string
  value: number
}

export interface AnalyticsStaffDrillDownData {
  business: AnalyticsBusinessBlock
  meta: AnalyticsMetaBlock & { lineType: StaffAnalyticsLineType }
  staff: {
    staffId: string
    staffName: string
    /** Attributed revenue for selected line filter, bucketed */
    attributedRevenueTrend: AnalyticsStaffTrendPoint[]
    /** Service-line revenue (tax-exclusive attributed), bucketed */
    serviceRevenueTrend: AnalyticsStaffTrendPoint[]
    /** Service units (qty ÷ split), bucketed */
    serviceUnitsTrend: AnalyticsStaffTrendPoint[]
  }
}
