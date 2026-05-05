/** Handoff from GRN dialog → purchase invoice editor (same tab/session). */

export const PURCHASE_INVOICE_GRN_PREFILL_KEY_PREFIX = 'purchaseInvoiceGrnPrefill:'

/** Max age so opening "new PI" for the PO days later won't pick up stale qty. */
export const PURCHASE_INVOICE_GRN_PREFILL_MAX_MS = 5 * 60 * 1000

export type PurchaseInvoiceGrnPrefillPayload = {
  /** This delivery qty by product Mongo id string */
  byProductId: Record<string, number>
  supplierInvoiceNumber?: string
  grnNotes?: string
  ts: number
}

export function purchaseInvoiceGrnPrefillStorageKey(purchaseOrderId: string): string {
  return `${PURCHASE_INVOICE_GRN_PREFILL_KEY_PREFIX}${purchaseOrderId}`
}
