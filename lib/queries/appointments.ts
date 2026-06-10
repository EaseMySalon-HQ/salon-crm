"use client"

import { useQuery } from "@tanstack/react-query"
import { addDays, format, subDays } from "date-fns"
import { AppointmentsAPI } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { GC_TIME, STALE_TIME } from "@/lib/queries/staleness"

export function appointmentsCalendarRangeKey(
  branchKey: string,
  dateFrom: string,
  dateTo: string,
) {
  return ["appointments", "calendar", branchKey, dateFrom, dateTo] as const
}

export function getAppointmentsCalendarRange(anchorDate: Date) {
  const dateFrom = format(subDays(anchorDate, 7), "yyyy-MM-dd")
  const dateTo = format(addDays(anchorDate, 30), "yyyy-MM-dd")
  return { dateFrom, dateTo }
}

export function useAppointmentsCalendarRange(anchorDate: Date, enabled = true) {
  const { user } = useAuth()
  const branchKey = user?.branchId ?? user?._id ?? "none"
  const { dateFrom, dateTo } = getAppointmentsCalendarRange(anchorDate)

  return useQuery({
    queryKey: appointmentsCalendarRangeKey(branchKey, dateFrom, dateTo),
    queryFn: async () => {
      const response = await AppointmentsAPI.getAll({
        limit: 1000,
        dateFrom,
        dateTo,
        view: "list",
      })
      if (!response?.success) {
        throw new Error(
          typeof response?.error === "string" ? response.error : "Failed to fetch appointments",
        )
      }
      return response.data || []
    },
    enabled: Boolean(enabled && user),
    staleTime: STALE_TIME.appointmentsRange,
    gcTime: GC_TIME.default,
  })
}
