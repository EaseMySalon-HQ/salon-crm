"use client"

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import type { BranchTimeSeriesResponse } from "@/lib/api"
import { getBranchColor } from "@/lib/branch-color"
import { formatINR, formatNumber } from "./branch-format"

/**
 * Presentational multi-branch line chart body. The period/metric controls live
 * with the caller (the dashboard owns the shared date range), so this component
 * only pivots `{ labels, series }` into recharts rows and draws one line per branch.
 */
export function MultiLineChart({
  data,
  isLoading,
  format,
  emptyLabel = "No data in this period.",
  heightClass = "h-[320px]",
}: {
  data?: BranchTimeSeriesResponse
  isLoading: boolean
  format: "currency" | "number"
  emptyLabel?: string
  heightClass?: string
}) {
  const labels = data?.labels ?? []
  const series = data?.series ?? []

  const chartData = labels.map((label, idx) => {
    const row: Record<string, string | number> = { name: label }
    for (const s of series) row[s.branchId] = s.data[idx] ?? 0
    return row
  })

  const fmt = (v: number) => (format === "currency" ? formatINR(v) : formatNumber(v))
  const empty =
    !isLoading && (series.length === 0 || chartData.every((row) => series.every((s) => !row[s.branchId])))

  if (isLoading) return <Skeleton className={`${heightClass} w-full`} />

  if (empty) {
    return (
      <div className={`flex ${heightClass} items-center justify-center rounded-lg border border-dashed bg-slate-50/50 text-sm text-slate-500`}>
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => (format === "currency" ? `₹${v}` : String(v))}
            width={format === "currency" ? 56 : 36}
          />
          <Tooltip formatter={(v: number) => fmt(v)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Line
              key={s.branchId}
              type="monotone"
              dataKey={s.branchId}
              name={s.branchName}
              stroke={getBranchColor(s.branchId)}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
