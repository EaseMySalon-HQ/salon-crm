"use client"

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { useCurrency } from "@/hooks/use-currency"
import { ChartSkeleton } from "@/components/loading"
import { useDashboardInit } from "@/lib/queries/dashboard"

interface ChartData {
  name: string
  appointments: number
  revenue: number
}

type OverviewProps = {
  chartRange?: "year" | "last7days" | "last30days"
}

export function Overview({ chartRange = "year" }: OverviewProps) {
  const { getSymbol } = useCurrency()
  const { data, isPending, isError } = useDashboardInit({ chartRange })

  const chartRows: ChartData[] =
    data?.chart?.map((c: { name: string; appointments?: number; revenue?: number }) => ({
      name: c.name,
      appointments: c.appointments ?? 0,
      revenue: c.revenue ?? 0,
    })) ?? []

  if (isPending) {
    return <ChartSkeleton height={350} className="w-full" />
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
      <LineChart data={chartRows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="4 4" stroke="rgba(100, 116, 139, 0.25)" vertical horizontal />
        <XAxis
          dataKey="name"
          stroke="#64748b"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
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
        <Tooltip
          cursor={{ stroke: "rgba(59, 130, 246, 0.35)", strokeWidth: 1.5 }}
          labelStyle={{ color: "#0f172a", fontWeight: 600 }}
          formatter={(value: number, seriesName: string) => {
            if (seriesName === "Appointment Value") {
              return [`${getSymbol()}${Number(value || 0).toLocaleString("en-IN")}`, "Appointment Value"]
            }
            return [`${getSymbol()}${Number(value || 0).toLocaleString("en-IN")}`, "Revenue"]
          }}
          contentStyle={{
            borderRadius: 10,
            border: "1px solid rgba(148, 163, 184, 0.35)",
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
          }}
        />
        <Legend
          verticalAlign="top"
          align="right"
          iconType="circle"
          wrapperStyle={{ paddingBottom: 12, fontSize: 12 }}
        />
        <Line
          dataKey="revenue"
          name="Revenue"
          type="monotone"
          stroke="#6366f1"
          strokeWidth={3}
          dot={{ r: 4, fill: "#6366f1", stroke: "#ffffff", strokeWidth: 2 }}
          activeDot={{ r: 6, fill: "#4f46e5", stroke: "#ffffff", strokeWidth: 2 }}
          className="animate-in slide-in-from-bottom-2 duration-700"
        />
        <Line
          dataKey="appointments"
          name="Appointment Value"
          type="monotone"
          stroke="#0f766e"
          strokeWidth={2.5}
          dot={{ r: 3.5, fill: "#0f766e", stroke: "#ffffff", strokeWidth: 2 }}
          activeDot={{ r: 5.5, fill: "#115e59", stroke: "#ffffff", strokeWidth: 2 }}
          className="animate-in slide-in-from-bottom-2 duration-700 delay-150"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
