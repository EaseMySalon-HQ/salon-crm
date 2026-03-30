/**
 * Payment stamp for receipts. Deleted/invoiced-cancelled bills must show Cancelled, not Full Paid.
 */
export type ReceiptPaymentStamp = { label: string; color: string; checkPrefix: string }

export function getReceiptPaymentStamp(
  receipt: { payments?: Array<{ amount?: number }>; status?: string; invoiceDeleted?: boolean },
  grandTotal: number
): ReceiptPaymentStamp {
  const isCancelled =
    receipt.invoiceDeleted === true ||
    String(receipt.status || '').toLowerCase() === 'cancelled'
  if (isCancelled) {
    return { label: 'Cancelled', color: '#64748b', checkPrefix: '' }
  }
  const totalPaid = (receipt.payments || []).reduce((sum, p) => sum + (p?.amount || 0), 0)
  const outstanding = grandTotal - totalPaid
  if (outstanding <= 0) return { label: 'FULL PAID', color: '#16a34a', checkPrefix: '✓ ' }
  if (totalPaid > 0) return { label: 'PART PAID', color: '#f97316', checkPrefix: '' }
  return { label: 'UNPAID', color: '#dc2626', checkPrefix: '' }
}
