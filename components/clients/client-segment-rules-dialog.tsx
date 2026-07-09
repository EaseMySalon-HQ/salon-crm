"use client"

import { useEffect, useState } from "react"
import { Loader2, Settings2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { ClientSegmentRulesAPI } from "@/lib/api"
import {
  DEFAULT_CLIENT_SEGMENT_RULES,
  mergeClientSegmentRules,
  validateClientSegmentRules,
  type ClientSegmentRules,
} from "@/lib/client-segments"

interface ClientSegmentRulesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rules: ClientSegmentRules
  onSaved: (rules: ClientSegmentRules) => void
  canEdit: boolean
}

export function ClientSegmentRulesDialog({
  open,
  onOpenChange,
  rules,
  onSaved,
  canEdit,
}: ClientSegmentRulesDialogProps) {
  const { toast } = useToast()
  const [draft, setDraft] = useState<ClientSegmentRules>(rules)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setDraft(mergeClientSegmentRules(rules))
  }, [open, rules])

  const updateField = (field: keyof ClientSegmentRules, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }))
  }

  const handleReset = () => {
    setDraft({ ...DEFAULT_CLIENT_SEGMENT_RULES })
  }

  const handleSave = async () => {
    const parsed: ClientSegmentRules = {
      newMaxVisits: Number(draft.newMaxVisits),
      vipSpendThreshold: Number(draft.vipSpendThreshold),
      atRiskAfterDays: Number(draft.atRiskAfterDays),
      winBackAfterDays: Number(draft.winBackAfterDays),
    }
    const validation = validateClientSegmentRules(parsed)
    if (!validation.valid) {
      toast({
        title: "Invalid segment rules",
        description: validation.error,
        variant: "destructive",
      })
      return
    }

    setSaving(true)
    try {
      const res = await ClientSegmentRulesAPI.update(validation.rules)
      if (res.success && res.data) {
        onSaved(res.data)
        onOpenChange(false)
        toast({
          title: "Segment rules saved",
          description: "Client segments will use your updated thresholds.",
        })
      } else {
        throw new Error(res.error || "Save failed")
      }
    } catch (error: any) {
      toast({
        title: "Could not save",
        description: error?.message || "Failed to save segment rules.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Client segment rules</DialogTitle>
          <DialogDescription>
            Customize how clients are grouped into New, Regular, VIP, At-Risk, and Win-Back segments.
            These rules apply to everyone at this branch.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="new-max-visits">New — max visits</Label>
            <Input
              id="new-max-visits"
              type="number"
              min={0}
              value={draft.newMaxVisits}
              onChange={(e) => updateField("newMaxVisits", e.target.value)}
              disabled={!canEdit}
            />
            <p className="text-xs text-slate-500">Clients with this many visits or fewer count as New.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vip-threshold">VIP — min lifetime spend (₹)</Label>
            <Input
              id="vip-threshold"
              type="number"
              min={1}
              value={draft.vipSpendThreshold}
              onChange={(e) => updateField("vipSpendThreshold", e.target.value)}
              disabled={!canEdit}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="at-risk-days">At-Risk — starts after (days)</Label>
            <Input
              id="at-risk-days"
              type="number"
              min={1}
              value={draft.atRiskAfterDays}
              onChange={(e) => updateField("atRiskAfterDays", e.target.value)}
              disabled={!canEdit}
            />
            <p className="text-xs text-slate-500">
              Applies until Win-Back threshold ({draft.winBackAfterDays} days).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="win-back-days">Win-Back — starts after (days)</Label>
            <Input
              id="win-back-days"
              type="number"
              min={2}
              value={draft.winBackAfterDays}
              onChange={(e) => updateField("winBackAfterDays", e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" onClick={handleReset} disabled={!canEdit || saving}>
            Reset to defaults
          </Button>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            {canEdit && (
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save rules"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ClientSegmentRulesButtonProps {
  rules: ClientSegmentRules
  onSaved: (rules: ClientSegmentRules) => void
  canEdit: boolean
}

export function ClientSegmentRulesButton({ rules, onSaved, canEdit }: ClientSegmentRulesButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 text-xs text-slate-600"
        onClick={() => setOpen(true)}
      >
        <Settings2 className="h-3.5 w-3.5" />
        Edit segment rules
      </Button>
      <ClientSegmentRulesDialog
        open={open}
        onOpenChange={setOpen}
        rules={rules}
        onSaved={onSaved}
        canEdit={canEdit}
      />
    </>
  )
}
