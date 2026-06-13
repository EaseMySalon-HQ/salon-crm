"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useQueries, useQuery } from "@tanstack/react-query"
import { BranchManagementAPI } from "@/lib/api"
import { BranchPillFilter } from "@/components/branch-management/branch-pill-filter"
import { BranchServicesPanel } from "@/components/branch-management/branch-services-panel"
import { PageSkeleton } from "@/components/loading"
import { CopyServicesDialog } from "@/components/branch-management/copy-services-dialog"
import {
  ServicesMatrixTable,
  buildServicesMatrix,
} from "@/components/branch-management/services-matrix-table"
import { STALE_TIME } from "@/lib/queries/staleness"

function BranchServicesContent() {
  const searchParams = useSearchParams()
  const [branchFilter, setBranchFilter] = useState<string | null>(null)
  const servicesDirtyRef = useRef(false)

  const { data: branchData, isLoading: branchesLoading } = useQuery({
    queryKey: ["branch-management", "branches"],
    queryFn: async () => {
      const res = await BranchManagementAPI.getBranches()
      if (!res.success) throw new Error(res.error || "Failed to load branches")
      return res.data
    },
    staleTime: STALE_TIME.businessSettings,
  })

  const activeBranches = useMemo(
    () => (branchData?.branches ?? []).filter((b) => b.isActive),
    [branchData?.branches]
  )

  const branchOptions = useMemo(
    () => activeBranches.map((b) => ({ branchId: b.id, branchName: b.name })),
    [activeBranches]
  )

  // Default to URL branch or current branch — not "All branches" — so the editor is visible immediately.
  useEffect(() => {
    if (activeBranches.length === 0) return

    const fromUrl = searchParams.get("branch")
    if (fromUrl && activeBranches.some((b) => b.id === fromUrl)) {
      setBranchFilter(fromUrl)
      return
    }

    setBranchFilter((prev) => {
      if (prev !== null) return prev
      const pick = activeBranches.find((b) => b.isCurrent) ?? activeBranches[0]
      return pick.id
    })
  }, [activeBranches, searchParams])

  const pillValue = branchFilter ?? (activeBranches[0]?.id ?? "all")
  const isCompareMode = pillValue === "all"

  const serviceQueries = useQueries({
    queries: activeBranches.map((b) => ({
      queryKey: ["branch-management", "branch-services", b.id],
      queryFn: async () => {
        const res = await BranchManagementAPI.getBranchServices(b.id)
        if (!res.success) throw new Error(res.error || "Failed to load services")
        return res.data.services
      },
      staleTime: STALE_TIME.businessSettings,
    })),
  })

  const servicesByBranch = useMemo(() => {
    const map: Record<string, (typeof serviceQueries)[number]["data"]> = {}
    activeBranches.forEach((b, i) => {
      map[b.id] = serviceQueries[i]?.data
    })
    return map
  }, [activeBranches, serviceQueries])

  const matrixLoading = branchesLoading || serviceQueries.some((q) => q.isLoading)

  const visibleBranches = useMemo(
    () =>
      isCompareMode ? branchOptions : branchOptions.filter((b) => b.branchId === pillValue),
    [branchOptions, isCompareMode, pillValue]
  )

  const matrixRows = useMemo(
    () => buildServicesMatrix(branchOptions, servicesByBranch),
    [branchOptions, servicesByBranch]
  )

  const selectedBranchName = branchOptions.find((b) => b.branchId === pillValue)?.branchName

  const handleBranchChange = (next: string) => {
    if (next === pillValue) return
    if (servicesDirtyRef.current && !window.confirm("Discard unsaved service overrides?")) {
      return
    }
    servicesDirtyRef.current = false
    setBranchFilter(next)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-800">Services</h2>
        <p className="text-sm text-slate-500">
          {isCompareMode
            ? "Compare pricing across branches. Select a branch pill to edit prices, duration, and availability."
            : "Edit price, duration, and enabled status for the selected branch, then save."}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <BranchPillFilter branches={branchOptions} value={pillValue} onChange={handleBranchChange} />
        {!isCompareMode && (
          <CopyServicesDialog
            targetBranchId={pillValue}
            targetBranchName={selectedBranchName}
            branches={branchOptions}
            disabled={branchOptions.length < 2}
          />
        )}
      </div>

      {isCompareMode ? (
        <ServicesMatrixTable branches={visibleBranches} rows={matrixRows} isLoading={matrixLoading} />
      ) : (
        <BranchServicesPanel
          key={pillValue}
          branchId={pillValue}
          branchName={selectedBranchName}
          onDirtyChange={(d) => {
            servicesDirtyRef.current = d
          }}
        />
      )}

      {!isCompareMode && (
        <details className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">
            Compare all branches
          </summary>
          <div className="border-t border-slate-100 p-4 pt-2">
            <ServicesMatrixTable branches={branchOptions} rows={matrixRows} isLoading={matrixLoading} />
          </div>
        </details>
      )}
    </div>
  )
}

export default function BranchServicesPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <BranchServicesContent />
    </Suspense>
  )
}
