/**
 * Tax-exclusive line total for staff splits / commission (GST not included).
 */
function getItemPreTaxTotal(item) {
  if (!item || typeof item !== 'object') return 0;
  const qty = Number(item.quantity) || 1;

  if (item.priceExcludingGST != null && Number.isFinite(Number(item.priceExcludingGST))) {
    return Number(item.priceExcludingGST) * qty;
  }

  const total = Number(item.total) || 0;
  const lineTax = Number(item.taxAmount);
  if (Number.isFinite(total) && Number.isFinite(lineTax) && lineTax >= 0) {
    return Math.max(0, total - lineTax);
  }

  const rate = Number(item.taxRate) || 0;
  if (rate > 0 && total > 0) {
    return total / (1 + rate / 100);
  }

  const price = Number(item.price) || 0;
  const disc = Number(item.discount) || 0;
  const baseAfterDiscount = price * qty * (1 - disc / 100);

  if (Number.isFinite(total) && total >= 0) {
    return total;
  }

  return Math.max(0, baseAfterDiscount);
}

module.exports = { getItemPreTaxTotal };
