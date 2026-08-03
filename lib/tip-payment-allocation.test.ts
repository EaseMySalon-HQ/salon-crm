import { describe, it, expect } from "vitest"
import {
  allocateTipByPaymentModes,
  getSalePaymentAmountsByMode,
  getTipPaymentModeLabel,
  formatTipModeBreakdown,
} from "./tip-payment-allocation"

describe("tip-payment-allocation", () => {
  it("splits tip proportionally for mixed checkout payments", () => {
    const sale = {
      payments: [
        { mode: "Cash", amount: 2000 },
        { mode: "Card", amount: 1500 },
        { mode: "Online", amount: 500 },
      ],
    }
    const split = allocateTipByPaymentModes(sale, 400)
    expect(split.cash).toBeCloseTo(200, 2)
    expect(split.card).toBeCloseTo(150, 2)
    expect(split.online).toBeCloseTo(50, 2)
    expect(getTipPaymentModeLabel(split)).toBe("Mixed")
    expect(formatTipModeBreakdown(split)).toContain("Cash ₹200.00")
  })

  it("includes due collections from paymentHistory", () => {
    const amounts = getSalePaymentAmountsByMode({
      payments: [{ mode: "Cash", amount: 1000 }],
      paymentHistory: [{ method: "Online", amount: 500 }],
    })
    expect(amounts.cash).toBe(1000)
    expect(amounts.online).toBe(500)
    expect(amounts.card).toBe(0)
  })

  it("falls back to paymentMode when no payment lines exist", () => {
    const split = allocateTipByPaymentModes(
      { paymentMode: "Card", paymentStatus: { paidAmount: 3000 } },
      300
    )
    expect(split.card).toBe(300)
    expect(getTipPaymentModeLabel(split)).toBe("Card")
  })

  it("uses explicit tipPaymentMode when set at checkout", () => {
    const split = allocateTipByPaymentModes(
      {
        tipPaymentMode: "cash",
        payments: [
          { mode: "Cash", amount: 2000 },
          { mode: "Card", amount: 1500 },
        ],
      },
      400
    )
    expect(split.cash).toBe(400)
    expect(split.card).toBe(0)
    expect(getTipPaymentModeLabel(split)).toBe("Cash")
  })
})
