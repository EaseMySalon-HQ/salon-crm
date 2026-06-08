"use client"

import { useState } from "react"
import { Building2, Phone, Mail, CalendarClock, CreditCard, Home } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { BranchClientMatch } from "@/lib/api"
import { getBranchColor } from "@/lib/branch-color"
import { formatINR, formatNumber, formatDate } from "./branch-format"
import { ClientProfileDrawer } from "./client-profile-drawer"

export function ClientSearchResults({
  matches,
  homeBranchId,
  isLoading,
  hasSearched,
}: {
  matches: BranchClientMatch[]
  homeBranchId: string | null
  isLoading: boolean
  hasSearched: boolean
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (!hasSearched) {
    return (
      <div className="rounded-xl border border-dashed bg-slate-50/60 px-4 py-16 text-center text-sm text-slate-500">
        Search a phone number to see a client&apos;s history across all branches.
      </div>
    )
  }

  const found = matches.filter((m) => m.found)

  if (found.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-slate-50/60 px-4 py-16 text-center text-sm text-slate-500">
        No client found with this phone number in any branch.
      </div>
    )
  }

  // Use the first match for the shared profile header (same person across branches).
  const profile = found[0].client!

  return (
    <div className="space-y-4">
      <Card className="border-slate-200/80 shadow-sm">
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 p-5">
          <div>
            <p className="text-lg font-semibold text-slate-900">{profile.name}</p>
            <p className="flex items-center gap-1.5 text-sm text-slate-500">
              <Phone className="h-3.5 w-3.5" /> {profile.phone}
            </p>
          </div>
          {profile.email && (
            <p className="flex items-center gap-1.5 text-sm text-slate-500">
              <Mail className="h-3.5 w-3.5" /> {profile.email}
            </p>
          )}
          <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">
            Visited {found.length} {found.length === 1 ? "branch" : "branches"}
          </Badge>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setDrawerOpen(true)}>
            View full profile
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {found.map((m) => {
          const c = m.client!
          const color = getBranchColor(m.branchId)
          const isHome = m.branchId === homeBranchId
          return (
            <Card key={m.branchId} className="overflow-hidden border-slate-200/80 shadow-sm">
              <div className="h-1.5 w-full" style={{ backgroundColor: color }} />
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
                  style={{ backgroundColor: color }}
                >
                  <Building2 className="h-4 w-4" />
                </span>
                <span className="truncate text-base font-semibold text-slate-900">{m.branchName}</span>
                {isHome && (
                  <Badge variant="outline" className="ml-auto border-indigo-200 bg-indigo-50 text-indigo-700">
                    <Home className="mr-1 h-3 w-3" /> Home
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Visits</p>
                    <p className="font-semibold text-slate-900">{formatNumber(c.totalVisits)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Total Spend</p>
                    <p className="font-semibold text-slate-900">{formatINR(c.totalSpent)}</p>
                  </div>
                  <div>
                    <p className="flex items-center gap-1 text-xs text-slate-500">
                      <CalendarClock className="h-3 w-3" /> Last Visit
                    </p>
                    <p className="font-semibold text-slate-900">{formatDate(c.lastVisit)}</p>
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <CreditCard className="h-3.5 w-3.5" /> Active Memberships
                  </p>
                  {m.memberships.length === 0 ? (
                    <p className="text-sm text-slate-400">None</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {m.memberships.map((mem) => (
                        <li
                          key={mem.id}
                          className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-slate-800">{mem.planName}</span>
                            <span className="block text-xs text-slate-400">
                              From {m.branchName}
                              {mem.expiryDate ? ` · expires ${formatDate(mem.expiryDate)}` : " · no expiry"}
                            </span>
                          </span>
                          {mem.remainingSessions != null && (
                            <Badge variant="outline" className="shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700">
                              {mem.remainingSessions} left
                            </Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <ClientProfileDrawer
        matches={matches}
        homeBranchId={homeBranchId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  )
}
