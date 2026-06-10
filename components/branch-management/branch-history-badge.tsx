"use client"

import { Badge } from "@/components/ui/badge"
import { getBranchColor } from "@/lib/branch-color"

/** Shown on bills/notes from another branch when shared client history is enabled. */
export function BranchHistoryBadge({
  branchId,
  branchName,
  isCurrentBranch,
}: {
  branchId?: string
  branchName?: string
  isCurrentBranch?: boolean
}) {
  if (isCurrentBranch !== false || !branchName) return null
  return (
    <Badge
      variant="outline"
      className="gap-1 border-slate-200 bg-white px-1.5 py-0 text-[10px] font-normal text-slate-600"
    >
      {branchId ? (
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: getBranchColor(branchId) }}
        />
      ) : null}
      {branchName}
    </Badge>
  )
}
