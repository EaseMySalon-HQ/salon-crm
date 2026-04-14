"use client"

import {
  AnalyticsDonutChart,
  ANALYTICS_PIE_COLORS,
  type AnalyticsDonutSlice,
} from "@/components/analytics/analytics-donut-chart"

import { Card, CardContent } from "@/components/ui/card"
import { useCurrency } from "@/hooks/use-currency"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AnalyticsTopService } from "@/lib/types/analytics"

type ServicePopularityProps = {
  isPending?: boolean
  isError?: boolean
  onRetry?: () => void
  topServices: AnalyticsTopService[]
  totalServiceLineRevenue: number
}

export function ServicePopularity({
  isPending,
  isError,
  onRetry,
  topServices,
  totalServiceLineRevenue,
}: ServicePopularityProps) {
  const { formatAmount } = useCurrency()

  const pieData = topServices.slice(0, 8).map((s) => ({
    name: s.name,
    value: Math.round(s.revenue * 100) / 100,
    color: s.color,
  }))

  const sumPie = pieData.reduce((a, b) => a + b.value, 0)
  const other = Math.max(0, (totalServiceLineRevenue || 0) - sumPie)
  const chartRows =
    other > 0.01 && pieData.length > 0
      ? [...pieData, { name: "Other", value: Math.round(other * 100) / 100, color: ANALYTICS_PIE_COLORS[7] }]
      : pieData

  const donutData: AnalyticsDonutSlice[] = chartRows.map((r) => ({
    name: r.name,
    value: r.value,
    fill: r.color || ANALYTICS_PIE_COLORS[7],
  }))

  if (isPending) {
    return (
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          <div className="min-h-[260px] h-[260px] sm:h-[280px] bg-muted/40 rounded animate-pulse" />
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-muted/40 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex gap-2 text-amber-900 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>Could not load service analytics.</span>
        </div>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" className="shrink-0 border-amber-300" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    )
  }

  const empty = !totalServiceLineRevenue || chartRows.length === 0

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 md:gap-8">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground mb-3">Revenue by service (bill line items)</p>
          <AnalyticsDonutChart
            data={empty ? [] : donutData}
            emptyMessage="No service sales in this period."
            formatTooltip={formatAmount}
          />
        </div>

        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground mb-3">Top services</p>
          {empty ? (
            <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed bg-muted/30 px-4 text-center text-sm text-muted-foreground">
              No data for this range.
            </div>
          ) : (
            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {topServices.slice(0, 12).map((service, index) => (
                <Card key={`${service.id}-${index}`}>
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-start gap-2">
                      <span
                        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: service.color }}
                        aria-hidden
                      />
                      <div>
                        <div className="font-medium truncate">{service.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatAmount(service.revenue)} · {service.percentOfServiceRevenue}% of service revenue
                          {service.bookings > 0 ? ` · ${service.bookings} bookings` : ""}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
