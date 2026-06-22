"use client"

import { Clock, MapPin, Phone, Zap, Wallet, UserRound } from "lucide-react"
import { BookingShowcaseCarousel } from "@/components/public-booking/booking-showcase-carousel"
import { cn } from "@/lib/utils"
import { resolveBookingHeroTheme } from "@/lib/booking-hero-themes"
import { BOOKING_HERO_INNER_CLASS } from "@/lib/booking-hero-layout"
import {
  formatPublicAddress,
  formatTodayHoursLabel,
  type PublicBookingProfile,
} from "@/lib/public-booking-api"

type BookingHeroProps = {
  profile: PublicBookingProfile
}

const HIGHLIGHTS = [
  { icon: Zap, title: "Live availability", detail: "See open slots instantly" },
  { icon: Wallet, title: "Pay at visit", detail: "No prepayment required" },
  { icon: UserRound, title: "Quick checkout", detail: "Book without signing up" },
] as const

export function BookingHero({ profile }: BookingHeroProps) {
  const addressLine = formatPublicAddress(profile)
  const hoursLine = formatTodayHoursLabel(profile)
  const phone = profile.contact?.phone?.trim()
  const tagline = profile.bookingTagline?.trim()
  const images = profile.showcaseImages ?? []
  const theme = resolveBookingHeroTheme(profile.bookingHeroTheme)
  const isLight = theme.mode === "light"

  return (
    <section
      className={cn("relative w-full overflow-hidden", isLight ? "text-slate-900" : "text-white")}
      style={{ backgroundColor: theme.baseBg }}
    >
      <div
        className={cn("pointer-events-none absolute inset-0", isLight ? "opacity-90" : "opacity-60")}
        aria-hidden
        style={{ background: theme.overlay }}
      />

      <div className={BOOKING_HERO_INNER_CLASS}>
        <div className="order-2 min-w-0 space-y-5 lg:order-1 lg:space-y-6">
          <div className="flex items-start gap-4">
            {profile.logoUrl ? (
              <div
                className={cn(
                  "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border",
                  isLight ? "border-slate-200 bg-white shadow-sm" : "border-white/10 bg-white/10"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={profile.logoUrl}
                  alt=""
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div
                className={cn(
                  "flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold shadow-lg",
                  isLight ? "text-white" : "text-white"
                )}
                style={{
                  background: `linear-gradient(to bottom right, ${theme.accent}, ${isLight ? theme.baseBg : theme.baseBg})`,
                  boxShadow: `0 10px 15px -3px ${theme.accent}40`,
                }}
              >
                {profile.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 space-y-1">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">{profile.name}</h1>
              {tagline ? (
                <p className={cn("pt-0.5 text-sm", isLight ? "text-slate-600" : "text-white/70")}>{tagline}</p>
              ) : (
                <p className={cn("pt-0.5 text-sm", isLight ? "text-slate-500" : "text-white/50")}>
                  Reserve your chair in a few taps
                </p>
              )}
            </div>
          </div>

          <ul className={cn("space-y-2.5 text-sm lg:space-y-3", isLight ? "text-slate-700" : "text-white/80")}>
            {addressLine && (
              <li className="flex gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: theme.accent }} aria-hidden />
                <span className="leading-relaxed">{addressLine}</span>
              </li>
            )}
            {phone && (
              <li className="flex gap-3">
                <Phone className="mt-0.5 h-4 w-4 shrink-0" style={{ color: theme.accent }} aria-hidden />
                <a
                  href={`tel:${phone.replace(/\s/g, "")}`}
                  className={cn("hover:underline", isLight ? "hover:text-slate-900" : "hover:text-white")}
                >
                  {phone}
                </a>
              </li>
            )}
            {hoursLine && (
              <li className="flex gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: theme.accent }} aria-hidden />
                <span>{hoursLine}</span>
              </li>
            )}
          </ul>

          <div
            className={cn(
              "hidden border-t pt-4 md:block lg:pt-5",
              isLight ? "border-slate-200/80" : "border-white/10"
            )}
          >
            <p
              className={cn(
                "mb-3 text-[11px] font-medium uppercase tracking-wider",
                isLight ? "text-slate-400" : "text-white/40"
              )}
            >
              What to expect
            </p>
            <ul className="grid gap-3 md:grid-cols-3 md:gap-4" role="list">
              {HIGHLIGHTS.map(({ icon: Icon, title, detail }) => (
                <li
                  key={title}
                  className={cn(
                    "flex min-w-0 items-start gap-2.5 cursor-default select-none",
                    isLight ? "text-slate-600" : "text-white/70"
                  )}
                >
                  <Icon
                    className="mt-0.5 h-4 w-4 shrink-0 opacity-70"
                    style={{ color: theme.accent }}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-xs font-medium leading-snug",
                        isLight ? "text-slate-700" : "text-white/85"
                      )}
                    >
                      {title}
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 text-[11px] leading-snug",
                        isLight ? "text-slate-500" : "text-white/45"
                      )}
                    >
                      {detail}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <BookingShowcaseCarousel
          images={images}
          salonName={profile.name}
          className="hidden lg:block order-1 -mx-4 w-[calc(100%+2rem)] sm:-mx-6 sm:w-[calc(100%+3rem)] lg:order-2 lg:mx-0 lg:w-full lg:max-w-[420px] lg:justify-self-end [&>div]:rounded-none lg:[&>div]:rounded-2xl"
        />
      </div>
    </section>
  )
}
