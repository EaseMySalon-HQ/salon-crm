"use client"

import * as React from "react"
import Script from "next/script"
import {
  Wallet,
  Zap,
  Loader2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Download,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"
import { useQueryClient } from "@tanstack/react-query"
import {
  WalletAPI,
  type WalletTransaction,
  type RechargeOrder,
  type WalletProvider,
} from "@/lib/api"

const MIN_RECHARGE_RUPEES = 10
const MAX_RECHARGE_RUPEES = 50000
const PRESET_AMOUNTS = [100, 500, 1000, 2000, 5000]
// Keep in sync with backend/routes/wallet.js GST_RATE.
const GST_RATE = 0.18

declare global {
  interface Window {
    Razorpay?: any
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—"
  try {
    return new Date(value).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return String(value)
  }
}

function formatRupees(n: number | null | undefined, opts: { withSymbol?: boolean } = {}) {
  const { withSymbol = true } = opts
  const value = Number(n || 0)
  const formatted = value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return withSymbol ? `₹${formatted}` : formatted
}

function providerLabel(p: string | null | undefined) {
  switch (p) {
    case "razorpay":
      return "Razorpay"
    case "stripe":
      return "Stripe"
    case "zoho":
      return "Zoho Pay"
    case "system":
      return "System"
    default:
      return p || "—"
  }
}

function channelLabel(c: string | null | undefined) {
  if (!c) return "—"
  if (c === "sms") return "SMS"
  if (c === "whatsapp") return "WhatsApp"
  return c
}

function BalanceCard({
  balanceRupees,
  loading,
  onRefresh,
}: {
  balanceRupees: number
  loading: boolean
  onRefresh: () => void
}) {
  return (
    <Card className="bg-gradient-to-br from-indigo-50 via-white to-purple-50 border-indigo-100">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-indigo-100 p-3">
              <Wallet className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Wallet balance</div>
              <div className="text-3xl font-semibold tracking-tight">
                {loading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : (
                  formatRupees(balanceRupees)
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Every WhatsApp and SMS message is debited from this wallet.
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function PricingCard() {
  const rows = [
    { label: "SMS (any type)", rate: "₹0.20 per message" },
    { label: "WhatsApp — transactional", rate: "₹0.20 per message" },
    { label: "WhatsApp — promotional (campaign)", rate: "₹1.20 per message" },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pricing</CardTitle>
        <CardDescription>
          Every message is debited from your wallet at the rates below. No free
          quota. Wallet recharges are subject to 18% GST added on top of the
          recharge amount.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
          >
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-medium">{r.rate}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function RechargeForm({
  onCredited,
}: {
  onCredited: () => void
}) {
  const { toast } = useToast()
  const [amount, setAmount] = React.useState<string>("500")
  const [submitting, setSubmitting] = React.useState(false)
  const [razorpayReady, setRazorpayReady] = React.useState(false)

  const amountNum = Number(amount)
  const amountValid =
    Number.isFinite(amountNum) &&
    amountNum >= MIN_RECHARGE_RUPEES &&
    amountNum <= MAX_RECHARGE_RUPEES

  const gstRupees = amountValid ? Math.round(amountNum * GST_RATE * 100) / 100 : 0
  const totalRupees = amountValid ? Math.round((amountNum + gstRupees) * 100) / 100 : 0

  const openRazorpayCheckout = React.useCallback(
    async (order: RechargeOrder) => {
      return new Promise<void>((resolve, reject) => {
        if (!window.Razorpay) {
          reject(new Error("Razorpay SDK is still loading. Please try again."))
          return
        }
        const rzp = new window.Razorpay({
          key: order.publicKey,
          amount: order.amountPaise,
          currency: order.currency || "INR",
          order_id: order.orderId,
          name: "Wallet Recharge",
          description: "Top up messaging wallet",
          handler: async (resp: any) => {
            try {
              const verify = await WalletAPI.verifyRecharge({
                provider: "razorpay",
                orderId: resp.razorpay_order_id,
                paymentId: resp.razorpay_payment_id,
                signature: resp.razorpay_signature,
                amountRupees: amountNum,
              })
              if (verify?.success) {
                toast({
                  title: "Payment successful",
                  description: `Wallet credited with ${formatRupees(
                    amountNum
                  )}. Total charged: ${formatRupees(totalRupees)} (incl. ${formatRupees(
                    gstRupees
                  )} GST).`,
                })
                onCredited()
                resolve()
              } else {
                reject(new Error(verify?.error || "Verification failed"))
              }
            } catch (err: any) {
              reject(err)
            }
          },
          modal: {
            ondismiss: () => resolve(),
          },
          theme: { color: "#6366f1" },
        })
        rzp.on("payment.failed", (resp: any) => {
          reject(new Error(resp?.error?.description || "Payment failed"))
        })
        rzp.open()
      })
    },
    [amountNum, onCredited, toast]
  )

  const openStripeCheckout = React.useCallback(
    async (order: RechargeOrder) => {
      if (!order.clientSecret) throw new Error("Missing Stripe client secret")
      const { loadStripe } = await import("@stripe/stripe-js")
      const stripe = await loadStripe(order.publicKey)
      if (!stripe) throw new Error("Stripe failed to initialise")
      const returnUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}${window.location.pathname}?section=recharge&stripe_redirect=1`
          : undefined
      const { error, paymentIntent } = await stripe.confirmPayment({
        clientSecret: order.clientSecret,
        confirmParams: returnUrl ? { return_url: returnUrl } : undefined,
        redirect: "if_required",
      } as any)
      if (error) {
        throw new Error(error.message || "Stripe payment failed")
      }
      const verify = await WalletAPI.verifyRecharge({
        provider: "stripe",
        orderId: order.orderId,
        paymentId: paymentIntent?.id || order.orderId,
        amountRupees: amountNum,
      })
      if (!verify?.success) {
        throw new Error(verify?.error || "Stripe verification failed")
      }
      toast({
        title: "Payment successful",
        description: `Wallet credited with ${formatRupees(
          amountNum
        )}. Total charged: ${formatRupees(totalRupees)} (incl. ${formatRupees(
          gstRupees
        )} GST).`,
      })
      onCredited()
    },
    [amountNum, gstRupees, onCredited, toast, totalRupees]
  )

  const openZohoCheckout = React.useCallback(
    async (order: RechargeOrder) => {
      if (!order.sessionUrl) throw new Error("Missing Zoho session URL")
      toast({
        title: "Redirecting to Zoho Pay",
        description: "Complete the payment on the Zoho page.",
      })
      window.location.href = order.sessionUrl
    },
    [toast]
  )

  const handleRecharge = React.useCallback(async () => {
    if (!amountValid) return
    setSubmitting(true)
    try {
      const res = await WalletAPI.createRechargeOrder(amountNum)
      if (!res?.success || !res.data) {
        throw new Error(res?.error || "Failed to create recharge order")
      }
      const order = res.data
      if (order.provider === "razorpay") {
        await openRazorpayCheckout(order)
      } else if (order.provider === "stripe") {
        await openStripeCheckout(order)
      } else if (order.provider === "zoho") {
        await openZohoCheckout(order)
      } else {
        throw new Error(`Unsupported provider: ${order.provider}`)
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Recharge failed",
        description: err?.message || "Please try again",
      })
    } finally {
      setSubmitting(false)
    }
  }, [
    amountNum,
    amountValid,
    openRazorpayCheckout,
    openStripeCheckout,
    openZohoCheckout,
    toast,
  ])

  return (
    <Card>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="lazyOnload"
        onReady={() => setRazorpayReady(true)}
        onLoad={() => setRazorpayReady(true)}
      />
      <CardHeader>
        <CardTitle className="text-base">Recharge wallet</CardTitle>
        <CardDescription>
          Minimum {formatRupees(MIN_RECHARGE_RUPEES)}, maximum {formatRupees(MAX_RECHARGE_RUPEES)}. 18%
          GST is added on top — wallet is credited with the pre-tax amount.
          Payment provider (Razorpay / Stripe / Zoho Pay) is set by your admin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {PRESET_AMOUNTS.map((p) => (
            <Button
              key={p}
              type="button"
              variant={String(p) === amount ? "default" : "outline"}
              size="sm"
              onClick={() => setAmount(String(p))}
            >
              ₹{p.toLocaleString("en-IN")}
            </Button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Amount (₹)
            </label>
            <Input
              type="number"
              min={MIN_RECHARGE_RUPEES}
              max={MAX_RECHARGE_RUPEES}
              step={10}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Enter amount (min ${MIN_RECHARGE_RUPEES})`}
            />
          </div>
          <Button
            type="button"
            onClick={handleRecharge}
            disabled={!amountValid || submitting}
            className="sm:min-w-[180px]"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" /> Recharge now
              </>
            )}
          </Button>
        </div>
        {!amountValid && amount !== "" && (
          <div className="flex items-center gap-2 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5" />
            Enter an amount between ₹{MIN_RECHARGE_RUPEES} and ₹{MAX_RECHARGE_RUPEES.toLocaleString("en-IN")}.
          </div>
        )}
        {amountValid && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Wallet credit</span>
              <span className="tabular-nums">{formatRupees(amountNum)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">GST (18%)</span>
              <span className="tabular-nums">{formatRupees(gstRupees)}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-1 font-medium">
              <span>Total payable</span>
              <span className="tabular-nums">{formatRupees(totalRupees)}</span>
            </div>
          </div>
        )}
        {!razorpayReady && (
          <p className="text-[11px] text-muted-foreground">
            Razorpay SDK loads on demand — first click may take a moment.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function TransactionHistory({ refreshKey }: { refreshKey: number }) {
  const { toast } = useToast()
  const [loading, setLoading] = React.useState(false)
  const [logs, setLogs] = React.useState<WalletTransaction[]>([])
  const [page, setPage] = React.useState(1)
  const [totalPages, setTotalPages] = React.useState(1)
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null)
  const limit = 10

  const handleDownload = React.useCallback(
    async (txId: string) => {
      if (!txId || downloadingId) return
      setDownloadingId(txId)
      try {
        await WalletAPI.downloadInvoice(txId)
      } catch (err) {
        toast({
          title: "Couldn't download invoice",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        })
      } finally {
        setDownloadingId(null)
      }
    },
    [downloadingId, toast]
  )

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await WalletAPI.getTransactions({ page, limit })
      if (res?.success && res.data) {
        setLogs(res.data.logs || [])
        setTotalPages(res.data.pagination?.totalPages || 1)
      } else {
        setLogs([])
      }
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [page])

  React.useEffect(() => {
    load()
  }, [load, refreshKey])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Transaction history</CardTitle>
        <CardDescription>Recharges and per-message debits.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance after</TableHead>
                <TableHead className="text-right">Invoice</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Loading…
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    No transactions yet.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((t) => (
                  <TableRow key={t._id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(t.timestamp)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          t.type === "credit"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        )}
                      >
                        {t.type === "credit" ? "Credit" : "Debit"}
                      </Badge>
                    </TableCell>
                    <TableCell>{channelLabel(t.channel)}</TableCell>
                    <TableCell className="max-w-[240px] truncate" title={t.description || ""}>
                      {t.description || "—"}
                    </TableCell>
                    <TableCell>{providerLabel(t.provider)}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        t.type === "credit" ? "text-emerald-700" : "text-amber-700"
                      )}
                    >
                      {t.type === "credit" ? "+" : "−"}
                      {formatRupees(t.amountRupees)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRupees(t.balanceAfterRupees)}
                    </TableCell>
                    <TableCell className="text-right">
                      {t.type === "credit" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => handleDownload(t._id)}
                          disabled={downloadingId === t._id}
                          title="Download GST invoice"
                        >
                          {downloadingId === t._id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          <span className="sr-only">Download invoice</span>
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between p-3 border-t">
          <div className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function RechargeSettings() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [balanceRupees, setBalanceRupees] = React.useState(0)
  const [balanceLoading, setBalanceLoading] = React.useState(true)
  const [refreshKey, setRefreshKey] = React.useState(0)

  const loadBalance = React.useCallback(async () => {
    setBalanceLoading(true)
    try {
      const res = await WalletAPI.getBalance()
      if (res?.success && res.data) {
        setBalanceRupees(res.data.balanceRupees)
        queryClient.invalidateQueries({ queryKey: ["wallet", "balance"] })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Unable to load wallet balance",
        description: err?.message || "Please try again",
      })
    } finally {
      setBalanceLoading(false)
    }
  }, [toast, queryClient])

  React.useEffect(() => {
    loadBalance()
  }, [loadBalance])

  const handleCredited = React.useCallback(() => {
    loadBalance()
    setRefreshKey((k) => k + 1)
  }, [loadBalance])

  return (
    <div className="space-y-4">
      <BalanceCard
        balanceRupees={balanceRupees}
        loading={balanceLoading}
        onRefresh={loadBalance}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <PricingCard />
        <RechargeForm onCredited={handleCredited} />
      </div>
      <TransactionHistory refreshKey={refreshKey} />
    </div>
  )
}
