/** Parse admin plan price input; allows 0 for free plans. */
export function parseAdminPlanPriceInput(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === "") return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

export function formatAdminPlanMonthlyPrice(monthlyPrice: number | null | undefined): string {
  if (monthlyPrice === 0) return "Free"
  if (monthlyPrice != null && Number.isFinite(monthlyPrice)) {
    return `₹${monthlyPrice.toLocaleString()}`
  }
  return "Custom"
}
