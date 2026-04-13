"use client"

import { useQuery } from "@tanstack/react-query"
import { DashboardAPI } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"

export function useDashboardInit(enabled = true) {
  const { user } = useAuth()
  const branchKey = user?.branchId ?? user?._id ?? "none"

  return useQuery({
    queryKey: ["dashboard", "init", branchKey],
    queryFn: async () => {
      const res = await DashboardAPI.getInit()
      if (!res?.success) {
        throw new Error(typeof res?.error === "string" ? res.error : "Dashboard init failed")
      }
      return res.data
    },
    enabled: Boolean(enabled && user),
  })
}
