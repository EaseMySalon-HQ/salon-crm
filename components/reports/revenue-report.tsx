"use client"

import { useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCurrency } from "@/hooks/use-currency"
import { AlertCircle } from "lucide-react"
import type { AnalyticsRevenuePoint } from "@/lib/types/analytics"

type ChartMetric = "revenue" | "expenses" | "net" | "all"

type RevenuePointKey = keyof Pick<AnalyticsRevenuePoint, "revenue" | "expenses" | "profit">

const METRIC: Record<
  Exclude<ChartMetric, "all">,
  { dataKey: RevenuePointKey; label: string; color: string }
> = {
  revenue: { dataKey: "revenue", label: "Revenue", color: "#8b5cf6" },
  expenses: { dataKey: "expenses", label: "Expenses", color: "#94a3b8" },
  net: { dataKey: "profit", label: "Net", color: "#10b981" },
}

const ALL_SERIES: { dataKey: RevenuePointKey; label: string; color: string }[] = [
  { dataKey: "revenue", label: "Revenue", color: "#8b5cf6" },
  { dataKey: "expenses", label: "Expenses", color: "#94a3b8" },
  { dataKey: "profit", label: "Net", color: "#10b981" },
]

type RevenueReportProps = {
  isPending?: boolean
  isError?: boolean
  onRetry?: () => void
  series: AnalyticsRevenuePoint[]
  totals: { totalRevenue: number; totalExpenses: number; totalProfit: number }
  bucketLabel: string
}

export function RevenueReport({
  isPending,
  isError,
  onRetry,
  series,
  totals,
  bucketLabel,
}: RevenueReportProps) {
  const { formatAmount } = useCurrency()
  const [chartType, setChartType] = useState<"bar" | "line">("bar")
  const [metric, setMetric] = useState<ChartMetric>("all")

  const chartData = series.map((p) => ({
    name: p.name,
    revenue: p.revenue,
    expenses: p.expenses,
    profit: p.profit,
  }))

  const m = metric === "all" ? null : METRIC[metric]
  const metricCaption =
    metric === "all" ? "Revenue, expenses & net" : m!.label
  const isEmpty =
    !isPending && !isError && totals.totalRevenue === 0 && totals.totalExpenses === 0

  if (isPending) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap justify-between gap-4">
          <div className="h-9 w-56 bg-muted rounded animate-pulse" />
          <div className="h-10 w-[180px] bg-muted rounded animate-pulse" />
          <div className="h-10 w-[180px] bg-muted rounded animate-pulse" />
        </div>
        <div className="h-[380px] bg-muted/40 rounded-lg animate-pulse" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex gap-2 text-amber-900 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>Could not load revenue data. Check your connection, then try again.</span>
        </div>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" className="shrink-0 border-amber-300" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{bucketLabel}</span> · {metricCaption}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={metric} onValueChange={(v) => setMetric(v as ChartMetric)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="revenue">Revenue</SelectItem>
              <SelectItem value="expenses">Expenses</SelectItem>
              <SelectItem value="net">Net</SelectItem>
            </SelectContent>
          </Select>
          <Select value={chartType} onValueChange={(v) => setChartType(v as "bar" | "line")}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Chart type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bar">Bar chart</SelectItem>
              <SelectItem value="line">Line chart</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="h-[380px] rounded-lg border bg-card/50 p-2 sm:p-4">
        {isEmpty ? (
          <div className="flex h-full min-h-[260px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
            No sales or expenses in this period. Try a wider date range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "bar" ? (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={chartData.length > 8 ? -35 : 0}
                  textAnchor={chartData.length > 8 ? "end" : "middle"}
                  height={chartData.length > 8 ? 70 : 40}
                />
                <YAxis />
                <Tooltip formatter={(value) => formatAmount(Number(value))} />
                {metric === "all"
                  ? ALL_SERIES.map((s) => (
                      <Bar
                        key={s.dataKey}
                        dataKey={s.dataKey}
                        name={s.label}
                        fill={s.color}
                        radius={[4, 4, 0, 0]}
                      />
                    ))
                  : (
                      <Bar dataKey={m!.dataKey} name={m!.label} fill={m!.color} radius={[4, 4, 0, 0]} />
                    )}
                {metric === "all" ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
              </BarChart>
            ) : (
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={chartData.length > 8 ? -35 : 0}
                  textAnchor={chartData.length > 8 ? "end" : "middle"}
                  height={chartData.length > 8 ? 70 : 40}
                />
                <YAxis />
                <Tooltip formatter={(value) => formatAmount(Number(value))} />
                {metric === "all"
                  ? ALL_SERIES.map((s) => (
                      <Line
                        key={s.dataKey}
                        type="monotone"
                        dataKey={s.dataKey}
                        name={s.label}
                        stroke={s.color}
                        strokeWidth={2}
                        dot={chartData.length <= 24}
                        activeDot={{ r: 4 }}
                      />
                    ))
                  : (
                      <Line
                        type="monotone"
                        dataKey={m!.dataKey}
                        name={m!.label}
                        stroke={m!.color}
                        strokeWidth={2}
                        dot={chartData.length <= 24}
                        activeDot={{ r: 4 }}
                      />
                    )}
                {metric === "all" ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
              </ComposedChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
