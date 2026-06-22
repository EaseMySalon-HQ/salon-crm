"use client"

import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { BT } from "@/lib/booking-page-theme"

export const DESKTOP_CHECKOUT_STEP_COUNT = 2

export const DESKTOP_CHECKOUT_STEP_HEADINGS: Record<
  number,
  { title: string; sub?: string }
> = {
  1: {
    title: "Staff & appointment time",
    sub: "Choose one stylist for your appointment and pick when to visit.",
  },
  2: {
    title: "Your details",
    sub: "We'll use this to confirm your appointment.",
  },
}

export const MOBILE_CHECKOUT_STEP_COUNT = 4

export const MOBILE_CHECKOUT_STEP_HEADINGS: Record<
  number,
  { title: string; sub?: string }
> = {
  1: {
    title: "Select staff",
    sub: "Choose a stylist or pick no preference — we'll assign someone available.",
  },
  2: {
    title: "Select date",
    sub: "Pick a day that works for your visit.",
  },
  3: {
    title: "Select time slot",
    sub: "Choose an available time on your selected date.",
  },
  4: {
    title: "Your details",
    sub: "We'll use this to confirm your appointment.",
  },
}

/** @deprecated use DESKTOP_CHECKOUT_STEP_COUNT */
export const CHECKOUT_STEP_COUNT = DESKTOP_CHECKOUT_STEP_COUNT

/** @deprecated use DESKTOP_CHECKOUT_STEP_HEADINGS */
export const CHECKOUT_STEP_HEADINGS = DESKTOP_CHECKOUT_STEP_HEADINGS

type BookingCheckoutShellProps = {
  step: number
  stepCount: number
  headings: Record<number, { title: string; sub?: string }>
  onBack: () => void
  children: ReactNode
}

export function BookingCheckoutShell({
  step,
  stepCount,
  headings,
  onBack,
  children,
}: BookingCheckoutShellProps) {
  const heading = headings[step] ?? { title: "Checkout" }
  const progressPct = (step / stepCount) * 100

  return (
    <div
      className={cn(
        "flex w-full flex-1 flex-col bg-gradient-to-b from-[color:var(--booking-surface-muted)] via-[color:var(--booking-surface)] to-[color-mix(in_srgb,var(--booking-accent)_8%,var(--booking-surface))]"
      )}
    >
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:py-10">
        <div className="mx-auto mb-8 max-w-md">
          <div className={cn("h-1.5 w-full overflow-hidden rounded-full", BT.bgSurfaceMuted)}>
            <div
              className={cn("h-full rounded-full transition-all duration-500 ease-out", BT.bgAccent)}
              style={{ width: `${progressPct}%` }}
              aria-hidden
            />
          </div>
        </div>

        <div className="relative mt-8 flex items-center justify-center">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            className={cn("absolute left-0", BT.textSecondary, BT.hoverAccentSoft, BT.hoverTextPrimary)}
          >
            <ArrowLeft className="mr-1 h-4 w-4" aria-hidden />
            Back
          </Button>
          <p className={cn("font-mono text-xs font-semibold uppercase tracking-[0.3em]", BT.textMuted)}>
            Step {step} of {stepCount}
          </p>
        </div>

        <div className="mt-4 text-center">
          <h2 className={cn("text-2xl font-bold tracking-tight sm:text-3xl", BT.textPrimary)}>
            {heading.title}
          </h2>
          {heading.sub ? (
            <p className={cn("mx-auto mt-3 max-w-xl text-base", BT.textSecondary)}>{heading.sub}</p>
          ) : null}
        </div>

        <div className="mt-8">{children}</div>
      </div>
    </div>
  )
}
