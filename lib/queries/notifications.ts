"use client"

import { useQuery } from "@tanstack/react-query"
import { NotificationsAPI } from "@/lib/api"
import type { NotificationFeedItem } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { GC_TIME, STALE_TIME } from "@/lib/queries/staleness"

export function useNotificationsFeed(enabled = true) {
  const { user } = useAuth()
  const branchKey = user?.branchId ?? user?._id ?? "none"

  return useQuery({
    queryKey: ["notifications", "feed", branchKey],
    queryFn: async () => {
      const res = await NotificationsAPI.getFeed()
      if (!res?.success || !res.data?.items) {
        throw new Error(
          typeof res?.error === "string" ? res.error : "Failed to load alerts"
        )
      }
      return res.data.items as NotificationFeedItem[]
    },
    enabled: Boolean(enabled && user),
    staleTime: STALE_TIME.dashboard,
    gcTime: GC_TIME.default,
  })
}
