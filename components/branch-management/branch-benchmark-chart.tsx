"use client"

import { useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import type { BranchSummaryRow } from "@/lib/api"
import { formatINR, formatNumber } from "./branch-format"
import { getBranchColor } from "@/lib/branch-color"

type Metric = "revenue" | "appointments" | "utilization"

const METRICS: { key: Metric; label: string }[] = [
  { key: "revenue", label: "Revenue" },
  { key: "appointments", label: "Appointments" },
  { key: "utilization", label: "Utilization" },
]

function metricValue(branch: BranchSummaryRow, metric: Metric): number {
  if (metric === "revenue") return branch.revenue
  if (metric === "utilization") return branch.capacityUtilizationPct ?? 0
  return branch.appointments
}

export function BranchBenchmarkChart({
  branches,
  isLoading,
  rangeLabel,
  className,
}: {
  branches: BranchSummaryRow[]
  isLoading: boolean
  rangeLabel?: string
  className?: string
}) {
  const [metric, setMetric] = useState<Metric>("revenue")

  const chartData = useMemo(() => {
    const healthy = branches.filter((b) => !b.error)
    return [...healthy]
      .map((b) => ({
        name: b.branchName,
        value: metricValue(b, metric),
        branchId: b.branchId,
      }))
      .sort((a, b) => b.value - a.value)
  }, [branches, metric])

  const formatValue = (v: number) => {
    if (metric === "revenue") return formatINR(v)
    if (metric === "utilization") return `${v}%`
    return formatNumber(v)
  }

  if (isLoading) {
    return <Skeleton className={`min-h-[360px] w-full rounded-xl ${className ?? ""}`} />
  }

  if (chartData.length === 0) {
    return (
      <div
        className={`rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-500 ${className ?? ""}`}
      >
        No branch data for this range yet.
      </div>
    )
  }

  const top = chartData[0]
  const bottom = chartData[chartData.length - 1]

  return (
    <div
      className={`flex h-full flex-col rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm ${className ?? ""}`}
    >
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Branch benchmark</h3>
          <p className="text-xs text-slate-400">
            Compare all branches at once{rangeLabel ? ` · ${rangeLabel}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {METRICS.map((m) => (
            <Button
              key={m.key}
              type="button"
              size="sm"
              variant={metric === m.key ? "default" : "outline"}
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </Button>
          ))}
        </div>
      </div>

      {chartData.length >= 2 && (
        <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-500">
          <span>
            Top:{" "}
            <span className="font-medium text-slate-700">{top.name}</span> ({formatValue(top.value)})
          </span>
          <span>
            Bottom:{" "}
            <span className="font-medium text-slate-700">{bottom.name}</span> (
            {formatValue(bottom.value)})
          </span>
        </div>
      )}

      <div className="min-h-[280px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
            <XAxis
              type="number"
              tick={{ fontSize: 11 }}
              tickLine={false}
              tickFormatter={(v) =>
                metric === "revenue" ? `₹${Math.round(v / 1000)}k` : String(v)
              }
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fontSize: 11 }}
              tickLine={false}
            />
            <Tooltip formatter={(v: number) => formatValue(v)} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {chartData.map((entry) => (
                <Cell key={entry.branchId} fill={getBranchColor(entry.branchId)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
