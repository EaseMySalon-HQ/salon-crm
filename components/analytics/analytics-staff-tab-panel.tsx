"use client"

import { useMemo, useState } from "react"

import {
  AnalyticsDonutChart,
  ANALYTICS_PIE_COLORS,
  type AnalyticsDonutSlice,
} from "@/components/analytics/analytics-donut-chart"
import { AnalyticsMetricLineChart } from "@/components/analytics/analytics-metric-line-chart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useCurrency } from "@/hooks/use-currency"
import { useStaffAnalyticsDrillDown } from "@/lib/queries/analytics"
import type { AnalyticsStaffRow, AnalyticsStaffTabData, StaffAnalyticsLineType } from "@/lib/types/analytics"
import {
  AlertCircle,
  BarChart3,
  Layers,
  LineChart,
  Package,
  Scissors,
  ShoppingBag,
  Trophy,
  Users,
} from "lucide-react"

import { cn } from "@/lib/utils"

type Props = {
  data: AnalyticsStaffTabData | undefined
  isPending: boolean
  isError: boolean
  onRetry: () => void
  lineType: StaffAnalyticsLineType
  onLineTypeChange: (v: StaffAnalyticsLineType) => void
  dateFrom: string
  dateTo: string
}

const SEGMENTS: {
  value: StaffAnalyticsLineType
  label: string
  Icon: typeof Layers
}[] = [
  { value: "all", label: "All", Icon: Layers },
  { value: "service", label: "Services", Icon: Scissors },
  { value: "product", label: "Products", Icon: ShoppingBag },
  { value: "membership", label: "Memberships", Icon: Users },
  { value: "package", label: "Packages", Icon: Package },
]

const LINE_LABELS: Record<StaffAnalyticsLineType, { leaderboard: string; allStaff: string }> = {
  all: {
    leaderboard: "Leaderboard (all line types)",
    allStaff: "Tax-exclusive attribution by line type; service units from service lines only",
  },
  service: {
    leaderboard: "Leaderboard (services)",
    allStaff: "Service lines only — revenue and attributed service units",
  },
  product: {
    leaderboard: "Leaderboard (products)",
    allStaff: "Product lines only — revenue and attributed units",
  },
  membership: {
    leaderboard: "Leaderboard (memberships)",
    allStaff: "Membership lines only — revenue and attributed units",
  },
  package: {
    leaderboard: "Leaderboard (packages)",
    allStaff: "Package lines only — revenue and attributed units",
  },
}

function trendCell(pct: number | null | undefined) {
  if (pct == null || Number.isNaN(pct)) {
    return <span className="text-muted-foreground">—</span>
  }
  if (pct === 0) {
    return <span className="text-muted-foreground">0%</span>
  }
  const up = pct > 0
  return (
    <span className={cn("tabular-nums font-medium", up ? "text-emerald-700" : "text-rose-700")}>
      {up ? "↑" : "↓"} {Math.abs(pct)}%
    </span>
  )
}

type PodiumSlot = {
  rank: 1 | 2 | 3
  staffName: string | null
  sales: number | null
  trophyClass: string
  iconSize: number
  columnClass: string
}

export function AnalyticsStaffTabPanel({
  data,
  isPending,
  isError,
  onRetry,
  lineType,
  onLineTypeChange,
  dateFrom,
  dateTo,
}: Props) {
  const { formatAmount } = useCurrency()
  const [drillStaffId, setDrillStaffId] = useState<string | null>(null)
  const [drillOpen, setDrillOpen] = useState(false)

  const drillQ = useStaffAnalyticsDrillDown(drillStaffId, dateFrom, dateTo, {
    lineType,
    enabled: drillOpen && Boolean(drillStaffId),
  })

  const staffDonutData: AnalyticsDonutSlice[] = useMemo(() => {
    const staff = data?.staff
    if (!staff) return []
    const total = staff.totalAttributedRevenue || 0
    const top = staff.top
    const slice = top.slice(0, 8)
    const sum = slice.reduce((a, s) => a + s.revenue, 0)
    const other = Math.max(0, total - sum)
    const rows: AnalyticsDonutSlice[] = slice.map((s, i) => ({
      name: s.staffName,
      value: Math.round(s.revenue * 100) / 100,
      fill: ANALYTICS_PIE_COLORS[i % ANALYTICS_PIE_COLORS.length],
    }))
    if (other > 0.01 && rows.length > 0) {
      rows.push({
        name: "Other",
        value: Math.round(other * 100) / 100,
        fill: ANALYTICS_PIE_COLORS[7],
      })
    }
    return rows.filter((r) => r.value > 0)
  }, [data])

  const openDrill = (row: AnalyticsStaffRow) => {
    const id = row.staffId
    if (!id) return
    setDrillStaffId(id)
    setDrillOpen(true)
  }

  if (isPending && !data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg border bg-muted/45 animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-lg border border-violet-200/60 bg-muted/45 animate-pulse" />
        <div className="h-[400px] bg-muted/40 rounded animate-pulse" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex gap-2 text-amber-900 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>Could not load staff analytics.</span>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0 border-amber-300" onClick={onRetry}>
          Retry
        </Button>
      </div>
    )
  }

  if (!data) return null

  const { staff } = data
  const top = staff.top
  const labels = LINE_LABELS[lineType]
  const insights = staff.insights ?? {
    meanAvgBillValue: 0,
    blendedAvgRevenuePerService: 0,
    meanServicesPerDay: 0,
  }

  const categoryEmpty = staff.totalAttributedRevenue <= 0 && top.length > 0

  const first = top[0]
  const second = top[1]
  const third = top[2]

  const slots: PodiumSlot[] = [
    {
      rank: 2,
      staffName: second?.staffName ?? null,
      sales: second != null ? second.revenue : null,
      trophyClass: "text-slate-400 drop-shadow-sm",
      iconSize: 44,
      columnClass: "order-1 pb-2 md:pb-4",
    },
    {
      rank: 1,
      staffName: first?.staffName ?? null,
      sales: first != null ? first.revenue : null,
      trophyClass: "text-amber-500 drop-shadow-md",
      iconSize: 56,
      columnClass: "order-2 -mt-2 md:-mt-4 pb-0",
    },
    {
      rank: 3,
      staffName: third?.staffName ?? null,
      sales: third != null ? third.revenue : null,
      trophyClass: "text-amber-800/90 drop-shadow-sm",
      iconSize: 40,
      columnClass: "order-3 pb-3 md:pb-5",
    },
  ]

  const drillData = drillQ.data
  const attributedSeries =
    drillData?.staff.attributedRevenueTrend.map((p) => ({ name: p.name, value: p.value })) ?? []
  const serviceUnitsSeries =
    drillData?.staff.serviceUnitsTrend.map((p) => ({ name: p.name, value: p.value })) ?? []

  return (
    <div className="space-y-4">
      {top.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4 opacity-80" />
                Avg bill (mean)
              </CardTitle>
              <CardDescription>Mean of per-staff average bill (only staff with at least one bill)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">{formatAmount(insights.meanAvgBillValue)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <LineChart className="h-4 w-4 opacity-80" />
                Avg / service (blended)
              </CardTitle>
              <CardDescription>Branch service revenue ÷ service units</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">{formatAmount(insights.blendedAvgRevenuePerService)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Scissors className="h-4 w-4 opacity-80" />
                Services / day (mean)
              </CardTitle>
              <CardDescription>Mean of per-staff service units ÷ days in range</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">{insights.meanServicesPerDay}</div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {categoryEmpty ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
          No attributed revenue in this category for the selected period. Staff below show ₹0.
        </div>
      ) : null}

      <Card className="overflow-hidden border-violet-200/60 bg-gradient-to-b from-violet-50/50 to-card">
        <CardHeader className="space-y-4 pb-2">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
            <div className="min-w-0 space-y-1.5">
              <CardTitle className="text-lg">{labels.leaderboard}</CardTitle>
              <CardDescription>Top 3 by line-attributed revenue (tax-exclusive), same rules as Staff Performance</CardDescription>
            </div>
            <ToggleGroup
              type="single"
              value={lineType}
              onValueChange={(v) => v && onLineTypeChange(v as StaffAnalyticsLineType)}
              className={cn(
                "inline-flex w-full min-w-0 shrink-0 snap-x snap-mandatory flex-nowrap gap-0 overflow-x-auto rounded-lg p-1 lg:w-auto lg:max-w-none",
                "border border-border/60 bg-muted/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]",
                "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                "lg:flex-wrap lg:overflow-visible lg:snap-none"
              )}
              variant="default"
              size="sm"
            >
              {SEGMENTS.map(({ value, label, Icon }) => (
                <ToggleGroupItem
                  key={value}
                  value={value}
                  aria-label={label}
                  className={cn(
                    "relative min-w-[6.75rem] shrink-0 snap-start rounded-md border-0 px-3 py-2 text-xs font-semibold shadow-none",
                    "text-muted-foreground transition-colors duration-150",
                    "hover:bg-muted/80 hover:text-foreground",
                    "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    "data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
                    "data-[state=on]:ring-1 data-[state=on]:ring-border/60",
                    "lg:min-w-0 lg:flex-1 lg:py-2.5 lg:text-sm"
                  )}
                >
                  <span className="flex items-center justify-center gap-2">
                    <Icon className="size-3.5 shrink-0 opacity-85 lg:size-4" aria-hidden />
                    <span className="whitespace-nowrap leading-tight">{label}</span>
                  </span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </CardHeader>
        <CardContent className="pt-0 pb-8">
          {top.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No staff in this branch.</p>
          ) : top.length === 1 && first ? (
            <div className="flex flex-col items-center text-center max-w-xs mx-auto pt-2 pb-4">
              <Trophy className="shrink-0 text-amber-500 drop-shadow-md" size={64} strokeWidth={1.75} aria-hidden />
              <span className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">1st</span>
              <p className="mt-1 text-base font-semibold leading-tight line-clamp-2 break-words">{first.staffName}</p>
              <p className="mt-2 text-lg tabular-nums font-semibold text-foreground">{formatAmount(first.revenue)}</p>
            </div>
          ) : (
            <div className="flex flex-row justify-center items-end gap-3 sm:gap-8 md:gap-12 max-w-2xl mx-auto px-2">
              {slots.map((slot) => (
                <div
                  key={slot.rank}
                  className={`flex flex-1 flex-col items-center text-center min-w-0 max-w-[140px] ${slot.columnClass}`}
                >
                  <Trophy
                    className={`shrink-0 ${slot.trophyClass}`}
                    size={slot.iconSize}
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {slot.rank === 1 ? "1st" : slot.rank === 2 ? "2nd" : "3rd"}
                  </span>
                  <p className="mt-1 text-sm font-semibold leading-tight line-clamp-2 break-words w-full">
                    {slot.staffName ?? "—"}
                  </p>
                  <p className="mt-1.5 text-sm tabular-nums font-medium text-foreground">
                    {slot.sales != null ? formatAmount(slot.sales) : "—"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All staff</CardTitle>
          <CardDescription>{labels.allStaff}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
            <div className="min-w-0 order-2 lg:order-1">
              <p className="text-sm font-medium text-muted-foreground mb-3">Revenue by staff (attributed)</p>
              <AnalyticsDonutChart
                data={staff.totalAttributedRevenue > 0 && staffDonutData.length > 0 ? staffDonutData : []}
                emptyMessage={
                  categoryEmpty
                    ? "No revenue in this category for the selected period."
                    : "No line-attributed staff revenue in this period."
                }
                formatTooltip={formatAmount}
              />
            </div>
            <div className="min-w-0 order-1 lg:order-2">
              <p className="text-sm font-medium text-muted-foreground mb-3">Performance detail</p>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">Staff</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Revenue</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Share</TableHead>
                      <TableHead className="text-right whitespace-nowrap hidden sm:table-cell">Avg bill</TableHead>
                      <TableHead className="text-right whitespace-nowrap hidden md:table-cell">Avg/svc</TableHead>
                      <TableHead className="text-right whitespace-nowrap hidden lg:table-cell">Svc/day</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Trend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staff.top.map((s, i) => {
                      const pct =
                        staff.totalAttributedRevenue > 0
                          ? Math.round((s.revenue / staff.totalAttributedRevenue) * 1000) / 10
                          : 0
                      const fill = ANALYTICS_PIE_COLORS[i % ANALYTICS_PIE_COLORS.length]
                      const canDrill = Boolean(s.staffId)
                      return (
                        <TableRow
                          key={s.staffId ?? `${s.staffName}-${i}`}
                          className={cn(canDrill && "cursor-pointer hover:bg-muted/50")}
                          onClick={() => canDrill && openDrill(s)}
                        >
                          <TableCell>
                            <span className="flex items-center gap-2 min-w-0">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                                style={{ backgroundColor: fill }}
                                aria-hidden
                              />
                              <span className="font-medium truncate">{s.staffName}</span>
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatAmount(s.revenue)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{pct}%</TableCell>
                          <TableCell className="text-right tabular-nums hidden sm:table-cell">
                            {formatAmount(s.avgBillValue ?? 0)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums hidden md:table-cell">
                            {formatAmount(s.avgRevenuePerService ?? 0)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums hidden lg:table-cell">
                            {s.servicesPerDay ?? 0}
                          </TableCell>
                          <TableCell className="text-right">{trendCell(s.revenueTrendPct)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Click a row for revenue and service trends.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet
        open={drillOpen}
        onOpenChange={(o) => {
          setDrillOpen(o)
          if (!o) setDrillStaffId(null)
        }}
      >
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto" side="right">
          <SheetHeader>
            <SheetTitle>{drillData?.staff.staffName ?? "Staff trends"}</SheetTitle>
            <SheetDescription>
              {dateFrom} → {dateTo}
              {drillData?.meta.lineType && drillData.meta.lineType !== "all"
                ? ` · Line filter: ${drillData.meta.lineType}`
                : ""}
              {drillData?.meta.bucket ? ` · ${drillData.meta.bucket}` : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-8 pb-8">
            {drillQ.isPending ? (
              <div className="space-y-4">
                <div className="h-48 rounded-lg bg-muted/50 animate-pulse" />
                <div className="h-48 rounded-lg bg-muted/50 animate-pulse" />
              </div>
            ) : drillQ.isError ? (
              <p className="text-sm text-destructive">Could not load trends.</p>
            ) : (
              <>
                <AnalyticsMetricLineChart
                  title="Attributed revenue (current filter)"
                  label="Attributed revenue"
                  color="#8b5cf6"
                  series={attributedSeries}
                  chartHeightClass="h-[220px]"
                  emptyMessage="No attributed revenue in this period for this filter."
                />
                <AnalyticsMetricLineChart
                  title="Service units"
                  label="Service units"
                  color="#0ea5e9"
                  series={serviceUnitsSeries}
                  format="number"
                  chartHeightClass="h-[220px]"
                  emptyMessage="No service lines in this period."
                />
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
