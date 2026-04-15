"use client"

import { useQuery } from "@tanstack/react-query"
import { AnalyticsAPI } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import {
  addCalendarDaysIST,
  getFirstDayOfMonthIST,
  getTodayIST,
} from "@/lib/date-utils"
import type {
  AnalyticsClientsTabData,
  AnalyticsProductsTabData,
  AnalyticsRevenueTabData,
  AnalyticsServicesTabData,
  AnalyticsStaffDrillDownData,
  AnalyticsStaffTabData,
  StaffAnalyticsLineType,
} from "@/lib/types/analytics"

/** Match backend `analytics-shared.js` span limits for `bucket=day|week`. */
export const ANALYTICS_MAX_DAYS_DAILY = 31
export const ANALYTICS_MAX_DAYS_WEEKLY = 35

export type AnalyticsBucketParam = "day" | "week" | "month"

export type AnalyticsDatePreset =
  | "today"
  | "yesterday"
  | "current_month"
  | "last_month"
  | "last_30d"
  | "last_90d"
  | "this_year"
  | "custom"

export function computeRangeForPreset(
  preset: AnalyticsDatePreset,
  customFrom: string,
  customTo: string
): { dateFrom: string; dateTo: string } {
  const today = getTodayIST()
  switch (preset) {
    case "today":
      return { dateFrom: today, dateTo: today }
    case "yesterday": {
      const y = addCalendarDaysIST(today, -1)
      return { dateFrom: y, dateTo: y }
    }
    case "current_month": {
      const from = getFirstDayOfMonthIST(today)
      return { dateFrom: from, dateTo: today }
    }
    case "last_month": {
      const firstThisMonth = getFirstDayOfMonthIST(today)
      const lastDayPrevMonth = addCalendarDaysIST(firstThisMonth, -1)
      const from = getFirstDayOfMonthIST(lastDayPrevMonth)
      return { dateFrom: from, dateTo: lastDayPrevMonth }
    }
    case "last_30d":
      return { dateFrom: addCalendarDaysIST(today, -29), dateTo: today }
    case "last_90d":
      return { dateFrom: addCalendarDaysIST(today, -89), dateTo: today }
    case "this_year": {
      const y = today.slice(0, 4)
      return { dateFrom: `${y}-01-01`, dateTo: today }
    }
    case "custom": {
      let from = customFrom
      let to = customTo
      if (from && to && from > to) {
        const s = from
        from = to
        to = s
      }
      return { dateFrom: from || today, dateTo: to || today }
    }
    default:
      return { dateFrom: addCalendarDaysIST(today, -29), dateTo: today }
  }
}

type TabOpts = { bucket?: AnalyticsBucketParam | null; enabled?: boolean }

function tabQueryKey(
  tab: string,
  branchKey: string,
  dateFrom: string,
  dateTo: string,
  bucket: AnalyticsBucketParam | null | undefined
) {
  return ["analytics", tab, branchKey, dateFrom, dateTo, bucket ?? "auto"] as const
}

export function useAnalyticsRevenueTab(dateFrom: string, dateTo: string, options?: TabOpts) {
  const { user } = useAuth()
  const branchKey = user?.branchId ?? user?._id ?? "none"
  const bucket = options?.bucket
  const enabled = options?.enabled !== false

  return useQuery({
    queryKey: tabQueryKey("revenue", branchKey, dateFrom, dateTo, bucket),
    queryFn: async (): Promise<AnalyticsRevenueTabData> => {
      const res = await AnalyticsAPI.getRevenueTab({
        dateFrom,
        dateTo,
        ...(bucket ? { bucket } : {}),
      })
      if (!res?.success) {
        throw new Error(typeof res?.error === "string" ? res.error : "Revenue analytics failed")
      }
      return res.data as AnalyticsRevenueTabData
    },
    enabled: Boolean(enabled && user && dateFrom && dateTo),
  })
}

export function useAnalyticsServicesTab(dateFrom: string, dateTo: string, options?: TabOpts) {
  const { user } = useAuth()
  const branchKey = user?.branchId ?? user?._id ?? "none"
  const bucket = options?.bucket
  const enabled = options?.enabled !== false

  return useQuery({
    queryKey: tabQueryKey("services", branchKey, dateFrom, dateTo, bucket),
    queryFn: async (): Promise<AnalyticsServicesTabData> => {
      const res = await AnalyticsAPI.getServicesTab({
        dateFrom,
        dateTo,
        ...(bucket ? { bucket } : {}),
      })
      if (!res?.success) {
        throw new Error(typeof res?.error === "string" ? res.error : "Services analytics failed")
      }
      return res.data as AnalyticsServicesTabData
    },
    enabled: Boolean(enabled && user && dateFrom && dateTo),
  })
}

export function useAnalyticsClientsTab(dateFrom: string, dateTo: string, options?: TabOpts) {
  const { user } = useAuth()
  const branchKey = user?.branchId ?? user?._id ?? "none"
  const bucket = options?.bucket
  const enabled = options?.enabled !== false

  return useQuery({
    queryKey: tabQueryKey("clients", branchKey, dateFrom, dateTo, bucket),
    queryFn: async (): Promise<AnalyticsClientsTabData> => {
      const res = await AnalyticsAPI.getClientsTab({
        dateFrom,
        dateTo,
        ...(bucket ? { bucket } : {}),
      })
      if (!res?.success) {
        throw new Error(typeof res?.error === "string" ? res.error : "Clients analytics failed")
      }
      return res.data as AnalyticsClientsTabData
    },
    enabled: Boolean(enabled && user && dateFrom && dateTo),
  })
}

export function useAnalyticsProductsTab(dateFrom: string, dateTo: string, options?: TabOpts) {
  const { user } = useAuth()
  const branchKey = user?.branchId ?? user?._id ?? "none"
  const bucket = options?.bucket
  const enabled = options?.enabled !== false

  return useQuery({
    queryKey: tabQueryKey("products", branchKey, dateFrom, dateTo, bucket),
    queryFn: async (): Promise<AnalyticsProductsTabData> => {
      const res = await AnalyticsAPI.getProductsTab({
        dateFrom,
        dateTo,
        ...(bucket ? { bucket } : {}),
      })
      if (!res?.success) {
        throw new Error(typeof res?.error === "string" ? res.error : "Products analytics failed")
      }
      return res.data as AnalyticsProductsTabData
    },
    enabled: Boolean(enabled && user && dateFrom && dateTo),
  })
}

export type StaffTabQueryOpts = TabOpts & { lineType?: StaffAnalyticsLineType }

export function useAnalyticsStaffTab(dateFrom: string, dateTo: string, options?: StaffTabQueryOpts) {
  const { user } = useAuth()
  const branchKey = user?.branchId ?? user?._id ?? "none"
  const bucket = options?.bucket
  const lineType = options?.lineType ?? "all"
  const enabled = options?.enabled !== false

  return useQuery({
    queryKey: [...tabQueryKey("staff", branchKey, dateFrom, dateTo, bucket), lineType] as const,
    queryFn: async (): Promise<AnalyticsStaffTabData> => {
      const res = await AnalyticsAPI.getStaffTab({
        dateFrom,
        dateTo,
        ...(bucket ? { bucket } : {}),
        ...(lineType && lineType !== "all" ? { lineType } : {}),
      })
      if (!res?.success) {
        throw new Error(typeof res?.error === "string" ? res.error : "Staff analytics failed")
      }
      return res.data as AnalyticsStaffTabData
    },
    enabled: Boolean(enabled && user && dateFrom && dateTo),
  })
}

export type StaffDrillQueryOpts = TabOpts & { lineType?: StaffAnalyticsLineType }

export function useStaffAnalyticsDrillDown(
  staffId: string | null,
  dateFrom: string,
  dateTo: string,
  options?: StaffDrillQueryOpts & { enabled?: boolean }
) {
  const { user } = useAuth()
  const branchKey = user?.branchId ?? user?._id ?? "none"
  const bucket = options?.bucket
  const lineType = options?.lineType ?? "all"
  const enabled = options?.enabled !== false

  return useQuery({
    queryKey: [...tabQueryKey("staff-drill", branchKey, dateFrom, dateTo, bucket), staffId, lineType] as const,
    queryFn: async (): Promise<AnalyticsStaffDrillDownData> => {
      if (!staffId) throw new Error("Staff id required")
      const res = await AnalyticsAPI.getStaffTrends(staffId, {
        dateFrom,
        dateTo,
        ...(bucket ? { bucket } : {}),
        ...(lineType && lineType !== "all" ? { lineType } : {}),
      })
      if (!res?.success) {
        throw new Error(typeof res?.error === "string" ? res.error : "Staff trends failed")
      }
      return res.data as AnalyticsStaffDrillDownData
    },
    enabled: Boolean(enabled && user && dateFrom && dateTo && staffId),
  })
}
