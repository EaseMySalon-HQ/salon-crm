"use client"

import { useQuery } from "@tanstack/react-query"
import { PlatformAPI } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { normalizeNavBannerClientPayload } from "@/lib/nav-banner"
import { GC_TIME, STALE_TIME } from "@/lib/queries/staleness"

export function useNavBannerConfig() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ["platform", "nav-banner"],
    queryFn: async () => {
      const res = await PlatformAPI.getNavBanner()
      if (!res?.success || !res.data) {
        throw new Error(typeof res?.error === "string" ? res.error : "Failed to load nav banner")
      }
      return normalizeNavBannerClientPayload(res.data).active
    },
    enabled: Boolean(user),
    staleTime: STALE_TIME.dashboard,
    gcTime: GC_TIME.default,
  })
}

export function useNavBannerActive() {
  const { data } = useNavBannerConfig()
  return Boolean(data)
}
