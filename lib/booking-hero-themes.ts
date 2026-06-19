export const BOOKING_HERO_THEME_IDS = [
  "purple",
  "midnight",
  "rose",
  "emerald",
  "amber",
  "ocean",
  "sunset",
  "slate",
  "light-lavender",
  "light-rose",
  "light-mint",
  "light-cream",
  "light-sky",
  "light-pearl",
] as const

export type BookingHeroThemeId = (typeof BOOKING_HERO_THEME_IDS)[number]

export const DEFAULT_BOOKING_HERO_THEME: BookingHeroThemeId = "purple"

export type BookingHeroThemeMode = "dark" | "light"

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
  purple: {
    id: "purple",
    label: "Violet glow",
    mode: "dark",
    baseBg: "#0f1117",
    overlay:
      "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(124,58,237,0.35), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 80%, rgba(168,85,247,0.2), transparent 50%)",
    accent: "#A855F7",
    badgeBorder: "border-[#7C3AED]/40",
    badgeBg: "bg-[#7C3AED]/15",
    badgeText: "text-purple-200",
  },
  midnight: {
    id: "midnight",
    label: "Midnight blue",
    mode: "dark",
    baseBg: "#0a0f1a",
    overlay:
      "radial-gradient(ellipse 75% 55% at 15% 0%, rgba(37,99,235,0.4), transparent 55%), radial-gradient(ellipse 45% 35% at 85% 85%, rgba(59,130,246,0.22), transparent 50%)",
    accent: "#60A5FA",
    badgeBorder: "border-blue-400/40",
    badgeBg: "bg-blue-500/15",
    badgeText: "text-blue-200",
  },
  rose: {
    id: "rose",
    label: "Rose blush",
    mode: "dark",
    baseBg: "#1a0f14",
    overlay:
      "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(225,29,72,0.32), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 80%, rgba(244,63,94,0.18), transparent 50%)",
    accent: "#FB7185",
    badgeBorder: "border-rose-400/40",
    badgeBg: "bg-rose-500/15",
    badgeText: "text-rose-200",
  },
  emerald: {
    id: "emerald",
    label: "Emerald calm",
    mode: "dark",
    baseBg: "#0a1210",
    overlay:
      "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(16,185,129,0.32), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 80%, rgba(52,211,153,0.18), transparent 50%)",
    accent: "#34D399",
    badgeBorder: "border-emerald-400/40",
    badgeBg: "bg-emerald-500/15",
    badgeText: "text-emerald-200",
  },
  amber: {
    id: "amber",
    label: "Warm amber",
    mode: "dark",
    baseBg: "#14100a",
    overlay:
      "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(217,119,6,0.34), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 80%, rgba(251,191,36,0.2), transparent 50%)",
    accent: "#FBBF24",
    badgeBorder: "border-amber-400/40",
    badgeBg: "bg-amber-500/15",
    badgeText: "text-amber-200",
  },
  ocean: {
    id: "ocean",
    label: "Ocean breeze",
    mode: "dark",
    baseBg: "#0a1114",
    overlay:
      "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(6,182,212,0.34), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 80%, rgba(34,211,238,0.18), transparent 50%)",
    accent: "#22D3EE",
    badgeBorder: "border-cyan-400/40",
    badgeBg: "bg-cyan-500/15",
    badgeText: "text-cyan-200",
  },
  sunset: {
    id: "sunset",
    label: "Sunset coral",
    mode: "dark",
    baseBg: "#140e0a",
    overlay:
      "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(234,88,12,0.34), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 80%, rgba(251,146,60,0.2), transparent 50%)",
    accent: "#FB923C",
    badgeBorder: "border-orange-400/40",
    badgeBg: "bg-orange-500/15",
    badgeText: "text-orange-200",
  },
  slate: {
    id: "slate",
    label: "Slate minimal",
    mode: "dark",
    baseBg: "#111318",
    overlay:
      "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(148,163,184,0.22), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 80%, rgba(100,116,139,0.16), transparent 50%)",
    accent: "#94A3B8",
    badgeBorder: "border-slate-400/40",
    badgeBg: "bg-slate-500/15",
    badgeText: "text-slate-200",
  },
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
}

export const BOOKING_HERO_DARK_THEME_IDS = BOOKING_HERO_THEME_IDS.filter(
  (id) => BOOKING_HERO_THEMES[id].mode === "dark"
)

export const BOOKING_HERO_LIGHT_THEME_IDS = BOOKING_HERO_THEME_IDS.filter(
  (id) => BOOKING_HERO_THEMES[id].mode === "light"
)

export function isBookingHeroThemeId(value: string): value is BookingHeroThemeId {
  return (BOOKING_HERO_THEME_IDS as readonly string[]).includes(value)
}

export function resolveBookingHeroTheme(id?: string | null): BookingHeroTheme {
  const key = String(id || "").trim().toLowerCase()
  if (isBookingHeroThemeId(key)) return BOOKING_HERO_THEMES[key]
  return BOOKING_HERO_THEMES[DEFAULT_BOOKING_HERO_THEME]
}
