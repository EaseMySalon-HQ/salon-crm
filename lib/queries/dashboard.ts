"use client"

import { useQuery } from "@tanstack/react-query"
import { DashboardAPI } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { GC_TIME, STALE_TIME } from "@/lib/queries/staleness"

type DashboardInitOptions = {
  enabled?: boolean
  chartRange?: "year" | "last7days" | "last30days"
  metricsRange?: "today" | "last7days"
}

export function useDashboardInit(options?: boolean | DashboardInitOptions) {
  const { user } = useAuth()
  const branchKey = user?.branchId ?? user?._id ?? "none"
  const enabled = typeof options === "boolean" ? options : options?.enabled !== false
  const chartRange = typeof options === "object" && options?.chartRange ? options.chartRange : "year"
  const metricsRange = typeof options === "object" && options?.metricsRange ? options.metricsRange : "today"

  return useQuery({
    queryKey: ["dashboard", "init", branchKey, chartRange, metricsRange],
    queryFn: async () => {
      const res = await DashboardAPI.getInit({ chartRange, metricsRange })
      if (!res?.success) {
        throw new Error(typeof res?.error === "string" ? res.error : "Dashboard init failed")
      }
      return res.data
    },
    enabled: Boolean(enabled && user),
    staleTime: STALE_TIME.dashboard,
    gcTime: GC_TIME.default,
  })
}
