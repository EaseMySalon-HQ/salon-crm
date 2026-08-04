import { describe, it, expect } from "vitest"
import {
  getActiveCheckoutPaymentModes,
  getTipEligiblePaymentModes,
  needsTipPaymentModeSelection,
  isTipPaymentModeValidForCheckout,
  resolveAutoTipPaymentMode,
  normalizeStoredTipPaymentMode,
  getTipPaymentModeBlockReason,
} from "./tip-payment-mode-prompt"

describe("tip-payment-mode-prompt", () => {
  it("detects multiple active checkout payment modes", () => {
    expect(getActiveCheckoutPaymentModes(1000, 500, 0)).toEqual(["cash", "card"])
    expect(needsTipPaymentModeSelection(200, 1000, 500, 0)).toBe(true)
    expect(needsTipPaymentModeSelection(0, 1000, 500, 0)).toBe(false)
    expect(needsTipPaymentModeSelection(200, 1000, 0, 0)).toBe(false)
  })

  it("filters eligible modes by amount >= tip", () => {
    expect(getTipEligiblePaymentModes(100, 1000, 50, 0)).toEqual(["cash"])
    expect(getTipEligiblePaymentModes(100, 50, 150, 0)).toEqual(["card"])
    expect(getTipEligiblePaymentModes(100, 100, 100, 0)).toEqual(["cash", "card"])
    expect(getTipEligiblePaymentModes(100, 50, 50, 0)).toEqual([])
  })

  it("auto-resolves tip mode for single tender", () => {
    expect(resolveAutoTipPaymentMode(100, 1500, 0, 0)).toBe("cash")
    expect(resolveAutoTipPaymentMode(100, 0, 800, 0)).toBe("card")
  })

  it("validates stored selection against eligible modes", () => {
    expect(isTipPaymentModeValidForCheckout("card", 100, 50, 150, 0)).toBe(true)
    expect(isTipPaymentModeValidForCheckout("card", 100, 1000, 50, 0)).toBe(false)
  })

  it("returns block reason when no mode can cover tip", () => {
    expect(getTipPaymentModeBlockReason(100, 50, 40, 0)).toMatch(/at least/)
    expect(getTipPaymentModeBlockReason(100, 100, 50, 0)).toBeNull()
  })

  it("normalizes stored tip payment mode labels", () => {
    expect(normalizeStoredTipPaymentMode("Card")).toBe("card")
    expect(normalizeStoredTipPaymentMode("UPI")).toBe("online")
    expect(normalizeStoredTipPaymentMode("")).toBeNull()
  })
})
