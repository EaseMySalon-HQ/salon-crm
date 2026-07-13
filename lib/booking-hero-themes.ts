export const BOOKING_HERO_THEME_IDS = [
  "light-lavender",
  "light-rose",
  "light-mint",
  "light-cream",
  "light-sky",
  "light-pearl",
  "luxury-ivory-gold",
  "luxury-black-gold",
  "luxury-onyx-champagne",
] as const

export type BookingHeroThemeId = (typeof BOOKING_HERO_THEME_IDS)[number]

export const DEFAULT_BOOKING_HERO_THEME: BookingHeroThemeId = "light-lavender"

export type BookingHeroThemeMode = "light" | "dark"

export type BookingHeroTheme = {
  id: BookingHeroThemeId
  label: string
  mode: BookingHeroThemeMode
  baseBg: string
  overlay: string
  accent: string
  badgeBorder: string
  badgeBg: string
  badgeText: string
}

export const BOOKING_HERO_THEMES: Record<BookingHeroThemeId, BookingHeroTheme> = {
  "light-lavender": {
    id: "light-lavender",
    label: "Soft lavender",
    mode: "light",
    baseBg: "#f8f6ff",
    overlay:
      "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(167,139,250,0.35), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 80%, rgba(196,181,253,0.3), transparent 50%)",
    accent: "#7C3AED",
    badgeBorder: "border-violet-300",
    badgeBg: "bg-violet-100",
    badgeText: "text-violet-700",
  },
  "light-rose": {
    id: "light-rose",
    label: "Rose water",
    mode: "light",
    baseBg: "#fff5f7",
    overlay:
      "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(251,113,133,0.28), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 80%, rgba(254,205,211,0.45), transparent 50%)",
    accent: "#E11D48",
    badgeBorder: "border-rose-300",
    badgeBg: "bg-rose-100",
    badgeText: "text-rose-700",
  },
  "light-mint": {
    id: "light-mint",
    label: "Fresh mint",
    mode: "light",
    baseBg: "#f0fdf9",
    overlay:
      "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(52,211,153,0.28), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 80%, rgba(167,243,208,0.45), transparent 50%)",
    accent: "#059669",
    badgeBorder: "border-emerald-300",
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-700",
  },
  "light-cream": {
    id: "light-cream",
    label: "Warm cream",
    mode: "light",
    baseBg: "#fffbeb",
    overlay:
      "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(251,191,36,0.3), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 80%, rgba(254,243,199,0.55), transparent 50%)",
    accent: "#D97706",
    badgeBorder: "border-amber-300",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-800",
  },
  "light-sky": {
    id: "light-sky",
    label: "Open sky",
    mode: "light",
    baseBg: "#f0f9ff",
    overlay:
      "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(56,189,248,0.3), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 80%, rgba(186,230,253,0.5), transparent 50%)",
    accent: "#0284C7",
    badgeBorder: "border-sky-300",
    badgeBg: "bg-sky-100",
    badgeText: "text-sky-800",
  },
  "light-pearl": {
    id: "light-pearl",
    label: "Clean pearl",
    mode: "light",
    baseBg: "#f8fafc",
    overlay:
      "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(148,163,184,0.22), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 80%, rgba(226,232,240,0.55), transparent 50%)",
    accent: "#475569",
    badgeBorder: "border-slate-300",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-700",
  },
  "luxury-ivory-gold": {
    id: "luxury-ivory-gold",
    label: "Ivory & gold",
    mode: "light",
    baseBg: "#f9f6ef",
    overlay:
      "radial-gradient(ellipse 75% 55% at 15% 0%, rgba(201,162,39,0.22), transparent 55%), radial-gradient(ellipse 45% 35% at 92% 88%, rgba(154,123,47,0.14), transparent 50%)",
    accent: "#9A7B2F",
    badgeBorder: "border-amber-300",
    badgeBg: "bg-amber-50",
    badgeText: "text-amber-900",
  },
  "luxury-black-gold": {
    id: "luxury-black-gold",
    label: "Black & gold",
    mode: "dark",
    baseBg: "#0c0c0c",
    overlay:
      "radial-gradient(ellipse 70% 50% at 18% 0%, rgba(201,162,39,0.28), transparent 58%), radial-gradient(ellipse 40% 35% at 88% 92%, rgba(212,175,55,0.18), transparent 52%)",
    accent: "#C9A227",
    badgeBorder: "border-amber-500/40",
    badgeBg: "bg-amber-500/15",
    badgeText: "text-amber-200",
  },
  "luxury-onyx-champagne": {
    id: "luxury-onyx-champagne",
    label: "Onyx & champagne",
    mode: "dark",
    baseBg: "#151310",
    overlay:
      "radial-gradient(ellipse 75% 55% at 12% 0%, rgba(176,141,87,0.24), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 85%, rgba(229,212,168,0.12), transparent 50%)",
    accent: "#B08D57",
    badgeBorder: "border-stone-500/40",
    badgeBg: "bg-stone-500/15",
    badgeText: "text-stone-200",
  },
}

/** @deprecated Dark themes removed; kept for legacy stored values. */
export const BOOKING_HERO_DARK_THEME_IDS: readonly string[] = [
  "purple",
  "midnight",
  "rose",
  "emerald",
  "amber",
  "ocean",
  "sunset",
  "slate",
]

export const BOOKING_HERO_LIGHT_THEME_IDS = BOOKING_HERO_THEME_IDS

export function isBookingHeroThemeId(value: string): value is BookingHeroThemeId {
  return (BOOKING_HERO_THEME_IDS as readonly string[]).includes(value)
}

export function resolveBookingHeroTheme(id?: string | null): BookingHeroTheme {
  const key = String(id || "").trim().toLowerCase()
  if (isBookingHeroThemeId(key)) return BOOKING_HERO_THEMES[key]
  return BOOKING_HERO_THEMES[DEFAULT_BOOKING_HERO_THEME]
}

export function resolveBookingHeroThemeIdFromAccent(accent?: string | null): BookingHeroThemeId {
  const normalized = String(accent || "").trim().toLowerCase()
  const match = BOOKING_HERO_THEME_IDS.find(
    (id) => BOOKING_HERO_THEMES[id].accent.toLowerCase() === normalized
  )
  return match || DEFAULT_BOOKING_HERO_THEME
}
