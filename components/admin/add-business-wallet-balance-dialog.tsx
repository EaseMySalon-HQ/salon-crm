"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, FileText, Loader2, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { adminRequestHeaders } from "@/lib/admin-request-headers"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"
const GST_RATE = 0.18

type CreditKind = "promo" | "paid"

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

function computeGstPreview(amountRupees: number) {
  const basePaise = Math.round(amountRupees * 100)
  const gstPaise = Math.round(basePaise * GST_RATE)
  return {
    baseRupees: basePaise / 100,
    gstRupees: gstPaise / 100,
    totalRupees: (basePaise + gstPaise) / 100,
  }
}

async function downloadWalletInvoice(businessId: string, transactionId: string) {
  const res = await fetch(
    `${API_URL}/admin/businesses/${businessId}/wallet/transactions/${transactionId}/invoice`,
    { credentials: "include", headers: adminRequestHeaders() }
  )
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload?.error || "Could not download invoice")
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `wallet-invoice-${transactionId}.pdf`
  anchor.click()
  URL.revokeObjectURL(url)
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
  const [creditKind, setCreditKind] = useState<CreditKind>("promo")
  const [paymentProvider, setPaymentProvider] = useState("manual")
  const [paymentReference, setPaymentReference] = useState("")
  const [emailInvoice, setEmailInvoice] = useState(true)

  const parsedAmount = Number(amount)
  const gstPreview = useMemo(() => {
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return null
    return computeGstPreview(parsedAmount)
  }, [parsedAmount])

  useEffect(() => {
    if (!open || !businessId) return
    setAmount("")
    setNote("")
    setCreditKind("promo")
    setPaymentProvider("manual")
    setPaymentReference("")
    setEmailInvoice(true)
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
          creditKind,
          paymentProvider: creditKind === "paid" ? paymentProvider : undefined,
          paymentReference:
            creditKind === "paid" && paymentReference.trim() ? paymentReference.trim() : undefined,
          generateInvoice: creditKind === "paid",
          emailInvoice: creditKind === "paid" ? emailInvoice : false,
        }),
      })
      const payload = await res.json()
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || payload.message || "Failed to add wallet balance")
      }

      const data = payload.data || {}
      const newBalance = Number(data.newBalanceRupees ?? 0)
      setCurrentBalanceRupees(newBalance)

      const creditedLabel =
        creditKind === "paid" && data.gstPaise > 0
          ? `${formatRupees(data.amountRupees)} wallet credit (${formatRupees(data.totalChargedRupees)} incl. GST)`
          : formatRupees(parsed)

      toast({
        title: creditKind === "paid" ? "Wallet credited — invoice generated" : "Wallet credited",
        description: `Added ${creditedLabel} to ${businessName}. New balance: ${formatRupees(newBalance)}.${
          data.invoiceNumber ? ` Invoice ${data.invoiceNumber}.` : ""
        }${data.invoiceEmailed ? " Emailed to business contact." : ""}${
          data.invoiceError ? ` Invoice email: ${data.invoiceError}` : ""
        }`,
      })

      if (data.invoiceGenerated && data.transactionId) {
        try {
          await downloadWalletInvoice(businessId, data.transactionId)
        } catch (err) {
          toast({
            title: "Invoice download failed",
            description: err instanceof Error ? err.message : "Could not download PDF",
            variant: "destructive",
          })
        }
      }

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
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
            <Label>Credit type</Label>
            <RadioGroup
              value={creditKind}
              onValueChange={(value) => setCreditKind(value as CreditKind)}
              className="grid gap-2"
            >
              <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50/50">
                <RadioGroupItem value="promo" id="credit-promo" className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Promotional / complimentary</p>
                  <p className="text-xs text-muted-foreground">
                    Trial credit, promo, or goodwill — no GST invoice.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50/50">
                <RadioGroupItem value="paid" id="credit-paid" className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    Paid recharge (GST invoice)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Payment received via QR, payment link, or bank transfer — generates a tax invoice.
                  </p>
                </div>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wallet-credit-amount">
              {creditKind === "paid" ? "Wallet credit amount (₹, before GST)" : "Amount to add (₹)"}
            </Label>
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
            {creditKind === "paid" && gstPreview ? (
              <div className="rounded-md border bg-slate-50 px-3 py-2 text-xs text-slate-700 space-y-1">
                <p>Wallet credit: {formatRupees(gstPreview.baseRupees)}</p>
                <p>GST ({(GST_RATE * 100).toFixed(0)}%): {formatRupees(gstPreview.gstRupees)}</p>
                <p className="font-medium">Invoice total: {formatRupees(gstPreview.totalRupees)}</p>
              </div>
            ) : null}
          </div>

          {creditKind === "paid" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="wallet-payment-provider">Payment source</Label>
                <Select value={paymentProvider} onValueChange={setPaymentProvider}>
                  <SelectTrigger id="wallet-payment-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual / bank / UPI QR</SelectItem>
                    <SelectItem value="razorpay">Razorpay</SelectItem>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="zoho">Zoho</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wallet-payment-ref">Payment reference (optional)</Label>
                <Input
                  id="wallet-payment-ref"
                  placeholder="UTR, Razorpay payment ID, transaction ref…"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={emailInvoice} onCheckedChange={(v) => setEmailInvoice(v === true)} />
                Email GST invoice to business contact
              </label>
            </>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="wallet-credit-note">Note (optional)</Label>
            <Textarea
              id="wallet-credit-note"
              rows={3}
              placeholder={
                creditKind === "paid"
                  ? "e.g. Razorpay link payment, March promo top-up…"
                  : "Reason for this credit, promo code, support ticket…"
              }
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
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : creditKind === "paid" ? (
              <>
                <Download className="h-4 w-4 mr-2" />
                Credit &amp; generate invoice
              </>
            ) : (
              "Add balance"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
