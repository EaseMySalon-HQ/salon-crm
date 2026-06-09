"use client"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import type { BranchClientListRow } from "@/lib/api"
import { getBranchColor } from "@/lib/branch-color"
import { formatINR, formatNumber } from "./branch-format"

const SEGMENT_STYLES: Record<string, string> = {
  new: "border-blue-200 bg-blue-50 text-blue-700",
  returning: "border-emerald-200 bg-emerald-50 text-emerald-700",
  vip: "border-amber-200 bg-amber-50 text-amber-800",
  at_risk: "border-red-200 bg-red-50 text-red-700",
}

export function ClientsTable({
  clients,
  isLoading,
  branchNames,
  onRowClick,
}: {
  clients: BranchClientListRow[]
  isLoading: boolean
  branchNames: Map<string, string>
  onRowClick?: (row: BranchClientListRow) => void
}) {
  if (isLoading) {
    return <Skeleton className="h-96 w-full rounded-xl" />
  }

  if (clients.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-12 text-center text-sm text-slate-500">
        No clients match your filters.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Client</TableHead>
            <TableHead>Home branch</TableHead>
            <TableHead>Segment</TableHead>
            <TableHead className="text-right">Visits</TableHead>
            <TableHead className="text-right">Spent</TableHead>
            <TableHead>Badges</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((c) => {
            const homeName = c.homeBranchId ? branchNames.get(c.homeBranchId) ?? "—" : "—"
            return (
              <TableRow
                key={c.phone}
                className={onRowClick ? "cursor-pointer" : undefined}
                onClick={() => onRowClick?.(c)}
              >
                <TableCell>
                  <div>
                    <p className="font-medium text-slate-800">{c.name || "Unknown"}</p>
                    <p className="text-xs text-slate-400">{c.phone}</p>
                  </div>
                </TableCell>
                <TableCell>
                  {c.homeBranchId ? (
                    <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: getBranchColor(c.homeBranchId) }}
                      />
                      {homeName}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={SEGMENT_STYLES[c.segment] ?? ""}>
                    {c.segment.replace("_", " ")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(c.totalVisits)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(c.totalSpent)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {c.homeBranchId && (
                      <Badge variant="outline" className="text-[10px]">
                        Home
                      </Badge>
                    )}
                    {c.allowCrossBranchBooking && (
                      <Badge variant="outline" className="border-violet-200 bg-violet-50 text-[10px] text-violet-700">
                        Cross-branch
                      </Badge>
                    )}
                    {c.branches.length > 1 && (
                      <Badge variant="outline" className="text-[10px]">
                        {c.branches.length} branches
                      </Badge>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
