import { describe, expect, it } from "vitest"
import {
  getClientSegment,
  isBirthdayThisMonth,
  matchesLastVisitFilter,
  validateClientSegmentRules,
  DEFAULT_CLIENT_SEGMENT_RULES,
} from "./client-segments"

describe("getClientSegment", () => {
  it("classifies new clients with <= max visits", () => {
    expect(getClientSegment({ totalVisits: 0 })).toBe("new")
    expect(getClientSegment({ totalVisits: 2, totalSpent: 100_000 })).toBe("new")
  })

  it("classifies VIP by spend threshold", () => {
    expect(
      getClientSegment(
        {
          totalVisits: 5,
          totalSpent: DEFAULT_CLIENT_SEGMENT_RULES.vipSpendThreshold,
          lastVisit: new Date().toISOString(),
        },
        DEFAULT_CLIENT_SEGMENT_RULES,
      ),
    ).toBe("vip")
  })

  it("classifies at-risk and win-back by last visit", () => {
    const now = Date.now()
    const atRisk = new Date(now - 60 * 86_400_000).toISOString()
    const winBack = new Date(now - 120 * 86_400_000).toISOString()

    expect(getClientSegment({ totalVisits: 5, totalSpent: 1000, lastVisit: atRisk })).toBe("at_risk")
    expect(getClientSegment({ totalVisits: 5, totalSpent: 1000, lastVisit: winBack })).toBe("win_back")
  })

  it("classifies engaged repeat clients as regular", () => {
    const recent = new Date().toISOString()
    expect(getClientSegment({ totalVisits: 4, totalSpent: 5000, lastVisit: recent })).toBe("regular")
  })

  it("respects custom rules", () => {
    const rules = {
      newMaxVisits: 1,
      vipSpendThreshold: 10_000,
      atRiskAfterDays: 30,
      winBackAfterDays: 60,
    }
    expect(getClientSegment({ totalVisits: 2, totalSpent: 500, lastVisit: new Date().toISOString() }, rules)).toBe(
      "regular",
    )
    expect(getClientSegment({ totalVisits: 1, totalSpent: 500 }, rules)).toBe("new")
  })
})

describe("validateClientSegmentRules", () => {
  it("rejects win-back before at-risk", () => {
    const result = validateClientSegmentRules({
      newMaxVisits: 2,
      vipSpendThreshold: 50000,
      atRiskAfterDays: 90,
      winBackAfterDays: 45,
    })
    expect(result.valid).toBe(false)
  })
})

describe("isBirthdayThisMonth", () => {
  it("matches current calendar month", () => {
    const now = new Date()
    const birthdate = `${now.getFullYear() - 25}-${String(now.getMonth() + 1).padStart(2, "0")}-15`
    expect(isBirthdayThisMonth(birthdate)).toBe(true)
    expect(isBirthdayThisMonth(`${now.getFullYear() - 25}-01-15`)).toBe(now.getMonth() === 0)
  })
})

describe("matchesLastVisitFilter", () => {
  it("handles never and range buckets", () => {
    expect(matchesLastVisitFilter(undefined, "never")).toBe(true)
    expect(matchesLastVisitFilter(null, "never")).toBe(true)

    const recent = new Date().toISOString()
    expect(matchesLastVisitFilter(recent, "under_30")).toBe(true)
    expect(matchesLastVisitFilter(recent, "never")).toBe(false)
  })
})
