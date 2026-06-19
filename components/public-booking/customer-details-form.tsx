"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { LoadingButton } from "@/components/loading"

const customerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name"),
  phone: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
  notes: z.string().trim().max(2000).optional(),
})

export type CustomerFormValues = z.infer<typeof customerSchema>

type CustomerDetailsFormProps = {
  submitting: boolean
  onSubmit: (values: CustomerFormValues) => void
  disabled?: boolean
  hideHeader?: boolean
}

export function CustomerDetailsForm({
  submitting,
  onSubmit,
  disabled,
  hideHeader = false,
}: CustomerDetailsFormProps) {
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: "", phone: "", email: "", notes: "" },
  })

  return (
    <section className="space-y-4">
      {!hideHeader && (
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Your details</h2>
          <p className="mt-1 text-sm text-slate-500">We&apos;ll use this to confirm your appointment.</p>
        </div>
      )}

      <form
        id="public-booking-customer-form"
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="space-y-2">
          <Label htmlFor="customer-name">Customer name</Label>
          <Input
            id="customer-name"
            {...form.register("name")}
            placeholder="Your full name"
            autoComplete="name"
            disabled={disabled}
          />
          {form.formState.errors.name && (
            <p className="text-xs text-red-600">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="customer-phone">Mobile number</Label>
          <Controller
            control={form.control}
            name="phone"
            render={({ field }) => (
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center border-r border-slate-200 pl-3 pr-3 text-sm font-medium text-slate-600">
                  +91
                </span>
                <Input
                  id="customer-phone"
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
                  disabled={disabled}
                />
              </div>
            )}
          />
          {form.formState.errors.phone && (
            <p className="text-xs text-red-600">{form.formState.errors.phone.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="customer-email">
            Email <span className="font-normal text-slate-400">(optional)</span>
          </Label>
          <Input
            id="customer-email"
            type="email"
            {...form.register("email")}
            placeholder="you@email.com"
            autoComplete="email"
            disabled={disabled}
          />
          {form.formState.errors.email && (
            <p className="text-xs text-red-600">{form.formState.errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="customer-notes">
            Notes <span className="font-normal text-slate-400">(optional)</span>
          </Label>
          <Textarea
            id="customer-notes"
            {...form.register("notes")}
            placeholder="Any special requests?"
            rows={3}
            disabled={disabled}
          />
        </div>

        <LoadingButton
          type="submit"
          loading={submitting}
          disabled={disabled}
          className="hidden w-full bg-[#7C3AED] hover:bg-[#6D28D9] lg:inline-flex lg:w-full"
        >
          Confirm booking
        </LoadingButton>
      </form>
    </section>
  )
}
