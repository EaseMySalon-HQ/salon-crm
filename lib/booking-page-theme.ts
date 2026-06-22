import {
  resolveBookingHeroTheme,
  type BookingHeroTheme,
} from "@/lib/booking-hero-themes"

export type BookingPageTheme = {
  hero: BookingHeroTheme
  isLight: boolean
  vars: Record<`--${string}`, string>
}

export function resolveBookingPageTheme(themeId?: string | null): BookingPageTheme {
  const hero = resolveBookingHeroTheme(themeId)
  const isLight = hero.mode === "light"

  return {
    hero,
    isLight,
    vars: {
      "--booking-accent": hero.accent,
      "--booking-text-primary": isLight ? "#0f172a" : "#f8fafc",
      "--booking-text-secondary": isLight ? "#475569" : "#cbd5e1",
      "--booking-text-muted": isLight ? "#64748b" : "#94a3b8",
      "--booking-text-subtle": isLight ? "#94a3b8" : "#64748b",
      "--booking-surface": isLight ? "#ffffff" : "#141820",
      "--booking-surface-muted": isLight ? "#f8fafc" : "#1a2030",
      "--booking-border": isLight ? "#e2e8f0" : "rgba(255,255,255,0.12)",
      "--booking-border-subtle": isLight ? "#f1f5f9" : "rgba(255,255,255,0.08)",
    },
  }
}

/** Shared Tailwind classes wired to booking theme CSS variables. */
export const BT = {
  textPrimary: "text-[color:var(--booking-text-primary)]",
  textSecondary: "text-[color:var(--booking-text-secondary)]",
  textMuted: "text-[color:var(--booking-text-muted)]",
  textSubtle: "text-[color:var(--booking-text-subtle)]",
  textAccent: "text-[color:var(--booking-accent)]",
  bgSurface: "bg-[color:var(--booking-surface)]",
  bgSurfaceMuted: "bg-[color:var(--booking-surface-muted)]",
  borderDefault: "border-[color:var(--booking-border)]",
  borderSubtle: "border-[color:var(--booking-border-subtle)]",
  bgAccent: "bg-[var(--booking-accent)]",
  bgAccentSoft:
    "bg-[color-mix(in_srgb,var(--booking-accent)_12%,var(--booking-surface))]",
  bgAccentSoftStrong:
    "bg-[color-mix(in_srgb,var(--booking-accent)_18%,var(--booking-surface))]",
  borderAccent:
    "border-[color-mix(in_srgb,var(--booking-accent)_35%,transparent)]",
  ringAccent: "ring-[color-mix(in_srgb,var(--booking-accent)_22%,transparent)]",
  hoverAccentSoft:
    "hover:bg-[color-mix(in_srgb,var(--booking-accent)_8%,var(--booking-surface))]",
  hoverAccentBorder:
    "hover:border-[color-mix(in_srgb,var(--booking-accent)_45%,transparent)]",
  hoverTextPrimary: "hover:text-[color:var(--booking-text-primary)]",
  btnPrimary:
    "bg-[var(--booking-accent)] text-white hover:opacity-90 disabled:opacity-50",
  divideSubtle: "divide-[color:var(--booking-border-subtle)]",
} as const
