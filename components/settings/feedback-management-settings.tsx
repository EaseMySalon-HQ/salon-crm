"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns"
import { FeedbackAPI } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { Loader2, Star } from "lucide-react"

type Row = {
  _id: string
  customerName: string
  customerPhone: string
  invoiceNumber: string
  branchId: string
  rating: number
  reviewText: string
  source: string
  submittedAt: string
  status: string
}

function sourceLabel(s: string) {
  if (s === "whatsapp") return "WhatsApp"
  if (s === "sms") return "SMS"
  if (s === "invoice_page") return "Invoice page"
  if (s === "public_link") return "Public link"
  return s || "—"
}

function statusBadgeVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "new") return "default"
  if (status === "reviewed") return "secondary"
  return "outline"
}

function shortBranch(id: string) {
  if (!id) return "—"
  const s = String(id)
  return s.length > 10 ? `${s.slice(-6)}` : s
}

type FeedbackDatePeriod =
  | "all"
  | "today"
  | "yesterday"
  | "last_7d"
  | "last_30d"
  | "current_month"
  | "last_month"
  | "custom"

function getRangeForPeriod(
  period: FeedbackDatePeriod,
  customFrom: string,
  customTo: string
): { from: string; to: string } | null {
  const now = new Date()
  switch (period) {
    case "all":
      return null
    case "today":
      return { from: format(now, "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") }
    case "yesterday": {
      const y = subDays(now, 1)
      return { from: format(y, "yyyy-MM-dd"), to: format(y, "yyyy-MM-dd") }
    }
    case "last_7d":
      return { from: format(subDays(now, 6), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") }
    case "last_30d":
      return { from: format(subDays(now, 29), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") }
    case "current_month":
      return { from: format(startOfMonth(now), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") }
    case "last_month": {
      const lm = subMonths(now, 1)
      return {
        from: format(startOfMonth(lm), "yyyy-MM-dd"),
        to: format(endOfMonth(lm), "yyyy-MM-dd"),
      }
    }
    case "custom": {
      if (!customFrom?.trim() || !customTo?.trim()) return null
      return { from: customFrom, to: customTo }
    }
    default:
      return null
  }
}

export function FeedbackManagementSettings() {
  const { hasPermission } = useAuth()
  const { toast } = useToast()
  const canView = hasPermission("feedback", "view")
  const canEdit = hasPermission("feedback", "edit") || hasPermission("feedback", "manage")

  const [stats, setStats] = useState<{
    total: number
    averageRating: number | null
    fiveStarCount: number
    lowRatingCount: number
    pendingFollowUpCount: number
  } | null>(null)
  const [branches, setBranches] = useState<{ id: string }[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const limit = 20

  const [ratingFilter, setRatingFilter] = useState<string>("all")
  const [branchFilter, setBranchFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [datePeriod, setDatePeriod] = useState<FeedbackDatePeriod>("all")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")

  const dateRangeParams = useMemo(
    () => getRangeForPeriod(datePeriod, customFrom, customTo),
    [datePeriod, customFrom, customTo]
  )

  const [loading, setLoading] = useState(true)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [notesDraft, setNotesDraft] = useState("")
  const [saving, setSaving] = useState(false)

  const loadStats = useCallback(async () => {
    const r = await FeedbackAPI.getStats()
    if (r.success && r.data) setStats(r.data)
  }, [])

  const loadBranches = useCallback(async () => {
    const r = await FeedbackAPI.getBranches()
    if (r.success && Array.isArray(r.data)) setBranches(r.data)
  }, [])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page, limit }
      if (ratingFilter !== "all") params.rating = Number(ratingFilter)
      if (branchFilter !== "all") params.branchId = branchFilter
      if (statusFilter !== "all") params.status = statusFilter
      if (dateRangeParams?.from) params.from = dateRangeParams.from
      if (dateRangeParams?.to) params.to = dateRangeParams.to

      const r = await FeedbackAPI.list(params)
      if (r.success && r.data) {
        setRows(r.data.items || [])
        setTotal(r.data.total || 0)
      }
    } finally {
      setLoading(false)
    }
  }, [page, limit, ratingFilter, branchFilter, statusFilter, dateRangeParams])

  useEffect(() => {
    if (!canView) return
    loadStats()
    loadBranches()
  }, [canView, loadStats, loadBranches])

  useEffect(() => {
    if (!canView) return
    loadList()
  }, [canView, loadList])

  const openDetail = async (id: string) => {
    setDetailId(id)
    setDetail(null)
    setNotesDraft("")
    const r = await FeedbackAPI.getById(id)
    if (r.success && r.data) {
      setDetail(r.data)
      setNotesDraft(r.data.internalNotes || "")
    } else {
      toast({ title: "Error", description: r.error || "Could not load feedback", variant: "destructive" })
    }
  }

  const saveNotes = async () => {
    if (!detailId || !canEdit) return
    setSaving(true)
    try {
      const r = await FeedbackAPI.updateNotes(detailId, notesDraft)
      if (r.success) {
        toast({ title: "Saved", description: "Internal notes updated." })
        await loadList()
        if (detail) setDetail({ ...detail, internalNotes: notesDraft })
      } else {
        toast({ title: "Error", description: r.error || "Save failed", variant: "destructive" })
      }
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (status: string) => {
    if (!detailId || !canEdit) return
    setSaving(true)
    try {
      const r = await FeedbackAPI.updateStatus(detailId, status)
      if (r.success) {
        toast({ title: "Updated", description: `Status: ${status}` })
        await loadList()
        if (detail) setDetail({ ...detail, status })
      } else {
        toast({ title: "Error", description: r.error || "Update failed", variant: "destructive" })
      }
    } finally {
      setSaving(false)
    }
  }

  if (!canView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
        You don&apos;t have permission to view Feedback Management.
      </div>
    )
  }

  return (
    <div className="w-full max-w-none min-w-0 space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Feedback Management</h2>
        <p className="text-sm text-slate-500 mt-1">
          Review ratings and comments from customers after each visit.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: "Total", value: stats.total },
            { label: "Avg rating", value: stats.averageRating ?? "—" },
            { label: "5-star", value: stats.fiveStarCount },
            { label: "Low (≤4)", value: stats.lowRatingCount },
            { label: "Pending (new)", value: stats.pendingFollowUpCount },
          ].map((k) => (
            <Card key={k.label} className="border-slate-200/90 shadow-sm">
              <CardHeader className="py-3 px-4">
                <CardDescription className="text-xs">{k.label}</CardDescription>
                <CardTitle className="text-xl font-semibold tabular-nums">{k.value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-slate-200/90 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Rating</Label>
            <Select value={ratingFilter} onValueChange={(v) => { setPage(1); setRatingFilter(v) }}>
              <SelectTrigger className="h-9 w-[120px] shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {[5, 4, 3, 2, 1].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} stars</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Branch</Label>
            <Select value={branchFilter} onValueChange={(v) => { setPage(1); setBranchFilter(v) }}>
              <SelectTrigger className="h-9 w-[160px] shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{shortBranch(b.id)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => { setPage(1); setStatusFilter(v) }}>
              <SelectTrigger className="h-9 w-[140px] shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="feedback-date-period" className="text-xs">
              Date range
            </Label>
            <Select
              value={datePeriod}
              onValueChange={(v) => {
                setPage(1)
                setDatePeriod(v as FeedbackDatePeriod)
              }}
            >
              <SelectTrigger id="feedback-date-period" className="h-9 w-[200px] shrink-0">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="last_7d">Last 7 days</SelectItem>
                <SelectItem value="last_30d">Last 30 days</SelectItem>
                <SelectItem value="current_month">This month</SelectItem>
                <SelectItem value="last_month">Last month</SelectItem>
                <SelectItem value="custom">Custom range…</SelectItem>
              </SelectContent>
            </Select>
            {datePeriod === "custom" && (!customFrom || !customTo) ? (
              <p className="text-[11px] text-amber-700/90 leading-tight max-w-[220px]">
                Choose dates below to apply a custom range.
              </p>
            ) : null}
          </div>
          {datePeriod === "custom" ? (
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <Label htmlFor="feedback-custom-from" className="text-xs">
                  From
                </Label>
                <Input
                  id="feedback-custom-from"
                  type="date"
                  className="h-9 w-[150px]"
                  value={customFrom}
                  onChange={(e) => {
                    setPage(1)
                    setCustomFrom(e.target.value)
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="feedback-custom-to" className="text-xs">
                  To
                </Label>
                <Input
                  id="feedback-custom-to"
                  type="date"
                  className="h-9 w-[150px]"
                  value={customTo}
                  onChange={(e) => {
                    setPage(1)
                    setCustomTo(e.target.value)
                  }}
                />
              </div>
            </div>
          ) : null}
          <Button type="button" variant="secondary" size="sm" className="h-9" onClick={() => { loadStats(); loadList() }}>
            Refresh
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200/90 shadow-sm overflow-hidden">
        <div className="overflow-x-auto w-full min-w-0">
          <Table className="w-full min-w-[56rem] table-auto">
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead className="text-xs font-medium">Customer</TableHead>
                <TableHead className="text-xs font-medium">Phone</TableHead>
                <TableHead className="text-xs font-medium">Invoice</TableHead>
                <TableHead className="text-xs font-medium">Branch</TableHead>
                <TableHead className="text-xs font-medium">Rating</TableHead>
                <TableHead className="text-xs font-medium min-w-[14rem] w-[38%]">Comment</TableHead>
                <TableHead className="text-xs font-medium">Source</TableHead>
                <TableHead className="text-xs font-medium">Submitted</TableHead>
                <TableHead className="text-xs font-medium">Status</TableHead>
                <TableHead className="text-xs font-medium text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-10 text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-10 text-slate-500 text-sm">
                    No feedback yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r._id} className="text-sm">
                    <TableCell className="font-medium text-slate-900">{r.customerName || "—"}</TableCell>
                    <TableCell className="text-slate-600">{r.customerPhone || "—"}</TableCell>
                    <TableCell>{r.invoiceNumber || "—"}</TableCell>
                    <TableCell className="text-slate-500 font-mono text-xs">{shortBranch(r.branchId)}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-0.5 text-amber-600">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        {r.rating}
                      </span>
                    </TableCell>
                    <TableCell
                      className="min-w-[14rem] align-top py-3 text-slate-600 whitespace-normal break-words line-clamp-3"
                      title={r.reviewText || undefined}
                    >
                      {r.reviewText || "—"}
                    </TableCell>
                    <TableCell>{sourceLabel(r.source)}</TableCell>
                    <TableCell className="text-slate-600 whitespace-nowrap text-xs">
                      {r.submittedAt
                        ? format(new Date(r.submittedAt), "MMM d, yyyy HH:mm")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(r.status)} className="capitalize text-xs">
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => openDetail(r._id)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {total > limit ? (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-600">
            <span>
              Page {page} · {total} total
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page * limit >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <Sheet open={!!detailId} onOpenChange={(o) => { if (!o) { setDetailId(null); setDetail(null) } }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Feedback details</SheetTitle>
            <SheetDescription>
              {detail?.customerName} · Invoice {detail?.invoice?.billNo || "—"}
            </SheetDescription>
          </SheetHeader>
          {detail && (
            <div className="mt-6 space-y-5 text-sm">
              <div className="grid grid-cols-2 gap-3 text-slate-600">
                <div>
                  <p className="text-xs text-slate-500">Phone</p>
                  <p className="font-medium text-slate-900">{detail.customerPhone || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Rating</p>
                  <p className="font-medium text-slate-900 inline-flex items-center gap-1">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    {detail.rating}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-500">Submitted</p>
                  <p className="text-slate-800">
                    {detail.submittedAt
                      ? format(new Date(detail.submittedAt), "PPpp")
                      : "—"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Review</p>
                <p className="text-slate-800 whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  {detail.reviewText || "—"}
                </p>
              </div>
              {detail.invoice?.items?.length ? (
                <div>
                  <p className="text-xs text-slate-500 mb-2">Invoice lines</p>
                  <ul className="space-y-1 text-xs text-slate-700 max-h-40 overflow-y-auto border border-slate-100 rounded-lg p-2">
                    {detail.invoice.items.map((it: any, i: number) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="truncate">{it.name}</span>
                        <span className="shrink-0 text-slate-500">{it.type}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div>
                <Label className="text-xs">Internal notes</Label>
                <Textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  disabled={!canEdit || saving}
                  className="mt-1 min-h-[100px] text-sm"
                  placeholder="Private notes for your team…"
                />
                <Button
                  type="button"
                  size="sm"
                  className="mt-2"
                  disabled={!canEdit || saving}
                  onClick={saveNotes}
                >
                  Save notes
                </Button>
              </div>
              {canEdit ? (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <Label className="text-xs">Status</Label>
                  <div className="flex flex-wrap gap-2">
                    {(["new", "reviewed", "resolved"] as const).map((st) => (
                      <Button
                        key={st}
                        type="button"
                        size="sm"
                        variant={detail.status === st ? "default" : "outline"}
                        disabled={saving}
                        className="capitalize"
                        onClick={() => setStatus(st)}
                      >
                        {st}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
