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
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SuppliersAPI } from "@/lib/api"
import { supplierPayableReferenceLabel } from "@/lib/supplier-payable-reference"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"
import { format } from "date-fns"

const PAYMENT_METHODS = ["Cash", "Bank", "UPI", "Card", "Cheque"]

function fifoSortPayables(rows: any[]) {
  return [...rows].sort((a, b) => {
    const ta = new Date(a.dueDate || 0).getTime()
    const tb = new Date(b.dueDate || 0).getTime()
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb
    return String(a._id || "").localeCompare(String(b._id || ""))
  })
}

interface SupplierFifoPaymentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier: { _id: string; name?: string } | null
  onSuccess?: () => void
}

export function SupplierFifoPaymentModal({ open, onOpenChange, supplier, onSuccess }: SupplierFifoPaymentModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [fifoRows, setFifoRows] = React.useState<any[]>([])
  const [totalOutstanding, setTotalOutstanding] = React.useState(0)
  const [amount, setAmount] = React.useState("")
  const [paymentMethod, setPaymentMethod] = React.useState("Cash")
  const [paymentDate, setPaymentDate] = React.useState(format(new Date(), "yyyy-MM-dd"))
  const [reference, setReference] = React.useState("")
  const [notes, setNotes] = React.useState("")

  React.useEffect(() => {
    if (!open || !supplier?._id) {
      setFifoRows([])
      setTotalOutstanding(0)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await SuppliersAPI.getOutstanding(supplier._id)
        if (cancelled) return
        const raw = res.success ? res.data?.payables || [] : []
        const sorted = fifoSortPayables(raw)
        const balances = sorted
          .map((p: any) => ({
            ...p,
            balanceDue: Math.max(0, (p.totalAmount || 0) - (p.amountPaid || 0)),
          }))
          .filter((p) => p.balanceDue > 0.005)
        setFifoRows(balances)
        const tot = balances.reduce((s, p) => s + p.balanceDue, 0)
        setTotalOutstanding(Math.round(tot * 100) / 100)
        setAmount(Math.round(tot * 100) / 100 > 0 ? String(Math.round(tot * 100) / 100) : "")
        setPaymentMethod("Cash")
        setPaymentDate(format(new Date(), "yyyy-MM-dd"))
        setReference("")
        setNotes("")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, supplier?._id])

  const amtNum = React.useMemo(() => {
    const n = parseFloat(amount)
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
  }, [amount])

  const fifoPreview = React.useMemo(() => {
    if (amtNum <= 0 || fifoRows.length === 0) return []
    let rem = amtNum
    const out: { payable: any; applied: number; balanceAfter: number }[] = []
    for (const row of fifoRows) {
      if (rem <= 0.005) break
      const bal = Math.max(0, (row.totalAmount || 0) - (row.amountPaid || 0))
      if (bal <= 0.005) continue
      const applied = Math.round(Math.min(rem, bal) * 100) / 100
      if (applied <= 0) continue
      rem = Math.round((rem - applied) * 100) / 100
      out.push({
        payable: row,
        applied,
        balanceAfter: Math.round((bal - applied) * 100) / 100,
      })
    }
    return out
  }, [amtNum, fifoRows])

  const submitDisabled =
    loading || saving || fifoRows.length === 0 || amtNum <= 0 || amtNum > totalOutstanding + 0.015

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supplier?._id) return
    if (amtNum <= 0 || amtNum > totalOutstanding + 0.015) {
      toast({
        title: "Invalid amount",
        description:
          amtNum <= 0
            ? "Enter amount greater than zero."
            : `Amount cannot exceed total outstanding ₹${totalOutstanding.toFixed(2)}`,
        variant: "destructive",
      })
      return
    }

    try {
      setSaving(true)
      const res = await SuppliersAPI.recordPaymentAutoAllocate(supplier._id, {
        amount: amtNum,
        paymentMethod,
        paymentDate,
        reference,
        notes,
      })
      if (res.success) {
        const slices = res.data?.allocations?.length || 0
        toast({
          title: "Payment recorded",
          description:
            slices > 1
              ? `₹${amtNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })} allocated across ${slices} bill(s), oldest due first.`
              : `₹${amtNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })} applied.`,
        })
        onSuccess?.()
        onOpenChange(false)
      } else {
        toast({
          title: "Error",
          description: (res as { error?: string }).error || "Failed to record payment",
          variant: "destructive",
        })
      }
    } catch (err: unknown) {
      const msg =
        typeof err === "object" &&
        err &&
        "response" in err &&
        (err as { response?: { data?: { error?: string } } }).response?.data?.error
      toast({ title: "Error", description: msg || "Something went wrong", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const supplierLabel = supplier?.name?.trim() || "Supplier"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Payment is applied to open bills by <strong>due date</strong>, oldest first. Any remainder goes to the
            next bill.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-slate-200/80 bg-slate-50/60 px-3 py-2 text-sm dark:bg-slate-900/35">
          <p>
            <span className="text-muted-foreground">Supplier:</span>{" "}
            <span className="font-medium text-foreground">{supplierLabel}</span>
          </p>
          {!loading ? (
            <p>
              <span className="text-muted-foreground">Total outstanding:</span>{" "}
              <span className="font-semibold tabular-nums">
                ₹{totalOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </p>
          ) : null}
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : fifoRows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No open dues for this supplier.</p>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">This payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fifoRows.map((row) => {
                    const prv = fifoPreview.find((x) => String(x.payable._id) === String(row._id))
                    return (
                      <TableRow key={String(row._id)}>
                        <TableCell className="max-w-[140px] truncate text-xs font-medium">
                          {supplierPayableReferenceLabel(row)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {row.dueDate ? format(new Date(row.dueDate), "dd MMM yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          ₹{row.balanceDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-medium">
                          {prv ? `₹${prv.applied.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fifo-amount">Amount *</Label>
                <Input
                  id="fifo-amount"
                  type="number"
                  step={0.01}
                  min={0.01}
                  max={totalOutstanding || undefined}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Payment method</Label>
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
                  <Label htmlFor="fifo-date">Date</Label>
                  <Input id="fifo-date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fifo-ref">Reference</Label>
                <Input id="fifo-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fifo-notes">Notes</Label>
                <Textarea id="fifo-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" rows={2} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitDisabled}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Record payment
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
