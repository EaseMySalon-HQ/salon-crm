"use client"

import { useEffect, useState } from "react"
import { Loader2, Wallet } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { adminRequestHeaders } from "@/lib/admin-request-headers"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

type AddBusinessWalletBalanceDialogProps = {
  businessId: string
  businessName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

function formatRupees(amount: number | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "—"
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount)
}

export function AddBusinessWalletBalanceDialog({
  businessId,
  businessName,
  open,
  onOpenChange,
  onSuccess,
}: AddBusinessWalletBalanceDialogProps) {
  const { toast } = useToast()
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [currentBalanceRupees, setCurrentBalanceRupees] = useState<number | null>(null)
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")

  useEffect(() => {
    if (!open || !businessId) return
    setAmount("")
    setNote("")
    setLoadingBalance(true)
    fetch(`${API_URL}/admin/businesses/${businessId}/wallet`, {
      credentials: "include",
      headers: adminRequestHeaders(),
    })
      .then(async (res) => {
        const payload = await res.json()
        if (!res.ok || !payload.success) {
          throw new Error(payload.error || "Could not load wallet balance")
        }
        setCurrentBalanceRupees(Number(payload.data?.balanceRupees ?? 0))
      })
      .catch((error: unknown) => {
        setCurrentBalanceRupees(null)
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Could not load wallet balance",
          variant: "destructive",
        })
      })
      .finally(() => setLoadingBalance(false))
  }, [open, businessId, toast])

  const handleSubmit = async () => {
    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast({ title: "Invalid amount", description: "Enter a valid amount in rupees.", variant: "destructive" })
      return
    }

    try {
      setSubmitting(true)
      const res = await fetch(`${API_URL}/admin/businesses/${businessId}/wallet/credit`, {
        method: "POST",
        credentials: "include",
        headers: adminRequestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          amountRupees: parsed,
          note: note.trim() || undefined,
        }),
      })
      const payload = await res.json()
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || payload.message || "Failed to add wallet balance")
      }

      const newBalance = Number(payload.data?.newBalanceRupees ?? 0)
      setCurrentBalanceRupees(newBalance)
      toast({
        title: "Wallet credited",
        description: `Added ${formatRupees(parsed)} to ${businessName}. New balance: ${formatRupees(newBalance)}.`,
      })
      onSuccess?.()
      onOpenChange(false)
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add wallet balance",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-emerald-600" />
            Add balance to wallet
          </DialogTitle>
          <DialogDescription>
            Credit the messaging wallet for <strong>{businessName}</strong>. This balance is used for SMS and
            WhatsApp charges.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Current balance</p>
            <p className="mt-1 text-lg font-semibold text-emerald-900 tabular-nums">
              {loadingBalance ? "Loading…" : formatRupees(currentBalanceRupees ?? 0)}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wallet-credit-amount">Amount to add (₹)</Label>
            <Input
              id="wallet-credit-amount"
              type="number"
              min="1"
              max="50000"
              step="0.01"
              placeholder="e.g. 500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-slate-500">Between ₹1 and ₹50,000 per credit.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wallet-credit-note">Note (optional)</Label>
            <Textarea
              id="wallet-credit-note"
              rows={3}
              placeholder="Reason for this credit, promo code, support ticket…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || loadingBalance}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add balance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
