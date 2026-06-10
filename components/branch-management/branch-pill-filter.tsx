"use client"

import { getBranchColor } from "@/lib/branch-color"
import { cn } from "@/lib/utils"

type BranchOption = { branchId: string; branchName: string }

/** Pill-style "All branches + per-branch" filter shared across branch-management tabs. */
export function BranchPillFilter({
  branches,
  value,
  onChange,
}: {
  branches: BranchOption[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange("all")}
        className={cn(
          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
          value === "all"
            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
        )}
      >
        All branches
      </button>
      {branches.map((b) => {
        const active = value === b.branchId
        return (
          <button
            key={b.branchId}
            type="button"
            onClick={() => onChange(b.branchId)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            )}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getBranchColor(b.branchId) }} />
            {b.branchName}
          </button>
        )
      })}
    </div>
  )
}
