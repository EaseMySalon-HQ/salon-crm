"use client"

import { useQuery } from "@tanstack/react-query"
import { InventoryTransfersAPI } from "@/lib/api"
import { STALE_TIME } from "@/lib/queries/staleness"

export function useTransferEligibility() {
  return useQuery({
    queryKey: ["inventory-transfers", "eligibility"],
    queryFn: async () => {
      const res = await InventoryTransfersAPI.getEligibility()
      if (!res.success) throw new Error(res.error || "Not eligible")
      return res.data
    },
    staleTime: STALE_TIME.businessSettings,
    retry: false,
  })
}
