"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Copy, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import { BranchManagementAPI } from "@/lib/api"

const modalSelectContentClass = "!z-[10000]"

type BranchOption = { branchId: string; branchName: string }

export function CopyServicesDialog({
  targetBranchId,
  targetBranchName,
  branches,
  disabled,
}: {
  targetBranchId: string
  targetBranchName?: string
  branches: BranchOption[]
  disabled?: boolean
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [sourceBranchId, setSourceBranchId] = useState("")
  const [includeCatalog, setIncludeCatalog] = useState(true)
  const [includeOverrides, setIncludeOverrides] = useState(true)
  const [updateExisting, setUpdateExisting] = useState(false)

  const sourceOptions = branches.filter((b) => b.branchId !== targetBranchId)

  const copy = useMutation({
    mutationFn: async () => {
      if (!sourceBranchId) throw new Error("Select a source branch")
      if (!includeCatalog && !includeOverrides) {
        throw new Error("Select at least catalog or pricing overrides")
      }
      const res = await BranchManagementAPI.copyBranchServices(targetBranchId, {
        sourceBranchId,
        includeCatalog,
        includeOverrides,
        onConflict: updateExisting ? "update" : "skip",
      })
      if (!res.success) throw new Error(res.error || "Copy failed")
      return res.data
    },
    onSuccess: (data) => {
      const parts = [
        data.created ? `${data.created} created` : null,
        data.updated ? `${data.updated} updated` : null,
        data.skipped ? `${data.skipped} skipped` : null,
        data.overridesCopied ? `${data.overridesCopied} pricing overrides` : null,
      ].filter(Boolean)

      toast({
        title: "Services copied",
        description: parts.length ? parts.join(" · ") : "Copy completed.",
      })

      if (data.warnings?.length) {
        toast({
          title: `${data.warnings.length} bundle(s) skipped`,
          description: data.warnings.map((w) => w.name).join(", "),
          variant: "destructive",
        })
      }

      queryClient.invalidateQueries({ queryKey: ["branch-management", "branch-services"] })
      setOpen(false)
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't copy services", description: err.message, variant: "destructive" })
    },
  })

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setSourceBranchId((prev) => prev || sourceOptions[0]?.branchId || "")
    }
  }

  const destLabel = targetBranchName || "this branch"

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2" disabled={disabled || sourceOptions.length === 0}>
          <Copy className="h-4 w-4" />
          Copy from branch
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copy services to {destLabel}</DialogTitle>
          <DialogDescription>
            Duplicate the service menu and branch pricing from another location. Existing services with the same
            name are skipped unless you choose to update them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Copy from</Label>
            <Select value={sourceBranchId} onValueChange={setSourceBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="Select source branch" />
              </SelectTrigger>
              <SelectContent className={modalSelectContentClass}>
                {sourceOptions.map((b) => (
                  <SelectItem key={b.branchId} value={b.branchId}>
                    {b.branchName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <label className="flex cursor-pointer items-start gap-2">
              <Checkbox checked={includeCatalog} onCheckedChange={(v) => setIncludeCatalog(v === true)} />
              <span className="text-sm leading-snug text-slate-700">
                <span className="font-medium">Service catalog</span>
                <span className="block text-xs text-slate-500">Names, categories, durations, bundles, and base prices</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2">
              <Checkbox checked={includeOverrides} onCheckedChange={(v) => setIncludeOverrides(v === true)} />
              <span className="text-sm leading-snug text-slate-700">
                <span className="font-medium">Branch pricing overrides</span>
                <span className="block text-xs text-slate-500">Per-branch prices, durations, and enabled toggles</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2">
              <Checkbox checked={updateExisting} onCheckedChange={(v) => setUpdateExisting(v === true)} />
              <span className="text-sm leading-snug text-slate-700">
                <span className="font-medium">Update matching services</span>
                <span className="block text-xs text-slate-500">
                  Overwrite services that already exist at {destLabel} (same name or SKU)
                </span>
              </span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={copy.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => copy.mutate()}
            disabled={copy.isPending || !sourceBranchId || (!includeCatalog && !includeOverrides)}
            className="gap-2"
          >
            {copy.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Copy services
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
