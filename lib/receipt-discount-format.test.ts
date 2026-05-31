import { describe, it, expect } from "vitest"
import { formatReceiptDiscountPercent } from "./receipt-discount-format"

describe("formatReceiptDiscountPercent", () => {
  it("rounds to at most 2 decimal places", () => {
    expect(formatReceiptDiscountPercent(1.8181818181818181)).toBe("1.82%")
  })

  it("drops trailing zeros for whole numbers", () => {
    expect(formatReceiptDiscountPercent(10)).toBe("10%")
  })

  it("returns dash for zero or invalid", () => {
    expect(formatReceiptDiscountPercent(0)).toBe("-")
    expect(formatReceiptDiscountPercent(null)).toBe("-")
  })
})
