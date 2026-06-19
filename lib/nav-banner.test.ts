import { describe, it, expect } from "vitest"
import {
  getFathersDayDate,
  isNavBannerThemeActive,
  normalizeNavBannersSettings,
  resolveActiveNavBanner,
  defaultFathersDayExpiry,
} from "./nav-banner"

describe("nav-banner", () => {
  it("returns third Sunday of June", () => {
    expect(getFathersDayDate(2026).getDate()).toBe(21)
    expect(getFathersDayDate(2026).getMonth()).toBe(5)
  })

  it("normalizes per-theme settings and migrates legacy navBanner", () => {
    const banners = normalizeNavBannersSettings(null, {
      enabled: true,
      theme: "fathers_day",
      expiresAt: "2026-12-31",
      headline: "Legacy headline",
      tagline: "Legacy tagline",
    })
    expect(banners.fathers_day.enabled).toBe(true)
    expect(banners.fathers_day.headline).toBe("Legacy headline")
  })

  it("resolves first active theme in registry order", () => {
    const banners = normalizeNavBannersSettings({
      fathers_day: {
        enabled: true,
        expiresAt: "2026-12-31",
        headline: "Hi",
        tagline: "There",
      },
    })
    const active = resolveActiveNavBanner(banners, new Date(2026, 5, 18))
    expect(active?.theme).toBe("fathers_day")
    expect(active?.headline).toBe("Hi")
  })

  it("is inactive when disabled or past expiry", () => {
    expect(isNavBannerThemeActive({ enabled: false, expiresAt: "2099-01-01", headline: "", tagline: "" })).toBe(
      false
    )
    expect(
      isNavBannerThemeActive(
        { enabled: true, expiresAt: "2020-01-01", headline: "", tagline: "" },
        new Date(2026, 5, 18)
      )
    ).toBe(false)
  })

  it("suggests expiry one week after Father's Day", () => {
    expect(defaultFathersDayExpiry(2026)).toBe("2026-06-28")
  })
})
