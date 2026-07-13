"use client"

import { Label } from "@/components/ui/label"
import {
  BOOKING_HERO_THEME_IDS,
  resolveBookingHeroTheme,
  type BookingHeroThemeId,
} from "@/lib/booking-hero-themes"
import { cn } from "@/lib/utils"

type BookingShowcaseManagerProps = {
  heroTheme?: BookingHeroThemeId
  disabled?: boolean
  onHeroThemeChange: (theme: BookingHeroThemeId) => void
}

export function BookingShowcaseManager({
  heroTheme,
  disabled,
  onHeroThemeChange,
}: BookingShowcaseManagerProps) {
  const resolvedHeroTheme = resolveBookingHeroTheme(heroTheme)

  return (
    <div className="space-y-3">
      <Label>Website theme</Label>
      <p className="text-xs text-slate-500">
        Color palette for your mini-site, booking page, and CTAs.
      </p>
      <div className="flex flex-wrap gap-2">
        {BOOKING_HERO_THEME_IDS.map((id) => {
          const theme = resolveBookingHeroTheme(id)
          const selected = resolvedHeroTheme.id === id
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              aria-label={theme.label}
              aria-pressed={selected}
              title={theme.label}
              onClick={() => onHeroThemeChange(id)}
              className={cn(
                "relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition",
                selected
                  ? "ring-2 ring-[color-mix(in_srgb,var(--swatch-accent)_35%,transparent)]"
                  : "border-slate-200 hover:border-slate-300"
              )}
              style={
                {
                  borderColor: selected ? theme.accent : undefined,
                  ['--swatch-accent' as string]: theme.accent,
                } as React.CSSProperties
              }
            >
              <div className="absolute inset-0" style={{ backgroundColor: theme.baseBg }}>
                <div
                  className="h-full w-full opacity-90"
                  style={{ background: theme.overlay }}
                  aria-hidden
                />
              </div>
            </button>
          )
        })}
      </div>
      <p className="text-xs text-slate-500">
        Selected: <span className="font-medium text-slate-700">{resolvedHeroTheme.label}</span>
      </p>
    </div>
  )
}
