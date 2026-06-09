"use client"

import { AlertTriangle } from "lucide-react"

type BranchErrorRow = { branchId: string; branchName: string; error?: string | null }

/**
 * Renders a discreet amber pill listing branches whose fan-out query failed, so a
 * single bad branch never blocks the rest of the data from rendering.
 */
export function BranchErrorNote({ rows }: { rows: BranchErrorRow[] }) {
  const failed = rows.filter((r) => r.error)
  if (failed.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
      <span className="font-medium">Some branches couldn&apos;t be loaded:</span>
      {failed.map((r) => (
        <span
          key={r.branchId}
          className="rounded-md border border-amber-300 bg-white/70 px-2 py-0.5 text-xs font-medium"
        >
          {r.branchName}
        </span>
      ))}
    </div>
  )
}
