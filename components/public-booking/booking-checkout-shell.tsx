"use client"

import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

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
    <div className="flex w-full flex-1 flex-col bg-gradient-to-b from-slate-50/80 via-white to-purple-50/20">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:py-10">
        <div className="mx-auto mb-8 max-w-md">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A855F7] transition-all duration-500 ease-out"
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
            className="absolute left-0 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="mr-1 h-4 w-4" aria-hidden />
            Back
          </Button>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Step {step} of {stepCount}
          </p>
        </div>

        <div className="mt-4 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {heading.title}
          </h2>
          {heading.sub ? (
            <p className="mx-auto mt-3 max-w-xl text-base text-slate-600">{heading.sub}</p>
          ) : null}
        </div>

        <div className="mt-8">{children}</div>
      </div>
    </div>
  )
}
