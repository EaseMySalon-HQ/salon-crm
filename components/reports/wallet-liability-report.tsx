"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ClientWalletAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { Download, Loader2, Search, ChevronLeft, ChevronRight } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatClientPhoneForDisplay } from "@/lib/walk-in-client"
import Link from "next/link"

const PREPAID_WALLET_LIABILITY_RETURN = "/settings?section=prepaid-wallet&prepaidWalletTab=liability"

type ClientLiabilityRow = {
  clientId: string
  name: string
  phone: string
  email: string
  totalOutstanding: number
  walletCount: number
  soonestExpiry: string | null
}

function formatExpiry(value: string | null) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
}

export function WalletLiabilityReport() {
  const { toast } = useToast()
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summary, setSummary] = useState<{ totalOutstanding: number; activeWalletCount: number } | null>(
    null
  )

  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [page, setPage] = useState(1)
  const [listLoading, setListLoading] = useState(true)
  const [rows, setRows] = useState<ClientLiabilityRow[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    ClientWalletAPI.getLiability()
      .then((res) => {
        if (res.success && res.data) setSummary(res.data)
      })
      .finally(() => setSummaryLoading(false))
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(t)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  const loadClients = useCallback(async () => {
    setListLoading(true)
    try {
      const res = await ClientWalletAPI.listClientLiability({
        search: debouncedSearch || undefined,
        page,
        limit: 25,
      })
      if (res.success && res.data) {
        setRows(res.data.rows || [])
        setTotalPages(res.data.totalPages || 1)
        setTotal(res.data.total || 0)
      } else {
        setRows([])
        setTotalPages(1)
        setTotal(0)
      }
    } finally {
      setListLoading(false)
    }
  }, [debouncedSearch, page])

  useEffect(() => {
    void loadClients()
  }, [loadClients])

  const exportCsv = async () => {
    const [liab, clientsRes, hist] = await Promise.all([
      ClientWalletAPI.getLiability(),
      ClientWalletAPI.listClientLiability({ limit: 100, page: 1 }),
      ClientWalletAPI.getHistory({ limit: 500 }),
    ])
    const csvRows: string[][] = []
    csvRows.push(["Type", "Value"])
    if (liab.success && liab.data) {
      csvRows.push(["Total outstanding (₹)", String(liab.data.totalOutstanding)])
      csvRows.push(["Active wallets", String(liab.data.activeWalletCount)])
    }
    csvRows.push([])
    csvRows.push(["Clients with liability"])
    csvRows.push(["Client", "Phone", "Email", "Outstanding (₹)", "Active wallets", "Soonest expiry"])
    const clients = clientsRes.success && clientsRes.data?.rows ? clientsRes.data.rows : []
    for (const c of clients) {
      csvRows.push([
        c.name,
        c.phone,
        c.email,
        String(c.totalOutstanding),
        String(c.walletCount),
        c.soonestExpiry ? new Date(c.soonestExpiry).toISOString().slice(0, 10) : "",
      ])
    }
    csvRows.push([])
    csvRows.push(["Redemption history (debits)"])
    csvRows.push(["Date", "Amount", "Balance after", "Services", "Wallet id"])
    const list = hist.success && hist.data?.history ? hist.data.history : []
    for (const h of list) {
      csvRows.push([
        h.createdAt ? new Date(h.createdAt).toISOString() : "",
        String(h.amount ?? ""),
        String(h.balanceAfter ?? ""),
        (h.serviceNames || []).join(";"),
        String(h.walletId?._id || h.walletId || ""),
      ])
    }
    const csv = csvRows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `wallet-liability-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: "Export started", description: "CSV download should begin shortly." })
  }

  return (
    <div className="space-y-6">
      {summaryLoading ? (
        <p className="text-sm text-muted-foreground">Loading summary…</p>
      ) : (
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
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active wallets</p>
            <p className="text-2xl font-semibold tabular-nums">{summary?.activeWalletCount ?? 0}</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Clients with liability</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Customers with active prepaid wallet balance at this branch.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void exportCsv()}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or email…"
            className="h-10 border-slate-200 bg-white pl-9"
          />
        </div>

        {listLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
            Loading clients…
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {debouncedSearch ? "No clients match your search." : "No outstanding prepaid wallet liability."}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200/80">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                  <TableHead>Client</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Wallets</TableHead>
                  <TableHead>Soonest expiry</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.clientId}>
                    <TableCell className="font-medium text-slate-900">{row.name || "—"}</TableCell>
                    <TableCell className="text-slate-600">
                      {row.phone ? formatClientPhoneForDisplay({ phone: row.phone, name: row.name }) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-indigo-800">
                      ₹
                      {row.totalOutstanding.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-700">{row.walletCount}</TableCell>
                    <TableCell className="text-slate-600">{formatExpiry(row.soonestExpiry)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="h-8" asChild>
                        <Link
                          href={`/clients/${row.clientId}/wallet?returnTo=${encodeURIComponent(PREPAID_WALLET_LIABILITY_RETURN)}`}
                        >
                          View
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!listLoading && total > 0 && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              {total.toLocaleString()} client{total === 1 ? "" : "s"}
              {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ""}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
