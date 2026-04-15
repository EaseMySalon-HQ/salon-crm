"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { usePathname } from "next/navigation"
import { SettingsAPI } from "@/lib/api"
import type { ApiResponse } from "@/lib/api"

/** Shared cache for `/api/settings/payment` — avoids N duplicate calls when many components use `useCurrency`. */
export const PAYMENT_SETTINGS_QUERY_KEY = ["settings", "payment"] as const

export function shouldSkipPaymentSettingsFetch(pathname: string | null): boolean {
  if (!pathname) return false
  if (pathname.includes("/receipt/public/") || pathname.includes("/public/")) return true
  if (pathname.includes("/login")) return true
  return false
}

async function fetchPaymentSettingsQuery(): Promise<ApiResponse<any>> {
  try {
    return await SettingsAPI.getPaymentSettings()
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 401) {
      return { success: false, error: "Unauthorized" }
    }
    throw error
  }
}

/**
 * Single cached fetch for payment settings (currency, tax, Razorpay, etc.).
 * Skips public receipt routes and login, matching previous `useCurrency` behavior.
 */
export function usePaymentSettingsQuery(options?: { enabled?: boolean }) {
  const pathname = usePathname()
  const skipRoute = shouldSkipPaymentSettingsFetch(pathname)
  const enabled = (options?.enabled !== false) && !skipRoute

  return useQuery({
    queryKey: PAYMENT_SETTINGS_QUERY_KEY,
    queryFn: fetchPaymentSettingsQuery,
    enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  })
}

export function useInvalidatePaymentSettings() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: PAYMENT_SETTINGS_QUERY_KEY })
  }
}
