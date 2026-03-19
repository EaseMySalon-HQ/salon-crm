/**
 * Staff attribution uses tax-exclusive line value (pre-GST / taxable amount).
 * Split by staffContributions percentage, legacy amount (scaled off inclusive total), or equal shares.
 */

export type StaffContributionLike = {
  staffId?: string
  staffName?: string
  percentage?: number
  amount?: number
}

export type LineItemLike = {
  type?: string
  total?: number
  price?: number
  quantity?: number
  discount?: number
  staffId?: string
  staffName?: string
  staffContributions?: StaffContributionLike[]
  priceExcludingGST?: number
  taxRate?: number
  /** Line GST (when present); preferred with total for pre-tax */
  taxAmount?: number
}

export type SaleStaffFallback = { staffId?: string; staffName?: string }

/** Customer line total (typically includes GST when tax applies). */
export function getLineGrossTotal(item: Pick<LineItemLike, "total" | "price" | "quantity">): number {
  const t = Number(item.total)
  if (Number.isFinite(t) && t >= 0) return t
  return (Number(item.price) || 0) * (Number(item.quantity) || 1)
}

/**
 * Tax-exclusive amount for the line (after line discount, before GST).
 * Staff revenue is never based on tax.
 */
export function getLinePreTaxTotal(item: LineItemLike): number {
  const qty = Number(item.quantity) || 1
  const pex = Number(item.priceExcludingGST)
  if (Number.isFinite(pex) && pex >= 0) {
    return pex * qty
  }

  const total = Number(item.total)
  const lineTax = Number((item as LineItemLike).taxAmount)
  if (Number.isFinite(total) && total >= 0 && Number.isFinite(lineTax) && lineTax >= 0) {
    return Math.max(0, total - lineTax)
  }

  const rate = Number(item.taxRate) || 0
  if (rate > 0 && Number.isFinite(total) && total > 0) {
    return total / (1 + rate / 100)
  }

  const price = Number(item.price) || 0
  const disc = Number(item.discount) || 0
  const baseAfterDiscount = price * qty * (1 - disc / 100)

  if (Number.isFinite(total) && total >= 0) {
    return total
  }

  return Math.max(0, baseAfterDiscount)
}

function revenueForOneContribution(
  c: StaffContributionLike,
  linePreTax: number,
  lineGross: number,
  contributorCount: number
): number {
  const pct = Number(c.percentage)
  if (Number.isFinite(pct) && pct > 0) {
    return (linePreTax * pct) / 100
  }
  const amt = Number(c.amount)
  if (Number.isFinite(amt) && amt > 0 && Number.isFinite(lineGross) && lineGross > 0) {
    return (amt / lineGross) * linePreTax
  }
  return contributorCount > 0 ? linePreTax / contributorCount : linePreTax
}

export type StaffRevenueSplit = { staffId: string; staffName?: string; revenue: number }

/**
 * Split tax-exclusive line revenue across staff on the line.
 */
export function splitLineRevenueByStaff(
  item: LineItemLike,
  saleFallback?: SaleStaffFallback
): StaffRevenueSplit[] {
  const linePreTax = getLinePreTaxTotal(item)
  const lineGross = getLineGrossTotal(item)
  const contribs = item.staffContributions
  const n = contribs?.length ?? 0

  if (contribs && n > 0) {
    return contribs
      .map((c) => {
        const sid = c.staffId != null ? String(c.staffId).trim() : ""
        if (!sid) return null
        const revenue = revenueForOneContribution(c, linePreTax, lineGross, n)
        return { staffId: sid, staffName: c.staffName, revenue }
      })
      .filter((x): x is StaffRevenueSplit => x != null && x.revenue > 0)
  }

  if (item.staffId != null && String(item.staffId).trim() !== "") {
    return [
      {
        staffId: String(item.staffId),
        staffName: item.staffName,
        revenue: linePreTax,
      },
    ]
  }

  if (saleFallback?.staffId != null && String(saleFallback.staffId).trim() !== "") {
    return [
      {
        staffId: String(saleFallback.staffId),
        staffName: saleFallback.staffName,
        revenue: linePreTax,
      },
    ]
  }

  return []
}

export function getAttributedRevenueForStaff(
  item: LineItemLike,
  staffId: string,
  staffName?: string,
  saleFallback?: SaleStaffFallback
): number {
  const match = (s: StaffRevenueSplit) =>
    String(s.staffId) === String(staffId) ||
    (staffName != null && s.staffName === staffName)

  const splits = splitLineRevenueByStaff(item, saleFallback)
  const row = splits.find(match)
  return row?.revenue ?? 0
}

export function staffIsAttributedToLineItem(
  item: LineItemLike,
  staffId: string,
  staffName?: string,
  saleFallback?: SaleStaffFallback
): boolean {
  return getAttributedRevenueForStaff(item, staffId, staffName, saleFallback) > 0
}

/** @deprecated Use getLinePreTaxTotal / getLineGrossTotal */
export function getLineNetTotal(item: LineItemLike): number {
  return getLinePreTaxTotal(item)
}
