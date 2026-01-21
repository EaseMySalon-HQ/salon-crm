/**
 * Helper for determining high-level payment adjustments when a bill
 * total changes. This does not perform any gateway refunds, it only
 * returns how much should be treated as refund / additional charge.
 *
 * For now we keep the logic conservative:
 * - If newTotal >= paidAmount: no refund, remainingAmount = newTotal - paidAmount
 * - If newTotal < paidAmount: refundAmount = paidAmount - newTotal, remainingAmount = 0
 */
function calculatePaymentAdjustments(currentPaymentStatus, newTotalAmount) {
  const totalAmount = Number(currentPaymentStatus?.totalAmount) || 0;
  const paidAmount = Number(currentPaymentStatus?.paidAmount) || 0;
  const newTotal = Number(newTotalAmount) || 0;

  const adjustments = {
    refundAmount: 0,
    additionalAmount: 0,
    remainingAmount: 0,
  };

  if (newTotal >= paidAmount) {
    adjustments.additionalAmount = newTotal - totalAmount > 0 ? newTotal - totalAmount : 0;
    adjustments.remainingAmount = newTotal - paidAmount;
  } else {
    adjustments.refundAmount = paidAmount - newTotal;
    adjustments.remainingAmount = 0;
  }

  return adjustments;
}

module.exports = {
  calculatePaymentAdjustments,
};


