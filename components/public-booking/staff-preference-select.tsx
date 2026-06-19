"use client"

import { Loader2 } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PublicBookingStaff } from "@/lib/public-booking-api"

const NO_PREFERENCE = "__no_preference__"

type StaffPreferenceSelectProps = {
  staffList: PublicBookingStaff[]
  loading?: boolean
  selectedStaffId: string | null
  onStaffChange: (staffId: string | null, staffName?: string) => void
  hideHeader?: boolean
}

export function StaffPreferenceSelect({
  staffList,
  loading = false,
  selectedStaffId,
  onStaffChange,
  hideHeader = false,
}: StaffPreferenceSelectProps) {
  const value = selectedStaffId || NO_PREFERENCE

  return (
    <section className="space-y-4">
      {!hideHeader && (
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Select your preferred expert</h2>
          <p className="mt-1 text-sm text-slate-500">
            One stylist will handle all services in your appointment.
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3 sm:gap-4">
          <p className="shrink-0 text-sm font-medium text-slate-900">Select Staff</p>
          {loading ? (
            <div className="flex flex-1 items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading staff…
            </div>
          ) : (
            <Select
              value={value}
              onValueChange={(v) => {
                if (v === NO_PREFERENCE) {
                  onStaffChange(null)
                  return
                }
                const staff = staffList.find((s) => s.id === v)
                onStaffChange(v, staff?.name)
              }}
            >
              <SelectTrigger className="min-w-0 flex-1">
                <SelectValue placeholder="No Preference" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PREFERENCE}>No Preference</SelectItem>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
    </section>
  )
}
