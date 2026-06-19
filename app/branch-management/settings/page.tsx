"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ExternalLink } from "lucide-react"
import { BranchManagementAPI } from "@/lib/api"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BranchesTable } from "@/components/branch-management/branches-table"
import { BranchConfigPanel } from "@/components/branch-management/branch-config-panel"
import { OrgSettingsPanel } from "@/components/branch-management/org-settings-panel"
import { STALE_TIME } from "@/lib/queries/staleness"

export default function BranchSettingsPage() {
  const queryClient = useQueryClient()
  const [selectedBranch, setSelectedBranch] = useState<string>("")
  const dirtyRef = useRef(false)

  const { data, isLoading } = useQuery({
    queryKey: ["branch-management", "branches"],
    queryFn: async () => {
      const res = await BranchManagementAPI.getBranches()
      if (!res.success) throw new Error(res.error || "Failed to load branches")
      return res.data
    },
    staleTime: STALE_TIME.businessSettings,
  })

  const branches = data?.branches ?? []
  const activeBranches = branches.filter((b) => b.isActive)

  // Default the configuration selector to the current branch once loaded.
  useEffect(() => {
    if (!selectedBranch && activeBranches.length > 0) {
      const current = activeBranches.find((b) => b.isCurrent) ?? activeBranches[0]
      setSelectedBranch(current.id)
    }
  }, [activeBranches, selectedBranch])

  // One refetch fans out to every branch-aware surface (switcher, sidebar gate, etc.).
  const refreshEverything = () => {
    queryClient.invalidateQueries({ queryKey: ["branch-management", "branches"] })
    queryClient.invalidateQueries({ queryKey: ["auth", "my-branches"] })
    queryClient.invalidateQueries({ queryKey: ["branch-management", "summary"] })
  }

  const handleSelectChange = (next: string) => {
    if (next === selectedBranch) return
    if (dirtyRef.current && !window.confirm("Discard unsaved changes to this branch?")) {
      return
    }
    dirtyRef.current = false
    setSelectedBranch(next)
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Organization</h2>
          <p className="text-sm text-slate-500">Settings that apply to all branches in your account.</p>
        </div>
        <OrgSettingsPanel />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Branch configuration</h2>
            <p className="text-sm text-slate-500">
              Edit branch details, revenue targets, and operating hours for one branch at a time.
            </p>
          </div>
          <Select value={selectedBranch} onValueChange={handleSelectChange} disabled={activeBranches.length === 0}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Select a branch" />
            </SelectTrigger>
            <SelectContent>
              {activeBranches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedBranch ? (
          <div className="space-y-6">
            <BranchConfigPanel
              key={selectedBranch}
              branchId={selectedBranch}
              onDirtyChange={(d) => {
                dirtyRef.current = d
              }}
              onSaved={refreshEverything}
            />
            <p className="text-sm text-slate-500">
              Per-branch service pricing and availability live in the{" "}
              <Link
                href={`/branch-management/services?branch=${selectedBranch}`}
                className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
              >
                Services section
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              .
            </p>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed bg-slate-50/60 px-4 py-12 text-center text-sm text-slate-500">
            Select a branch to edit its settings.
          </p>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">All branches</h2>
          <p className="text-sm text-slate-500">Activate or deactivate branches, or switch into one.</p>
        </div>

        <BranchesTable branches={branches} isLoading={isLoading} onChanged={refreshEverything} />
      </section>
    </div>
  )
}
