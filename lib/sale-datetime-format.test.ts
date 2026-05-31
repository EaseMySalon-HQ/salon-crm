import { describe, it, expect } from "vitest"
import {
  formatBillTimeStringTo12h,
  formatSaleTimeForDisplay,
} from "./sale-datetime-format"

describe("formatBillTimeStringTo12h", () => {
  it("formats 24h PM checkout times", () => {
    expect(formatBillTimeStringTo12h("20:21")).toBe("08:21 PM")
  })

  it("formats 24h AM checkout times", () => {
    expect(formatBillTimeStringTo12h("08:21")).toBe("08:21 AM")
  })

  it("preserves 12h PM input (idempotent)", () => {
    expect(formatBillTimeStringTo12h("08:21 PM")).toBe("08:21 PM")
  })

  it("preserves 12h AM input (idempotent)", () => {
    expect(formatBillTimeStringTo12h("08:21 AM")).toBe("08:21 AM")
  })
})

describe("formatSaleTimeForDisplay", () => {
  it("prefers sale.time over sale.date instant (avoids midnight UTC → 05:30 IST bug)", () => {
    const time = formatSaleTimeForDisplay({
      date: "2026-05-31T00:00:00.000Z",
      time: "04:36",
    })
    expect(time).toBe("04:36 AM")
  })

  it("falls back to IST from ISO date when time field is missing", () => {
    const time = formatSaleTimeForDisplay({
      date: "2026-05-30T23:06:00.000Z",
    })
    expect(time).toBe("04:36 AM")
  })

  it("stays PM when formatted twice (receipt preview path)", () => {
    const once = formatSaleTimeForDisplay({
      date: "2026-05-23",
      time: "20:21",
    })
    const twice = formatSaleTimeForDisplay({
      date: "2026-05-23",
      time: once,
    })
    expect(once).toBe("08:21 PM")
    expect(twice).toBe("08:21 PM")
  })
})
