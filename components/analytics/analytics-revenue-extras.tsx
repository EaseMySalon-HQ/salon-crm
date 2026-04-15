"use client"

import { AnalyticsDonutChart, type AnalyticsDonutSlice } from "@/components/analytics/analytics-donut-chart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useCurrency } from "@/hooks/use-currency"
import type { AnalyticsRevenueTabData } from "@/lib/types/analytics"
import { PieChart as PieChartIcon } from "lucide-react"

type Props = {
  data: AnalyticsRevenueTabData | undefined
  isPending: boolean
}

const BREAKDOWN_ROWS: {
  key: keyof Pick<
    AnalyticsRevenueTabData["revenue"]["breakdown"],
    "service" | "product" | "membership" | "package" | "other"
  >
  label: string
  fill: string
}[] = [
  { key: "service", label: "Services", fill: "#8b5cf6" },
  { key: "product", label: "Products", fill: "#0ea5e9" },
  { key: "membership", label: "Membership", fill: "#d946ef" },
  { key: "package", label: "Packages", fill: "#f59e0b" },
  { key: "other", label: "Other", fill: "#94a3b8" },
]

export function AnalyticsRevenueExtras({ data, isPending }: Props) {
  const { formatAmount } = useCurrency()

  if (isPending && !data) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="h-20 bg-muted/40 rounded-t-lg" />
        <CardContent className="h-64 bg-muted/20" />
      </Card>
    )
  }

  if (!data) return null

  const { revenue } = data
  const rb = revenue.breakdown ?? {
    service: 0,
    product: 0,
    membership: 0,
    package: 0,
    other: 0,
    lineItemsTotal: 0,
  }
  const lineTotal =
    rb.lineItemsTotal ||
    rb.service + rb.product + rb.membership + rb.package + rb.other ||
    1

  const rows = BREAKDOWN_ROWS.map((row) => ({
    ...row,
    v: rb[row.key],
  }))

  const pieData: AnalyticsDonutSlice[] = rows
    .filter((r) => r.v > 0)
    .map((r) => ({
      name: r.label,
      value: Math.round(r.v * 100) / 100,
      fill: r.fill,
    }))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <PieChartIcon className="h-4 w-4 text-violet-600" />
            Revenue breakdown (line items)
          </CardTitle>
          <CardDescription>Services vs products and other bill lines</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 md:gap-8">
            <AnalyticsDonutChart
              data={pieData}
              emptyMessage="No line-item revenue in this period."
              formatTooltip={formatAmount}
            />

            <div className="space-y-3 text-sm min-w-0">
              {rows.map((row) => {
                const pct = lineTotal > 0 ? Math.round((row.v / lineTotal) * 1000) / 10 : 0
                return (
                  <div key={row.key}>
                    <div className="flex justify-between gap-2 mb-1">
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: row.fill }}
                          aria-hidden
                        />
                        <span className="truncate">{row.label}</span>
                      </span>
                      <span className="font-medium tabular-nums shrink-0">
                        {formatAmount(row.v)} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-[width]"
                        style={{
                          width: `${Math.min(100, pct)}%`,
                          backgroundColor: row.fill,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
