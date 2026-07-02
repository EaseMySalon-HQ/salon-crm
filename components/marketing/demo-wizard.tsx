"use client"

import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/use-toast"
import {
  DemoBookingSuccessDialog,
  type DemoBookingSuccessSummary,
} from "@/components/marketing/demo-booking-success-dialog"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

const locationOptions = ["1", "2", "3", "4", "5+"] as const
const staffCountOptions = ["1", "2-5", "6-10", "above 10"] as const

const demoSchema = z.object({
  branches: z.string().trim().min(1, "Select number of locations"),
  firstName: z.string().trim().min(2, "Enter your first name"),
  lastName: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z
    .string()
    .regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
  email: z.string().trim().email("Enter a valid email"),
  salon: z.string().trim().min(2, "Salon / brand name is required"),
  city: z.string().trim().min(2, "City is required"),
  staffCount: z.string().trim().min(1, "Select number of staff"),
  notes: z
    .string()
    .trim()
    .min(10, "Tell us a little about what you'd like to focus on")
    .max(2000, "Please keep this under 2000 characters"),
  website: z.string().max(200).optional(),
})

type DemoFormValues = z.infer<typeof demoSchema>

function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-slate-700">
        {label}
        {required ? (
          <span className="ml-0.5 text-red-600" aria-hidden>
            *
          </span>
        ) : null}
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
  const [loading, setLoading] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const [successSummary, setSuccessSummary] = useState<DemoBookingSuccessSummary | null>(null)

  const form = useForm<DemoFormValues>({
    resolver: zodResolver(demoSchema),
    mode: "onChange",
    defaultValues: {
      branches: "",
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      salon: "",
      city: "",
      staffCount: "",
      notes: "",
      website: "",
    },
  })

  const onSubmit = async (values: DemoFormValues) => {
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/public/demo-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: values.firstName.trim(),
          lastName: values.lastName?.trim() || undefined,
          phone: `+91${values.phone}`,
          email: values.email.trim(),
          salon: values.salon,
          city: values.city,
          branches: values.branches,
          staffCount: values.staffCount,
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
      })
      window.fbq?.("track", "Lead", {
        content_name: "Demo Booking",
        content_category: "demo",
        currency: "INR",
      })

      setSuccessSummary({
        name: values.firstName.trim(),
        salon: values.salon,
        email: values.email,
      })
      setSuccessOpen(true)
      form.reset()
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

  const watched = form.watch()
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const emailValue = watched.email?.trim() ?? ""
  const emailOk = emailRe.test(emailValue)
  const isFormValid =
    (watched.branches?.trim().length ?? 0) >= 1 &&
    (watched.firstName?.trim().length ?? 0) >= 2 &&
    /^\d{10}$/.test(watched.phone || "") &&
    emailOk &&
    (watched.salon?.trim().length ?? 0) >= 2 &&
    (watched.city?.trim().length ?? 0) >= 2 &&
    (watched.staffCount?.trim().length ?? 0) >= 1 &&
    (watched.notes?.trim().length ?? 0) >= 10

  return (
    <>
      <DemoBookingSuccessDialog
        open={successOpen}
        onOpenChange={setSuccessOpen}
        summary={successSummary}
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-purple-100/30 sm:p-8">
        <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
          Book Your Free Demo Today!
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Fill in the details and we&apos;ll set up your personalized walkthrough.
        </p>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            className="pointer-events-none absolute -left-[9999px] h-0 w-0 opacity-0"
            {...form.register("website")}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="First name"
              required
              error={form.formState.errors.firstName?.message}
            >
              <Input
                {...form.register("firstName")}
                placeholder="First name"
                autoComplete="given-name"
              />
            </Field>
            <Field
              label="Last name"
              hint="Optional"
              error={form.formState.errors.lastName?.message}
            >
              <Input
                {...form.register("lastName")}
                placeholder="Last name"
                autoComplete="family-name"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Phone number"
              required
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
              required
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Salon / brand name"
              required
              error={form.formState.errors.salon?.message}
            >
              <Input
                {...form.register("salon")}
                placeholder="e.g. Bloom Beauty Lounge"
                autoComplete="organization"
              />
            </Field>
            <Field
              label="Locations"
              required
              error={form.formState.errors.branches?.message}
            >
              <Controller
                control={form.control}
                name="branches"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value || undefined}>
                    <SelectTrigger aria-label="Number of locations">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {locationOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="No. of Staffs"
              required
              error={form.formState.errors.staffCount?.message}
            >
              <Controller
                control={form.control}
                name="staffCount"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value || undefined}>
                    <SelectTrigger aria-label="Number of staff">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {staffCountOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="City" required error={form.formState.errors.city?.message}>
              <Input
                {...form.register("city")}
                placeholder="e.g. Mumbai"
                autoComplete="address-level2"
              />
            </Field>
          </div>

          <Field
            label="What should we prepare for your demo?"
            required
            error={form.formState.errors.notes?.message}
          >
            <Textarea
              rows={4}
              placeholder="Top priorities, current challenges, or modules you want to see…"
              aria-invalid={form.formState.errors.notes ? "true" : "false"}
              {...form.register("notes")}
            />
          </Field>

          <Button
            type="submit"
            disabled={loading || !isFormValid}
            className="h-11 w-full bg-[#7C3AED] px-8 hover:bg-[#6D28D9]"
          >
            {loading ? "Booking…" : "Submit"}
          </Button>
        </form>
      </div>
    </>
  )
}
