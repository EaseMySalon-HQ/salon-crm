"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { RewardPointsAPI } from "@/lib/api"
import { formatClientPhoneForDisplay } from "@/lib/walk-in-client"

type ClientBalanceRow = {
  id: string
  name: string
  phone: string
  email: string
  rewardPointsBalance: number
  updatedAt: string | null
}

function formatLedgerType(type: string, points: number) {
  const t = String(type || "").toLowerCase()
  if (t === "earn") return "Earned"
  if (t === "redeem") return "Redeemed"
  if (t === "expire") return "Expired"
  if (t === "adjust") return points >= 0 ? "Adjustment (+)" : "Adjustment (−)"
  return type || "—"
}

function formatLedgerDate(value: string | Date | null | undefined) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function RewardPointsLogsTab() {
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [includeZero, setIncludeZero] = useState(false)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ClientBalanceRow[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const [ledgerOpen, setLedgerOpen] = useState(false)
  const [ledgerClient, setLedgerClient] = useState<ClientBalanceRow | null>(null)
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerRows, setLedgerRows] = useState<any[]>([])
  const [ledgerSummary, setLedgerSummary] = useState<{
    lifetimeEarned: number
    lifetimeRedeemed: number
    balance: number
  } | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(t)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, includeZero])

  const loadBalances = useCallback(async () => {
    setLoading(true)
    try {
      const res = await RewardPointsAPI.listClientBalances({
        search: debouncedSearch || undefined,
        page,
        limit: 25,
        includeZero,
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
      setLoading(false)
    }
  }, [debouncedSearch, includeZero, page])

  useEffect(() => {
    void loadBalances()
  }, [loadBalances])

  const openLedger = async (client: ClientBalanceRow) => {
    setLedgerClient(client)
    setLedgerOpen(true)
    setLedgerLoading(true)
    setLedgerRows([])
    setLedgerSummary(null)
    try {
      const [ledgerRes, summaryRes] = await Promise.all([
        RewardPointsAPI.getLedger(client.id, { limit: 50, skip: 0 }),
        RewardPointsAPI.getSummary(client.id),
      ])
      if (ledgerRes.success && ledgerRes.data) {
        setLedgerRows(ledgerRes.data.rows || [])
      }
      if (summaryRes.success && summaryRes.data) {
        setLedgerSummary({
          balance: summaryRes.data.balance,
          lifetimeEarned: summaryRes.data.lifetimeEarned,
          lifetimeRedeemed: summaryRes.data.lifetimeRedeemed,
        })
      }
    } finally {
      setLedgerLoading(false)
    }
  }

  return (
    <>
      <Card className="border-slate-200/90 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/40 pb-4">
          <CardTitle className="text-lg text-slate-900">Client points</CardTitle>
          <CardDescription>
            Current reward point balances per client. Open a row to view the full ledger history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, phone, or email…"
                className="h-10 border-slate-200 bg-white pl-9"
              />
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-slate-200/80 bg-white px-3 py-2">
              <Switch id="rp-include-zero" checked={includeZero} onCheckedChange={setIncludeZero} />
              <Label htmlFor="rp-include-zero" className="text-sm font-normal cursor-pointer mb-0">
                Include zero balance
              </Label>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
              Loading client balances…
            </div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {debouncedSearch
                ? "No clients match your search."
                : includeZero
                  ? "No clients found."
                  : "No clients with a reward points balance yet."}
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200/80">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                    <TableHead>Client</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="w-[120px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-slate-900">{row.name || "—"}</TableCell>
                      <TableCell className="text-slate-600">
                        {row.phone ? formatClientPhoneForDisplay({ phone: row.phone, name: row.name }) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-violet-800">
                        {row.rewardPointsBalance.toLocaleString()} pts
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => void openLedger(row)}
                        >
                          View ledger
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {!loading && total > 0 && (
            <div className="flex items-center justify-between gap-3 pt-1">
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
        </CardContent>
      </Card>

      <Dialog open={ledgerOpen} onOpenChange={setLedgerOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{ledgerClient?.name || "Client ledger"}</DialogTitle>
            <DialogDescription>
              Reward points activity
              {ledgerClient?.phone ? ` · ${formatClientPhoneForDisplay({ phone: ledgerClient.phone, name: ledgerClient.name })}` : ""}
            </DialogDescription>
          </DialogHeader>

          {ledgerLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
              Loading ledger…
            </div>
          ) : (
            <div className="space-y-4">
              {ledgerSummary && (
                <div className="grid grid-cols-3 gap-3 rounded-lg border border-violet-100 bg-violet-50/40 p-3 text-center">
                  <div>
                    <p className="text-xs text-slate-500">Balance</p>
                    <p className="text-lg font-semibold tabular-nums text-violet-900">
                      {ledgerSummary.balance.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Lifetime earned</p>
                    <p className="text-lg font-semibold tabular-nums text-emerald-700">
                      +{ledgerSummary.lifetimeEarned.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Lifetime redeemed</p>
                    <p className="text-lg font-semibold tabular-nums text-amber-800">
                      −{ledgerSummary.lifetimeRedeemed.toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              {ledgerRows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No ledger entries yet.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Points</TableHead>
                        <TableHead className="text-right">Balance after</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledgerRows.map((entry) => {
                        const pts = Number(entry.points) || 0
                        return (
                          <TableRow key={String(entry._id || entry.createdAt)}>
                            <TableCell className="text-sm text-slate-600">
                              {formatLedgerDate(entry.createdAt)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {formatLedgerType(entry.type, pts)}
                              {entry.metadata?.reason ? (
                                <span className="block text-xs text-slate-500">{entry.metadata.reason}</span>
                              ) : null}
                            </TableCell>
                            <TableCell
                              className={`text-right tabular-nums font-medium ${
                                pts >= 0 ? "text-emerald-700" : "text-amber-800"
                              }`}
                            >
                              {pts >= 0 ? "+" : ""}
                              {pts.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-slate-700">
                              {Number(entry.balanceAfter ?? 0).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
