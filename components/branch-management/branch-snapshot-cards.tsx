"use client"

import Link from "next/link"
import { useMemo } from "react"
import { ArrowRight, Building2, MapPin } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { BranchSummaryRow } from "@/lib/api"
import { getBranchColor } from "@/lib/branch-color"
import { formatINR, formatNumber } from "./branch-format"

function StatusBadge({ status }: { status: string }) {
  const active = status === "active"
  return (
    <Badge
      variant="outline"
      className={
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-300 bg-slate-100 text-slate-500"
      }
    >
      {active ? "Active" : "Inactive"}
    </Badge>
  )
}

export function BranchSnapshotCards({
  branches,
  isLoading,
  selectedBranchId,
  onSelect,
  variant = "grid",
}: {
  branches: BranchSummaryRow[]
  isLoading: boolean
  selectedBranchId?: string
  onSelect?: (branchId: string) => void
  variant?: "grid" | "sidebar"
}) {
  const sorted = useMemo(
    () => [...branches].sort((a, b) => b.revenue - a.revenue),
    [branches]
  )

  if (isLoading) {
    if (variant === "sidebar") {
      return (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      )
    }
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-48 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (variant === "sidebar") {
    return (
      <div className="space-y-2">
        {sorted.map((b) => {
          const color = getBranchColor(b.branchId)
          const isSelected = selectedBranchId === b.branchId
          return (
            <button
              key={b.branchId}
              type="button"
              onClick={onSelect ? () => onSelect(isSelected ? "all" : b.branchId) : undefined}
              className={cn(
                "w-full rounded-lg border text-left transition-all",
                isSelected
                  ? "border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-200"
                  : "border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-sm"
              )}
            >
              <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white"
                  style={{ backgroundColor: color }}
                >
                  <Building2 className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{b.branchName}</p>
                  {b.city && (
                    <p className="flex items-center gap-1 truncate text-[11px] text-slate-400">
                      <MapPin className="h-3 w-3 shrink-0" /> {b.city}
                    </p>
                  )}
                </div>
                <StatusBadge status={b.status} />
              </div>
              {b.error ? (
                <p className="px-3 py-2 text-xs text-amber-700">Couldn&apos;t load this branch.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2 px-3 py-2.5">
                  <MiniStat label="Revenue" value={formatINR(b.revenue)} />
                  <MiniStat label="Appts" value={formatNumber(b.appointments)} />
                  <MiniStat label="Ticket" value={formatINR(b.avgTicketSize)} />
                  <MiniStat label="Clients" value={formatNumber(b.clients)} />
                </div>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {sorted.map((b) => {
        const color = getBranchColor(b.branchId)
        const isSelected = selectedBranchId === b.branchId
        return (
          <Card
            key={b.branchId}
            className={cn(
              "overflow-hidden border-slate-200/80 shadow-sm transition-shadow",
              onSelect && "cursor-pointer hover:shadow-md",
              isSelected && "ring-2 ring-indigo-400"
            )}
            onClick={onSelect ? () => onSelect(isSelected ? "all" : b.branchId) : undefined}
          >
            <div className="h-1.5 w-full" style={{ backgroundColor: color }} />
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
                  style={{ backgroundColor: color }}
                >
                  <Building2 className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <span className="block truncate text-base font-semibold text-slate-900">{b.branchName}</span>
                  {b.city && (
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <MapPin className="h-3 w-3" /> {b.city}
                    </span>
                  )}
                </div>
              </div>
              <StatusBadge status={b.status} />
            </CardHeader>
            <CardContent className="space-y-3">
              {b.error ? (
                <p className="text-sm text-amber-700">Couldn&apos;t load this branch.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Metric label="Revenue" value={formatINR(b.revenue)} />
                    <Metric label="Appointments" value={formatNumber(b.appointments)} />
                    <Metric label="Avg Ticket" value={formatINR(b.avgTicketSize)} />
                    <Metric label="Clients" value={formatNumber(b.clients)} />
                  </div>
                  <div className="flex flex-wrap gap-3 pt-1 text-xs">
                    <Link
                      href={`/branch-management/staff?branch=${b.branchId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      Staff <ArrowRight className="h-3 w-3" />
                    </Link>
                    <Link
                      href={`/branch-management/inventory?branch=${b.branchId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      Inventory <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] text-slate-400">{label}</p>
      <p className="truncate text-xs font-semibold text-slate-800">{value}</p>
    </div>
  )
}
