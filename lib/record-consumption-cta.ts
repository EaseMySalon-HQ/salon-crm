/** Active (non-cancelled) bills can show Record consumption. */
export function canShowRecordConsumptionCta(input: {
  saleId?: string | null
  status?: string | null
  invoiceDeleted?: boolean
}): boolean {
  const saleId = String(input.saleId || "").trim()
  if (!saleId) return false

  const status = String(input.status || "").toLowerCase()
  if (status === "cancelled" || input.invoiceDeleted) return false
  return ["completed", "partial", "unpaid"].includes(status)
}
