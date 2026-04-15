"use client"

import { AnalyticsDelta } from "@/components/analytics/analytics-delta"
import { AnalyticsMetricLineChart } from "@/components/analytics/analytics-metric-line-chart"
import { ServicePopularity } from "@/components/reports/service-popularity"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useCurrency } from "@/hooks/use-currency"
import type { AnalyticsServicesTabData } from "@/lib/types/analytics"
import { AlertCircle, Scissors } from "lucide-react"

type Props = {
  data: AnalyticsServicesTabData | undefined
  isPending: boolean
  isError: boolean
  onRetry: () => void
}

export function AnalyticsServicesTabPanel({ data, isPending, isError, onRetry }: Props) {
  const { formatAmount } = useCurrency()

  if (isPending && !data) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-6 h-24 bg-muted/40 animate-pulse rounded-lg" />
            </Card>
          ))}
        </div>
        <div className="h-[280px] bg-muted/40 rounded animate-pulse" />
        <div className="h-64 bg-muted/40 rounded animate-pulse" />
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
        <Button type="button" variant="outline" size="sm" className="shrink-0 border-amber-300" onClick={onRetry}>
          Retry
        </Button>
      </div>
    )
  }

  if (!data) return null

  const { services, comparison } = data
  const trendPoints = services.serviceTrends.map((p) => ({
    name: p.name,
    value: p.serviceRevenue,
  }))

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Scissors className="h-4 w-4" />
              Services in catalog
            </CardTitle>
            <CardDescription>Active service rows for this branch</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{services.totalServicesCatalog}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Service line revenue</CardTitle>
            <CardDescription>From POS service line items</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">{formatAmount(services.totalServiceLineRevenue)}</div>
            <div className="mt-2">
              <AnalyticsDelta pct={comparison?.serviceRevenuePct} />
            </div>
          </CardContent>
        </Card>
      </div>

      <AnalyticsMetricLineChart
        title="Service revenue trend"
        label="Service revenue"
        color="#8b5cf6"
        series={trendPoints}
      />

      <Card>
        <CardHeader>
          <CardTitle>Service revenue breakdown</CardTitle>
          <CardDescription>
            Chart shows top eight by revenue (plus Other). The list can show top ten or every service in range—POS line
            revenue and appointment counts where matched.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ServicePopularity
            topServices={services.topServices}
            allServicesBreakdown={services.allServicesBreakdown}
            totalServiceLineRevenue={services.totalServiceLineRevenue}
          />
        </CardContent>
      </Card>
    </div>
  )
}
