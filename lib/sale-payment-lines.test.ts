import { describe, it, expect } from "vitest"
import { buildReceiptPaymentsWithLegacyFallback } from "./sale-payment-lines"

const saleDate = "2026-05-25T21:00:00.000Z"

describe("buildReceiptPaymentsWithLegacyFallback", () => {
  it("returns empty for unpaid bills without payments array", () => {
    const lines = buildReceiptPaymentsWithLegacyFallback({
      date: saleDate,
      status: "unpaid",
      grossTotal: 6030,
      paymentStatus: { totalAmount: 6030, paidAmount: 0, remainingAmount: 6030 },
    })
    expect(lines).toEqual([])
  })

  it("infers legacy full payment for completed bills without payments array", () => {
    const lines = buildReceiptPaymentsWithLegacyFallback({
      date: saleDate,
      status: "completed",
      grossTotal: 6030,
      paymentMode: "Cash",
      paymentStatus: { totalAmount: 6030, paidAmount: 6030, remainingAmount: 0 },
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]?.type).toBe("cash")
    expect(lines[0]?.amount).toBe(6030)
  })

  it("infers legacy partial payment when paidAmount is set but payments array is empty", () => {
    const lines = buildReceiptPaymentsWithLegacyFallback({
      date: saleDate,
      status: "partial",
      grossTotal: 6030,
      paymentMode: "Cash",
      paymentStatus: { totalAmount: 6030, paidAmount: 2000, remainingAmount: 4030 },
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]?.amount).toBe(2000)
  })

  it("prefers explicit payments array over legacy fallback", () => {
    const lines = buildReceiptPaymentsWithLegacyFallback({
      date: saleDate,
      status: "completed",
      grossTotal: 6030,
      payments: [{ mode: "Card", amount: 6030 }],
      paymentStatus: { totalAmount: 6030, paidAmount: 6030, remainingAmount: 0 },
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]?.type).toBe("card")
  })
})
