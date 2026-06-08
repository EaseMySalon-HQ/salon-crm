"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/use-toast"
import { BranchManagementAPI } from "@/lib/api"
import { STALE_TIME } from "@/lib/queries/staleness"

export function OrgSettingsPanel() {
  const queryClient = useQueryClient()
  const [enabled, setEnabled] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["branch-management", "org-settings"],
    queryFn: async () => {
      const res = await BranchManagementAPI.getOrgSettings()
      if (!res.success) throw new Error(res.error || "Failed to load settings")
      return res.data
    },
    staleTime: STALE_TIME.businessSettings,
  })

  useEffect(() => {
    if (data) setEnabled(data.shareClientsAcrossBranches)
  }, [data])

  const save = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await BranchManagementAPI.updateOrgSettings({
        shareClientsAcrossBranches: next,
      })
      if (!res.success) throw new Error(res.error || res.message || "Couldn't save")
      return res.data
    },
    onSuccess: (_data, next) => {
      setEnabled(next)
      queryClient.invalidateQueries({ queryKey: ["branch-management", "org-settings"] })
      toast({
        title: next ? "Shared clients enabled" : "Shared clients disabled",
        description: next
          ? "Client profiles from any branch can be found at every location."
          : "Each branch now only shows its own clients in search and checkout.",
      })
    },
    onError: (err: Error, next) => {
      setEnabled(!next)
      toast({ title: "Couldn't save setting", description: err.message, variant: "destructive" })
    },
  })

  const handleToggle = (next: boolean) => {
    setEnabled(next)
    save.mutate(next)
  }

  if (isLoading) return <Skeleton className="h-36 w-full rounded-xl" />

  return (
    <Card className="border-slate-200/80 shadow-sm">
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
          <Users className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <CardTitle className="text-base font-semibold text-slate-800">Shared client profiles</CardTitle>
          <p className="text-sm text-slate-500">
          When on, clients added at one branch appear in search and Quick Sale at all your branches, including
          bills and appointment notes from other locations. Visit counts and revenue totals include all branches;
          unpaid dues are collected only for the current branch.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          <Switch
            checked={enabled}
            disabled={save.isPending}
            onCheckedChange={handleToggle}
            aria-label="Share client profiles across branches"
          />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-slate-500">
          {enabled
            ? "Staff can look up any client by phone or name across locations. A profile is created at the current branch the first time they are selected."
            : "Turn this on to let every branch access the same client directory without re-importing contacts."}
        </p>
      </CardContent>
    </Card>
  )
}
