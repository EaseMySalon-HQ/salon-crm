"use client"

import { useEffect, useState } from "react"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts"
import { AppointmentsAPI, SalesAPI } from "@/lib/api"
import { useCurrency } from "@/hooks/use-currency"

interface ChartData {
  name: string
  appointments: number
  revenue: number
}

export function Overview() {
  const { getSymbol } = useCurrency()
  const [data, setData] = useState<ChartData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isAuthError = false
    const fetchChartData = async () => {
      try {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        const base: ChartData[] = months.map((name) => ({ name, appointments: 0, revenue: 0 }))

        const [appointmentsRes, salesRes] = await Promise.all([
          AppointmentsAPI.getAll({ limit: 500 }),
          SalesAPI.getAll(),
        ])

        // Aggregate appointments by month
        if (appointmentsRes?.success && Array.isArray(appointmentsRes.data)) {
          for (const appt of appointmentsRes.data as any[]) {
            const dateStr: string = appt?.date
            if (!dateStr) continue
            const dt = new Date(`${dateStr}T00:00:00`)
            const m = dt.getMonth()
            if (m >= 0 && m < 12) base[m].appointments += 1
          }
        }

        // Aggregate revenue by month from sales (grossTotal)
        if (salesRes?.data && Array.isArray(salesRes.data)) {
          for (const sale of salesRes.data as any[]) {
            const dt = new Date(sale?.date)
            const m = dt.getMonth()
            if (m >= 0 && m < 12) base[m].revenue += Number(sale?.grossTotal || 0)
          }
        }

        setData(base)
      } catch (error: any) {
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          isAuthError = true
          return
        }
        console.error("Failed to fetch chart data:", error)
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        setData(months.map((name) => ({ name, appointments: 0, revenue: 0 })))
      } finally {
        if (!isAuthError) setLoading(false)
      }
    }

    fetchChartData()
  }, [])

  if (loading) {
    return (
      <div className="w-full h-[350px] flex items-center justify-center">
        <div className="text-muted-foreground">Loading chart data...</div>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
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
          tick={{ fill: '#64748b', fontWeight: 500 }}
        />
        <YAxis
          stroke="#64748b"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${getSymbol()}${value}`}
          tick={{ fill: '#64748b', fontWeight: 500 }}
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
