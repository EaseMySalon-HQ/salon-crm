"use client"

import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Calendar } from "lucide-react"
import { format, isValid, parse, parseISO } from "date-fns"
import { ListSkeleton } from "@/components/loading"
import { useDashboardInit } from "@/lib/queries/dashboard"

interface RecentItem {
  id: string
  name: string
  avatar?: string
  service: string
  staffName: string
  timeLabel: string
  price: number
  status: string
  dateTime: Date | null
}

/** Build local Date from appointment date + time; supports 24h (e.g. 19:15) and 12h with AM/PM. */
function parseAppointmentWallDateTime(dateRaw: unknown, timeRaw: unknown, startAtRaw?: unknown): Date | null {
  if (startAtRaw != null && startAtRaw !== "") {
    const fromStart = typeof startAtRaw === "string" ? parseISO(startAtRaw) : new Date(startAtRaw as Date)
    if (isValid(fromStart)) return fromStart
  }
  if (!dateRaw) return null
  const dateStr = String(dateRaw).trim()
  const datePart = dateStr.length >= 10 ? dateStr.slice(0, 10) : dateStr
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const iso = parseISO(dateStr)
    return isValid(iso) ? iso : null
  }
  if (timeRaw == null || String(timeRaw).trim() === "") {
    const midnight = parseISO(`${datePart}T00:00:00`)
    return isValid(midnight) ? midnight : null
  }
  const timeStr = String(timeRaw).trim()
  const ref = new Date()
  const attempts = [
    parse(`${datePart} ${timeStr}`, "yyyy-MM-dd HH:mm", ref),
    parse(`${datePart} ${timeStr}`, "yyyy-MM-dd H:mm", ref),
    parse(`${datePart} ${timeStr}`, "yyyy-MM-dd h:mm a", ref),
  ]
  for (const d of attempts) {
    if (isValid(d)) return d
  }
  return null
}

export function RecentAppointments() {
  const router = useRouter()
  const { data, isPending, isError } = useDashboardInit()

  const raw = data?.appointments?.recentUpcoming ?? []

  const items: RecentItem[] = (Array.isArray(raw) ? raw : []).map((a: any) => {
    const appointmentDateTime = parseAppointmentWallDateTime(a?.date, a?.time, a?.startAt)
    const timeLabel =
      appointmentDateTime && isValid(appointmentDateTime)
        ? format(appointmentDateTime, "MMM dd, h:mm a")
        : [a?.date, a?.time].filter(Boolean).join(" ") || String(a?.time || "")
    return {
      id: String(a._id),
      name: a?.clientId?.name || "Client",
      avatar: "/placeholder.svg",
      service: a?.serviceId?.name || "Service",
      staffName: String(a?.staffName || "").trim(),
      timeLabel,
      price: Number(a?.price || a?.serviceId?.price || 0),
      status: a?.status || "scheduled",
      dateTime: appointmentDateTime,
    }
  })

  const scrollClass =
    "h-full overflow-y-auto overflow-x-hidden overscroll-contain space-y-4 pr-1 [-webkit-overflow-scrolling:touch]"

  if (isPending) {
    return (
      <div className={scrollClass}>
        <ListSkeleton rows={4} showAvatar />
      </div>
    )
  }

  if (isError) {
    return <div className="text-sm text-muted-foreground">Could not load recent appointments.</div>
  }

  return (
    <div className={scrollClass}>
      {items.map((appointment, index) => {
        const statusStyles: Record<string, { badge: string; label: string; amount: string }> = {
          completed: {
            badge: "bg-emerald-100 text-emerald-700",
            label: "Completed",
            amount: "text-emerald-600 group-hover:text-emerald-700",
          },
          cancelled: {
            badge: "bg-rose-100 text-rose-700",
            label: "Cancelled",
            amount: "text-rose-500 group-hover:text-rose-600 line-through",
          },
          cancelled_at_billing: {
            badge: "bg-rose-100 text-rose-700",
            label: "Cancelled",
            amount: "text-rose-500 group-hover:text-rose-600 line-through",
          },
          missed: {
            badge: "bg-slate-200 text-slate-700",
            label: "Missed",
            amount: "text-slate-500 group-hover:text-slate-600",
          },
          confirmed: {
            badge: "bg-blue-100 text-blue-700",
            label: "Confirmed",
            amount: "text-blue-600 group-hover:text-blue-700",
          },
          arrived: {
            badge: "bg-violet-100 text-violet-700",
            label: "Arrived",
            amount: "text-violet-600 group-hover:text-violet-700",
          },
          service_started: {
            badge: "bg-cyan-100 text-cyan-700",
            label: "Service started",
            amount: "text-cyan-600 group-hover:text-cyan-700",
          },
          scheduled: {
            badge: "bg-amber-100 text-amber-700",
            label: "Scheduled",
            amount: "text-amber-600 group-hover:text-amber-700",
          },
        }

        const statusKey = String(appointment.status || "scheduled").trim().toLowerCase()
        const status = statusStyles[statusKey] || statusStyles["scheduled"]

        return (
          <button
            key={appointment.id}
            type="button"
            onClick={() => router.push(`/appointments?appointment=${appointment.id}`)}
            className="w-full text-left"
          >
            <div
              className="group flex items-center p-3 rounded-xl bg-gradient-to-r from-slate-50 to-gray-50 hover:from-blue-50 hover:to-indigo-50 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-md border border-transparent hover:border-blue-200"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="relative">
                <Avatar className="h-10 w-10 ring-2 ring-white shadow-sm group-hover:ring-blue-200 transition-all duration-300">
                  <AvatarImage src={appointment.avatar || "/placeholder.svg"} alt="Avatar" />
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-semibold">
                    {appointment.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="ml-4 space-y-1 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold leading-none text-gray-800 group-hover:text-blue-800 transition-colors duration-300">
                    {appointment.name}
                  </p>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.badge}`}>{status.label}</span>
                </div>
                <p className="text-sm text-gray-600 group-hover:text-blue-600 transition-colors duration-300">
                  {appointment.service} with {appointment.staffName || "Unassigned Staff"}
                </p>
                <p className="text-xs text-gray-500 group-hover:text-gray-700 transition-colors duration-300">
                  {appointment.timeLabel}
                </p>
              </div>
              <div className="ml-auto font-bold text-lg px-3 py-1 rounded-full bg-white/50">
                <span className={status.amount}>₹{appointment.price}</span>
              </div>
            </div>
          </button>
        )
      })}
      {items.length === 0 && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <Calendar className="h-8 w-8 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">No recent appointments</p>
          <p className="text-sm text-gray-400">Appointments will appear here once scheduled</p>
        </div>
      )}
    </div>
  )
}
