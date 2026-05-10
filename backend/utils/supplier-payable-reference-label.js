/**
 * Human-facing reference for a supplier payable row (mirror of lib/supplier-payable-reference.ts).
 */

function supplierPayableReferenceLabel(p) {
  if (!p || typeof p !== 'object') return '—';
  const pi = p.purchaseInvoiceId;
  if (pi && typeof pi === 'object') {
    const sin = String(pi.supplierInvoiceNumber || '').trim();
    if (sin) return sin;
    if (pi.invoiceNumber) return String(pi.invoiceNumber).trim();
    return '—';
  }
  const po = p.purchaseOrderId;
  if (po && typeof po === 'object' && po.poNumber) return `PO ${po.poNumber}`;
  return '—';
}

module.exports = { supplierPayableReferenceLabel };
