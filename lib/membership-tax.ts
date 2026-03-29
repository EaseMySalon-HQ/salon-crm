/**
 * Line total for membership plans on Quick Sale (matches service/product GST inclusive/exclusive rules).
 */
export function computeMembershipPlanLineTotal(
  baseAmount: number,
  options: {
    membershipTaxRate: number
    enableTax: boolean
    priceInclusiveOfTax: boolean
  }
): { total: number; taxAmount: number } {
  const rate = options.membershipTaxRate
  const applyTax = options.enableTax && rate > 0
  if (!applyTax) return { total: baseAmount, taxAmount: 0 }
  if (options.priceInclusiveOfTax) {
    const taxAmount = baseAmount - baseAmount / (1 + rate / 100)
    return { total: baseAmount, taxAmount }
  }
  const taxAmount = (baseAmount * rate) / 100
  return { total: baseAmount + taxAmount, taxAmount }
}
