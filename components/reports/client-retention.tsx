"use client"

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

type ClientRetentionProps = {
  isPending?: boolean
  isError?: boolean
  onRetry?: () => void
  totalClients: number
  avgVisitsFromProfile: number
  clientsWithTwoOrMoreVisits: number
  newClientsSeries: { name: string; newClients: number }[]
}

export function ClientRetention({
  isPending,
  isError,
  onRetry,
  totalClients,
  avgVisitsFromProfile,
  clientsWithTwoOrMoreVisits,
  newClientsSeries,
}: ClientRetentionProps) {
  const chartData = newClientsSeries.map((p) => ({
    name: p.name,
    newClients: p.newClients,
  }))

  if (isPending) {
    return (
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-4 w-24 bg-muted rounded animate-pulse mb-2" />
                <div className="h-8 w-16 bg-muted rounded animate-pulse" />
              </CardContent>
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
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" className="shrink-0 border-amber-300" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    )
  }

  const emptySeries = chartData.every((d) => d.newClients === 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="text-muted-foreground text-sm">Total clients</div>
            <div className="text-2xl font-bold mt-1">{totalClients}</div>
            <p className="text-xs text-muted-foreground mt-1">In your CRM</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-muted-foreground text-sm">Avg. visits (profile)</div>
            <div className="text-2xl font-bold mt-1">{avgVisitsFromProfile}</div>
            <p className="text-xs text-muted-foreground mt-1">From client records</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-muted-foreground text-sm">Repeat clients</div>
            <div className="text-2xl font-bold mt-1">{clientsWithTwoOrMoreVisits}</div>
            <p className="text-xs text-muted-foreground mt-1">With 2+ visits on profile</p>
          </CardContent>
        </Card>
      </div>

      <div className="h-[400px]">
        <h3 className="text-lg font-medium mb-4">New clients over time</h3>
        {emptySeries ? (
          <div className="flex h-[320px] items-center justify-center rounded-lg border border-dashed bg-muted/30 px-4 text-center text-sm text-muted-foreground">
            No new client profiles in this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="90%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={chartData.length > 10 ? -35 : 0} textAnchor={chartData.length > 10 ? "end" : "middle"} height={chartData.length > 10 ? 70 : 40} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="newClients" name="New clients" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.25} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
