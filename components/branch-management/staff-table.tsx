"use client"

import { useMemo, useState } from "react"
import { ArrowUpDown } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import type { BranchStaffGroup } from "@/lib/api"
import { getBranchColor } from "@/lib/branch-color"
import { formatINR, formatNumber, initials } from "./branch-format"
import { StaffProfileDrawer, type StaffProfile } from "./staff-profile-drawer"

type Row = StaffProfile

type SortKey = "name" | "role" | "branchName" | "servicesDone" | "revenue" | "utilizationPct"

function roleLabel(role: string): string {
  if (!role) return "Staff"
  return role.charAt(0).toUpperCase() + role.slice(1)
}

export function StaffTable({
  branches,
  isLoading,
  branchFilter,
  rangeLabel = "This Month",
  includeInactive = true,
}: {
  branches: BranchStaffGroup[]
  isLoading: boolean
  branchFilter: string
  rangeLabel?: string
  includeInactive?: boolean
}) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [selected, setSelected] = useState<StaffProfile | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const rows = useMemo<Row[]>(() => {
    const all: Row[] = []
    for (const group of branches) {
      if (branchFilter !== "all" && group.branchId !== branchFilter) continue
      for (const s of group.staff) {
        if (!includeInactive && !s.isActive) continue
        all.push({
          branchId: group.branchId,
          branchName: group.branchName,
          staffId: s.id,
          name: s.name,
          role: s.role,
          isActive: s.isActive,
          avatar: s.avatar,
          servicesDone: s.servicesDone,
          revenue: s.revenue,
          utilizationPct: s.utilizationPct ?? s.attendancePct ?? 0,
        })
      }
    }
    all.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      let cmp: number
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv
      else cmp = String(av).localeCompare(String(bv))
      return sortDir === "asc" ? cmp : -cmp
    })
    return all
  }, [branches, branchFilter, sortKey, sortDir, includeInactive])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "name" || key === "role" || key === "branchName" ? "asc" : "desc")
    }
  }

  const openProfile = (row: Row) => {
    setSelected(row)
    setDrawerOpen(true)
  }

  const SortHead = ({ label, k, numeric }: { label: string; k: SortKey; numeric?: boolean }) => (
    <TableHead className={numeric ? "text-right" : ""}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 font-medium hover:text-slate-900 ${
          numeric ? "flex-row-reverse" : ""
        } ${sortKey === k ? "text-indigo-700" : "text-slate-600"}`}
      >
        {label}
        <ArrowUpDown className="h-3.5 w-3.5" />
      </button>
    </TableHead>
  )

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <SortHead label="Staff" k="name" />
              <SortHead label="Role" k="role" />
              <TableHead>Status</TableHead>
              <SortHead label="Branch" k="branchName" />
              <SortHead label="Services" k="servicesDone" numeric />
              <SortHead label="Revenue" k="revenue" numeric />
              <SortHead label="Utilization %" k="utilizationPct" numeric />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [0, 1, 2, 3].map((i) => (
                <TableRow key={i}>
                  {[0, 1, 2, 3, 4, 5, 6].map((j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  No staff found for this selection.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow
                  key={`${r.branchId}-${r.staffId}`}
                  className="cursor-pointer"
                  onClick={() => openProfile(r)}
                >
                  <TableCell>
                    <span className="inline-flex items-center gap-2.5">
                      <Avatar className="h-8 w-8">
                        {r.avatar && <AvatarImage src={r.avatar} alt={r.name} />}
                        <AvatarFallback
                          className="text-xs font-semibold text-white"
                          style={{ backgroundColor: getBranchColor(r.branchId) }}
                        >
                          {initials(r.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-slate-800">{r.name}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-600">{roleLabel(r.role)}</TableCell>
                  <TableCell>
                    {r.isActive ? (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-500">
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: getBranchColor(r.branchId) }}
                      />
                      {r.branchName}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.servicesDone)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(r.revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.utilizationPct}%</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <StaffProfileDrawer staff={selected} open={drawerOpen} onOpenChange={setDrawerOpen} rangeLabel={rangeLabel} />
    </>
  )
}
