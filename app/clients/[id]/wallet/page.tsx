"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ClientWalletAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth-context"
import { ProtectedLayout } from "@/components/layout/protected-layout"

const STATUS_COLOR: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  expired: "bg-red-100 text-red-800",
  exhausted: "bg-gray-100 text-gray-700",
  cancelled: "bg-gray-100 text-gray-500",
}

export default function ClientWalletPage() {
  const { id: clientId } = useParams<{ id: string }>()
  const router = useRouter()
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

  const load = async () => {
    setLoading(true)
    const res = await ClientWalletAPI.getClientWallets(clientId)
    if (res.success && res.data) {
      setData({
        wallets: res.data.wallets || [],
        transactionsByWallet: res.data.transactionsByWallet || {},
      })
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [clientId])

  const submitAdjust = async () => {
    if (!adjustWalletId || !adjustDelta) {
      toast({ title: "Wallet and amount required", variant: "destructive" })
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

        {isManager && (
          <div className="rounded-xl border p-4 space-y-3 bg-slate-50/80">
            <h2 className="font-semibold text-sm">Manual adjustment</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Wallet ID</Label>
                <Input
                  placeholder="Paste wallet _id"
                  value={adjustWalletId}
                  onChange={(e) => setAdjustWalletId(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Delta (₹, + credit / − debit)</Label>
                <Input
                  type="number"
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Reason</Label>
                <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
              </div>
            </div>
            <Button type="button" size="sm" onClick={() => void submitAdjust()}>
              Apply adjustment
            </Button>
            <p className="text-xs text-muted-foreground">
              Copy wallet id from a row below, or pick from the list. Positive adds credit; negative deducts.
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

        {data.wallets.length === 0 ? (
          <p className="text-gray-500 text-sm">No wallets for this client yet.</p>
        ) : (
          <ul className="space-y-3">
            {data.wallets.map((w) => (
              <li key={w._id} className="border rounded-xl p-4 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{w.planSnapshot?.planName || "Wallet"}</p>
                    <p className="text-sm text-gray-600">
                      Balance{" "}
                      <span className="font-mono font-medium text-gray-900">₹{w.remainingBalance}</span> / ₹
                      {w.creditedBalance} · Expires {new Date(w.expiryDate).toLocaleDateString("en-IN")}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1 font-mono">id: {String(w._id)}</p>
                  </div>
                  <Badge className={STATUS_COLOR[w.status] || "bg-gray-100"}>{w.status}</Badge>
                </div>
                <Button
                  variant="link"
                  className="px-0 h-auto text-sm"
                  type="button"
                  onClick={() => setExpanded(expanded === w._id ? null : w._id)}
                >
                  {expanded === w._id ? "Hide history" : "Show history"}
                </Button>
                {expanded === w._id && (
                  <ul className="mt-2 text-sm border-t pt-2 space-y-1 max-h-48 overflow-y-auto">
                    {(data.transactionsByWallet[String(w._id)] || []).map((tx: any) => (
                      <li key={tx._id} className="flex justify-between gap-2 text-gray-700">
                        <span>
                          {tx.type} · {tx.description || "—"}
                          {tx.serviceNames?.length ? ` · ${tx.serviceNames.join(", ")}` : ""}
                        </span>
                        <span className="shrink-0 font-mono">
                          {tx.type === "debit" ? "-" : "+"}₹{Math.abs(tx.amount)}
                        </span>
                      </li>
                    ))}
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
