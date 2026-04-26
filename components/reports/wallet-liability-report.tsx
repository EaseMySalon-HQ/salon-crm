"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ClientWalletAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { Download } from "lucide-react"

export function WalletLiabilityReport() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<{ totalOutstanding: number; activeWalletCount: number } | null>(null)

  useEffect(() => {
    ClientWalletAPI.getLiability()
      .then((res) => {
        if (res.success && res.data) setSummary(res.data)
      })
      .finally(() => setLoading(false))
  }, [])

  const exportCsv = async () => {
    const [liab, hist] = await Promise.all([
      ClientWalletAPI.getLiability(),
      ClientWalletAPI.getHistory({ limit: 500 }),
    ])
    const rows: string[][] = []
    rows.push(["Type", "Value"])
    if (liab.success && liab.data) {
      rows.push(["Total outstanding (₹)", String(liab.data.totalOutstanding)])
      rows.push(["Active wallets", String(liab.data.activeWalletCount)])
    }
    rows.push([])
    rows.push(["Redemption history (debits)"])
    rows.push(["Date", "Amount", "Balance after", "Services", "Wallet id"])
    const list = hist.success && hist.data?.history ? hist.data.history : []
    for (const h of list) {
      rows.push([
        h.createdAt ? new Date(h.createdAt).toISOString() : "",
        String(h.amount ?? ""),
        String(h.balanceAfter ?? ""),
        (h.serviceNames || []).join(";"),
        String(h.walletId?._id || h.walletId || ""),
      ])
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `wallet-liability-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: "Export started", description: "CSV download should begin shortly." })
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading liability…</p>
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Total outstanding credit
          </p>
          <p className="text-2xl font-semibold tabular-nums">
            ₹{Number(summary?.totalOutstanding ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Active wallets
          </p>
          <p className="text-2xl font-semibold tabular-nums">{summary?.activeWalletCount ?? 0}</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Outstanding balance is the sum of remaining balances on all active client wallets. Export includes
        recent redemption debits for audit.
      </p>
      <Button type="button" variant="outline" size="sm" onClick={() => void exportCsv()}>
        <Download className="h-4 w-4 mr-2" />
        Export CSV
      </Button>
    </div>
  )
}
