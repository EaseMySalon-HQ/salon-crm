"use client"

import { useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import type { StaffCompareResponse } from "@/lib/api"
import { formatINR, formatNumber } from "./branch-format"
import { getBranchColor } from "@/lib/branch-color"

type Metric = "revenue" | "services" | "utilization"

const METRICS: { key: Metric; label: string }[] = [
  { key: "revenue", label: "Revenue" },
  { key: "services", label: "Services" },
  { key: "utilization", label: "Utilization" },
]

export function StaffCompareChart({
  data,
  isLoading,
  metric,
  onMetricChange,
}: {
  data?: StaffCompareResponse
  isLoading: boolean
  metric: Metric
  onMetricChange: (m: Metric) => void
}) {
  if (isLoading) {
    return <Skeleton className="h-72 w-full rounded-xl" />
  }

  const chartData =
    data?.labels.map((label, i) => ({
      name: label,
      value: data.series[0]?.data[i] ?? 0,
      branchId: data.branches[i]?.branchId ?? "",
    })) ?? []

  const formatValue = (v: number) => {
    if (metric === "revenue") return formatINR(v)
    if (metric === "utilization") return `${v}%`
    return formatNumber(v)
  }

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Branch comparison</h3>
        <div className="flex gap-1">
          {METRICS.map((m) => (
            <Button
              key={m.key}
              type="button"
              size="sm"
              variant={metric === m.key ? "default" : "outline"}
              onClick={() => onMetricChange(m.key)}
            >
              {m.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              tickFormatter={(v) => (metric === "revenue" ? `₹${Math.round(v / 1000)}k` : String(v))}
            />
            <Tooltip formatter={(v: number) => formatValue(v)} />
            <Bar
              dataKey="value"
              radius={[4, 4, 0, 0]}
              fill="#6366f1"
              shape={(props: any) => {
                const { x, y, width, height, payload } = props
                const color = getBranchColor(payload.branchId)
                return <rect x={x} y={y} width={width} height={height} fill={color} rx={4} />
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
