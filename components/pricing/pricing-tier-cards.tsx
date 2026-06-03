"use client"

import Link from "next/link"
import { ArrowUpRight, Check, Lock } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { PlanFeatureItem, PricingPlan } from "@/lib/pricing-matrix"

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

function TierCard({ plan }: { plan: PricingPlan }) {
  const isPopular = plan.popular === true

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
            {formatInr(plan.monthlyInr)}
          </span>
          <span className="text-base font-medium text-slate-500">/ month + GST</span>
        </div>
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

export function PricingTierCards({ plans }: { plans: PricingPlan[] }) {
  return (
    <div className="grid items-stretch gap-6 lg:grid-cols-3 lg:gap-5">
      {plans.map((plan) => (
        <TierCard key={plan.id} plan={plan} />
      ))}
    </div>
  )
}
