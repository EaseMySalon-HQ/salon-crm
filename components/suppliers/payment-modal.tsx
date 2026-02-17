"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SupplierPayablesAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { Loader2, CreditCard, Circle } from "lucide-react"
import { format } from "date-fns"

const PAYMENT_METHODS = ["Cash", "Bank", "UPI", "Card", "Cheque"]

interface PaymentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  payable: any
  onSuccess?: () => void
}

export function PaymentModal({ open, onOpenChange, payable, onSuccess }: PaymentModalProps) {
  const { toast } = useToast()
  const [saving, setSaving] = React.useState(false)
  const [amount, setAmount] = React.useState("")
  const [paymentMethod, setPaymentMethod] = React.useState("Cash")
  const [paymentDate, setPaymentDate] = React.useState(format(new Date(), "yyyy-MM-dd"))
  const [reference, setReference] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [fullPayable, setFullPayable] = React.useState<any>(null)

  const balanceDue = React.useMemo(() => {
    const p = fullPayable || payable
    if (!p) return 0
    return Math.max(0, (p.totalAmount || 0) - (p.amountPaid || 0))
  }, [payable, fullPayable])

  const payments = (fullPayable || payable)?.payments || []

  React.useEffect(() => {
    if (open && payable?._id) {
      SupplierPayablesAPI.getById(payable._id).then((r) => {
        if (r.success && r.data) setFullPayable(r.data)
      }).catch(() => setFullPayable(null))
    } else {
      setFullPayable(null)
    }
  }, [open, payable?._id])

  React.useEffect(() => {
    if (open && payable) {
      setAmount(balanceDue.toString())
      setPaymentMethod("Cash")
      setPaymentDate(format(new Date(), "yyyy-MM-dd"))
      setReference("")
      setNotes("")
    }
  }, [open, payable, balanceDue])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) {
      toast({ title: "Error", description: "Enter a valid amount", variant: "destructive" })
      return
    }
    if (amt > balanceDue) {
      toast({ title: "Error", description: `Amount cannot exceed balance (₹${balanceDue.toFixed(2)})`, variant: "destructive" })
      return
    }
    try {
      setSaving(true)
      const res = await SupplierPayablesAPI.recordPayment(payable._id, {
        amount: amt,
        paymentMethod,
        paymentDate,
        reference,
        notes,
      })
      if (res.success) {
        toast({ title: "Success", description: "Payment recorded" })
        onSuccess?.()
        onOpenChange(false)
      } else {
        toast({ title: "Error", description: res.error || "Failed", variant: "destructive" })
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.response?.data?.error || "Something went wrong",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  if (!payable) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <div className="mb-4 p-3 bg-muted/50 rounded-lg text-sm">
          <p>
            <span className="text-muted-foreground">Supplier:</span> {(fullPayable || payable).supplierId?.name || "-"}
          </p>
          <p>
            <span className="text-muted-foreground">PO:</span> {(fullPayable || payable).purchaseOrderId?.poNumber || "-"}
          </p>
          <p>
            <span className="text-muted-foreground">Balance due:</span>{" "}
            <span className="font-semibold">₹{balanceDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </p>
        </div>

        {payments.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium mb-2">Payment History</h4>
            <div className="relative pl-4 border-l-2 border-muted space-y-3">
              {[...payments].reverse().map((pmt: any, idx: number) => (
                <div key={pmt._id || idx} className="relative flex gap-3">
                  <Circle className="absolute -left-[21px] top-0.5 h-3 w-3 fill-primary text-primary" />
                  <div className="flex-1 min-w-0 pb-2">
                    <p className="text-sm font-medium">
                      ₹{(pmt.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })} • {pmt.paymentMethod || "Cash"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pmt.paymentDate ? format(new Date(pmt.paymentDate), "dd MMM yyyy") : "-"}
                      {pmt.reference ? ` • ${pmt.reference}` : ""}
                    </p>
                    {pmt.notes && <p className="text-xs text-muted-foreground mt-0.5">{pmt.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount *</Label>
            <Input
              id="amount"
              type="number"
              min={0.01}
              max={balanceDue}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentDate">Date</Label>
              <Input
                id="paymentDate"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reference">Reference (Cheque no, UPI ref, etc.)</Label>
            <Input
              id="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
