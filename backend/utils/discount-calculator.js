/**
 * Simple helper to recalculate bill-level discount proportionally when
 * the subtotal changes.
 *
 * newDiscount = originalDiscount * (newSubtotal / originalSubtotal)
 */
function recalculateBillDiscount(originalSubtotal, newSubtotal, originalDiscount) {
  const origSub = Number(originalSubtotal) || 0;
  const newSub = Number(newSubtotal) || 0;
  const origDisc = Number(originalDiscount) || 0;

  if (origSub <= 0 || origDisc <= 0 || newSub <= 0) {
    return origDisc;
  }

  const ratio = newSub / origSub;
  const newDiscount = origDisc * ratio;
  // Round to 2 decimals to avoid floating point noise
  return Math.round(newDiscount * 100) / 100;
}

module.exports = {
  recalculateBillDiscount,
};


