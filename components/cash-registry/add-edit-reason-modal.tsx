"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CASH_DIFFERENCE_REASONS } from "./cash-difference-breakdown-drawer"
import { CashRegistryAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

interface AddEditReasonModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: "cash" | "online"
  difference: number
  closingEntryId: string
  existingReason?: string
  existingNote?: string
  onSuccess?: () => void
}

export function AddEditReasonModal({
  open,
  onOpenChange,
  type,
  difference,
  closingEntryId,
  existingReason,
  existingNote,
  onSuccess,
}: AddEditReasonModalProps) {
  const [reason, setReason] = useState("")
  const [note, setNote] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      setReason(existingReason || "")
      setNote(existingNote || "")
    }
  }, [open, existingReason, existingNote])

  const handleSave = async () => {
    if (!reason.trim()) {
      toast({
        title: "Reason required",
        description: "Please select a reason from the dropdown.",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    try {
      const response = await CashRegistryAPI.updateDifferenceReason(
        closingEntryId,
        { type, reason: reason.trim(), note: note.trim() }
      )
      if (response?.success !== false) {
        toast({
          title: "Reason saved",
          description: "The difference reason has been saved successfully.",
        })
        onSuccess?.()
        onOpenChange(false)
      } else {
        throw new Error(response?.error || "Failed to save")
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to save reason. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const title = type === "cash" ? "Add / Edit Cash Difference Reason" : "Add / Edit Online Difference Reason"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Provide a reason for the difference. This helps with accountability and tracking.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border bg-muted/30 p-3">
            <span className="text-sm text-muted-foreground">Difference amount: </span>
            <span
              className={`font-bold ${
                difference > 0 ? "text-green-600" : difference < 0 ? "text-red-600" : "text-foreground"
              }`}
            >
              ₹{difference.toFixed(2)}
            </span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="reason">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {CASH_DIFFERENCE_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Add note (optional)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add any additional details..."
              className="min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Reason"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
