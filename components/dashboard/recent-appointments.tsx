"use client"

import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Calendar } from "lucide-react"
import { format, parse, parseISO } from "date-fns"
import { useDashboardInit } from "@/lib/queries/dashboard"

interface RecentItem {
  id: string
  name: string
  avatar?: string
  service: string
  timeLabel: string
  price: number
  status: string
  dateTime: Date | null
}

export function RecentAppointments() {
  const router = useRouter()
  const { data, isPending, isError } = useDashboardInit()

  const raw = data?.appointments?.recentUpcoming ?? []

  const items: RecentItem[] = (Array.isArray(raw) ? raw : []).map((a: any) => {
    let appointmentDateTime: Date | null = null
    try {
      if (a?.date && a?.time) {
        appointmentDateTime = parse(`${a.date} ${a.time}`, "yyyy-MM-dd h:mm a", new Date())
      } else if (a?.date) {
        appointmentDateTime = parseISO(a.date)
      }
    } catch {
      appointmentDateTime = null
    }
    return {
      id: String(a._id),
      name: a?.clientId?.name || "Client",
      avatar: "/placeholder.svg",
      service: a?.serviceId?.name || "Service",
      timeLabel: appointmentDateTime ? format(appointmentDateTime, "MMM dd, h:mm a") : a?.time || "",
      price: Number(a?.price || a?.serviceId?.price || 0),
      status: a?.status || "scheduled",
      dateTime: appointmentDateTime,
    }
  })

  if (isPending) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    )
  }

  if (isError) {
    return <div className="text-sm text-muted-foreground">Could not load recent appointments.</div>
  }

  return (
    <div className="space-y-4">
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
          confirmed: {
            badge: "bg-blue-100 text-blue-700",
            label: "Confirmed",
            amount: "text-blue-600 group-hover:text-blue-700",
          },
          scheduled: {
            badge: "bg-amber-100 text-amber-700",
            label: "Scheduled",
            amount: "text-amber-600 group-hover:text-amber-700",
          },
        }

        const status = statusStyles[appointment.status] || statusStyles["scheduled"]

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
                  {appointment.service}
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
