import { describe, it, expect } from "vitest"
import { recalculateServiceProductTotals } from "./complete-service-checkout-inline"

const taxOff: import("./complete-service-checkout-inline").ServiceCheckoutTaxSettings = {
  enableTax: false,
  priceInclusiveOfTax: true,
  serviceTaxRate: 5,
  membershipTaxRate: 5,
  packageTaxRate: 5,
  prepaidWalletTaxRate: 5,
  essentialProductRate: 5,
  intermediateProductRate: 12,
  standardProductRate: 18,
  luxuryProductRate: 28,
  exemptProductRate: 0,
}

describe("recalculateServiceProductTotals", () => {
  it("applies cart discount after line-level discounts (not on full catalog price)", () => {
    const serviceItems = [
      { price: 1000, quantity: 1, discount: 0 },
      { price: 2000, quantity: 1, discount: 0 },
    ]
    const productItems = [
      { price: 230, quantity: 1, discount: 5 },
      { price: 675, quantity: 1, discount: 0 },
      { price: 225, quantity: 1, discount: 0 },
    ]

    const { serviceItems: sOut, productItems: pOut } = recalculateServiceProductTotals(
      serviceItems,
      productItems,
      19,
      0,
      [],
      [],
      taxOff
    )

    const billTotal =
      sOut.reduce((sum, item) => sum + item.total, 0) + pOut.reduce((sum, item) => sum + item.total, 0)

    // 4130 - 11.5 (5% on castor oil) - 19 cart = 4099.5
    expect(billTotal).toBeCloseTo(4099.5, 2)
    expect(Math.round(billTotal)).toBe(4100)
    expect(pOut[0]?.total).toBeCloseTo(218.5 - (218.5 / 4118.5) * 19, 2)
  })

  it("preserves line-only discounts when no cart discount is set", () => {
    const productItems = [{ price: 230, quantity: 1, discount: 5 }]
    const { productItems: pOut } = recalculateServiceProductTotals(
      [],
      productItems,
      0,
      0,
      [],
      [],
      taxOff
    )
    expect(pOut[0]?.total).toBeCloseTo(218.5, 2)
    expect(pOut[0]?.discount).toBe(5)
  })
})
