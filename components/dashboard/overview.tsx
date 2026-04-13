"use client"

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts"
import { useCurrency } from "@/hooks/use-currency"
import { useDashboardInit } from "@/lib/queries/dashboard"

interface ChartData {
  name: string
  appointments: number
  revenue: number
}

export function Overview() {
  const { getSymbol } = useCurrency()
  const { data, isPending, isError } = useDashboardInit()

  const chartRows: ChartData[] =
    data?.chart?.map((c: { name: string; appointments?: number; revenue?: number }) => ({
      name: c.name,
      appointments: c.appointments ?? 0,
      revenue: c.revenue ?? 0,
    })) ?? []

  if (isPending) {
    return (
      <div className="w-full h-[350px] flex items-center justify-center">
        <div className="text-muted-foreground">Loading chart data...</div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="w-full h-[350px] flex items-center justify-center">
        <div className="text-muted-foreground">Could not load chart data.</div>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={chartRows}>
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.6} />
          </linearGradient>
          <linearGradient id="appointmentsGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#059669" stopOpacity={0.6} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="name"
          stroke="#64748b"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#64748b", fontWeight: 500 }}
        />
        <YAxis
          stroke="#64748b"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${getSymbol()}${value}`}
          tick={{ fill: "#64748b", fontWeight: 500 }}
        />
        <Bar
          dataKey="revenue"
          fill="url(#revenueGradient)"
          radius={[6, 6, 0, 0]}
          className="animate-in slide-in-from-bottom-2 duration-1000"
        />
        <Bar
          dataKey="appointments"
          fill="url(#appointmentsGradient)"
          radius={[6, 6, 0, 0]}
          className="animate-in slide-in-from-bottom-2 duration-1000 delay-200"
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
