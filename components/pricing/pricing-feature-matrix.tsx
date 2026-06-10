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
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Check className="h-4 w-4 stroke-[2.5]" aria-hidden />
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
        <Badge variant="secondary" className="whitespace-nowrap text-xs font-normal">
          Add-on
        </Badge>
      </div>
    )
  }
  if (value === "soon") {
    return (
      <div className="flex justify-center">
        <span className="text-xs font-semibold text-amber-600">Soon</span>
      </div>
    )
  }
  return (
    <div className="flex justify-center px-1">
      <span className="text-center text-xs font-medium leading-snug text-slate-600 sm:text-sm">{value}</span>
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
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-[200px] max-w-[280px] bg-slate-50/95 px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm sm:max-w-none"
              >
                Feature
              </th>
              {plans.map((plan) => (
                <th
                  key={plan.id}
                  scope="col"
                  className={cn(
                    "w-[88px] px-3 py-4 text-center text-xs font-semibold uppercase tracking-wide sm:w-[100px]",
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
                    className="sticky left-0 z-10 border-y border-purple-100 bg-purple-50/95 px-4 py-3 backdrop-blur-sm"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-900 sm:text-sm">
                      {cat.title}
                    </span>
                  </td>
                </tr>
                {cat.rows.map((row) => (
                  <tr key={row.feature} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 max-w-[280px] border-r border-slate-100 bg-white/95 px-4 py-3 text-left font-normal backdrop-blur-sm"
                    >
                      <div className="text-slate-700">{row.feature}</div>
                      {row.hint ? (
                        <div className="mt-0.5 text-xs leading-snug text-slate-500">{row.hint}</div>
                      ) : null}
                    </th>
                    {TIER_KEYS.map((tier) => {
                      const plan = plans.find((p) => p.id === tier)
                      return (
                        <td
                          key={tier}
                          className={cn("px-2 py-3 align-middle", plan?.popular && "bg-blue-50/40")}
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
    </div>
  )
}
