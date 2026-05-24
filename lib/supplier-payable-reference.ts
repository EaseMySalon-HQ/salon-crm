/**
 * Human-facing reference for a supplier payable row.
 * Purchase invoice: supplier’s invoice number, then fallback to internal invoice #.
 * PO-only: prefixed PO number.
 */
export function supplierPayableReferenceLabel(p: {
  purchaseInvoiceId?: { invoiceNumber?: string; supplierInvoiceNumber?: string } | null
  purchaseOrderId?: { poNumber?: string } | null
}): string {
  const pi = p.purchaseInvoiceId
  if (pi && typeof pi === "object") {
    const sin = String(pi.supplierInvoiceNumber || "").trim()
    if (sin) return sin
    if (pi.invoiceNumber) return String(pi.invoiceNumber)
    return "—"
  }
  const po = p.purchaseOrderId
  if (po && typeof po === "object" && po.poNumber) return `PO ${po.poNumber}`
  return "—"
}
