/**
 * Centralized React Query invalidation helpers. Mutation handlers throughout the app should
 * call these instead of issuing ad-hoc `invalidateQueries`/full page refreshes; this keeps
 * the “what does this mutation affect?” mapping in one place and matches the backend
 * dashboard cache invalidation in `backend/lib/dashboard-cache.js`.
 */

import type { QueryClient } from "@tanstack/react-query"

/** Drop the cached dashboard summary; next render re-fetches once. */
export function invalidateDashboard(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["dashboard", "init"] })
}

/** Calendar/list appointment ranges share a `["appointments"]` key prefix. */
export function invalidateAppointments(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["appointments"] })
}

/** Sales lists + reports computed from sales (sales/expense/staff). */
export function invalidateSales(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["sales"] })
  qc.invalidateQueries({ queryKey: ["reports"] })
}

/** Products and any low-stock dashboards. */
export function invalidateProducts(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["products"] })
}

/** Clients lists + search results. */
export function invalidateClients(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["clients"] })
}

/** Wallet/recharge balance shown in the top nav. */
export function invalidateWallet(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["wallet"] })
}

/** Compound helper for sale-completion flows. */
export function invalidateAfterSale(qc: QueryClient, opts?: { affectsInventory?: boolean }) {
  invalidateDashboard(qc)
  invalidateSales(qc)
  if (opts?.affectsInventory) invalidateProducts(qc)
}

/** Compound helper for appointment create/update/cancel. */
export function invalidateAfterAppointment(qc: QueryClient) {
  invalidateDashboard(qc)
  invalidateAppointments(qc)
}

/** Compound helper for inventory adjustment. */
export function invalidateAfterInventory(qc: QueryClient) {
  invalidateDashboard(qc)
  invalidateProducts(qc)
}
