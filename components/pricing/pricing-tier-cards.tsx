"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Check, Lock } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { PlanFeatureItem, PricingPlan } from "@/lib/pricing-matrix"

type BillingCycle = "monthly" | "annual"

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n)
}

function FeatureRow({ item }: { item: PlanFeatureItem }) {
  if (item.state === "included") {
    return (
      <li className="flex gap-3 text-sm leading-snug text-slate-700">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 stroke-[2.5]" aria-hidden />
        <span>{item.label}</span>
      </li>
    )
  }
  if (item.state === "addon") {
    return (
      <li className="flex gap-3 text-sm leading-snug text-slate-500">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <span className="flex flex-wrap items-center gap-2">
          {item.label}
          <Badge className="border-0 bg-amber-100 px-2 py-0 text-[10px] font-semibold uppercase tracking-wide text-amber-700 hover:bg-amber-100">
            Add-on
          </Badge>
        </span>
      </li>
    )
  }
  return (
    <li className="flex gap-3 text-sm leading-snug text-slate-400">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden />
      <span>{item.label}</span>
    </li>
  )
}

function TierCard({ plan, billingCycle }: { plan: PricingPlan; billingCycle: BillingCycle }) {
  const isPopular = plan.popular === true
  const isAnnual = billingCycle === "annual"
  const displayPrice = isAnnual ? Math.round(plan.annualInr / 12) : plan.monthlyInr
  const savings = plan.annualSavingsInr

  return (
    <article
      className={cn(
        "relative flex h-full flex-col rounded-2xl border bg-white shadow-sm",
        isPopular ? "border-2 border-blue-500 shadow-md" : "border-slate-200"
      )}
    >
      {isPopular ? (
        <div className="absolute -top-3.5 left-1/2 z-10 -translate-x-1/2">
          <span className="inline-flex rounded-full bg-blue-600 px-4 py-1 text-xs font-semibold text-white shadow-sm">
            Most popular
          </span>
        </div>
      ) : null}

      <div className="flex flex-col px-6 pb-6 pt-10 sm:px-7">
        <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-900">
          {plan.id === "starter" ? "STARTER" : plan.id === "pro" ? "PRO" : plan.name.toUpperCase()}
        </h3>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
          <span className="text-4xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-[2.5rem]">
            {formatInr(displayPrice)}
          </span>
          <span className="text-base font-medium text-slate-500">/ month + GST</span>
        </div>
        {isAnnual ? (
          <p className="mt-1 text-xs font-medium text-emerald-700">
            {formatInr(plan.annualInr)} billed annually · save {formatInr(savings)}
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">Billed monthly</p>
        )}
        <p className="mt-4 min-h-[4.5rem] text-sm leading-relaxed text-slate-600">{plan.description}</p>

        <Link
          href="/contact"
          className={cn(
            "mt-6 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors",
            plan.ctaStyle === "primary-blue"
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "border border-stone-200 bg-[#F5F0E8] text-slate-900 hover:bg-[#EDE8DF]"
          )}
        >
          {plan.ctaLabel}
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      <div className="mx-6 border-t border-slate-100 sm:mx-7" />

      <div className="flex flex-1 flex-col gap-6 px-6 py-6 sm:px-7 sm:py-7">
        {plan.featureSections.map((section) => (
          <div key={section.title}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              {section.title}
            </p>
            <ul className="mt-3 space-y-2.5">
              {section.items.map((item) => (
                <FeatureRow key={item.label} item={item} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </article>
  )
}

function BillingCycleToggle({
  value,
  onChange,
}: {
  value: BillingCycle
  onChange: (next: BillingCycle) => void
}) {
  return (
    <div className="flex justify-center">
      <div
        role="tablist"
        aria-label="Billing cycle"
        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 shadow-sm"
      >
        <button
          type="button"
          role="tab"
          aria-selected={value === "monthly"}
          onClick={() => onChange("monthly")}
          className={cn(
            "rounded-full px-5 py-2 text-sm font-semibold transition-colors",
            value === "monthly"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          Monthly
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value === "annual"}
          onClick={() => onChange("annual")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors",
            value === "annual"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          Annually
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
            Save 17%
          </span>
        </button>
      </div>
    </div>
  )
}

export function PricingTierCards({ plans }: { plans: PricingPlan[] }) {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly")

  return (
    <div className="space-y-8">
      <BillingCycleToggle value={billingCycle} onChange={setBillingCycle} />
      <div className="grid items-stretch gap-6 lg:grid-cols-3 lg:gap-5">
        {plans.map((plan) => (
          <TierCard key={plan.id} plan={plan} billingCycle={billingCycle} />
        ))}
      </div>
    </div>
  )
}
