"use client"

import { Fragment } from "react"
import { Check } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { FeatureCategory, FeatureCell, PlanTier, PricingPlan } from "@/lib/pricing-matrix"

function Cell({ value }: { value: FeatureCell }) {
  if (value === "yes") {
    return (
      <div className="flex justify-center">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 sm:h-8 sm:w-8">
          <Check className="h-3.5 w-3.5 stroke-[2.5] sm:h-4 sm:w-4" aria-hidden />
        </span>
      </div>
    )
  }
  if (value === "no") {
    return (
      <div className="flex justify-center text-slate-300" aria-label="Not included">
        <span className="text-lg font-light">—</span>
      </div>
    )
  }
  if (value === "addon") {
    return (
      <div className="flex justify-center">
        <Badge variant="secondary" className="whitespace-nowrap px-1.5 py-0 text-[10px] font-normal sm:px-2.5 sm:py-0.5 sm:text-xs">
          Add-on
        </Badge>
      </div>
    )
  }
  if (value === "soon") {
    return (
      <div className="flex justify-center">
        <span className="text-[10px] font-semibold text-amber-600 sm:text-xs">Soon</span>
      </div>
    )
  }
  return (
    <div className="flex justify-center px-1">
      <span className="text-center text-[11px] font-medium leading-snug text-slate-600 sm:text-sm">{value}</span>
    </div>
  )
}

const TIER_KEYS: PlanTier[] = ["starter", "growth", "pro"]

function rowCell(row: FeatureCategory["rows"][number], tier: PlanTier): FeatureCell {
  if (tier === "starter") {
    const legacy = row as FeatureCategory["rows"][number] & { free?: FeatureCell }
    return row.starter ?? legacy.free ?? "no"
  }
  return row[tier] ?? "no"
}

export function PricingFeatureMatrix({
  categories,
  plans,
}: {
  categories: FeatureCategory[]
  plans: Pick<PricingPlan, "id" | "name" | "popular">[]
}) {
  return (
    <div className="overflow-clip rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-sm table-fixed">
        <colgroup>
          <col className="w-[44%] sm:w-auto" />
          <col className="w-[18.66%] sm:w-[100px]" />
          <col className="w-[18.66%] sm:w-[100px]" />
          <col className="w-[18.66%] sm:w-[100px]" />
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th
              scope="col"
              className="sticky left-0 top-16 z-30 bg-slate-50 px-2.5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 shadow-[inset_0_-1px_0_0_rgb(226_232_240)] sm:px-4 sm:py-4 sm:text-xs"
            >
              Feature
            </th>
            {plans.map((plan) => (
              <th
                key={plan.id}
                scope="col"
                className={cn(
                  "sticky top-16 z-20 bg-slate-50 px-1.5 py-3 text-center text-[10px] font-semibold uppercase tracking-wide shadow-[inset_0_-1px_0_0_rgb(226_232_240)] sm:px-3 sm:py-4 sm:text-xs",
                  plan.popular ? "text-blue-600" : "text-slate-600"
                )}
              >
                {plan.id === "starter" ? "Starter" : plan.id === "pro" ? "Pro" : plan.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <Fragment key={cat.title}>
              <tr className="bg-purple-50/60">
                <td
                  colSpan={4}
                  className="sticky left-0 z-10 border-y border-purple-100 bg-purple-50/95 px-2.5 py-2.5 backdrop-blur-sm sm:px-4 sm:py-3"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-900 sm:text-sm">
                    {cat.title}
                  </span>
                </td>
              </tr>
              {cat.rows.map((row) => (
                <tr key={row.feature} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-r border-slate-100 bg-white/95 px-2.5 py-2.5 text-left font-normal backdrop-blur-sm sm:px-4 sm:py-3"
                  >
                    <div className="text-[12px] leading-snug text-slate-700 sm:text-sm">{row.feature}</div>
                    {row.hint ? (
                      <div className="mt-0.5 text-[10px] leading-snug text-slate-500 sm:text-xs">{row.hint}</div>
                    ) : null}
                  </th>
                  {TIER_KEYS.map((tier) => {
                    const plan = plans.find((p) => p.id === tier)
                    return (
                      <td
                        key={tier}
                        className={cn("px-1 py-2.5 align-middle sm:px-2 sm:py-3", plan?.popular && "bg-blue-50/40")}
                      >
                        <Cell value={rowCell(row, tier)} />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
