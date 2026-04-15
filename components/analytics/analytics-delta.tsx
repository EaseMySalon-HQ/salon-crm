"use client"

import { cn } from "@/lib/utils"

type AnalyticsDeltaProps = {
  pct: number | null | undefined
  className?: string
}

export function AnalyticsDelta({ pct, className }: AnalyticsDeltaProps) {
  if (pct == null || Number.isNaN(pct)) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>vs prior period — n/a</span>
    )
  }
  if (pct === 0) {
    return <span className={cn("text-xs text-muted-foreground", className)}>vs prior period — flat</span>
  }
  const up = pct > 0
  return (
    <span
      className={cn(
        "text-xs font-medium tabular-nums",
        up ? "text-emerald-700" : "text-rose-700",
        className
      )}
    >
      {up ? "↑" : "↓"} {Math.abs(pct)}% vs prior period
    </span>
  )
}
