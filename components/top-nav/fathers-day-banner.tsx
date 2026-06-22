"use client"

import { Sparkles, Shirt } from "lucide-react"
import type { NavBannerConfig, NavBannerTheme } from "@/lib/nav-banner"

type NavBannerMessageProps = {
  config: NavBannerConfig
}

export function NavBannerBackground({ theme }: { theme: NavBannerTheme }) {
  if (theme !== "fathers_day") return null

  return (
    <>
      <div className="fathers-day-banner-gradient pointer-events-none absolute inset-0" aria-hidden />
      <div
        className="pointer-events-none absolute inset-y-0 -left-1/4 w-1/2 bg-gradient-to-r from-transparent via-amber-200/20 to-transparent animate-gold-sheen"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <span className="fathers-day-sparkle absolute left-[6%] top-[30%] h-1 w-1 rounded-full bg-amber-300/70" />
        <span className="fathers-day-sparkle fathers-day-sparkle-delay-1 absolute left-[18%] top-[65%] h-1.5 w-1.5 rounded-full bg-sky-300/60" />
        <span className="fathers-day-sparkle fathers-day-sparkle-delay-2 absolute left-1/2 top-[25%] h-1 w-1 -translate-x-1/2 rounded-full bg-amber-200/80" />
        <span className="fathers-day-sparkle fathers-day-sparkle-delay-3 absolute right-[14%] top-[55%] h-1.5 w-1.5 rounded-full bg-white/40" />
        <span className="fathers-day-sparkle absolute right-[5%] top-[35%] h-1 w-1 rounded-full bg-amber-300/60" />
      </div>
    </>
  )
}

export function NavBannerMessage({ config }: NavBannerMessageProps) {
  if (config.theme !== "fathers_day") return null

  return (
    <div
      className="relative inline-flex h-9 max-w-full min-w-0 items-center px-1 sm:px-2"
      role="status"
      aria-label={[config.headline, config.tagline].filter(Boolean).join(" · ")}
    >
      <div className="relative flex min-w-0 items-center gap-1.5 sm:gap-2">
        <span className="fathers-day-float hidden sm:inline-flex shrink-0" aria-hidden>
          <Shirt className="h-3 w-3 text-amber-300/90" strokeWidth={2} />
        </span>

        <p className="flex min-w-0 items-center gap-1 text-[11px] font-semibold leading-none tracking-wide sm:text-xs">
          <Sparkles className="h-3 w-3 shrink-0 text-amber-300 fathers-day-pulse" aria-hidden />
          <span className="fathers-day-text-shimmer min-w-0 truncate">{config.headline}</span>
          {config.tagline ? (
            <>
              <span className="hidden shrink-0 text-slate-300/80 xl:inline" aria-hidden>
                ·
              </span>
              <span className="hidden min-w-0 truncate text-slate-200/90 xl:inline">{config.tagline}</span>
            </>
          ) : null}
          <Sparkles
            className="hidden h-3 w-3 shrink-0 text-sky-300/90 fathers-day-pulse fathers-day-pulse-delay xl:inline"
            aria-hidden
          />
        </p>
      </div>
    </div>
  )
}

/** @deprecated Use NavBannerBackground */
export const FathersDayNavBackground = NavBannerBackground

/** @deprecated Use NavBannerMessage */
export function FathersDayNavBanner({ config }: { config: NavBannerConfig }) {
  return <NavBannerMessage config={config} />
}
