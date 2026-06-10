"use client"

import { Building2, Phone, Mail, CreditCard, Home, Loader2 } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import type { BranchClientMatch } from "@/lib/api"
import { getBranchColor } from "@/lib/branch-color"
import { formatINR, formatNumber, formatDate } from "./branch-format"

function latest(dates: (string | null)[]): string | null {
  let best: number | null = null
  for (const d of dates) {
    if (!d) continue
    const t = new Date(d).getTime()
    if (!Number.isNaN(t) && (best === null || t > best)) best = t
  }
  return best === null ? null : new Date(best).toISOString()
}

export function ClientProfileDrawer({
  matches,
  homeBranchId,
  open,
  onOpenChange,
  isLoading = false,
  fallbackName,
  fallbackPhone,
}: {
  matches: BranchClientMatch[]
  homeBranchId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  isLoading?: boolean
  fallbackName?: string
  fallbackPhone?: string
}) {
  const found = matches.filter((m) => m.found && m.client)
  const profile = found[0]?.client ?? null
  const title = profile?.name || fallbackName || "Client profile"

  const totalVisits = found.reduce((sum, m) => sum + (m.client?.totalVisits || 0), 0)
  const totalSpent = found.reduce((sum, m) => sum + (m.client?.totalSpent || 0), 0)
  const lastVisit = latest(found.map((m) => m.client?.lastVisit ?? null))
  const homeBranch = found.find((m) => m.branchId === homeBranchId)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="truncate text-left">{title}</SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="mt-8 flex flex-col items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
            Loading client profile…
          </div>
        ) : profile ? (
          <>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {profile.phone}
              </div>
              {profile.email && (
                <div className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> {profile.email}
                </div>
              )}
            </div>

            {homeBranch && (
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700">
                <Home className="h-3.5 w-3.5" /> Home branch: {homeBranch.branchName}
              </div>
            )}

            <div className="mt-5 grid grid-cols-3 gap-3">
              <Stat label="Total Visits" value={formatNumber(totalVisits)} />
              <Stat label="Lifetime Value" value={formatINR(totalSpent)} />
              <Stat label="Last Visit" value={formatDate(lastVisit)} />
            </div>

            <div className="mt-6 space-y-3">
              <p className="text-sm font-medium text-slate-600">Per-branch history</p>
              {found.map((m) => {
                const c = m.client!
                const color = getBranchColor(m.branchId)
                return (
                  <div key={m.branchId} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white"
                          style={{ backgroundColor: color }}
                        >
                          <Building2 className="h-3.5 w-3.5" />
                        </span>
                        {m.branchName}
                      </span>
                      {m.branchId === homeBranchId && (
                        <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">
                          Home
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <MiniStat label="Visits" value={formatNumber(c.totalVisits)} />
                      <MiniStat label="Spend" value={formatINR(c.totalSpent)} />
                      <MiniStat label="Last" value={formatDate(c.lastVisit)} />
                    </div>
                    {m.memberships.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                          <CreditCard className="h-3.5 w-3.5" /> Memberships
                        </p>
                        {m.memberships.map((mem) => (
                          <div
                            key={mem.id}
                            className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs"
                          >
                            <span className="truncate font-medium text-slate-700">{mem.planName}</span>
                            {mem.remainingSessions != null && (
                              <Badge variant="outline" className="shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700">
                                {mem.remainingSessions} left
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="mt-8 text-center text-sm text-slate-500">
            {fallbackPhone ? (
              <>
                <p>No profile found for {fallbackPhone}.</p>
                <p className="mt-1 text-xs">This client may only exist in the merged list view.</p>
              </>
            ) : (
              <p>Select a client to view their profile.</p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2 text-center">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="font-semibold text-slate-700">{value}</p>
    </div>
  )
}
