"use client"

import { isValid, parse, parseISO } from "date-fns"
import { useQuery } from "@tanstack/react-query"

import { AppointmentsAPI } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { addCalendarDaysIST, getTodayIST } from "@/lib/date-utils"
import { GC_TIME, STALE_TIME } from "@/lib/queries/staleness"

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "cancelled_at_billing", "missed"])

function appointmentWallInstantMs(appointment: {
  date?: unknown
  time?: unknown
  startAt?: unknown
}): number {
  const dateRaw = appointment?.date
  const timeRaw = appointment?.time
  if (dateRaw) {
    const dateStr = String(dateRaw).trim()
    const datePart = dateStr.length >= 10 ? dateStr.slice(0, 10) : dateStr
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart) && timeRaw != null && String(timeRaw).trim() !== "") {
      const timeStr = String(timeRaw).trim()
      const ref = new Date()
      const attempts = [
        parse(`${datePart} ${timeStr}`, "yyyy-MM-dd HH:mm", ref),
        parse(`${datePart} ${timeStr}`, "yyyy-MM-dd H:mm", ref),
        parse(`${datePart} ${timeStr}`, "yyyy-MM-dd h:mm a", ref),
      ]
      for (const d of attempts) {
        if (isValid(d)) return d.getTime()
      }
    }
  }
  if (appointment?.startAt != null && appointment.startAt !== "") {
    const fromStart =
      typeof appointment.startAt === "string"
        ? parseISO(appointment.startAt)
        : new Date(appointment.startAt as Date)
    if (isValid(fromStart)) return fromStart.getTime()
  }
  return 0
}

export function useNotificationAppointments(enabled = true) {
  const { user } = useAuth()
  const branchKey = user?.branchId ?? user?._id ?? "none"
  const dateFrom = getTodayIST()
  const dateTo = addCalendarDaysIST(dateFrom, 6)

  return useQuery({
    queryKey: ["notifications", "appointments-upcoming", branchKey, dateFrom, dateTo],
    queryFn: async () => {
      const res = await AppointmentsAPI.getAll({
        dateFrom,
        dateTo,
        limit: 200,
        view: "list",
      })
      if (!res?.success) {
        throw new Error(typeof res?.error === "string" ? res.error : "Failed to load appointments")
      }
      const rows = Array.isArray(res.data) ? res.data : []
      const now = Date.now()
      return rows
        .filter((appointment) => {
          const status = String(appointment?.status || "").trim().toLowerCase()
          if (TERMINAL_STATUSES.has(status)) return false
          if (String(appointment?.leadSource || "").trim() === "Walk-in") return false
          const instant = appointmentWallInstantMs(appointment)
          return instant >= now
        })
        .sort((a, b) => appointmentWallInstantMs(a) - appointmentWallInstantMs(b))
        .slice(0, 24)
    },
    enabled: Boolean(enabled && user),
    staleTime: STALE_TIME.appointmentsRange,
    gcTime: GC_TIME.default,
  })
}
