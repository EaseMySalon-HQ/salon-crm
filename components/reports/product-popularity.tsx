"use client"

import { useState } from "react"

import {
  AnalyticsDonutChart,
  ANALYTICS_PIE_COLORS,
  type AnalyticsDonutSlice,
} from "@/components/analytics/analytics-donut-chart"

import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useCurrency } from "@/hooks/use-currency"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { AnalyticsTopProduct } from "@/lib/types/analytics"

const TOP_PRODUCTS_CARD_LIMIT = 10

type ProductPopularityProps = {
  isPending?: boolean
  isError?: boolean
  onRetry?: () => void
  topProducts: AnalyticsTopProduct[]
  allProductsBreakdown?: AnalyticsTopProduct[]
  totalProductRevenue: number
}

function pctOfRevenue(p: AnalyticsTopProduct, total: number): number {
  if (p.percentOfProductRevenue != null) return p.percentOfProductRevenue
  if (!total || total <= 0) return 0
  return Math.round((p.revenue / total) * 1000) / 10
}

export function ProductPopularity({
  isPending,
  isError,
  onRetry,
  topProducts,
  allProductsBreakdown,
  totalProductRevenue,
}: ProductPopularityProps) {
  const { formatAmount } = useCurrency()
  const [listMode, setListMode] = useState<"top" | "all">("top")

  const pieData = topProducts.slice(0, 8).map((p) => ({
    name: p.name,
    value: Math.round(p.revenue * 100) / 100,
    color: p.color,
  }))

  const sumPie = pieData.reduce((a, b) => a + b.value, 0)
  const other = Math.max(0, (totalProductRevenue || 0) - sumPie)
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
          <span>Could not load product analytics.</span>
        </div>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" className="shrink-0 border-amber-300" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    )
  }

  const empty = !totalProductRevenue || chartRows.length === 0

  const listRows = allProductsBreakdown != null ? allProductsBreakdown : topProducts
  const hasFullBreakdown = allProductsBreakdown != null
  const topProductsForCards = (allProductsBreakdown ?? topProducts).slice(0, TOP_PRODUCTS_CARD_LIMIT)

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 md:gap-8">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground mb-3">Revenue by product (line items)</p>
          <AnalyticsDonutChart
            data={empty ? [] : donutData}
            emptyMessage="No product lines in this period."
            formatTooltip={formatAmount}
          />
        </div>

        <div className="min-w-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
            <p className="text-sm font-medium text-muted-foreground">
              {hasFullBreakdown && listMode === "all" ? "All products in period" : "Top 10 products"}
            </p>
            {hasFullBreakdown ? (
              <ToggleGroup
                type="single"
                value={listMode}
                onValueChange={(v) => {
                  if (v === "top" || v === "all") setListMode(v)
                }}
                variant="outline"
                size="sm"
                className="shrink-0 justify-start sm:justify-end"
                aria-label="Product list view"
              >
                <ToggleGroupItem value="top" className="px-3">
                  Top 10
                </ToggleGroupItem>
                <ToggleGroupItem value="all" className="px-3">
                  All products
                </ToggleGroupItem>
              </ToggleGroup>
            ) : null}
          </div>
          {empty ? (
            <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed bg-muted/30 px-4 text-center text-sm text-muted-foreground">
              No data for this range.
            </div>
          ) : hasFullBreakdown && listMode === "all" ? (
            <div className="rounded-md border max-h-[360px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[min(40%,280px)]">Product</TableHead>
                    <TableHead className="text-right tabular-nums">Revenue</TableHead>
                    <TableHead className="text-right tabular-nums">Share</TableHead>
                    <TableHead className="text-right tabular-nums">Units</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listRows.map((p, index) => (
                    <TableRow key={`${p.id}-${index}`}>
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-2 min-w-0">
                          <span
                            className="h-2 w-2 shrink-0 rounded-sm"
                            style={{ backgroundColor: p.color }}
                            aria-hidden
                          />
                          <span className="truncate">{p.name}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(p.revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pctOfRevenue(p, totalProductRevenue)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.units}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {topProductsForCards.map((p, index) => {
                const pct = pctOfRevenue(p, totalProductRevenue)
                return (
                  <Card key={`${p.id}-${index}`}>
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex items-start gap-2">
                        <span
                          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: p.color }}
                          aria-hidden
                        />
                        <div>
                          <div className="font-medium truncate">{p.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {formatAmount(p.revenue)} · {pct}% of product revenue · {p.units} units
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
