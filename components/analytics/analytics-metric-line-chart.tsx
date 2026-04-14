"use client"

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useCurrency } from "@/hooks/use-currency"

type Point = { name: string; value: number }

type Props = {
  title: string
  label: string
  color: string
  series: Point[]
  format?: "currency" | "number"
  emptyMessage?: string
  /** Tailwind height class for the chart area (default h-[320px]) */
  chartHeightClass?: string
}

export function AnalyticsMetricLineChart({
  title,
  label,
  color,
  series,
  format = "currency",
  emptyMessage = "No data in this period.",
  chartHeightClass = "h-[320px]",
}: Props) {
  const { formatAmount } = useCurrency()
  const chartData = series
  const empty = chartData.length === 0 || chartData.every((d) => d.value === 0)

  const fmt = (v: number) => (format === "currency" ? formatAmount(v) : String(Math.round(v)))

  if (empty) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-medium">{title}</h3>
      <div className={chartHeightClass}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              interval={0}
              angle={chartData.length > 12 ? -35 : 0}
              textAnchor={chartData.length > 12 ? "end" : "middle"}
              height={chartData.length > 12 ? 70 : 40}
            />
            <YAxis tickFormatter={(v) => (format === "currency" ? `₹${v}` : String(v))} />
            <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={(l) => String(l)} />
            <Line type="monotone" dataKey="value" name={label} stroke={color} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
