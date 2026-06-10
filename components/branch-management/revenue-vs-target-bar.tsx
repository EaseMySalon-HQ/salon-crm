"use client"

import { Skeleton } from "@/components/ui/skeleton"
import type { BranchSummaryRow } from "@/lib/api"
import { formatINR } from "./branch-format"
import { getBranchColor } from "@/lib/branch-color"

export function RevenueVsTargetBar({
  branches,
  isLoading,
}: {
  branches: BranchSummaryRow[]
  isLoading: boolean
}) {
  const withTarget = branches.filter((b) => !b.error && (b.revenueTarget ?? 0) > 0)

  if (isLoading) {
    return <Skeleton className="h-32 w-full rounded-xl" />
  }

  if (withTarget.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500">
        Set a monthly revenue target in branch settings to track progress here.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">Revenue vs target</h3>
      <p className="mb-4 text-xs text-slate-400">Prorated for the selected date range</p>
      <div className="space-y-3">
        {withTarget.map((b) => {
          const pct = b.revenueVsTargetPct ?? 0
          const capped = Math.min(100, pct)
          return (
            <div key={b.branchId}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: getBranchColor(b.branchId) }}
                  />
                  {b.branchName}
                </span>
                <span className="tabular-nums text-slate-500">
                  {formatINR(b.revenue)} / {formatINR(b.revenueTarget ?? 0)} ({pct}%)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                  style={{ width: `${capped}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
