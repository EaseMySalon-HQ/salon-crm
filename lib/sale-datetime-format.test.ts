import { describe, it, expect } from "vitest"
import { formatSaleTimeForDisplay } from "./sale-datetime-format"

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
})
