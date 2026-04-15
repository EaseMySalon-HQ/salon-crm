"use client"

import { useEffect, useMemo, useState } from "react"
import { TrendingUp, Wallet } from "lucide-react"

import { AnalyticsRevenueExtras } from "@/components/analytics/analytics-revenue-extras"
import { AnalyticsDelta } from "@/components/analytics/analytics-delta"
import { AnalyticsClientsTabPanel } from "@/components/analytics/analytics-clients-tab-panel"
import { AnalyticsProductsTabPanel } from "@/components/analytics/analytics-products-tab-panel"
import { AnalyticsServicesTabPanel } from "@/components/analytics/analytics-services-tab-panel"
import { AnalyticsStaffTabPanel } from "@/components/analytics/analytics-staff-tab-panel"
import { RevenueReport } from "@/components/reports/revenue-report"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCurrency } from "@/hooks/use-currency"
import { addCalendarDaysIST, daysInclusiveRange, getTodayIST } from "@/lib/date-utils"
import {
  ANALYTICS_MAX_DAYS_DAILY,
  ANALYTICS_MAX_DAYS_WEEKLY,
  computeRangeForPreset,
  useAnalyticsClientsTab,
  useAnalyticsProductsTab,
  useAnalyticsRevenueTab,
  useAnalyticsServicesTab,
  useAnalyticsStaffTab,
  type AnalyticsBucketParam,
  type AnalyticsDatePreset,
} from "@/lib/queries/analytics"
import type { StaffAnalyticsLineType } from "@/lib/types/analytics"

export type AnalyticsTabId = "revenue" | "services" | "clients" | "products" | "staff"

function bucketLabelFromMeta(bucket?: string): string {
  if (bucket === "day") return "Daily"
  if (bucket === "week") return "Weekly"
  if (bucket === "month") return "Monthly"
  return "Auto"
}

export function AnalyticsPageContent() {
  const { formatAmount } = useCurrency()
  const today = getTodayIST()
  const [preset, setPreset] = useState<AnalyticsDatePreset>("last_30d")
  const [customFrom, setCustomFrom] = useState(() => addCalendarDaysIST(today, -29))
  const [customTo, setCustomTo] = useState(() => today)
  const [activeTab, setActiveTab] = useState<AnalyticsTabId>("revenue")
  const [staffLineType, setStaffLineType] = useState<StaffAnalyticsLineType>("all")

  const { dateFrom, dateTo } = useMemo(
    () => computeRangeForPreset(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  )

  const spanDays = useMemo(() => daysInclusiveRange(dateFrom, dateTo), [dateFrom, dateTo])
  const allowDay = spanDays <= ANALYTICS_MAX_DAYS_DAILY
  const allowWeek = spanDays <= ANALYTICS_MAX_DAYS_WEEKLY
  const showGranularitySelect = preset !== "today" && preset !== "yesterday"

  const [granularity, setGranularity] = useState<AnalyticsBucketParam>("day")

  useEffect(() => {
    if (!showGranularitySelect) return
    setGranularity((g) => {
      if (g === "day" && !allowDay) return allowWeek ? "week" : "month"
      if (g === "week" && !allowWeek) return "month"
      return g
    })
  }, [showGranularitySelect, allowDay, allowWeek])

  /** User-controlled bucket only applies to the Revenue tab; other tabs use API auto bucketing */
  const revenueBucketParam = showGranularitySelect ? granularity : undefined

  const revenueQ = useAnalyticsRevenueTab(dateFrom, dateTo, { bucket: revenueBucketParam })
  const servicesQ = useAnalyticsServicesTab(dateFrom, dateTo, {
    enabled: activeTab === "services",
  })
  const clientsQ = useAnalyticsClientsTab(dateFrom, dateTo, {
    enabled: activeTab === "clients",
  })
  const productsQ = useAnalyticsProductsTab(dateFrom, dateTo, {
    enabled: activeTab === "products",
  })
  const staffQ = useAnalyticsStaffTab(dateFrom, dateTo, {
    enabled: activeTab === "staff",
    lineType: staffLineType,
  })

  const revenueData = revenueQ.data
  const bucketLabel = bucketLabelFromMeta(revenueData?.meta.bucket)
  const summaryLoading = revenueQ.isPending && !revenueData
  const totals = revenueData?.revenue.totals

  const handlePresetChange = (v: AnalyticsDatePreset) => {
    if (v === "custom") {
      const cur = computeRangeForPreset(preset, customFrom, customTo)
      setCustomFrom(cur.dateFrom)
      setCustomTo(cur.dateTo)
    }
    setPreset(v)
  }

  const isFetchingAny =
    revenueQ.isFetching ||
    (activeTab === "services" && servicesQ.isFetching) ||
    (activeTab === "clients" && clientsQ.isFetching) ||
    (activeTab === "products" && productsQ.isFetching) ||
    (activeTab === "staff" && staffQ.isFetching)

  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">Explore revenue, services, clients, products, and staff for the selected period.</p>
      </div>

      <Card className="border border-border/80 shadow-sm">
        <CardContent className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end pt-6">
          <div className="flex flex-col gap-2 min-w-[200px]">
            <Label htmlFor="analytics-preset">Period</Label>
            <Select value={preset} onValueChange={(v) => handlePresetChange(v as AnalyticsDatePreset)}>
              <SelectTrigger id="analytics-preset" className="w-full sm:w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="current_month">Current month</SelectItem>
                <SelectItem value="last_month">Last month</SelectItem>
                <SelectItem value="last_30d">Last 30 days</SelectItem>
                <SelectItem value="last_90d">Last 90 days</SelectItem>
                <SelectItem value="this_year">This year</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {showGranularitySelect && activeTab === "revenue" ? (
            <div className="flex flex-col gap-2 min-w-[200px]">
              <Label htmlFor="analytics-granularity">Granularity</Label>
              <Select value={granularity} onValueChange={(v) => setGranularity(v as AnalyticsBucketParam)}>
                <SelectTrigger id="analytics-granularity" className="w-full sm:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowDay ? <SelectItem value="day">Daily</SelectItem> : null}
                  {allowWeek ? <SelectItem value="week">Weekly</SelectItem> : null}
                  <SelectItem value="month">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {preset === "custom" ? (
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="analytics-from">From</Label>
                <Input
                  id="analytics-from"
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-[160px]"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="analytics-to">To</Label>
                <Input
                  id="analytics-to"
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-[160px]"
                />
              </div>
            </div>
          ) : null}
          <div className="text-sm text-muted-foreground lg:ml-auto">
            {dateFrom} → {dateTo}
            {isFetchingAny ? <span className="ml-2 text-violet-600">Updating…</span> : null}
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AnalyticsTabId)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 mb-2 h-auto min-h-11 gap-1 p-1">
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
        </TabsList>

        {activeTab === "revenue" ? (
          <div className="grid gap-4 sm:grid-cols-3 mt-4">
            <Card className="bg-gradient-to-br from-violet-50/80 to-white border-violet-100/80">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-violet-900">Revenue</CardTitle>
                <Wallet className="h-4 w-4 text-violet-600" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <div className="h-9 w-28 bg-muted animate-pulse rounded" />
                ) : (
                  <div className="text-2xl font-bold text-violet-950">{formatAmount(totals?.totalRevenue ?? 0)}</div>
                )}
                <p className="text-xs text-violet-800/80 mt-1">Sales in range (excl. cancelled)</p>
                {!summaryLoading ? (
                  <div className="mt-2">
                    <AnalyticsDelta pct={revenueData?.comparison?.revenuePct} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-slate-50/80 to-white border-slate-100/80">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-900">Expenses</CardTitle>
                <TrendingUp className="h-4 w-4 text-slate-600 rotate-180" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <div className="h-9 w-28 bg-muted animate-pulse rounded" />
                ) : (
                  <div className="text-2xl font-bold text-slate-900">{formatAmount(totals?.totalExpenses ?? 0)}</div>
                )}
                <p className="text-xs text-muted-foreground mt-1">Approved + pending</p>
                {!summaryLoading ? (
                  <div className="mt-2">
                    <AnalyticsDelta pct={revenueData?.comparison?.expensesPct} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-emerald-50/80 to-white border-emerald-100/80">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-emerald-900">Net</CardTitle>
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <div className="h-9 w-28 bg-muted animate-pulse rounded" />
                ) : (
                  <div className="text-2xl font-bold text-emerald-950">{formatAmount(totals?.totalProfit ?? 0)}</div>
                )}
                <p className="text-xs text-emerald-800/80 mt-1">Revenue − expenses</p>
                {!summaryLoading ? (
                  <div className="mt-2">
                    <AnalyticsDelta pct={revenueData?.comparison?.netPct} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        ) : null}

        <TabsContent value="revenue" className="mt-4 pt-1 space-y-6">
          <RevenueReport
            isPending={revenueQ.isPending}
            isError={revenueQ.isError}
            onRetry={() => revenueQ.refetch()}
            series={revenueData?.revenue.series ?? []}
            totals={
              revenueData?.revenue.totals ?? {
                totalRevenue: 0,
                totalExpenses: 0,
                totalProfit: 0,
              }
            }
            bucketLabel={bucketLabel}
          />
          <AnalyticsRevenueExtras data={revenueData} isPending={revenueQ.isPending} />
        </TabsContent>

        <TabsContent value="services" className="mt-4 pt-1">
          <AnalyticsServicesTabPanel
            data={servicesQ.data}
            isPending={servicesQ.isPending}
            isError={servicesQ.isError}
            onRetry={() => servicesQ.refetch()}
          />
        </TabsContent>

        <TabsContent value="clients" className="mt-4 pt-1">
          <AnalyticsClientsTabPanel
            data={clientsQ.data}
            isPending={clientsQ.isPending}
            isError={clientsQ.isError}
            onRetry={() => clientsQ.refetch()}
          />
        </TabsContent>

        <TabsContent value="products" className="mt-4 pt-1">
          <AnalyticsProductsTabPanel
            data={productsQ.data}
            isPending={productsQ.isPending}
            isError={productsQ.isError}
            onRetry={() => productsQ.refetch()}
          />
        </TabsContent>

        <TabsContent value="staff" className="mt-4 pt-1">
          <AnalyticsStaffTabPanel
            data={staffQ.data}
            isPending={staffQ.isPending}
            isError={staffQ.isError}
            onRetry={() => staffQ.refetch()}
            lineType={staffLineType}
            onLineTypeChange={setStaffLineType}
            dateFrom={dateFrom}
            dateTo={dateTo}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
