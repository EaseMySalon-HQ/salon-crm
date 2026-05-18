"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CashMovementsAPI } from "@/lib/api"
import {
  CASH_MOVEMENT_TYPE_OPTIONS,
  type CashMovementDirection,
  type CashMovementRow,
  type CashMovementType,
  defaultDirectionForType,
} from "@/lib/cash-movements"
import { getTodayIST, toDateStringIST } from "@/lib/date-utils"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"

interface CashMovementModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  defaultDate?: string
  /** When set, modal edits this movement instead of creating a new one */
  editing?: CashMovementRow | null
}

export function CashMovementModal({
  open,
  onOpenChange,
  onSuccess,
  defaultDate,
  editing = null,
}: CashMovementModalProps) {
  const { toast } = useToast()
  const isEdit = Boolean(editing?._id)
  const [type, setType] = useState<CashMovementType>("owner_withdrawal")
  const [direction, setDirection] = useState<CashMovementDirection>("out")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(defaultDate || getTodayIST())
  const [reason, setReason] = useState("")
  const [referenceNo, setReferenceNo] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setType(editing.type as CashMovementType)
      setDirection(editing.direction)
      setAmount(String(editing.amount ?? ""))
      setDate(toDateStringIST(editing.date))
      setReason(editing.reason || "")
      setReferenceNo(editing.referenceNo || "")
    } else {
      setDate(defaultDate || getTodayIST())
      setType("owner_withdrawal")
      setDirection("out")
      setAmount("")
      setReason("")
      setReferenceNo("")
    }
  }, [open, defaultDate, editing])

  useEffect(() => {
    if (type !== "other") {
      setDirection(defaultDirectionForType(type))
    }
  }, [type])

  const handleSubmit = async () => {
    const amt = Number(amount)
    if (!amt || amt <= 0) {
      toast({ title: "Invalid amount", description: "Enter an amount greater than zero.", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const payload = {
        type,
        ...(type === "other" ? { direction } : {}),
        amount: amt,
        date: toDateStringIST(date),
        reason: reason.trim(),
        referenceNo: referenceNo.trim(),
      }
      const res = isEdit && editing
        ? await CashMovementsAPI.update(editing._id, payload)
        : await CashMovementsAPI.create(payload)
      if (res.success) {
        toast({
          title: isEdit ? "Movement updated" : "Cash movement recorded",
          description: isEdit
            ? "Drawer reconciliation has been recalculated for that day."
            : "Drawer reconciliation will include this movement.",
        })
        onOpenChange(false)
        onSuccess?.()
      } else {
        throw new Error((res as { error?: string }).error || "Failed to save")
      }
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } }
      const message =
        ax.response?.data?.error ||
        (e instanceof Error ? e.message : "Could not save cash movement")
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const selectedOption = CASH_MOVEMENT_TYPE_OPTIONS.find((o) => o.value === type)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit cash movement" : "Record cash movement"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Fix the type, amount, or date. This updates expected cash for that day."
              : "Owner withdrawals, bank deposits, and similar moves affect the cash drawer only — not expense reports."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as CashMovementType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CASH_MOVEMENT_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedOption?.description && (
              <p className="text-xs text-muted-foreground">{selectedOption.description}</p>
            )}
          </div>

          {type === "other" && (
            <div className="space-y-2">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as CashMovementDirection)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="out">Cash out of drawer</SelectItem>
                  <SelectItem value="in">Cash into drawer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cm-amount">Amount (₹)</Label>
              <Input
                id="cm-amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cm-date">Date</Label>
              <Input
                id="cm-date"
                type="date"
                value={date}
                max={getTodayIST()}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cm-ref">Reference (optional)</Label>
            <Input
              id="cm-ref"
              placeholder="Cheque no., bag label, etc."
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cm-reason">Note (optional)</Label>
            <Textarea
              id="cm-reason"
              rows={2}
              placeholder="Brief reason for this movement"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isEdit ? "Save changes" : "Save movement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
