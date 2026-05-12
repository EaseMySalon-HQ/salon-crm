/**
 * Centralized React Query `staleTime` constants per resource type — keeps the egress-vs-freshness
 * trade-off consistent across hooks. Values are intentionally generous; pair with explicit
 * `queryClient.invalidateQueries` after mutations rather than short stale times + window-focus
 * refetches (which were a major source of duplicate Railway requests).
 */

export const STALE_TIME = {
  /** Auth profile / session: only changes on login, logout, role update, impersonation switch. */
  auth: 10 * 60_000,
  /** Business settings (name, currency, branding): rarely changes. */
  businessSettings: 10 * 60_000,
  /** Dashboard summary: backend has its own TTL cache; client mirrors at 90s. */
  dashboard: 90_000,
  /** Calendar/list appointment ranges. */
  appointmentsRange: 45_000,
  /** Reports: 5 min — bypass requires `queryClient.invalidateQueries`. */
  reports: 5 * 60_000,
  /** Catalog (staff, services, products, suppliers) used by dropdowns. */
  catalog: 10 * 60_000,
  /** Wallet/recharge balance — short to keep top-nav meter fresh after deductions. */
  walletBalance: 30_000,
} as const

export const GC_TIME = {
  /** Long-lived caches keep entries warm across navigation. */
  long: 30 * 60_000,
  /** Default — same as React Query's 5 minute default; explicit so it never silently changes. */
  default: 5 * 60_000,
} as const
