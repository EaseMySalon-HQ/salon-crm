"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { getBranchColor } from "@/lib/branch-color"
import { formatINR } from "./branch-format"
import type { BranchServiceRow } from "@/lib/api"

type BranchCol = { branchId: string; branchName: string }

export type ServicesMatrixRow = {
  key: string
  name: string
  sku: string
  category: string
  branches: Record<
    string,
    { price: number; durationMinutes: number; enabled: boolean; hasOverride?: boolean }
  >
}

export function buildServicesMatrix(
  branches: BranchCol[],
  servicesByBranch: Record<string, BranchServiceRow[] | undefined>
): ServicesMatrixRow[] {
  const rowMap = new Map<string, ServicesMatrixRow>()

  for (const branch of branches) {
    const services = servicesByBranch[branch.branchId] ?? []
    for (const s of services) {
      let row = rowMap.get(s.key)
      if (!row) {
        row = {
          key: s.key,
          name: s.name,
          sku: s.sku,
          category: s.category,
          branches: {},
        }
        rowMap.set(s.key, row)
      }
      row.branches[branch.branchId] = {
        price: s.price,
        durationMinutes: s.durationMinutes,
        enabled: s.enabled,
        hasOverride: s.hasOverride,
      }
    }
  }

  return Array.from(rowMap.values()).sort((a, b) => a.name.localeCompare(b.name))
}

export function ServicesMatrixTable({
  branches,
  rows,
  isLoading,
}: {
  branches: BranchCol[]
  rows: ServicesMatrixRow[]
  isLoading: boolean
}) {
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
    )
  }, [rows, search])

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search services…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        <p className="text-xs text-slate-500">{filtered.length} services</p>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 z-10 min-w-[180px] bg-white">Service</TableHead>
              <TableHead className="min-w-[100px]">Category</TableHead>
              {branches.map((b) => (
                <TableHead key={b.branchId} className="min-w-[140px] text-center">
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: getBranchColor(b.branchId) }}
                    />
                    {b.branchName}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2 + branches.length} className="py-10 text-center text-sm text-slate-500">
                  No services match your search.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="sticky left-0 z-10 bg-white">
                    <p className="font-medium text-slate-800">{row.name}</p>
                    {row.sku && <p className="text-xs text-slate-400">{row.sku}</p>}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{row.category || "—"}</TableCell>
                  {branches.map((b) => {
                    const cell = row.branches[b.branchId]
                    if (!cell) {
                      return (
                        <TableCell key={b.branchId} className="text-center text-sm text-slate-300">
                          —
                        </TableCell>
                      )
                    }
                    return (
                      <TableCell key={b.branchId} className="text-center">
                        <div
                          className={cn(
                            "inline-flex flex-col rounded-md px-2 py-1 text-xs",
                            cell.enabled ? "bg-slate-50 text-slate-700" : "bg-slate-100 text-slate-400"
                          )}
                        >
                          <span className="font-medium">{formatINR(cell.price)}</span>
                          <span>{cell.durationMinutes} min</span>
                          {!cell.enabled && <span className="text-[10px] uppercase tracking-wide">Off</span>}
                          {cell.hasOverride && (
                            <span className="text-[10px] font-medium text-indigo-600">Override</span>
                          )}
                        </div>
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
