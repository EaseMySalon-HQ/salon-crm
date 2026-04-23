"use client"

import { Fragment, useCallback, useMemo, useState } from "react"
import { Check, ChevronDown } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { FeatureCategory, FeatureCell } from "@/lib/pricing-matrix"

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
        <Badge variant="secondary" className="font-normal text-xs whitespace-nowrap">
          Add-on
        </Badge>
      </div>
    )
  }
  return (
    <div className="flex justify-center">
      <Badge className="bg-purple-100 text-[#5B21B6] hover:bg-purple-100 font-normal text-xs whitespace-nowrap">
        Free
      </Badge>
    </div>
  )
}

export function PricingFeatureMatrix({ categories }: { categories: FeatureCategory[] }) {
  const initialExpanded = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.title, false])) as Record<string, boolean>,
    [categories]
  )
  const [expanded, setExpanded] = useState<Record<string, boolean>>(initialExpanded)

  const toggleCategory = useCallback((title: string) => {
    setExpanded((prev) => ({ ...prev, [title]: !prev[title] }))
  }, [])

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-slate-50/95 backdrop-blur-sm px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 min-w-[200px] max-w-[280px] sm:max-w-none"
              >
                Feature
              </th>
              <th
                scope="col"
                className="px-3 py-4 text-center text-xs font-semibold uppercase tracking-wide text-slate-600 w-[88px] sm:w-[100px]"
              >
                Starter
              </th>
              <th
                scope="col"
                className="px-3 py-4 text-center text-xs font-semibold uppercase tracking-wide text-[#6D28D9] w-[88px] sm:w-[100px]"
              >
                Growth
              </th>
              <th
                scope="col"
                className="px-3 py-4 text-center text-xs font-semibold uppercase tracking-wide text-slate-600 w-[88px] sm:w-[100px]"
              >
                Pro
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat, catIndex) => {
              const isOpen = expanded[cat.title] === true
              const panelId = `feature-category-panel-${catIndex}`
              return (
                <Fragment key={cat.title}>
                  <tr className="bg-purple-50/60">
                    <td
                      colSpan={4}
                      className="sticky left-0 z-10 border-y border-purple-100 bg-purple-50/95 p-0 backdrop-blur-sm"
                    >
                      <button
                        type="button"
                        onClick={() => toggleCategory(cat.title)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left font-semibold text-slate-900 transition-colors hover:bg-purple-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7C3AED]/40"
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                      >
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 text-[#6D28D9] transition-transform duration-200",
                            !isOpen && "-rotate-90"
                          )}
                          aria-hidden
                        />
                        <span>{cat.title}</span>
                        <span className="ml-auto text-xs font-normal text-slate-500 tabular-nums">
                          {cat.rows.length} {cat.rows.length === 1 ? "row" : "rows"}
                        </span>
                      </button>
                    </td>
                  </tr>
                  {isOpen &&
                    cat.rows.map((row, rowIndex) => (
                      <tr
                        key={row.feature}
                        id={rowIndex === 0 ? panelId : undefined}
                        className="border-b border-slate-100 hover:bg-slate-50/50"
                      >
                        <th
                          scope="row"
                          className="sticky left-0 z-10 max-w-[280px] border-r border-slate-100 bg-white/95 px-4 py-3 text-left font-normal text-slate-700 backdrop-blur-sm"
                        >
                          {row.feature}
                        </th>
                        <td className="px-2 py-3 align-middle">
                          <Cell value={row.starter} />
                        </td>
                        <td className="px-2 py-3 align-middle bg-purple-50/30">
                          <Cell value={row.growth} />
                        </td>
                        <td className="px-2 py-3 align-middle">
                          <Cell value={row.professional} />
                        </td>
                      </tr>
                    ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
