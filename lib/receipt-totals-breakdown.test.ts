import { describe, it, expect } from "vitest"
import {
  buildReceiptTotalsBreakdown,
  itemCatalogPreTax,
  getReceiptTotalsDisplayRows,
} from "./receipt-totals-breakdown"

describe("receipt-totals-breakdown", () => {
  it("builds cart discount bifurcation from fixed cart amount", () => {
    const items = [
      { price: 1000, quantity: 1, total: 990, taxRate: 5 },
      { price: 230, quantity: 1, total: 218.5, taxRate: 5, discount: 5 },
    ]
    const breakdown = buildReceiptTotalsBreakdown({
      items,
      tax: 20,
      totalInclTaxBeforeLoyalty: 1208.5,
      cartDiscountAmount: 19,
      cartDiscountLabel: "Cart Discount",
    })

    expect(breakdown.cartDiscountAmount).toBe(19)
    expect(breakdown.grossPreTaxTotal).toBeGreaterThan(breakdown.subtotalPreTax)
    const rows = getReceiptTotalsDisplayRows(breakdown)
    expect(rows.some((r) => r.key === "cart-discount" && r.label.includes("Cart Discount"))).toBe(
      true
    )
    expect(rows.some((r) => r.key === "subtotal-pre-tax")).toBe(true)
  })

  it("computes catalog pre-tax from tax-inclusive price", () => {
    expect(itemCatalogPreTax({ price: 105, quantity: 1, taxRate: 5 })).toBeCloseTo(100, 2)
  })

  it("uses Item Discount and Cart Discount labels", () => {
    const items = [
      { price: 1000, quantity: 1, total: 990, taxRate: 5 },
      { price: 230, quantity: 1, total: 218.5, taxRate: 5, discount: 5 },
    ]
    const breakdown = buildReceiptTotalsBreakdown({
      items,
      tax: 20,
      totalInclTaxBeforeLoyalty: 1208.5,
      cartDiscountAmount: 19,
      lineDiscountAmount: 11.5,
    })
    const rows = getReceiptTotalsDisplayRows(breakdown)
    expect(rows.find((r) => r.key === "line-discount")?.label).toBe("Item Discount")
    expect(rows.find((r) => r.key === "cart-discount")?.label).toBe("Cart Discount")
  })
})
