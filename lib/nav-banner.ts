/** Third Sunday of June (US / India Father's Day). */
export function getFathersDayDate(year: number): Date {
  const june1 = new Date(year, 5, 1)
  const weekday = june1.getDay()
  const firstSunday = weekday === 0 ? 1 : 8 - weekday
  return new Date(year, 5, firstSunday + 14)
}

export type NavBannerTheme = "fathers_day"

/** Per-theme settings stored in admin (no theme id — keyed by theme in navBanners map). */
export type NavBannerThemeConfig = {
  enabled: boolean
  expiresAt: string
  headline: string
  tagline: string
}

/** Active banner resolved for the tenant top nav. */
export type NavBannerConfig = NavBannerThemeConfig & {
  theme: NavBannerTheme
}

export type NavBannersSettings = Record<NavBannerTheme, NavBannerThemeConfig>

export type NavBannerThemeDefinition = {
  value: NavBannerTheme
  label: string
  description: string
  defaults: NavBannerThemeConfig
  /** Suggested expiry when enabling (optional per theme). */
  suggestExpiry?: (year?: number) => string
}

export function defaultFathersDayExpiry(year = new Date().getFullYear()): string {
  const end = getFathersDayDate(year)
  end.setDate(end.getDate() + 7)
  const y = end.getFullYear()
  const m = String(end.getMonth() + 1).padStart(2, "0")
  const d = String(end.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export const NAV_BANNER_THEME_REGISTRY: NavBannerThemeDefinition[] = [
  {
    value: "fathers_day",
    label: "Father's Day",
    description: "Navy gradient nav with gold shimmer and festive message",
    defaults: {
      enabled: false,
      expiresAt: "",
      headline: "Happy Father's Day",
      tagline: "Treat Dad to a grooming session",
    },
    suggestExpiry: defaultFathersDayExpiry,
  },
]

/** @deprecated Use NAV_BANNER_THEME_REGISTRY */
export const NAV_BANNER_THEMES = NAV_BANNER_THEME_REGISTRY

export function buildDefaultNavBannersSettings(): NavBannersSettings {
  const out = {} as NavBannersSettings
  for (const theme of NAV_BANNER_THEME_REGISTRY) {
    out[theme.value] = { ...theme.defaults }
  }
  return out
}

export const DEFAULT_NAV_BANNERS = buildDefaultNavBannersSettings()

function normalizeThemeConfig(
  theme: NavBannerTheme,
  raw: unknown,
  definition: NavBannerThemeDefinition
): NavBannerThemeConfig {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    enabled: src.enabled === true,
    expiresAt: typeof src.expiresAt === "string" ? src.expiresAt.trim() : "",
    headline:
      typeof src.headline === "string" && src.headline.trim()
        ? src.headline.trim()
        : definition.defaults.headline,
    tagline:
      typeof src.tagline === "string" && src.tagline.trim()
        ? src.tagline.trim()
        : definition.defaults.tagline,
  }
}

/** Merge stored navBanners with registry defaults; migrates legacy single `navBanner` object. */
export function normalizeNavBannersSettings(
  rawNavBanners: unknown,
  legacyNavBanner?: unknown
): NavBannersSettings {
  const defaults = buildDefaultNavBannersSettings()
  const src =
    rawNavBanners && typeof rawNavBanners === "object"
      ? (rawNavBanners as Record<string, unknown>)
      : {}

  const legacy =
    legacyNavBanner && typeof legacyNavBanner === "object"
      ? (legacyNavBanner as Record<string, unknown>)
      : null

  const out = { ...defaults }
  for (const theme of NAV_BANNER_THEME_REGISTRY) {
    const themeRaw = src[theme.value] ?? (legacy?.theme === theme.value ? legacy : undefined)
    out[theme.value] = normalizeThemeConfig(theme.value, themeRaw, theme)
  }
  return out
}

export function isNavBannerThemeActive(
  config: NavBannerThemeConfig | null | undefined,
  now = new Date()
): boolean {
  if (!config?.enabled) return false
  const expires = String(config.expiresAt || "").trim()
  if (!expires) return true
  const end = new Date(`${expires}T23:59:59`)
  if (Number.isNaN(end.getTime())) return true
  return now <= end
}

/** First enabled, non-expired theme in registry order (only one shown in top nav). */
export function resolveActiveNavBanner(
  banners: NavBannersSettings | null | undefined,
  now = new Date()
): NavBannerConfig | null {
  if (!banners) return null
  for (const theme of NAV_BANNER_THEME_REGISTRY) {
    const config = banners[theme.value]
    if (!isNavBannerThemeActive(config, now)) continue
    return { theme: theme.value, ...config }
  }
  return null
}

/** @deprecated Use isNavBannerThemeActive or resolveActiveNavBanner */
export function isNavBannerActive(
  config: NavBannerConfig | null | undefined,
  now = new Date()
): boolean {
  if (!config) return false
  return isNavBannerThemeActive(config, now)
}

/** @deprecated Use normalizeNavBannersSettings + resolveActiveNavBanner */
export function normalizeNavBannerConfig(raw: unknown): NavBannerConfig {
  const legacy = raw && typeof raw === "object" ? raw : {}
  const banners = normalizeNavBannersSettings(null, legacy)
  return (
    resolveActiveNavBanner(banners) ?? {
      theme: "fathers_day",
      ...DEFAULT_NAV_BANNERS.fathers_day,
    }
  )
}

export type NavBannerClientPayload = {
  active: NavBannerConfig | null
  banners: NavBannersSettings
}

export function normalizeNavBannerClientPayload(raw: unknown): NavBannerClientPayload {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const banners = normalizeNavBannersSettings(obj.banners, obj.active ?? obj.navBanner)
  const active =
    obj.active && typeof obj.active === "object"
      ? resolveActiveNavBanner(banners) ??
        (() => {
          const a = obj.active as Record<string, unknown>
          const theme = a.theme === "fathers_day" ? "fathers_day" : null
          if (!theme) return null
          const cfg = banners[theme]
          return isNavBannerThemeActive(cfg) ? { theme, ...cfg } : null
        })()
      : resolveActiveNavBanner(banners)
  return { active, banners }
}
