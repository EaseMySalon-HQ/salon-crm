"use client"

import { useMemo } from "react"

import { AnalyticsDelta } from "@/components/analytics/analytics-delta"
import {
  AnalyticsDonutChart,
  ANALYTICS_PIE_COLORS,
  type AnalyticsDonutSlice,
} from "@/components/analytics/analytics-donut-chart"
import { AnalyticsMetricLineChart } from "@/components/analytics/analytics-metric-line-chart"
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

  const productDonutData: AnalyticsDonutSlice[] = useMemo(() => {
    const products = data?.products
    if (!products) return []
    const slice = products.topProducts.slice(0, 8)
    const sum = slice.reduce((a, p) => a + p.revenue, 0)
    const other = Math.max(0, (products.totalProductRevenue || 0) - sum)
    const rows = [...slice.map((p) => ({ name: p.name, value: p.revenue, fill: p.color }))]
    if (other > 0.01 && rows.length > 0) {
      rows.push({
        name: "Other",
        value: Math.round(other * 100) / 100,
        fill: ANALYTICS_PIE_COLORS[7],
      })
    }
    return rows
      .filter((r) => r.value > 0)
      .map((r) => ({
        name: r.name,
        value: Math.round(r.value * 100) / 100,
        fill: r.fill,
      }))
  }, [data])

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

  const noProducts = !products.totalProductRevenue || products.topProducts.length === 0

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
            <div className="text-muted-foreground text-sm">Top product lines</div>
            <div className="text-2xl font-bold mt-1">{products.topProducts.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Tracked SKUs in range</p>
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
            Top products
          </CardTitle>
          <CardDescription>By revenue from product line items</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 md:gap-8">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground mb-3">Revenue by product (line items)</p>
              <AnalyticsDonutChart
                data={noProducts ? [] : productDonutData}
                emptyMessage="No product lines in this period."
                formatTooltip={formatAmount}
              />
            </div>
            <div className="space-y-3 text-sm min-w-0 max-h-[320px] overflow-y-auto pr-1">
              {products.topProducts.slice(0, 20).map((p, i) => {
                const pct =
                  products.totalProductRevenue > 0
                    ? Math.round((p.revenue / products.totalProductRevenue) * 1000) / 10
                    : 0
                return (
                  <div key={`${p.id}-${i}`}>
                    <div className="flex justify-between gap-2 mb-1">
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: p.color }}
                          aria-hidden
                        />
                        <span className="truncate font-medium">{p.name}</span>
                      </span>
                      <span className="text-muted-foreground shrink-0 tabular-nums">
                        {formatAmount(p.revenue)} ({pct}%) · {p.units} units
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-[width]"
                        style={{
                          width: `${Math.min(100, pct)}%`,
                          backgroundColor: p.color,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
              {products.topProducts.length === 0 ? (
                <p className="text-muted-foreground text-sm">No product lines in this period.</p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
