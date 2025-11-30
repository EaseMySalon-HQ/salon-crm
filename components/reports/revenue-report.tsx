"use client"

import { useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCurrency } from "@/hooks/use-currency"
import { useFeature } from "@/hooks/use-entitlements"

// Sample data
const monthlyData = [
  { name: "Jan", revenue: 4500, expenses: 3200, profit: 1300 },
  { name: "Feb", revenue: 5200, expenses: 3400, profit: 1800 },
  { name: "Mar", revenue: 4800, expenses: 3300, profit: 1500 },
  { name: "Apr", revenue: 6000, expenses: 3600, profit: 2400 },
  { name: "May", revenue: 5700, expenses: 3500, profit: 2200 },
  { name: "Jun", revenue: 6500, expenses: 3800, profit: 2700 },
  { name: "Jul", revenue: 7000, expenses: 4000, profit: 3000 },
  { name: "Aug", revenue: 6800, expenses: 3900, profit: 2900 },
  { name: "Sep", revenue: 6200, expenses: 3700, profit: 2500 },
  { name: "Oct", revenue: 6600, expenses: 3800, profit: 2800 },
  { name: "Nov", revenue: 6100, expenses: 3600, profit: 2500 },
  { name: "Dec", revenue: 7200, expenses: 4100, profit: 3100 },
]

const weeklyData = [
  { name: "Week 1", revenue: 1200, expenses: 800, profit: 400 },
  { name: "Week 2", revenue: 1400, expenses: 850, profit: 550 },
  { name: "Week 3", revenue: 1300, expenses: 820, profit: 480 },
  { name: "Week 4", revenue: 1500, expenses: 870, profit: 630 },
]

export function RevenueReport() {
  const { formatAmount } = useCurrency()
  const { hasAccess: canExport } = useFeature("data_export")
  const [timeframe, setTimeframe] = useState("monthly")
  const [chartType, setChartType] = useState("bar")

  const data = timeframe === "monthly" ? monthlyData : weeklyData

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Select defaultValue={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select timeframe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>

          <Select defaultValue={chartType} onValueChange={setChartType}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select chart type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bar">Bar Chart</SelectItem>
              <SelectItem value="line">Line Chart</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          {canExport ? (
            <>
              <Button variant="outline" size="sm">
                Export PDF
              </Button>
              <Button variant="outline" size="sm">
                Export CSV
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" disabled title="Data export requires Professional or Enterprise plan">
                Export PDF (Upgrade)
              </Button>
              <Button variant="outline" size="sm" disabled title="Data export requires Professional or Enterprise plan">
                Export CSV (Upgrade)
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="text-2xl font-bold">
              {formatAmount(data.reduce((sum, item) => sum + item.revenue, 0))}
            </div>
            <p className="text-muted-foreground">Total Revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-2xl font-bold">
              {formatAmount(data.reduce((sum, item) => sum + item.expenses, 0))}
            </div>
            <p className="text-muted-foreground">Total Expenses</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-2xl font-bold">
              {formatAmount(data.reduce((sum, item) => sum + item.profit, 0))}
            </div>
            <p className="text-muted-foreground">Total Profit</p>
          </CardContent>
        </Card>
      </div>

      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "bar" ? (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => formatAmount(Number(value))} />
              <Legend />
              <Bar dataKey="revenue" name="Revenue" fill="#adfa1d" />
              <Bar dataKey="expenses" name="Expenses" fill="#888888" />
              <Bar dataKey="profit" name="Profit" fill="#10b981" />
            </BarChart>
          ) : (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => formatAmount(Number(value))} />
              <Legend />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#adfa1d" activeDot={{ r: 8 }} />
              <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#888888" />
              <Line type="monotone" dataKey="profit" name="Profit" stroke="#10b981" />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
