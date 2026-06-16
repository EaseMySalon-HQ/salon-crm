"use client"

import { useEffect, useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { DayPicker } from "react-day-picker"
import {
  ArrowLeft,
  ArrowRight,
  Brush,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Crown,
  Flower2,
  HandHeart,
  HeartPulse,
  HelpCircle,
  Palette,
  Scissors,
  Sparkles,
  Store,
  User,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import {
  DemoBookingSuccessDialog,
  type DemoBookingSuccessSummary,
} from "@/components/marketing/demo-booking-success-dialog"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

const TOTAL_STEPS = 5

const serviceOptions = [
  { id: "Haircuts & styling", Icon: Scissors },
  { id: "Hair color & treatments", Icon: Palette },
  { id: "Nails", Icon: Flower2 },
  { id: "Skin & facials", Icon: Sparkles },
  { id: "Threading & waxing", Icon: HandHeart },
  { id: "Bridal & makeup", Icon: Crown },
  { id: "Massage & spa", Icon: HeartPulse },
  { id: "Men's grooming", Icon: UserRound },
  { id: "Other", Icon: Brush },
  { id: "Not sure yet", Icon: HelpCircle },
] as const

type BranchBucket = {
  value: string
  label: string
  subtitle: string
  Icon: LucideIcon
}

const branchBuckets: BranchBucket[] = [
  { value: "1", label: "1", subtitle: "Single chair / solo", Icon: User },
  { value: "2-4", label: "2-4", subtitle: "Small team", Icon: Users },
  { value: "5-10", label: "5-10", subtitle: "Multi-stylist salon", Icon: Store },
  { value: "10+", label: "10+", subtitle: "Chain / franchise", Icon: Building2 },
]

/** 30-min start-times from 10:00 AM to 7:30 PM IST. */
const timeSlots = Array.from({ length: 20 }, (_, index) => {
  const totalMinutes = 10 * 60 + index * 30
  const hour24 = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const period = hour24 >= 12 ? "PM" : "AM"
  const displayHour = hour24 % 12 || 12
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(displayHour)}:${pad(minutes)} ${period}`
})

function isoToDate(iso: string): Date | undefined {
  if (!iso) return undefined
  const parts = iso.split("-").map(Number)
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return undefined
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function formatLongDate(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

/** Parse a slot like "10:30 AM" to minutes since midnight (0–1439). */
function slotToMinutes(slot: string): number {
  const match = slot.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return 0
  let h = Number(match[1])
  const m = Number(match[2])
  const period = match[3].toUpperCase()
  if (period === "PM" && h !== 12) h += 12
  if (period === "AM" && h === 12) h = 0
  return h * 60 + m
}

/** Current wall-clock minutes-since-midnight in Asia/Kolkata. */
function istMinutesSinceMidnight(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at)
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0)
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0)
  return h * 60 + m
}

/** Minimum lead time before a slot is bookable, in minutes. */
const SLOT_LEAD_TIME_MIN = 60

const demoSchema = z.object({
  services: z.array(z.string()).min(1, "Pick at least one service"),
  branches: z.string().min(1, "Pick a branch count"),
  name: z.string().trim().min(2, "Enter your full name"),
  phone: z
    .string()
    .regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .or(z.literal(""))
    .optional(),
  salon: z.string().trim().min(2, "Salon / brand name is required"),
  city: z.string().trim().min(2, "City is required"),
  preferredDate: z.string().min(1, "Pick a date"),
  preferredSlot: z.string().min(1, "Pick a time slot"),
  notes: z
    .string()
    .trim()
    .min(10, "Tell us a little about what you'd like to focus on")
    .max(2000, "Please keep this under 2000 characters"),
  website: z.string().max(200).optional(),
})

type DemoFormValues = z.infer<typeof demoSchema>

const STEP_HEADINGS: Record<number, { title: string; sub?: string }> = {
  1: {
    title: "What services do you offer?",
    sub: "Pick all that apply — we'll tailor your demo to what you actually run.",
  },
  2: {
    title: "How many locations do you run?",
    sub: "Helps us route you to the right product specialist.",
  },
  3: {
    title: "What's your name and contact?",
  },
  4: {
    title: "Tell us about your business",
  },
  5: {
    title: "Pick a time that works for you",
    sub: "Live 30-min walkthrough · 7 days a week · India timezone (IST)",
  },
}

const STEP_FIELDS: Record<number, (keyof DemoFormValues)[]> = {
  1: ["services"],
  2: ["branches"],
  3: ["name", "phone", "email"],
  4: ["salon", "city"],
  5: ["preferredDate", "preferredSlot"],
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-slate-700">
        {label}
        {hint ? (
          <span className="ml-1 font-normal text-slate-400">({hint})</span>
        ) : null}
      </label>
      {children}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  )
}

export function DemoWizard() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const [successSummary, setSuccessSummary] = useState<DemoBookingSuccessSummary | null>(null)

  const todayMidnight = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const istTime = now
    .toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    })
    .toLowerCase()

  const form = useForm<DemoFormValues>({
    resolver: zodResolver(demoSchema),
    mode: "onChange",
    defaultValues: {
      services: [],
      branches: "",
      name: "",
      phone: "",
      email: "",
      salon: "",
      city: "",
      preferredDate: "",
      preferredSlot: "",
      notes: "",
      website: "",
    },
  })

  const handleNext = async () => {
    const fields = STEP_FIELDS[step]
    const valid = await form.trigger(fields)
    if (!valid) return
    setStep((s) => Math.min(s + 1, TOTAL_STEPS))
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 1))
  }

  const onSubmit = async (values: DemoFormValues) => {
    setLoading(true)

    try {
      const message = [
        `Services interested in: ${values.services.join(", ")}`,
        `Notes: ${values.notes}`,
      ].join("\n\n")

      const dateObj = isoToDate(values.preferredDate)
      const dateLabel = dateObj ? formatLongDate(dateObj) : values.preferredDate
      const preferredTime = `${dateLabel} · ${values.preferredSlot} IST`

      const res = await fetch(`${API_URL}/public/demo-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          phone: `+91${values.phone}`,
          email: values.email?.trim() ? values.email.trim() : undefined,
          salon: values.salon,
          city: values.city,
          branches: values.branches,
          preferredTime,
          message,
          website: values.website || "",
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || payload?.success === false) {
        throw new Error(payload?.error || "Could not save your demo request")
      }

      window.gtag?.("event", "conversion", {
        send_to: "AW-18203026415/JT4OCOmrwb0cEO_H8OdD",
      })
      window.gtag?.("event", "generate_lead", {
        currency: "INR",
        form: "demo",
        content_name: "Demo Booking",
        branches: values.branches,
        services: values.services,
      })
      window.fbq?.("track", "Lead", {
        content_name: "Demo Booking",
        content_category: "demo",
        currency: "INR",
      })

      setSuccessSummary({
        name: values.name,
        salon: values.salon,
        email: values.email,
        preferredTime,
      })
      setSuccessOpen(true)
      form.reset()
      setStep(1)
    } catch (error) {
      toast({
        title: "Something went wrong",
        description: error instanceof Error ? error.message : "Please try again in a moment.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const heading = STEP_HEADINGS[step]
  const progressPct = (step / TOTAL_STEPS) * 100

  // Live per-step validity — gates the Continue / Book my demo button.
  // form.watch() makes this reactive: any field change re-evaluates.
  const watched = form.watch()
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const isCurrentStepValid = (() => {
    switch (step) {
      case 1:
        return (watched.services?.length ?? 0) > 0
      case 2:
        return !!watched.branches
      case 3: {
        const nameOk = (watched.name?.trim().length ?? 0) >= 2
        const phoneOk = /^\d{10}$/.test(watched.phone || "")
        const emailValue = watched.email?.trim() ?? ""
        const emailOk = emailValue === "" || emailRe.test(emailValue)
        return nameOk && phoneOk && emailOk
      }
      case 4:
        return (
          (watched.salon?.trim().length ?? 0) >= 2 &&
          (watched.city?.trim().length ?? 0) >= 2
        )
      case 5:
        return (
          !!watched.preferredDate &&
          !!watched.preferredSlot &&
          (watched.notes?.trim().length ?? 0) >= 10
        )
      default:
        return false
    }
  })()

  return (
    <>
      <DemoBookingSuccessDialog
        open={successOpen}
        onOpenChange={setSuccessOpen}
        summary={successSummary}
      />

      <div className="mx-auto w-full max-w-3xl">
        {/* Progress bar */}
        <div className="mx-auto mb-8 max-w-md">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A855F7] transition-all duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
              aria-hidden
            />
          </div>
        </div>

        {/* Step counter + heading */}
        <div className="text-center">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Step {step} of {TOTAL_STEPS}
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]">
            {heading.title}
          </h1>
          {heading.sub ? (
            <p className="mx-auto mt-3 max-w-xl text-base text-slate-600">{heading.sub}</p>
          ) : null}
        </div>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          onKeyDown={(e) => {
            const target = e.target as HTMLElement
            if (
              e.key === "Enter" &&
              step < TOTAL_STEPS &&
              target.tagName !== "TEXTAREA" &&
              target.tagName !== "BUTTON"
            ) {
              e.preventDefault()
              handleNext()
            }
          }}
          className="mt-10"
        >
          {/* Honeypot */}
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            className="pointer-events-none absolute -left-[9999px] h-0 w-0 opacity-0"
            {...form.register("website")}
          />

          {/* STEP 1 — Services */}
          {step === 1 && (
            <Controller
              control={form.control}
              name="services"
              render={({ field, fieldState }) => (
                <div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {serviceOptions.map((service) => {
                      const isSelected = field.value.includes(service.id)
                      const Icon = service.Icon
                      return (
                        <button
                          key={service.id}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => {
                            const next = isSelected
                              ? field.value.filter((s) => s !== service.id)
                              : [...field.value, service.id]
                            field.onChange(next)
                          }}
                          className={cn(
                            "group relative flex items-center gap-3 rounded-2xl border-2 bg-white px-4 py-3.5 text-left transition-all",
                            isSelected
                              ? "border-[#7C3AED] bg-purple-50/60 shadow-sm"
                              : "border-slate-200 hover:border-[#7C3AED]/40 hover:shadow-sm"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                              isSelected
                                ? "bg-[#7C3AED] text-white"
                                : "bg-slate-100 text-[#7C3AED]"
                            )}
                          >
                            <Icon className="h-4 w-4" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">
                            {service.id}
                          </span>
                          {isSelected ? (
                            <Check className="h-4 w-4 shrink-0 text-[#7C3AED]" aria-hidden />
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                  {fieldState.error ? (
                    <p className="mt-3 text-center text-sm text-red-600">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </div>
              )}
            />
          )}

          {/* STEP 2 — Branches */}
          {step === 2 && (
            <Controller
              control={form.control}
              name="branches"
              render={({ field, fieldState }) => (
                <div>
                  <div className="mx-auto grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                    {branchBuckets.map((bucket) => {
                      const isSelected = field.value === bucket.value
                      const Icon = bucket.Icon
                      return (
                        <button
                          key={bucket.value}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => field.onChange(bucket.value)}
                          className={cn(
                            "group flex aspect-[4/5] flex-col items-center justify-between rounded-2xl border-2 bg-white p-4 transition-all",
                            isSelected
                              ? "border-[#7C3AED] bg-purple-50/60 shadow-md"
                              : "border-slate-200 hover:border-[#7C3AED]/40 hover:shadow-sm"
                          )}
                        >
                          <div className="flex flex-1 items-center justify-center py-3">
                            <span
                              className={cn(
                                "flex h-16 w-16 items-center justify-center rounded-2xl transition-colors",
                                isSelected
                                  ? "bg-[#7C3AED] text-white shadow-md shadow-purple-200"
                                  : "bg-gradient-to-br from-purple-50 to-purple-100 text-[#7C3AED] group-hover:from-purple-100 group-hover:to-purple-200"
                              )}
                            >
                              <Icon className="h-8 w-8" aria-hidden strokeWidth={1.75} />
                            </span>
                          </div>
                          <div className="text-center">
                            <p className="text-xl font-bold text-slate-900">{bucket.label}</p>
                            <p className="mt-0.5 text-[11px] leading-snug text-slate-500 sm:text-xs">
                              {bucket.subtitle}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  {fieldState.error ? (
                    <p className="mt-3 text-center text-sm text-red-600">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </div>
              )}
            />
          )}

          {/* STEP 3 — Identity */}
          {step === 3 && (
            <div className="mx-auto max-w-md space-y-5">
              <Field label="Full name" error={form.formState.errors.name?.message}>
                <Input
                  {...form.register("name")}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </Field>
              <Field
                label="Mobile number"
                error={form.formState.errors.phone?.message}
              >
                <Controller
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center border-r border-slate-200 pl-3 pr-3 text-sm font-medium text-slate-600">
                        +91
                      </span>
                      <Input
                        ref={field.ref}
                        name={field.name}
                        value={field.value}
                        onBlur={field.onBlur}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "").slice(0, 10)
                          field.onChange(digits)
                        }}
                        placeholder="98765 43210"
                        autoComplete="tel-national"
                        inputMode="numeric"
                        maxLength={10}
                        className="pl-14"
                        aria-label="10-digit Indian mobile number"
                      />
                    </div>
                  )}
                />
              </Field>
              <Field
                label="Email"
                hint="Optional"
                error={form.formState.errors.email?.message}
              >
                <Input
                  type="email"
                  {...form.register("email")}
                  placeholder="you@salon.com"
                  autoComplete="email"
                />
              </Field>
            </div>
          )}

          {/* STEP 4 — Business */}
          {step === 4 && (
            <div className="mx-auto max-w-md space-y-5">
              <Field
                label="Salon / brand name"
                error={form.formState.errors.salon?.message}
              >
                <Input
                  {...form.register("salon")}
                  placeholder="e.g. Bloom Beauty Lounge"
                  autoComplete="organization"
                />
              </Field>
              <Field label="City" error={form.formState.errors.city?.message}>
                <Input
                  {...form.register("city")}
                  placeholder="e.g. Mumbai"
                  autoComplete="address-level2"
                />
              </Field>
            </div>
          )}

          {/* STEP 5 — Date + Time */}
          {step === 5 && (
            <div className="mx-auto max-w-3xl space-y-5">
              <Controller
                control={form.control}
                name="preferredDate"
                render={({ field: dateField }) => {
                  const selectedDateObj = isoToDate(dateField.value)
                  return (
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="grid md:grid-cols-2">
                        {/* LEFT — Calendar + timezone footer */}
                        <div className="flex flex-col border-b border-slate-100 p-5 md:border-b-0 md:border-r md:p-6">
                          <DayPicker
                            mode="single"
                            selected={selectedDateObj}
                            onSelect={(date) => {
                              if (!date) {
                                dateField.onChange("")
                                form.setValue("preferredSlot", "", { shouldValidate: false })
                                return
                              }
                              const iso = dateToIso(date)
                              if (iso !== dateField.value) {
                                dateField.onChange(iso)
                                form.setValue("preferredSlot", "", { shouldValidate: false })
                              }
                            }}
                            disabled={{ before: todayMidnight }}
                            startMonth={
                              new Date(todayMidnight.getFullYear(), todayMidnight.getMonth(), 1)
                            }
                            endMonth={
                              new Date(todayMidnight.getFullYear(), todayMidnight.getMonth() + 3, 1)
                            }
                            showOutsideDays={false}
                            className="mx-auto w-full"
                            classNames={{
                              months: "flex flex-col",
                              month: "flex flex-col gap-2",
                              nav: "flex items-center justify-between px-1",
                              button_previous:
                                "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30",
                              button_next:
                                "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30",
                              month_caption:
                                "flex h-8 items-center justify-center text-base font-semibold text-slate-900",
                              table: "w-full border-collapse",
                              weekdays: "flex",
                              weekday:
                                "flex-1 py-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500",
                              week: "flex",
                              day: "flex-1 aspect-square p-0.5",
                              outside: "text-slate-300",
                              disabled: "opacity-40",
                            }}
                            components={{
                              Chevron: ({ orientation, className }) =>
                                orientation === "left" ? (
                                  <ChevronLeft className={cn("h-4 w-4", className)} aria-hidden />
                                ) : (
                                  <ChevronRight className={cn("h-4 w-4", className)} aria-hidden />
                                ),
                              DayButton: ({ day, modifiers, ...buttonProps }) => {
                                const isSelected = !!modifiers.selected
                                const isToday = !!modifiers.today
                                const isDisabled = !!modifiers.disabled
                                return (
                                  <button
                                    type="button"
                                    disabled={isDisabled}
                                    aria-label={day.date.toDateString()}
                                    {...buttonProps}
                                    className={cn(
                                      "mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors",
                                      isDisabled && "cursor-not-allowed text-slate-300",
                                      !isDisabled &&
                                        !isSelected &&
                                        !isToday &&
                                        "font-medium text-slate-700 hover:bg-purple-50",
                                      !isDisabled &&
                                        isToday &&
                                        !isSelected &&
                                        "font-semibold text-slate-900 ring-1 ring-inset ring-slate-400",
                                      isSelected &&
                                        "bg-[#7C3AED] font-semibold text-white shadow-sm hover:bg-[#6D28D9]"
                                    )}
                                  >
                                    {day.date.getDate()}
                                  </button>
                                )
                              },
                            }}
                          />
                          <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                            Asia / Kolkata ({istTime})
                          </div>
                        </div>

                        {/* RIGHT — slot list or empty state */}
                        <div className="p-5 md:p-6">
                          {selectedDateObj ? (
                            (() => {
                              const isTodaySelected =
                                selectedDateObj.getTime() === todayMidnight.getTime()
                              const cutoffMinutes =
                                istMinutesSinceMidnight(now) + SLOT_LEAD_TIME_MIN
                              const availableSlots = isTodaySelected
                                ? timeSlots.filter(
                                    (s) => slotToMinutes(s) >= cutoffMinutes
                                  )
                                : timeSlots

                              if (availableSlots.length === 0) {
                                return (
                                  <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 px-4 text-center">
                                    <p className="text-sm font-semibold text-slate-900">
                                      No more slots available today
                                    </p>
                                    <p className="text-xs leading-relaxed text-slate-500">
                                      Slots need at least 1&nbsp;hour of lead time. Pick another date
                                      above to see available times.
                                    </p>
                                  </div>
                                )
                              }

                              return (
                                <Controller
                                  control={form.control}
                                  name="preferredSlot"
                                  render={({ field: slotField }) => {
                                    // If the previously-chosen slot is no longer available
                                    // (e.g. clock advanced past it), clear it so the user re-picks.
                                    const slotStillValid =
                                      !slotField.value ||
                                      availableSlots.includes(slotField.value)
                                    if (!slotStillValid) {
                                      queueMicrotask(() =>
                                        form.setValue("preferredSlot", "", {
                                          shouldValidate: false,
                                        })
                                      )
                                    }
                                    return (
                                      <div className="flex h-full flex-col">
                                        <p className="mb-4 text-center text-sm font-semibold text-slate-900">
                                          {formatLongDate(selectedDateObj)}
                                        </p>
                                        <div className="grid gap-2 sm:max-h-[280px] sm:overflow-y-auto sm:pr-1">
                                          {availableSlots.map((slot) => {
                                            const isSelected = slotField.value === slot
                                            return (
                                              <button
                                                key={slot}
                                                type="button"
                                                onClick={() => slotField.onChange(slot)}
                                                className={cn(
                                                  "rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition-all",
                                                  isSelected
                                                    ? "border-[#7C3AED] bg-[#7C3AED] text-white shadow-sm hover:bg-[#6D28D9]"
                                                    : "border-slate-200 bg-white text-slate-700 hover:border-[#7C3AED]/40"
                                                )}
                                              >
                                                {slot}
                                              </button>
                                            )
                                          })}
                                        </div>
                                        {isTodaySelected ? (
                                          <p className="mt-3 text-center text-[11px] text-slate-400">
                                            Slots within the next hour are unavailable.
                                          </p>
                                        ) : null}
                                      </div>
                                    )
                                  }}
                                />
                              )
                            })()
                          ) : (
                            <div className="flex h-full min-h-[220px] items-center justify-center px-4 text-center text-sm text-slate-500">
                              Select a date to view available times.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                }}
              />

              {(form.formState.errors.preferredDate?.message ||
                form.formState.errors.preferredSlot?.message) ? (
                <p className="text-center text-sm text-red-600">
                  {form.formState.errors.preferredDate?.message ||
                    form.formState.errors.preferredSlot?.message}
                </p>
              ) : null}

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  What should we prepare for your demo?
                </label>
                <Textarea
                  rows={3}
                  placeholder="Top priorities, current challenges, or modules you want to see…"
                  aria-invalid={form.formState.errors.notes ? "true" : "false"}
                  {...form.register("notes")}
                />
                {form.formState.errors.notes ? (
                  <p className="mt-1.5 text-sm text-red-600">
                    {form.formState.errors.notes.message}
                  </p>
                ) : null}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-10 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            {step > 1 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={handleBack}
                className="text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                <ArrowLeft className="mr-1 h-4 w-4" aria-hidden />
                Back
              </Button>
            ) : (
              <span aria-hidden />
            )}
            {step < TOTAL_STEPS ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={!isCurrentStepValid}
                className="h-11 bg-[#7C3AED] px-8 hover:bg-[#6D28D9] sm:min-w-[170px]"
              >
                Continue
                <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={loading || !isCurrentStepValid}
                className="h-11 bg-[#7C3AED] px-8 hover:bg-[#6D28D9] sm:min-w-[170px]"
              >
                {loading ? "Booking…" : "Book my demo"}
              </Button>
            )}
          </div>
        </form>
      </div>
    </>
  )
}
