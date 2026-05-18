"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ClientWalletAPI } from "@/lib/api"
import { clientWalletTxnToDebitCredit } from "@/lib/client-wallet-ledger"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth-context"
import { ProtectedLayout } from "@/components/layout/protected-layout"

const STATUS_COLOR: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  expired: "bg-red-100 text-red-800",
  exhausted: "bg-gray-100 text-gray-700",
  cancelled: "bg-gray-100 text-gray-500",
}

function walletPlanTitle(w: { planSnapshot?: Record<string, unknown> | null }): string {
  const ps = w.planSnapshot
  if (ps?.openedFromBillChangeCredit === true || ps?.billChangeCashCreditNonExpiring === true) {
    return "Bill change credit"
  }
  return typeof ps?.planName === "string" && ps.planName.trim() ? ps.planName : "Wallet"
}

function walletPickerLabel(w: {
  _id: unknown
  planSnapshot?: Record<string, unknown> | null
  remainingBalance?: number
  status?: string
}): string {
  const title = walletPlanTitle(w)
  const bal = Number(w.remainingBalance) || 0
  const status = String(w.status || "")
  return `${title} · ₹${bal.toLocaleString("en-IN", { minimumFractionDigits: 2 })} · ${status}`
}

function pickDefaultAdjustWalletId(wallets: any[]): string {
  if (!wallets.length) return ""
  const active = wallets.filter((w) => String(w.status || "").toLowerCase() === "active")
  const pool = active.length ? active : wallets
  const sorted = [...pool].sort(
    (a, b) => (Number(b.remainingBalance) || 0) - (Number(a.remainingBalance) || 0),
  )
  return String(sorted[0]._id)
}

export default function ClientWalletPage() {
  const { id: clientId } = useParams<{ id: string }>()
  const { toast } = useToast()
  const { user } = useAuth()
  const isManager = user?.role === "admin" || user?.role === "manager"

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{ wallets: any[]; transactionsByWallet: Record<string, any[]> }>({
    wallets: [],
    transactionsByWallet: {},
  })
  const [expanded, setExpanded] = useState<string | null>(null)
  const [adjustWalletId, setAdjustWalletId] = useState("")
  const [adjustDelta, setAdjustDelta] = useState("")
  const [adjustReason, setAdjustReason] = useState("")
  const [openAmount, setOpenAmount] = useState("")
  const [openReason, setOpenReason] = useState("")
  const [openingWallet, setOpeningWallet] = useState(false)

  const wallets = data.wallets

  const load = useCallback(async () => {
    setLoading(true)
    const res = await ClientWalletAPI.getClientWallets(clientId)
    if (res.success && res.data) {
      const list = res.data.wallets || []
      setData({
        wallets: list,
        transactionsByWallet: res.data.transactionsByWallet || {},
      })
      setAdjustWalletId((prev) => {
        if (prev && list.some((w: any) => String(w._id) === prev)) return prev
        return pickDefaultAdjustWalletId(list)
      })
    }
    setLoading(false)
  }, [clientId])

  useEffect(() => {
    void load()
  }, [load])

  const selectedWallet = useMemo(
    () => wallets.find((w) => String(w._id) === adjustWalletId),
    [wallets, adjustWalletId],
  )

  const submitAdjust = async () => {
    if (!adjustWalletId || adjustDelta === "" || adjustDelta === "-") {
      toast({ title: "Select a wallet and enter an amount", variant: "destructive" })
      return
    }
    const res = await ClientWalletAPI.adjust({
      walletId: adjustWalletId,
      delta: Number(adjustDelta),
      reason: adjustReason,
    })
    if (res.success) {
      toast({ title: "Balance adjusted" })
      setAdjustDelta("")
      setAdjustReason("")
      void load()
    } else {
      toast({ title: res.message || "Failed", variant: "destructive" })
    }
  }

  const submitOpenWallet = async () => {
    const amt = openAmount.trim() === "" ? 0 : Number(openAmount)
    if (!Number.isFinite(amt) || amt < 0) {
      toast({ title: "Enter a valid amount (0 or more)", variant: "destructive" })
      return
    }
    setOpeningWallet(true)
    try {
      const res = await ClientWalletAPI.openBalanceWallet({
        clientId,
        amount: amt,
        reason: openReason,
      })
      if (res.success) {
        toast({
          title: "Wallet opened",
          description:
            amt > 0
              ? `₹${amt.toLocaleString("en-IN", { minimumFractionDigits: 2 })} credited.`
              : "You can add balance using Manual adjustment below.",
        })
        setOpenAmount("")
        setOpenReason("")
        void load()
      } else {
        toast({ title: res.message || "Could not open wallet", variant: "destructive" })
      }
    } finally {
      setOpeningWallet(false)
    }
  }

  if (loading) {
    return (
      <ProtectedLayout requiredModule="clients">
        <div className="p-6 text-center text-gray-400">Loading…</div>
      </ProtectedLayout>
    )
  }

  return (
    <ProtectedLayout requiredModule="clients">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/clients/${clientId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Wallet className="h-6 w-6 text-indigo-600" />
            <h1 className="text-xl font-bold">Prepaid wallet</h1>
          </div>
        </div>

        {isManager && wallets.length === 0 && (
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 space-y-3 dark:border-amber-900/50 dark:bg-amber-950/20">
            <h2 className="font-semibold text-sm">No wallet yet</h2>
            <p className="text-sm text-muted-foreground">
              This client has no wallet, so there is no wallet ID to paste. Open a balance wallet here
              (no prepaid plan required), then add or fix the amount below.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Opening balance (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="e.g. 4"
                  value={openAmount}
                  onChange={(e) => setOpenAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Reason</Label>
                <Input
                  placeholder="e.g. Bill change not credited on bill #1234"
                  value={openReason}
                  onChange={(e) => setOpenReason(e.target.value)}
                />
              </div>
            </div>
            <Button type="button" size="sm" disabled={openingWallet} onClick={() => void submitOpenWallet()}>
              {openingWallet ? "Opening…" : "Open wallet & credit"}
            </Button>
          </div>
        )}

        {isManager && wallets.length > 0 && (
          <div className="rounded-xl border p-4 space-y-3 bg-slate-50/80">
            <h2 className="font-semibold text-sm">Manual adjustment</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label>Wallet</Label>
                <Select value={adjustWalletId || undefined} onValueChange={setAdjustWalletId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select wallet" />
                  </SelectTrigger>
                  <SelectContent>
                    {wallets.map((w) => (
                      <SelectItem key={String(w._id)} value={String(w._id)}>
                        {walletPickerLabel(w)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedWallet ? (
                  <p className="text-xs text-muted-foreground">
                    Adjusting: <span className="font-medium text-foreground">{walletPlanTitle(selectedWallet)}</span>
                    {" · "}
                    Current balance ₹
                    {Number(selectedWallet.remainingBalance || 0).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label>Amount (₹, + credit / − debit)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 4 or -10"
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Reason</Label>
                <Input
                  placeholder="Why you are changing the balance"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                />
              </div>
            </div>
            <Button type="button" size="sm" onClick={() => void submitAdjust()}>
              Apply adjustment
            </Button>
            <p className="text-xs text-muted-foreground">
              Pick the wallet from the list — you do not need to copy a wallet ID. Positive adds credit;
              negative deducts.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/quick-sale?clientId=${clientId}&prepaidWallet=1`}>Sell new wallet</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings?section=prepaid-wallet">Wallet settings</Link>
          </Button>
        </div>

        {wallets.length === 0 ? (
          <p className="text-gray-500 text-sm">No wallets for this client yet.</p>
        ) : (
          <ul className="space-y-3">
            {wallets.map((w) => (
              <li key={w._id} className="border rounded-xl p-4 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{walletPlanTitle(w)}</p>
                    <p className="text-sm text-gray-600">
                      Balance{" "}
                      <span className="font-mono font-medium text-gray-900">
                        ₹{Number(w.remainingBalance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>{" "}
                      / ₹{Number(w.creditedBalance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })} ·
                      Expires {new Date(w.expiryDate).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                  <Badge className={STATUS_COLOR[w.status] || "bg-gray-100"}>{w.status}</Badge>
                </div>
                {isManager ? (
                  <Button
                    variant="link"
                    className="px-0 h-auto text-sm"
                    type="button"
                    onClick={() => setAdjustWalletId(String(w._id))}
                  >
                    Use for manual adjustment
                  </Button>
                ) : null}
                <Button
                  variant="link"
                  className="px-0 h-auto text-sm ml-2"
                  type="button"
                  onClick={() => setExpanded(expanded === w._id ? null : w._id)}
                >
                  {expanded === w._id ? "Hide history" : "Show history"}
                </Button>
                {expanded === w._id && (
                  <ul className="mt-2 text-sm border-t pt-2 space-y-1 max-h-48 overflow-y-auto">
                    {(data.transactionsByWallet[String(w._id)] || []).map((tx: any) => {
                      const ledgerSide = clientWalletTxnToDebitCredit(tx)
                      return (
                        <li key={tx._id} className="flex justify-between gap-2 text-gray-700">
                          <span>
                            {ledgerSide} · {tx.description || "—"}
                            {tx.serviceNames?.length ? ` · ${tx.serviceNames.join(", ")}` : ""}
                          </span>
                          <span className="shrink-0 font-mono">
                            {ledgerSide === "Debit" ? "-" : "+"}₹{Math.abs(tx.amount)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </ProtectedLayout>
  )
}
