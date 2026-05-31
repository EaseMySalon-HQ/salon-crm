import type { Receipt } from "@/lib/data"

export interface ReceiptTotalsBreakdown {
  /** Sum of catalog line amounts before any discount (excl. GST). */
  grossPreTaxTotal: number
  /** Manual line-item discounts (excl. GST). */
  lineDiscountAmount: number
  /** Membership plan savings (excl. GST). */
  membershipDiscountAmount: number
  /** Cart / bill-level discount (tax-inclusive ₹). */
  cartDiscountAmount: number
  cartDiscountLabel?: string
  /** Intermediate total incl. GST before cart discount (when cart discount applies). */
  totalBeforeCartInclTax?: number
  /** Pre-tax subtotal after all line, membership, and cart discounts. */
  subtotalPreTax: number
  taxAmount: number
  /** Bill total incl. GST after discounts and round-off, before loyalty and tip. */
  totalInclTax: number
  roundOff: number
  loyaltyDiscountAmount: number
  tip: number
  /** Amount due (bill + tip, after loyalty). */
  grandTotal: number
}

export type ReceiptTotalsBreakdownItem = {
  price: number
  quantity?: number
  total: number
  taxRate?: number
  taxAmount?: number
  priceExcludingGST?: number
  type?: string
  isMembershipFree?: boolean
  membershipDiscountPercent?: number
}

export type BuildReceiptTotalsBreakdownInput = {
  items: ReceiptTotalsBreakdownItem[]
  tax: number
  /** Bill incl. GST after round-off, before loyalty redemption. */
  totalInclTaxBeforeLoyalty: number
  roundOff?: number
  loyaltyDiscountAmount?: number
  tip?: number
  cartDiscountFixed?: number
  cartDiscountPercent?: number
  cartDiscountAmount?: number
  cartDiscountLabel?: string
  membershipDiscountAmount?: number
  lineDiscountAmount?: number
  subtotalPreTax?: number
}

const EPS = 0.015

export const RECEIPT_ITEM_DISCOUNT_LABEL = "Item Discount"
export const RECEIPT_CART_DISCOUNT_LABEL = "Cart Discount"

export function itemCatalogPreTax(item: {
  price: number
  quantity?: number
  taxRate?: number
}): number {
  const qty = Math.max(1, Number(item.quantity) || 1)
  const grossIncl = (Number(item.price) || 0) * qty
  const rate = Math.max(0, Number(item.taxRate) || 0)
  if (rate <= EPS) return grossIncl
  return grossIncl / (1 + rate / 100)
}

export function itemLinePreTaxAfterDiscount(item: {
  total: number
  taxAmount?: number
  priceExcludingGST?: number
  quantity?: number
  taxRate?: number
}): number {
  const qty = Math.max(1, Number(item.quantity) || 1)
  const peg = item.priceExcludingGST
  if (peg != null && Number.isFinite(peg)) return peg * qty
  const tax = Number(item.taxAmount)
  if (Number.isFinite(tax)) return (Number(item.total) || 0) - tax
  const rate = Math.max(0, Number(item.taxRate) || 0)
  const total = Number(item.total) || 0
  if (rate <= EPS) return total
  return total / (1 + rate / 100)
}

function sumItemTotalsInclTax(items: ReceiptTotalsBreakdownItem[]): number {
  return items.reduce((sum, item) => sum + (Number(item.total) || 0), 0)
}

function resolveCartDiscountInclTax(
  items: ReceiptTotalsBreakdownItem[],
  input: BuildReceiptTotalsBreakdownInput
): { amount: number; label?: string } {
  if (input.cartDiscountAmount != null && input.cartDiscountAmount > EPS) {
    return { amount: input.cartDiscountAmount, label: input.cartDiscountLabel }
  }
  const fixed = Number(input.cartDiscountFixed) || 0
  if (fixed > EPS) {
    return { amount: fixed, label: input.cartDiscountLabel || RECEIPT_CART_DISCOUNT_LABEL }
  }
  const pct = Number(input.cartDiscountPercent) || 0
  if (pct > EPS && pct < 100) {
    const afterCart = sumItemTotalsInclTax(items)
    const amount = (afterCart * pct) / (100 - pct)
    return {
      amount,
      label: input.cartDiscountLabel || `${RECEIPT_CART_DISCOUNT_LABEL} (${pct}%)`,
    }
  }
  return { amount: 0, label: input.cartDiscountLabel }
}

function inferMembershipDiscountPreTax(items: ReceiptTotalsBreakdownItem[]): number {
  return items.reduce((sum, item) => {
    if (item.type !== "service") return sum
    const isFree = item.isMembershipFree === true
    const memPct = Math.max(0, Number(item.membershipDiscountPercent) || 0)
    if (!isFree && memPct <= EPS) return sum
    const catalogPreTax = itemCatalogPreTax(item)
    const baseIncl = (Number(item.price) || 0) * Math.max(1, Number(item.quantity) || 1)
    const rate = Math.max(0, Number(item.taxRate) || 0)
    const effectivePct = isFree ? 100 : memPct
    const afterMemIncl = baseIncl * (1 - effectivePct / 100)
    const afterMemPreTax =
      rate <= EPS ? afterMemIncl : afterMemIncl / (1 + rate / 100)
    return sum + Math.max(0, catalogPreTax - afterMemPreTax)
  }, 0)
}

export function buildReceiptTotalsBreakdown(
  input: BuildReceiptTotalsBreakdownInput
): ReceiptTotalsBreakdown {
  const items = input.items || []
  const grossPreTaxTotal = items.reduce((sum, item) => sum + itemCatalogPreTax(item), 0)
  const subtotalPreTax =
    input.subtotalPreTax ??
    items.reduce((sum, item) => sum + itemLinePreTaxAfterDiscount(item), 0)

  const { amount: cartDiscountAmount, label: cartDiscountLabel } = resolveCartDiscountInclTax(
    items,
    input
  )

  const membershipDiscountAmount =
    input.membershipDiscountAmount != null && input.membershipDiscountAmount > EPS
      ? input.membershipDiscountAmount
      : inferMembershipDiscountPreTax(items)

  const totalDiscountPreTax = Math.max(0, grossPreTaxTotal - subtotalPreTax)
  const cartDiscountPreTaxShare =
    cartDiscountAmount > EPS && input.totalInclTaxBeforeLoyalty > EPS
      ? cartDiscountAmount * (subtotalPreTax / input.totalInclTaxBeforeLoyalty)
      : cartDiscountAmount > EPS
        ? cartDiscountAmount
        : 0

  const lineDiscountAmount =
    input.lineDiscountAmount != null && input.lineDiscountAmount > EPS
      ? input.lineDiscountAmount
      : Math.max(
          0,
          totalDiscountPreTax - membershipDiscountAmount - cartDiscountPreTaxShare
        )

  const totalBeforeCartInclTax =
    cartDiscountAmount > EPS ? input.totalInclTaxBeforeLoyalty + cartDiscountAmount : undefined

  const roundOff = Number(input.roundOff) || 0
  const loyaltyDiscountAmount = Math.max(0, Number(input.loyaltyDiscountAmount) || 0)
  const tip = Math.max(0, Number(input.tip) || 0)
  const totalInclTax = input.totalInclTaxBeforeLoyalty
  const grandTotal = Math.max(0, totalInclTax - loyaltyDiscountAmount + tip)

  return {
    grossPreTaxTotal,
    lineDiscountAmount,
    membershipDiscountAmount,
    cartDiscountAmount,
    cartDiscountLabel,
    totalBeforeCartInclTax,
    subtotalPreTax,
    taxAmount: Math.max(0, Number(input.tax) || 0),
    totalInclTax,
    roundOff,
    loyaltyDiscountAmount,
    tip,
    grandTotal,
  }
}

export type ReceiptTotalsMeta = {
  totalsBreakdown?: ReceiptTotalsBreakdown
  discount?: number
  discountType?: "fixed" | "percentage"
  loyaltyDiscountAmount?: number
}

export function resolveReceiptTotalsBreakdown(
  receipt: Receipt & ReceiptTotalsMeta,
  items?: ReceiptTotalsBreakdownItem[]
): ReceiptTotalsBreakdown {
  if (receipt.totalsBreakdown) return receipt.totalsBreakdown

  const lineItems: ReceiptTotalsBreakdownItem[] =
    items ??
    (receipt.items || []).map((item) => ({
      price: item.price,
      quantity: item.quantity,
      total: item.total,
      taxRate: (item as { taxRate?: number }).taxRate,
      taxAmount: (item as { taxAmount?: number }).taxAmount,
      priceExcludingGST: (item as { priceExcludingGST?: number }).priceExcludingGST,
      type: item.type,
      isMembershipFree: (item as { isMembershipFree?: boolean }).isMembershipFree,
      membershipDiscountPercent: (item as { membershipDiscountPercent?: number })
        .membershipDiscountPercent,
    }))

  const loyaltyDiscountAmount = Math.max(0, Number(receipt.loyaltyDiscountAmount) || 0)
  const tip = Math.max(0, Number(receipt.tip) || 0)
  const roundOff = Number(receipt.roundOff) || 0
  const billBeforeLoyalty =
    typeof receipt.total === "number" && !Number.isNaN(receipt.total)
      ? receipt.total - tip + loyaltyDiscountAmount
      : Math.max(
          0,
          (receipt.subtotalExcludingTax ?? receipt.subtotal) -
            (receipt.discount || 0) +
            (receipt.tax || 0) +
            roundOff
        )

  const discountType = receipt.discountType === "fixed" ? "fixed" : "percentage"
  const discountVal = Math.max(0, Number(receipt.discount) || 0)

  return buildReceiptTotalsBreakdown({
    items: lineItems,
    tax: receipt.tax || 0,
    totalInclTaxBeforeLoyalty: billBeforeLoyalty,
    roundOff,
    loyaltyDiscountAmount,
    tip,
    subtotalPreTax: receipt.subtotalExcludingTax,
    cartDiscountFixed: discountType === "fixed" ? discountVal : undefined,
    cartDiscountPercent: discountType === "percentage" ? discountVal : undefined,
  })
}

export type ReceiptTotalsDisplayRow = {
  key: string
  label: string
  amount: number
  /** negative = discount/savings */
  tone?: "default" | "discount" | "emphasis" | "grand"
  indent?: boolean
}

export function getReceiptTotalsDisplayRows(
  breakdown: ReceiptTotalsBreakdown
): ReceiptTotalsDisplayRow[] {
  const rows: ReceiptTotalsDisplayRow[] = []

  rows.push({
    key: "gross-pre-tax",
    label: "Total Amount (Excl. GST)",
    amount: breakdown.grossPreTaxTotal,
  })

  if (breakdown.lineDiscountAmount > EPS) {
    rows.push({
      key: "line-discount",
      label: RECEIPT_ITEM_DISCOUNT_LABEL,
      amount: -breakdown.lineDiscountAmount,
      tone: "discount",
    })
  }

  if (breakdown.membershipDiscountAmount > EPS) {
    rows.push({
      key: "membership-discount",
      label: "Membership Discount",
      amount: -breakdown.membershipDiscountAmount,
      tone: "discount",
    })
  }

  if (breakdown.totalBeforeCartInclTax != null && breakdown.cartDiscountAmount > EPS) {
    rows.push({
      key: "before-cart",
      label: "Due (incl. GST, before cart)",
      amount: breakdown.totalBeforeCartInclTax,
    })
  }

  if (breakdown.cartDiscountAmount > EPS) {
    rows.push({
      key: "cart-discount",
      label: breakdown.cartDiscountLabel || RECEIPT_CART_DISCOUNT_LABEL,
      amount: -breakdown.cartDiscountAmount,
      tone: "discount",
    })
  }

  rows.push({
    key: "subtotal-pre-tax",
    label: "Subtotal (Excl. GST)",
    amount: breakdown.subtotalPreTax,
  })

  if (breakdown.taxAmount > EPS) {
    rows.push({
      key: "tax",
      label: "Tax (GST)",
      amount: breakdown.taxAmount,
    })
  }

  rows.push({
    key: "total-incl-tax",
    label: "Total",
    amount: breakdown.totalInclTax,
    tone: "emphasis",
  })

  if (Math.abs(breakdown.roundOff) > EPS) {
    rows.push({
      key: "round-off",
      label: "Round Off",
      amount: breakdown.roundOff,
    })
  }

  if (breakdown.loyaltyDiscountAmount > EPS) {
    rows.push({
      key: "loyalty",
      label: "Points Discount",
      amount: -breakdown.loyaltyDiscountAmount,
      tone: "discount",
    })
  }

  if (breakdown.tip > EPS) {
    rows.push({
      key: "tip",
      label: "Tip",
      amount: breakdown.tip,
    })
  }

  rows.push({
    key: "grand-total",
    label: "TOTAL",
    amount: breakdown.grandTotal,
    tone: "grand",
  })

  return rows
}

export type FormatReceiptAmountFn = (amount: number) => string

export function formatReceiptTotalsBreakdownHtml(
  breakdown: ReceiptTotalsBreakdown,
  formatAmount: FormatReceiptAmountFn,
  options?: { indentClass?: string; grandClass?: string; taxDetailHtml?: string; skipGrandTotal?: boolean }
): string {
  const indentClass = options?.indentClass ?? "margin-left: 10px; font-size: 11px;"
  const rows = getReceiptTotalsDisplayRows(breakdown)

  return rows
    .map((row) => {
      const isDiscount = row.amount < -EPS
      const display = isDiscount
        ? `-${formatAmount(Math.abs(row.amount))}`
        : formatAmount(row.amount)
      const style =
        row.tone === "grand"
          ? options?.grandClass ??
            "font-weight: bold; font-size: 14px; border-top: 2px solid #000; padding-top: 6px; margin-top: 4px;"
          : row.indent
            ? indentClass
            : ""
      const labelStyle = row.tone === "discount" ? "color: #047857;" : ""

      if (row.key === "tax") {
        if (breakdown.taxAmount <= EPS) return ""
        return `
        <div class="total-line" style="${style}">
          <span>${row.label}:</span>
          <span>${formatAmount(row.amount)}</span>
        </div>
        ${options?.taxDetailHtml ?? ""}`
      }

      if (row.key === "grand-total") {
        if (options?.skipGrandTotal) return ""
        return `
        <div class="total-line grand-total" style="${style}">
          <span>${row.label}:</span>
          <span>${display}</span>
        </div>`
      }

      return `
        <div class="total-line" style="${style}">
          <span style="${labelStyle}">${row.label}:</span>
          <span style="${labelStyle}">${display}</span>
        </div>`
    })
    .join("")
}

export function buildReceiptTaxDetailHtml(
  receipt: Receipt,
  formatAmount: FormatReceiptAmountFn
): string {
  if ((receipt.tax || 0) <= EPS) return ""
  if (receipt.taxBreakdown) {
    let html = ""
    if (receipt.taxBreakdown.serviceTax > 0) {
      const serviceTax = receipt.taxBreakdown.serviceTax
      const serviceRate = receipt.taxBreakdown.serviceRate || 5
      html += `
        <div class="total-line" style="margin-left: 10px; font-size: 11px;">
          <span>Service Tax (${serviceRate}%):</span>
          <span>${formatAmount(serviceTax)}</span>
        </div>
        <div class="total-line" style="margin-left: 20px; font-size: 10px;">
          <span>CGST (${serviceRate / 2}%):</span>
          <span>${formatAmount(serviceTax / 2)}</span>
        </div>
        <div class="total-line" style="margin-left: 20px; font-size: 10px;">
          <span>SGST (${serviceRate / 2}%):</span>
          <span>${formatAmount(serviceTax / 2)}</span>
        </div>`
    }
    if (receipt.taxBreakdown.productTaxByRate) {
      for (const [rate, amount] of Object.entries(receipt.taxBreakdown.productTaxByRate)) {
        if (amount > EPS) {
          html += `
        <div class="total-line" style="margin-left: 10px; font-size: 11px;">
          <span>Product Tax (${rate}%):</span>
          <span>${formatAmount(amount)}</span>
        </div>
        <div class="total-line" style="margin-left: 20px; font-size: 10px;">
          <span>CGST (${parseFloat(rate) / 2}%):</span>
          <span>${formatAmount(amount / 2)}</span>
        </div>
        <div class="total-line" style="margin-left: 20px; font-size: 10px;">
          <span>SGST (${parseFloat(rate) / 2}%):</span>
          <span>${formatAmount(amount / 2)}</span>
        </div>`
        }
      }
    }
    return html
  }
  return `
    <div class="total-line" style="margin-left: 10px; font-size: 11px;">
      <span>CGST (2.5%):</span>
      <span>${formatAmount(receipt.tax / 2)}</span>
    </div>
    <div class="total-line" style="margin-left: 10px; font-size: 11px;">
      <span>SGST (2.5%):</span>
      <span>${formatAmount(receipt.tax / 2)}</span>
    </div>`
}

export function renderReceiptTotalsHtml(
  receipt: Receipt & ReceiptTotalsMeta,
  formatAmount: FormatReceiptAmountFn,
  options?: { taxDetailHtml?: string; grandTotalOverride?: number; skipGrandTotal?: boolean }
): string {
  const breakdown = resolveReceiptTotalsBreakdown(receipt)
  if (options?.grandTotalOverride != null) {
    breakdown.grandTotal = options.grandTotalOverride
  }
  return formatReceiptTotalsBreakdownHtml(breakdown, formatAmount, {
    taxDetailHtml: options?.taxDetailHtml,
    skipGrandTotal: options?.skipGrandTotal,
  })
}
