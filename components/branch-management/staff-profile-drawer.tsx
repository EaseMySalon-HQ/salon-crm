"use client"

import { Building2, CalendarCheck, IndianRupee, Percent } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { getBranchColor } from "@/lib/branch-color"
import { formatINR, formatNumber, initials } from "./branch-format"

export type StaffProfile = {
  staffId: string
  name: string
  role: string
  unlinked?: boolean
  isActive: boolean
  avatar: string
  branchId: string
  branchName: string
  servicesDone: number
  revenue: number
  utilizationPct: number
}

const STAFF_ROLES: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  staff: "Staff",
}

function roleLabel(role: string, unlinked?: boolean): string {
  if (unlinked) return "—"
  return STAFF_ROLES[role] || "Staff"
}

export function StaffProfileDrawer({
  staff,
  open,
  onOpenChange,
  rangeLabel = "This Month",
}: {
  staff: StaffProfile | null
  open: boolean
  onOpenChange: (open: boolean) => void
  rangeLabel?: string
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        {staff && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                <Avatar className="h-14 w-14">
                  {staff.avatar && <AvatarImage src={staff.avatar} alt={staff.name} />}
                  <AvatarFallback
                    className="text-base font-semibold text-white"
                    style={{ backgroundColor: getBranchColor(staff.branchId) }}
                  >
                    {initials(staff.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 text-left">
                  <SheetTitle className="truncate">{staff.name}</SheetTitle>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{roleLabel(staff.role, staff.unlinked)}</span>
                    <Badge
                      variant="outline"
                      className={
                        staff.isActive
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-300 bg-slate-100 text-slate-500"
                      }
                    >
                      {staff.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white"
                  style={{ backgroundColor: getBranchColor(staff.branchId) }}
                >
                  <Building2 className="h-3.5 w-3.5" />
                </span>
                <span className="font-medium text-slate-700">{staff.branchName}</span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <StatRow icon={CalendarCheck} label={`Services done (${rangeLabel})`} value={formatNumber(staff.servicesDone)} />
                <StatRow icon={IndianRupee} label="Revenue contribution" value={formatINR(staff.revenue)} />
                <StatRow icon={Percent} label={`Utilization (${rangeLabel})`} value={`${staff.utilizationPct}%`} />
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function StatRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
      <span className="flex items-center gap-2 text-sm text-slate-500">
        <Icon className="h-4 w-4 text-slate-400" /> {label}
      </span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  )
}
