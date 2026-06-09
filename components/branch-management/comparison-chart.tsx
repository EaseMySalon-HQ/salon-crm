"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { BranchTimeSeriesResponse } from "@/lib/api"
import { MultiLineChart } from "./multi-line-chart"

type Metric = "revenue" | "appointments"

const METRICS: { value: Metric; label: string }[] = [
  { value: "revenue", label: "Revenue" },
  { value: "appointments", label: "Appointments" },
]

function filterSeries(
  data: BranchTimeSeriesResponse | undefined,
  branchFilter: string
): BranchTimeSeriesResponse | undefined {
  if (!data || branchFilter === "all") return data
  return { ...data, series: data.series.filter((s) => s.branchId === branchFilter) }
}

/**
 * Single cross-branch comparison chart with a Revenue | Appointments toggle. Both
 * datasets are fetched upfront with the shared date range, so toggling the metric
 * is instant and `branchFilter` narrows the lines to one branch when set.
 */
export function ComparisonChart({
  revenue,
  appointments,
  isLoading,
  branchFilter,
  rangeLabel,
  tall = false,
}: {
  revenue?: BranchTimeSeriesResponse
  appointments?: BranchTimeSeriesResponse
  isLoading: boolean
  branchFilter: string
  rangeLabel: string
  tall?: boolean
}) {
  const [metric, setMetric] = useState<Metric>("revenue")

  const data = useMemo(
    () => filterSeries(metric === "revenue" ? revenue : appointments, branchFilter),
    [metric, revenue, appointments, branchFilter]
  )

  return (
    <Card className="h-full border-slate-200/80 shadow-sm">
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base font-semibold text-slate-800">
            {metric === "revenue" ? "Revenue comparison" : "Appointments comparison"}
          </CardTitle>
          <p className="text-xs text-slate-400">{rangeLabel}</p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {METRICS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMetric(m.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                metric === m.value
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <MultiLineChart
          data={data}
          isLoading={isLoading}
          format={metric === "revenue" ? "currency" : "number"}
          heightClass={tall ? "h-[360px] xl:h-[480px]" : "h-[320px]"}
        />
      </CardContent>
    </Card>
  )
}
