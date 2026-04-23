"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  BarChart3,
  CalendarDays,
  Download,
  FileSpreadsheet,
  Filter,
  Hash,
  Loader2,
  Lock,
  LockOpen,
  RefreshCw,
  Search,
  ShieldCheck,
  Unlock,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"

import {
  AdminGstAPI,
  type GstBuyerType,
  type GstFilingRow,
  type GstInvoicesQuery,
  type GstInvoicesResponse,
  type GstProvider,
  type GstSource,
  type GstStatus,
  type GstSummaryResponse,
} from "@/lib/admin-api"

const PAGE_SIZE = 25

function currentPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function formatINR(paise: number): string {
  const rupees = Math.round(Number(paise) || 0) / 100
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—"
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return "—"
  return dt.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number)
  if (!y || !m) return period
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  })
}

/** Build a list of last N months as YYYY-MM strings, most recent first. */
function recentPeriods(count = 18): string[] {
  const now = new Date()
  const list: string[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    list.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    )
  }
  return list
}

export function GstReports() {
  const { toast } = useToast()

  const [period, setPeriod] = useState<string>(currentPeriod())
  const [from, setFrom] = useState<string>("")
  const [to, setTo] = useState<string>("")
  const [source, setSource] = useState<GstSource>("all")
  const [provider, setProvider] = useState<GstProvider>("all")
  const [status, setStatus] = useState<GstStatus>("all")
  const [buyerType, setBuyerType] = useState<GstBuyerType>("all")
  const [search, setSearch] = useState<string>("")
  const [page, setPage] = useState(1)

  const [summary, setSummary] = useState<GstSummaryResponse | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)

  const [invoices, setInvoices] = useState<GstInvoicesResponse | null>(null)
  const [invoicesLoading, setInvoicesLoading] = useState(true)

  const [filings, setFilings] = useState<GstFilingRow[]>([])
  const [filingsLoading, setFilingsLoading] = useState(true)

  const [exporting, setExporting] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [fileConfirmOpen, setFileConfirmOpen] = useState(false)
  const [filingPeriod, setFilingPeriod] = useState(period)
  const [fileBusy, setFileBusy] = useState(false)
  const [reopenPeriod, setReopenPeriod] = useState<string | null>(null)
  const [reopenBusy, setReopenBusy] = useState(false)

  const query: GstInvoicesQuery = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      period: from || to ? undefined : period,
      from: from || undefined,
      to: to || undefined,
      source,
      provider,
      status,
      buyerType,
      search: search.trim() || undefined,
    }),
    [page, period, from, to, source, provider, status, buyerType, search]
  )

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const data = await AdminGstAPI.summary(period)
      setSummary(data)
    } catch (err: any) {
      toast({
        title: "Couldn't load GST summary",
        description: err?.message || "Try again.",
        variant: "destructive",
      })
    } finally {
      setSummaryLoading(false)
    }
  }, [period, toast])

  const loadInvoices = useCallback(async () => {
    setInvoicesLoading(true)
    try {
      const data = await AdminGstAPI.listInvoices(query)
      setInvoices(data)
    } catch (err: any) {
      toast({
        title: "Couldn't load invoices",
        description: err?.message || "Try again.",
        variant: "destructive",
      })
    } finally {
      setInvoicesLoading(false)
    }
  }, [query, toast])

  const loadFilings = useCallback(async () => {
    setFilingsLoading(true)
    try {
      const rows = await AdminGstAPI.listFilings()
      setFilings(rows)
    } catch {
      // Non-fatal — the section will just render empty.
    } finally {
      setFilingsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  useEffect(() => {
    loadInvoices()
  }, [loadInvoices])

  useEffect(() => {
    loadFilings()
  }, [loadFilings])

  const handleExport = async (format: "csv" | "xlsx" | "gstr1") => {
    setExporting(true)
    try {
      const filename = await AdminGstAPI.exportInvoices({
        period: from || to ? undefined : period,
        from: from || undefined,
        to: to || undefined,
        source,
        provider,
        status,
        buyerType,
        search: search.trim() || undefined,
        format,
      })
      toast({
        title: "Export ready",
        description: `Downloaded ${filename}.`,
      })
    } catch (err: any) {
      toast({
        title: "Export failed",
        description: err?.message || "Try again.",
        variant: "destructive",
      })
    } finally {
      setExporting(false)
    }
  }

  const handleDownloadInvoice = async (invoiceId: string) => {
    setDownloadingId(invoiceId)
    try {
      await AdminGstAPI.downloadInvoice(invoiceId)
    } catch (err: any) {
      toast({
        title: "Download failed",
        description: err?.message || "Try again.",
        variant: "destructive",
      })
    } finally {
      setDownloadingId(null)
    }
  }

  const openFileConfirm = () => {
    setFilingPeriod(from || to ? currentPeriod() : period)
    setFileConfirmOpen(true)
  }

  const handleFile = async () => {
    setFileBusy(true)
    try {
      await AdminGstAPI.fileReturn(filingPeriod)
      toast({
        title: "Period filed",
        description: `${periodLabel(filingPeriod)} is now locked.`,
      })
      setFileConfirmOpen(false)
      await Promise.all([loadSummary(), loadInvoices(), loadFilings()])
    } catch (err: any) {
      toast({
        title: "Filing failed",
        description: err?.message || "Try again.",
        variant: "destructive",
      })
    } finally {
      setFileBusy(false)
    }
  }

  const handleReopen = async () => {
    if (!reopenPeriod) return
    setReopenBusy(true)
    try {
      await AdminGstAPI.reopen(reopenPeriod)
      toast({
        title: "Period reopened",
        description: `${periodLabel(reopenPeriod)} is unlocked.`,
      })
      setReopenPeriod(null)
      await Promise.all([loadSummary(), loadInvoices(), loadFilings()])
    } catch (err: any) {
      toast({
        title: "Reopen failed",
        description: err?.message || "Try again.",
        variant: "destructive",
      })
    } finally {
      setReopenBusy(false)
    }
  }

  const currentPeriodLocked = !!summary?.filing

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">GST Reports</h3>
          <p className="text-sm text-slate-500">
            Single source of truth for SaaS revenue invoices (wallet + plan).
            Filter by period or date range, export for GST portal upload, and
            lock a month once the return has been filed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v)}>
            <SelectTrigger className="w-44 border-slate-200">
              <CalendarDays className="h-4 w-4 mr-2 text-slate-500" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {recentPeriods().map((p) => (
                <SelectItem key={p} value={p}>
                  {periodLabel(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadSummary()
              loadInvoices()
              loadFilings()
            }}
            className="border-slate-200"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          title="Invoices Today"
          value={
            summaryLoading
              ? null
              : String(summary?.today.count ?? 0)
          }
          subtitle={
            summaryLoading
              ? null
              : formatINR(summary?.today.grandTotalPaise ?? 0)
          }
          icon={Hash}
        />
        <KpiCard
          title="This Month Taxable"
          value={
            summaryLoading
              ? null
              : formatINR(summary?.month.taxablePaise ?? 0)
          }
          subtitle={
            summaryLoading
              ? null
              : `${summary?.month.count ?? 0} invoices`
          }
          icon={BarChart3}
        />
        <KpiCard
          title="This Month GST"
          value={
            summaryLoading
              ? null
              : formatINR(summary?.month.totalTaxPaise ?? 0)
          }
          subtitle={
            summaryLoading
              ? null
              : `CGST ${formatINR(summary?.month.cgstPaise ?? 0)} · SGST ${formatINR(
                  summary?.month.sgstPaise ?? 0
                )} · IGST ${formatINR(summary?.month.igstPaise ?? 0)}`
          }
          icon={ShieldCheck}
        />
        <KpiCard
          title="B2B vs B2C"
          value={
            summaryLoading
              ? null
              : `${summary?.month.b2b.count ?? 0} / ${summary?.month.b2c.count ?? 0}`
          }
          subtitle={
            summaryLoading
              ? null
              : `B2B ${formatINR(summary?.month.b2b.taxablePaise ?? 0)} · B2C ${formatINR(
                  summary?.month.b2c.taxablePaise ?? 0
                )}`
          }
          icon={Filter}
        />
      </div>

      {/* Filing status banner */}
      {currentPeriodLocked && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-emerald-900">
            <Lock className="h-4 w-4" />
            <span>
              <strong>{periodLabel(period)}</strong> was filed on{" "}
              {formatDate(summary?.filing?.filedAt)} by{" "}
              {summary?.filing?.filedBy || "admin"}. Invoices in this period
              are locked.
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-emerald-200 text-emerald-900"
            onClick={() => setReopenPeriod(period)}
          >
            <Unlock className="h-4 w-4 mr-2" />
            Reopen…
          </Button>
        </div>
      )}

      {/* Filter bar */}
      <Card className="border-slate-200/80">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <Label className="text-xs text-slate-500">From</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value)
                  setPage(1)
                }}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">To</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value)
                  setPage(1)
                }}
                className="h-9"
              />
            </div>
            <FilterSelect
              label="Source"
              value={source}
              onChange={(v) => {
                setSource(v as GstSource)
                setPage(1)
              }}
              options={[
                { value: "all", label: "All sources" },
                { value: "plan", label: "Plan subscription" },
                { value: "wallet", label: "Wallet recharge" },
              ]}
            />
            <FilterSelect
              label="Provider"
              value={provider}
              onChange={(v) => {
                setProvider(v as GstProvider)
                setPage(1)
              }}
              options={[
                { value: "all", label: "All providers" },
                { value: "razorpay", label: "Razorpay" },
                { value: "stripe", label: "Stripe" },
                { value: "zoho", label: "Zoho Pay" },
                { value: "system", label: "System" },
              ]}
            />
            <FilterSelect
              label="Buyer Type"
              value={buyerType}
              onChange={(v) => {
                setBuyerType(v as GstBuyerType)
                setPage(1)
              }}
              options={[
                { value: "all", label: "All buyers" },
                { value: "B2B", label: "B2B (with GSTIN)" },
                { value: "B2C", label: "B2C" },
              ]}
            />
            <FilterSelect
              label="Status"
              value={status}
              onChange={(v) => {
                setStatus(v as GstStatus)
                setPage(1)
              }}
              options={[
                { value: "all", label: "All statuses" },
                { value: "generated", label: "Generated" },
                { value: "reported", label: "Reported" },
                { value: "filed", label: "Filed" },
              ]}
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <Label className="text-xs text-slate-500">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Invoice no, buyer name, GSTIN, payment id…"
                  className="h-9 pl-8"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={exporting} className="border-slate-200">
                    {exporting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                    )}
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Export filtered invoices</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleExport("csv")}>
                    CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("xlsx")}>
                    Excel (XLSX)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("gstr1")}>
                    GSTR-1 template
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                onClick={openFileConfirm}
                disabled={currentPeriodLocked}
                className="bg-slate-900 hover:bg-slate-800 text-white"
              >
                <Lock className="h-4 w-4 mr-2" />
                Mark as Filed
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice table */}
      <Card className="border-slate-200/80">
        <CardContent className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>GSTIN</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">CGST</TableHead>
                  <TableHead className="text-right">SGST</TableHead>
                  <TableHead className="text-right">IGST</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoicesLoading && (
                  <>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 12 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </>
                )}

                {!invoicesLoading && invoices?.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-sm text-slate-500 py-10">
                      No invoices match these filters.
                    </TableCell>
                  </TableRow>
                )}

                {!invoicesLoading &&
                  invoices?.rows.map((r) => (
                    <TableRow key={r._id}>
                      <TableCell className="font-mono text-xs">
                        {r.invoiceNumber}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(r.invoiceDate)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            r.source === "plan"
                              ? "border-indigo-200 text-indigo-700 bg-indigo-50"
                              : "border-emerald-200 text-emerald-700 bg-emerald-50"
                          }
                        >
                          {r.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate" title={r.buyer.name || ""}>
                        {r.buyer.name || <span className="text-slate-400">—</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.buyer.gstin ? (
                          r.buyer.gstin
                        ) : (
                          <Badge variant="outline" className="text-slate-500">B2C</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {formatINR(r.taxableValuePaise)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {formatINR(r.cgstPaise)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {formatINR(r.sgstPaise)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {formatINR(r.igstPaise)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap font-medium">
                        {formatINR(r.grandTotalPaise)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadInvoice(r._id)}
                          disabled={downloadingId === r._id}
                        >
                          {downloadingId === r._id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>

          {!invoicesLoading && invoices && invoices.pagination.total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-600">
              <div>
                <span className="font-medium">Totals:</span>{" "}
                Taxable {formatINR(invoices.totals.taxablePaise)} · Tax{" "}
                {formatINR(invoices.totals.totalTaxPaise)} · Grand{" "}
                {formatINR(invoices.totals.grandTotalPaise)}
              </div>
              <div className="flex items-center gap-2">
                <span>
                  Page {invoices.pagination.page} of{" "}
                  {invoices.pagination.totalPages} · {invoices.pagination.total} rows
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-200"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-200"
                  disabled={page >= (invoices.pagination.totalPages || 1)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filings history */}
      <Card className="border-slate-200/80">
        <CardContent className="p-4 space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">
              Filings history
            </h4>
            <p className="text-xs text-slate-500">
              Locked periods. Reopen is restricted to super admins and is
              intended only to correct mistakes before the return is submitted
              at the GST portal.
            </p>
          </div>
          {filingsLoading && <Skeleton className="h-12 w-full" />}
          {!filingsLoading && filings.length === 0 && (
            <p className="text-sm text-slate-500 py-4">No periods filed yet.</p>
          )}
          {!filingsLoading && filings.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Filed at</TableHead>
                    <TableHead>Filed by</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                    <TableHead className="text-right">Taxable</TableHead>
                    <TableHead className="text-right">Total Tax</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filings.map((f) => {
                    const isActive = !f.reopenedAt
                    return (
                      <TableRow key={f._id}>
                        <TableCell>{periodLabel(f.period)}</TableCell>
                        <TableCell>{formatDate(f.filedAt)}</TableCell>
                        <TableCell>{f.filedBy || "—"}</TableCell>
                        <TableCell className="text-right">
                          {f.counts?.total ?? 0} ({f.counts?.b2b ?? 0} B2B /{" "}
                          {f.counts?.b2c ?? 0} B2C)
                        </TableCell>
                        <TableCell className="text-right">
                          {formatINR(f.totals?.taxablePaise ?? 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatINR(f.totals?.totalTaxPaise ?? 0)}
                        </TableCell>
                        <TableCell>
                          {isActive ? (
                            <Badge className="bg-slate-900 text-white">Filed</Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-300 text-amber-700">
                              Reopened
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isActive && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setReopenPeriod(f.period)}
                            >
                              <LockOpen className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm file dialog */}
      <AlertDialog open={fileConfirmOpen} onOpenChange={setFileConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lock {periodLabel(filingPeriod)}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark every invoice with filing period{" "}
              <strong>{filingPeriod}</strong> as <strong>filed</strong> and
              prevent further edits. Do this after you&apos;ve uploaded the
              return on the GST portal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <Label className="text-xs text-slate-500">Period to lock</Label>
            <Select value={filingPeriod} onValueChange={(v) => setFilingPeriod(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {recentPeriods().map((p) => (
                  <SelectItem key={p} value={p}>
                    {periodLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={fileBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={fileBusy}
              onClick={(e) => {
                e.preventDefault()
                handleFile()
              }}
            >
              {fileBusy ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Lock className="h-4 w-4 mr-2" />
              )}
              Mark as Filed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reopen dialog */}
      <AlertDialog
        open={!!reopenPeriod}
        onOpenChange={(open) => {
          if (!open) setReopenPeriod(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reopen {reopenPeriod ? periodLabel(reopenPeriod) : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This unlocks every invoice in this period. Use only for pre-upload
              corrections. Once the return is actually submitted at the GST
              portal, reopening will create a compliance mismatch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reopenBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={reopenBusy}
              onClick={(e) => {
                e.preventDefault()
                handleReopen()
              }}
            >
              {reopenBusy ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <LockOpen className="h-4 w-4 mr-2" />
              )}
              Reopen period
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string
  value: string | null
  subtitle: string | null
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card className="border-slate-200/80">
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-slate-500 text-xs uppercase tracking-wide">
          <span>{title}</span>
          <Icon className="h-4 w-4" />
        </div>
        <div className="mt-2">
          {value === null ? (
            <Skeleton className="h-7 w-28" />
          ) : (
            <div className="text-lg font-semibold text-slate-900 whitespace-nowrap">
              {value}
            </div>
          )}
          {subtitle === null ? (
            <Skeleton className="h-3 w-40 mt-2" />
          ) : (
            <div className="text-xs text-slate-500 mt-1">{subtitle}</div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <Label className="text-xs text-slate-500">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function StatusBadge({ status }: { status: "generated" | "reported" | "filed" }) {
  if (status === "filed") {
    return (
      <Badge className="bg-slate-900 text-white">
        <Lock className="h-3 w-3 mr-1" />
        Filed
      </Badge>
    )
  }
  if (status === "reported") {
    return (
      <Badge variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-50">
        Reported
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-slate-200 text-slate-700">
      Generated
    </Badge>
  )
}
