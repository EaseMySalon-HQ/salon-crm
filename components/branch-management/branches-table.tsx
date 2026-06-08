"use client"

import { useState } from "react"
import { Building2, Check, Loader2, Power, PowerOff, ArrowRightLeft } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/use-toast"
import { BranchManagementAPI, type BranchListItem } from "@/lib/api"
import { switchToBranch } from "@/components/branch-switcher/branch-switcher"
import { getBranchColor } from "@/lib/branch-color"
import { formatDate } from "./branch-format"

export function BranchesTable({
  branches,
  isLoading,
  onChanged,
}: {
  branches: BranchListItem[]
  isLoading: boolean
  onChanged: () => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)

  const handleToggle = async (b: BranchListItem) => {
    if (busyId) return
    if (b.isActive && b.isCurrent) {
      toast({
        title: "Switch branches first",
        description: "You can't deactivate the branch you're currently using. Switch to another branch, then deactivate this one.",
        variant: "destructive",
      })
      return
    }
    setBusyId(b.id)
    try {
      const res = await BranchManagementAPI.setBranchStatus(b.id, !b.isActive)
      if (!res.success) {
        toast({ title: "Couldn't update branch", description: res.message || res.error || "Try again.", variant: "destructive" })
        return
      }
      toast({ title: res.data.branch.isActive ? "Branch reactivated" : "Branch deactivated", description: res.data.branch.name })
      onChanged()
    } catch (err: any) {
      toast({
        title: "Couldn't update branch",
        description: err?.response?.data?.message || err?.response?.data?.error || err?.message || "Try again.",
        variant: "destructive",
      })
    } finally {
      setBusyId(null)
    }
  }

  const handleSwitch = async (b: BranchListItem) => {
    if (busyId || b.isCurrent) return
    setBusyId(b.id)
    const ok = await switchToBranch(b.id)
    if (!ok) {
      setBusyId(null)
      toast({ title: "Couldn't switch branch", variant: "destructive" })
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Branch</TableHead>
            <TableHead>City</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Manager</TableHead>
            <TableHead>Date Added</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            [0, 1, 2].map((i) => (
              <TableRow key={i}>
                {[0, 1, 2, 3, 4, 5].map((j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : branches.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">
                No branches yet.
              </TableCell>
            </TableRow>
          ) : (
            branches.map((b) => (
              <TableRow key={b.id} className={b.isActive ? "" : "bg-slate-50/60 text-slate-400"}>
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white"
                      style={{ backgroundColor: b.isActive ? getBranchColor(b.id) : "#cbd5e1" }}
                    >
                      <Building2 className="h-3.5 w-3.5" />
                    </span>
                    <span className="font-medium text-slate-800">
                      {b.name}
                      {b.isCurrent && (
                        <Badge variant="outline" className="ml-2 border-indigo-200 bg-indigo-50 text-indigo-700">
                          Current
                        </Badge>
                      )}
                    </span>
                  </span>
                </TableCell>
                <TableCell>{b.city || "—"}</TableCell>
                <TableCell>
                  {b.isActive ? (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Active</Badge>
                  ) : (
                    <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-500">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell>{b.managerName || "—"}</TableCell>
                <TableCell>{formatDate(b.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {b.isActive && !b.isCurrent && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={busyId === b.id}
                        onClick={() => handleSwitch(b)}
                      >
                        {busyId === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
                        Switch
                      </Button>
                    )}
                    {b.isCurrent && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600">
                        <Check className="h-3.5 w-3.5" /> In use
                      </span>
                    )}
                    <Button
                      variant={b.isActive ? "outline" : "default"}
                      size="sm"
                      className="gap-1.5"
                      disabled={busyId === b.id || (b.isActive && b.isCurrent)}
                      onClick={() => handleToggle(b)}
                    >
                      {busyId === b.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : b.isActive ? (
                        <PowerOff className="h-3.5 w-3.5" />
                      ) : (
                        <Power className="h-3.5 w-3.5" />
                      )}
                      {b.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
