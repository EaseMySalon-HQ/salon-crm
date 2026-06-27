"use client"

import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArrowLeft,
  ArrowRight,
  Brush,
  Building2,
  Check,
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
    title: "Almost done — what should we prepare?",
    sub: "We'll reach out within 1 business day to schedule your live walkthrough.",
  },
}

const STEP_FIELDS: Record<number, (keyof DemoFormValues)[]> = {
  1: ["services"],
  2: ["branches"],
  3: ["name", "phone", "email"],
  4: ["salon", "city"],
  5: ["notes"],
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
          services: values.services,
          message: values.notes.trim(),
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
        return (watched.notes?.trim().length ?? 0) >= 10
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

          {/* STEP 5 — Demo prep */}
          {step === 5 && (
            <div className="mx-auto max-w-md space-y-5">
              <Field
                label="What should we prepare for your demo?"
                error={form.formState.errors.notes?.message}
              >
                <Textarea
                  rows={5}
                  placeholder="Top priorities, current challenges, or modules you want to see…"
                  aria-invalid={form.formState.errors.notes ? "true" : "false"}
                  {...form.register("notes")}
                />
              </Field>
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
