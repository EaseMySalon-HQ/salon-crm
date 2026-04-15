"use client"

import { AnalyticsDelta } from "@/components/analytics/analytics-delta"
import { AnalyticsMetricLineChart } from "@/components/analytics/analytics-metric-line-chart"
import { ProductPopularity } from "@/components/reports/product-popularity"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useCurrency } from "@/hooks/use-currency"
import type { AnalyticsProductsTabData } from "@/lib/types/analytics"
import { AlertCircle, Package } from "lucide-react"

type Props = {
  data: AnalyticsProductsTabData | undefined
  isPending: boolean
  isError: boolean
  onRetry: () => void
}

export function AnalyticsProductsTabPanel({ data, isPending, isError, onRetry }: Props) {
  const { formatAmount } = useCurrency()

  if (isPending && !data) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6 h-24 bg-muted/40 animate-pulse rounded-lg" />
            </Card>
          ))}
        </div>
        <div className="h-[320px] bg-muted/40 rounded animate-pulse" />
        <div className="h-40 bg-muted/40 rounded animate-pulse" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex gap-2 text-amber-900 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>Could not load product analytics.</span>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0 border-amber-300" onClick={onRetry}>
          Retry
        </Button>
      </div>
    )
  }

  if (!data) return null

  const { products, comparison } = data
  const trendPoints = products.productTrends.map((p) => ({
    name: p.name,
    value: p.productRevenue,
  }))

  const distinctProductLines = (products.allProductsBreakdown ?? products.topProducts).length

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="text-muted-foreground text-sm">Product sales</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{formatAmount(products.totalProductRevenue)}</div>
            <div className="mt-2">
              <AnalyticsDelta pct={comparison?.productRevenuePct} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-muted-foreground text-sm">Units sold</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{products.totalUnitsSold}</div>
            <div className="mt-2">
              <AnalyticsDelta pct={comparison?.unitsSoldPct} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-muted-foreground text-sm">Product lines</div>
            <div className="text-2xl font-bold mt-1">{distinctProductLines}</div>
            <p className="text-xs text-muted-foreground mt-1">Distinct SKUs in range</p>
          </CardContent>
        </Card>
      </div>

      <AnalyticsMetricLineChart
        title="Product revenue trend"
        label="Product revenue"
        color="#0ea5e9"
        series={trendPoints}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4 text-sky-600" />
            Product revenue breakdown
          </CardTitle>
          <CardDescription>
            Chart shows top eight by revenue (plus Other). Use Top 10 / All products to switch the list—revenue and
            units from POS product lines.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProductPopularity
            topProducts={products.topProducts}
            allProductsBreakdown={products.allProductsBreakdown}
            totalProductRevenue={products.totalProductRevenue}
            isPending={isPending}
            isError={isError}
            onRetry={onRetry}
          />
        </CardContent>
      </Card>
    </div>
  )
}
