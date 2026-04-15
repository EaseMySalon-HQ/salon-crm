"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

/** Same sequence as `PIE_COLORS` in `backend/lib/analytics-shared.js` for cross-tab consistency */
export const ANALYTICS_PIE_COLORS = [
  "#adfa1d",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#06b6d4",
  "#64748b",
] as const

export type AnalyticsDonutSlice = {
  name: string
  value: number
  fill: string
}

type Props = {
  data: AnalyticsDonutSlice[]
  /** Shown when `data` is empty */
  emptyMessage: string
  formatTooltip: (value: number) => string
}

/** Shared donut used across Analytics tabs (revenue breakdown, top services, etc.) */
export function AnalyticsDonutChart({ data, emptyMessage, formatTooltip }: Props) {
  const empty = data.length === 0

  return (
    <div className="min-h-[260px] h-[260px] w-full sm:h-[280px]">
      {empty ? (
        <div className="flex h-full min-h-[200px] items-center justify-center rounded-lg border border-dashed bg-muted/30 px-4 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
              labelLine={false}
              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${entry.name}-${index}`}
                  fill={entry.fill}
                  stroke="hsl(var(--card))"
                  strokeWidth={1}
                />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => formatTooltip(value)} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
