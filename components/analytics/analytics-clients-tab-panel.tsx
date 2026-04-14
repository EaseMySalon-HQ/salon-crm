"use client"

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { AnalyticsDelta } from "@/components/analytics/analytics-delta"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useCurrency } from "@/hooks/use-currency"
import { AlertCircle } from "lucide-react"
import type { AnalyticsClientsTabData } from "@/lib/types/analytics"

type Props = {
  data: AnalyticsClientsTabData | undefined
  isPending: boolean
  isError: boolean
  onRetry: () => void
}

export function AnalyticsClientsTabPanel({ data, isPending, isError, onRetry }: Props) {
  const { formatAmount } = useCurrency()

  if (isPending && !data) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-4 w-24 bg-muted rounded animate-pulse mb-2" />
                <div className="h-8 w-16 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={`s-${i}`}>
              <CardContent className="p-6 h-24 bg-muted/40 animate-pulse rounded-lg" />
            </Card>
          ))}
        </div>
        <div className="h-[400px] bg-muted/40 rounded animate-pulse" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex gap-2 text-amber-900 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>Could not load client metrics.</span>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0 border-amber-300" onClick={onRetry}>
          Retry
        </Button>
      </div>
    )
  }

  if (!data) return null

  const { clients, comparison } = data
  const mix = clients.mix
  const insights = clients.insights
  const visitRetention = clients.visitRetention
  const recency = clients.recency
  const topClients = clients.topClientsBySpend ?? []

  const chartData = clients.newClientsSeries.map((p) => ({
    name: p.name,
    newClients: p.newClients,
  }))
  const emptySeries = chartData.every((d) => d.newClients === 0)

  const vrTotal =
    (visitRetention?.visits1 ?? 0) +
    (visitRetention?.visits2to3 ?? 0) +
    (visitRetention?.visits4plus ?? 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="text-muted-foreground text-sm">New profiles</div>
            <div className="text-2xl font-bold mt-1">{clients.newProfilesInRange}</div>
            <p className="text-xs text-muted-foreground mt-1">Created in this period</p>
            <div className="mt-2">
              <AnalyticsDelta pct={comparison?.newClientsPct} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-muted-foreground text-sm">New buyers (with sale)</div>
            <div className="text-2xl font-bold mt-1">{mix.newBuyersWithSale}</div>
            <p className="text-xs text-muted-foreground mt-1">First purchase in range</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-muted-foreground text-sm">Returning buyers</div>
            <div className="text-2xl font-bold mt-1">{mix.returningBuyersWithSale}</div>
            <p className="text-xs text-muted-foreground mt-1">Had activity before this range</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-muted-foreground text-sm">Repeat rate</div>
            <div className="text-2xl font-bold mt-1">
              {mix.repeatRatePct != null ? `${mix.repeatRatePct}%` : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Share of buyers who were returning</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="text-muted-foreground text-sm">Avg revenue / buyer</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">
              {insights?.avgRevenuePerBuyingClient != null
                ? formatAmount(insights.avgRevenuePerBuyingClient)
                : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Period revenue ÷ distinct buyers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-muted-foreground text-sm">Conversion rate</div>
            <div className="text-2xl font-bold mt-1">
              {insights?.conversionRatePct != null ? `${insights.conversionRatePct}%` : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Buyers in period ÷ {insights?.totalClientProfiles ?? "—"} branch profiles
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-muted-foreground text-sm">Active (30d)</div>
            <div className="text-2xl font-bold mt-1">{insights?.activeClientsLast30Days ?? "—"}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Distinct clients with a sale in the 30 days ending {data.meta.dateTo} (IST)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-muted-foreground text-sm">Branch profiles</div>
            <div className="text-2xl font-bold mt-1">{insights?.totalClientProfiles ?? "—"}</div>
            <p className="text-xs text-muted-foreground mt-1">Total clients in branch</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Visit retention (this period)</CardTitle>
            <CardDescription>Buyers segmented by number of bills in the selected range</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              { label: "1 visit", v: visitRetention?.visits1 ?? 0, color: "bg-violet-500" },
              { label: "2–3 visits", v: visitRetention?.visits2to3 ?? 0, color: "bg-sky-500" },
              { label: "4+ visits", v: visitRetention?.visits4plus ?? 0, color: "bg-emerald-500" },
            ].map((row) => {
              const pct = vrTotal > 0 ? Math.round((row.v / vrTotal) * 1000) / 10 : 0
              return (
                <div key={row.label}>
                  <div className="flex justify-between gap-2 mb-1">
                    <span>{row.label}</span>
                    <span className="font-medium tabular-nums">
                      {row.v} buyers ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${row.color}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              )
            })}
            {vrTotal === 0 ? (
              <p className="text-muted-foreground text-sm">No buyer activity in this period.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recency (last sale)</CardTitle>
            <CardDescription>
              As of {recency?.asOfDate ?? data.meta.dateTo} — days since last bill (any time)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              { label: "Active (0–30d)", v: recency?.active0to30Days ?? 0, color: "bg-emerald-500" },
              { label: "At risk (31–60d)", v: recency?.atRisk30to60Days ?? 0, color: "bg-amber-500" },
              { label: "Lost (>60d)", v: recency?.lostOver60Days ?? 0, color: "bg-slate-400" },
              { label: "Never purchased", v: recency?.neverPurchased ?? 0, color: "bg-muted-foreground" },
            ].map((row) => (
              <div key={row.label} className="flex justify-between gap-2 border-b border-border/60 pb-2 last:border-0">
                <span className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-sm shrink-0 ${row.color}`} aria-hidden />
                  {row.label}
                </span>
                <span className="font-medium tabular-nums">{row.v}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top clients by spend</CardTitle>
          <CardDescription>Top 5 in this period by total bill value (GST-inclusive)</CardDescription>
        </CardHeader>
        <CardContent>
          {topClients.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales with a linked client in this period.</p>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto text-sm">
              {topClients.map((c, i) => (
                <div
                  key={c.clientId}
                  className="flex flex-row items-start sm:items-center justify-between gap-3 border-b border-border/60 pb-3 last:border-0"
                >
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <span className="font-medium tabular-nums text-muted-foreground w-5 shrink-0">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                      {c.phone ? <div className="text-xs text-muted-foreground truncate">{c.phone}</div> : null}
                    </div>
                  </div>
                  <span className="font-semibold tabular-nums shrink-0">{formatAmount(c.totalSpend)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="h-[400px]">
        <h3 className="text-lg font-medium mb-4">New client profiles over time</h3>
        {emptySeries ? (
          <div className="flex h-[320px] items-center justify-center rounded-lg border border-dashed bg-muted/30 px-4 text-center text-sm text-muted-foreground">
            No new client profiles in this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="90%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11 }}
                interval={0}
                angle={chartData.length > 10 ? -35 : 0}
                textAnchor={chartData.length > 10 ? "end" : "middle"}
                height={chartData.length > 10 ? 70 : 40}
              />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey="newClients"
                name="New profiles"
                stroke="#8b5cf6"
                fill="#8b5cf6"
                fillOpacity={0.25}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
