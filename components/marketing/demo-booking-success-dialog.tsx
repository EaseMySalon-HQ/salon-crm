"use client"

import {
  CalendarDays,
  Check,
  Mail,
  Sparkles,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type DemoBookingSuccessSummary = {
  name: string
  salon: string
  email: string
  preferredTime?: string
}

type DemoBookingSuccessDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: DemoBookingSuccessSummary | null
}

const nextSteps = [
  {
    icon: Mail,
    title: "Confirmation email",
    description: "We’ll send a short note to your inbox with what happens next.",
  },
  {
    icon: CalendarDays,
    title: "Calendar invite",
    description: "Within 1 business day, you’ll get a slot for your live walkthrough.",
  },
  {
    icon: Sparkles,
    title: "Tailored demo",
    description: "We’ll prep POS, appointments, and reports around your priorities.",
  },
] as const

export function DemoBookingSuccessDialog({
  open,
  onOpenChange,
  summary,
}: DemoBookingSuccessDialogProps) {
  const firstName = summary?.name?.trim().split(/\s+/)[0] || "there"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-slate-900/65 backdrop-blur-md"
        className={cn(
          "max-w-[440px] gap-0 overflow-hidden border-0 p-0 shadow-2xl",
          "sm:rounded-2xl"
        )}
      >
        <DialogTitle className="sr-only">Demo request received</DialogTitle>
        <DialogDescription className="sr-only">
          Your demo booking was submitted successfully.
        </DialogDescription>

        {/* Hero */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] px-6 pt-8 pb-10 text-center text-white">
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-6 -left-6 h-28 w-28 rounded-full bg-white/15 blur-2xl" />

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-3 rounded-full p-2 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center">
            <span
              className="absolute inset-0 animate-ping rounded-full bg-white/25"
              aria-hidden
            />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lg shadow-purple-900/20">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600">
                <Check className="h-7 w-7 text-white stroke-[3]" />
              </span>
            </span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight">
            You&apos;re all set, {firstName}!
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-purple-100">
            {summary?.salon ? (
              <>
                We received your request for{" "}
                <span className="font-semibold text-white">{summary.salon}</span>.
              </>
            ) : (
              "We received your demo request."
            )}
          </p>
          {summary?.preferredTime ? (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
              <CalendarDays className="h-3.5 w-3.5" />
              Preferred: {summary.preferredTime}
            </p>
          ) : null}
        </div>

        {/* Body */}
        <div className="space-y-5 bg-white px-6 py-6">
          <p className="text-center text-sm text-slate-600">
            Our team will reach out at{" "}
            <span className="font-medium text-slate-900">{summary?.email}</span> within{" "}
            <span className="font-medium text-slate-900">1 business day</span>.
          </p>

          <ul className="space-y-3">
            {nextSteps.map((step, index) => {
              const Icon = step.icon
              return (
                <li
                  key={step.title}
                  className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3.5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#7C3AED]/10 text-[#7C3AED]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 text-left">
                    <p className="text-sm font-semibold text-slate-900">
                      <span className="mr-1.5 text-xs font-bold text-[#7C3AED]">
                        {index + 1}
                      </span>
                      {step.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                      {step.description}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>

          <Button
            type="button"
            className="h-11 w-full rounded-xl bg-[#7C3AED] text-base font-semibold hover:bg-[#6D28D9]"
            onClick={() => onOpenChange(false)}
          >
            Sounds good
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
