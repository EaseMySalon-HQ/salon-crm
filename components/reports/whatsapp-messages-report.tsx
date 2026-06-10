"use client"

/**
 * Reports → Messages tab.
 *
 * Surfaces every WhatsApp message routed through the salon CRM with full
 * filtering and at-a-glance usage cards. Built on /whatsapp/v2/messages
 * which now joins client name, template name and campaign name server-side.
 *
 * Key decisions:
 *  - Pagination is server-side (skip/limit). Page size 50 matches the inbox.
 *  - Filters live in URL-friendly state but we don't sync to query params
 *    yet — the Reports page already owns the `?tab=` param and we don't
 *    want to fight it.
 *  - CSV export pulls a fresh page-1 with limit=200 instead of the current
 *    page so the export reflects "what the user is filtering" not "what
 *    they happen to be paged on". Larger exports go through the regular
 *    download flow on the backend (out of scope here).
 */

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  WhatsAppMessagesAPI,
  WhatsAppCampaignsAPI,
  WhatsAppTemplatesAPI,
} from "@/lib/api"
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  IndianRupee,
  MessageCircle,
  RefreshCw,
  Search,
  Wallet,
  XCircle,
} from "lucide-react"
import { format } from "date-fns"

const STATUSES = ["queued", "sent", "delivered", "read", "failed"] as const
const CATEGORIES = ["marketing", "utility", "authentication", "service"] as const
const PAGE_SIZE = 50

type Filters = {
  from: string
  to: string
  status: string
  category: string
  campaignId: string
  templateId: string
  freeWindowOnly: boolean
  q: string
}

type Usage = {
  total?: number
  sent?: number
  delivered?: number
  read?: number
  failed?: number
  freeWindow?: number
  totalCost?: number
  deliveryRate?: number
  readRate?: number
}

type Row = {
  _id: string
  recipientPhone?: string
  direction?: "inbound" | "outbound"
  intent?: string | null
  category?: string | null
  status?: string
  failureCode?: string | number | null
  failureReason?: string | null
  costPaise?: number
  freeWindow?: boolean
  timestamp?: string
  clientName?: string | null
  templateName?: string | null
  templateCategory?: string | null
  campaignName?: string | null
  /* Allow drilldown to inspect everything else */
  [key: string]: any
}

const defaultFilters: Filters = {
  from: "",
  to: "",
  status: "any",
  category: "any",
  campaignId: "any",
  templateId: "any",
  freeWindowOnly: false,
  q: "",
}

export function WhatsAppMessagesReport() {
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [items, setItems] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [page, setPage] = useState(1)
  const [drilldown, setDrilldown] = useState<Row | null>(null)

  const queryParams = useMemo(() => {
    const p: Record<string, any> = {}
    if (filters.from) p.from = new Date(filters.from).toISOString()
    if (filters.to) {
      // Push 'to' to end-of-day so dashboard "till today" includes today's messages.
      const d = new Date(filters.to)
      d.setHours(23, 59, 59, 999)
      p.to = d.toISOString()
    }
    if (filters.status && filters.status !== "any") p.status = filters.status
    if (filters.category && filters.category !== "any") p.category = filters.category
    if (filters.campaignId && filters.campaignId !== "any") p.campaignId = filters.campaignId
    if (filters.templateId && filters.templateId !== "any") p.templateId = filters.templateId
    if (filters.freeWindowOnly) p.freeWindowOnly = "true"
    if (filters.q.trim()) p.q = filters.q.trim()
    return p
  }, [filters])

  // Reset page whenever the filter set changes — otherwise users land on
  // page 4 with an empty result after narrowing the date range.
  useEffect(() => {
    setPage(1)
  }, [JSON.stringify(queryParams)])

  async function refresh() {
    setLoading(true)
    try {
      const [list, usageRes, campaignsRes, templatesRes] = await Promise.all([
        WhatsAppMessagesAPI.list({
          ...queryParams,
          limit: PAGE_SIZE,
          skip: (page - 1) * PAGE_SIZE,
        }),
        WhatsAppMessagesAPI.usage(queryParams),
        WhatsAppCampaignsAPI.list(),
        WhatsAppTemplatesAPI.list(),
      ])
      if (list.success) {
        setItems((list.data?.items || []) as Row[])
        setTotal(list.data?.total || 0)
      }
      if (usageRes.success) setUsage(usageRes.data as Usage)
      if (campaignsRes.success) setCampaigns(campaignsRes.data || [])
      if (templatesRes.success) setTemplates(templatesRes.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(queryParams), page])

  async function handleExport() {
    setExporting(true)
    try {
      const res = await WhatsAppMessagesAPI.list({ ...queryParams, limit: 200, skip: 0 })
      if (!res.success) throw new Error(res.error || "Export failed")
      const rows = (res.data?.items || []) as Row[]
      downloadCsv(rows)
    } catch (err) {
      console.error("[whatsapp-report] export failed", err)
    } finally {
      setExporting(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showingStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const showingEnd = Math.min(total, page * PAGE_SIZE)
  const deliveryPct = ((usage?.deliveryRate || 0) * 100).toFixed(1)
  const readPct = ((usage?.readRate || 0) * 100).toFixed(1)
  const walletRupees = ((usage?.totalCost || 0) / 100).toFixed(2)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <UsageCard
          label="Total sent"
          value={(usage?.sent ?? 0).toLocaleString()}
          icon={<MessageCircle className="h-4 w-4 text-blue-600" />}
          tone="blue"
        />
        <UsageCard
          label="Delivered"
          value={(usage?.delivered ?? 0).toLocaleString()}
          subtle={`${deliveryPct}% delivery`}
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          tone="emerald"
        />
        <UsageCard
          label="Read"
          value={(usage?.read ?? 0).toLocaleString()}
          subtle={`${readPct}% open`}
          icon={<CheckCheck className="h-4 w-4 text-cyan-600" />}
          tone="cyan"
        />
        <UsageCard
          label="Failed"
          value={(usage?.failed ?? 0).toLocaleString()}
          icon={<XCircle className="h-4 w-4 text-rose-600" />}
          tone="rose"
        />
        <UsageCard
          label="Free window"
          value={(usage?.freeWindow ?? 0).toLocaleString()}
          icon={<Clock className="h-4 w-4 text-amber-600" />}
          tone="amber"
        />
        <UsageCard
          label="Wallet spent"
          value={`₹${walletRupees}`}
          icon={<Wallet className="h-4 w-4 text-violet-600" />}
          tone="violet"
        />
        <UsageCard
          label="Delivery rate"
          value={`${deliveryPct}%`}
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          tone="emerald"
        />
        <UsageCard
          label="Read rate"
          value={`${readPct}%`}
          icon={<CheckCheck className="h-4 w-4 text-cyan-600" />}
          tone="cyan"
        />
      </div>

      <Card className="border-slate-200">
        <CardContent className="pt-5 pb-5">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div>
              <Label className="text-xs text-slate-600">From</Label>
              <Input
                className="mt-1"
                type="date"
                value={filters.from}
                onChange={(e) => setFilters({ ...filters, from: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-600">To</Label>
              <Input
                className="mt-1"
                type="date"
                value={filters.to}
                onChange={(e) => setFilters({ ...filters, to: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Status</Label>
              <Select
                value={filters.status}
                onValueChange={(v) => setFilters({ ...filters, status: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any status</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-600">Category</Label>
              <Select
                value={filters.category}
                onValueChange={(v) => setFilters({ ...filters, category: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any category</SelectItem>
                  {CATEGORIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-600">Campaign</Label>
              <Select
                value={filters.campaignId}
                onValueChange={(v) => setFilters({ ...filters, campaignId: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any campaign</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-600">Template</Label>
              <Select
                value={filters.templateId}
                onValueChange={(v) => setFilters({ ...filters, templateId: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any template</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t._id} value={t._id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Search by phone (last 10 digits)…"
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="rounded"
                checked={filters.freeWindowOnly}
                onChange={(e) =>
                  setFilters({ ...filters, freeWindowOnly: e.target.checked })
                }
              />
              Only free-window
            </label>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setFilters(defaultFilters)}>
                Reset
              </Button>
              <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={exporting || total === 0}
              >
                <Download className={`h-3.5 w-3.5 mr-1.5 ${exporting ? "animate-pulse" : ""}`} />
                Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <p className="text-xs text-slate-600">
            {loading
              ? "Loading messages…"
              : total === 0
                ? "No messages match the current filters."
                : `Showing ${showingStart.toLocaleString()}–${showingEnd.toLocaleString()} of ${total.toLocaleString()}`}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs tabular-nums text-slate-600 px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/40">
                <TableHead className="w-[28px]"></TableHead>
                <TableHead>Client / Phone</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">Inspect</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m) => (
                <TableRow key={m._id} className="hover:bg-slate-50/40">
                  <TableCell>
                    <DirectionIcon direction={m.direction} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-800 text-sm leading-tight">
                        {m.clientName || "Unknown"}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 leading-tight">
                        {formatPhone(m.recipientPhone)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {m.templateName ? (
                      <div className="flex flex-col">
                        <span className="text-sm text-slate-700 leading-tight">
                          {m.templateName}
                        </span>
                        {m.templateCategory && (
                          <span className="text-[10px] text-slate-400 uppercase tracking-wide leading-tight">
                            {m.templateCategory}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {m.campaignName ? (
                      <span className="text-sm text-slate-700">{m.campaignName}</span>
                    ) : m.intent ? (
                      <span className="text-xs text-slate-500">{m.intent}</span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {m.category ? (
                      <Badge variant="outline" className="capitalize text-[10px]">
                        {m.category}
                      </Badge>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <StatusBadge status={m.status} />
                      {m.status === "failed" && m.failureReason && (
                        <span className="text-[10px] text-rose-600 leading-tight max-w-[220px] truncate">
                          {m.failureCode ? `[${m.failureCode}] ` : ""}
                          {m.failureReason}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {m.freeWindow ? (
                      <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px]">
                        Free
                      </Badge>
                    ) : m.costPaise ? (
                      <span className="text-sm tabular-nums text-slate-700">
                        <IndianRupee className="inline h-3 w-3 -mt-0.5" />
                        {(m.costPaise / 100).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                    {m.timestamp ? format(new Date(m.timestamp), "dd MMM, HH:mm") : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setDrilldown(m)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-slate-500 py-12">
                    <MessageCircle className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    No messages match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!drilldown} onOpenChange={(o) => !o && setDrilldown(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Message details</DialogTitle>
          </DialogHeader>
          {drilldown && (
            <div className="space-y-3 text-sm">
              <DetailRow label="Client" value={drilldown.clientName || "Unknown"} />
              <DetailRow label="Phone" value={formatPhone(drilldown.recipientPhone) || "—"} mono />
              <DetailRow label="Direction" value={drilldown.direction || "—"} />
              <DetailRow label="Status" value={drilldown.status || "—"} />
              <DetailRow label="Template" value={drilldown.templateName || "—"} />
              <DetailRow label="Campaign" value={drilldown.campaignName || "—"} />
              <DetailRow label="Category" value={drilldown.category || "—"} />
              <DetailRow label="Intent" value={drilldown.intent || "—"} />
              <DetailRow label="Free window" value={drilldown.freeWindow ? "Yes" : "No"} />
              <DetailRow
                label="Cost"
                value={
                  drilldown.costPaise
                    ? `₹${(drilldown.costPaise / 100).toFixed(2)}`
                    : "—"
                }
              />
              <DetailRow
                label="Timestamp"
                value={
                  drilldown.timestamp
                    ? format(new Date(drilldown.timestamp), "dd MMM yyyy, HH:mm:ss")
                    : "—"
                }
              />
              {drilldown.failureReason && (
                <DetailRow
                  label="Failure"
                  value={`[${drilldown.failureCode || "?"}] ${drilldown.failureReason}`}
                  highlight="rose"
                />
              )}
              {drilldown.dedupeKey && (
                <DetailRow label="Dedupe key" value={drilldown.dedupeKey} mono />
              )}
              {drilldown.metaMessageId && (
                <DetailRow label="Meta message ID" value={drilldown.metaMessageId} mono />
              )}
              {drilldown.providerMessageId && (
                <DetailRow
                  label="Provider message ID"
                  value={drilldown.providerMessageId}
                  mono
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ============================== sub-components ============================== */

const TONE_BG: Record<string, string> = {
  blue: "from-blue-50 to-blue-50/30 border-blue-100",
  emerald: "from-emerald-50 to-emerald-50/30 border-emerald-100",
  cyan: "from-cyan-50 to-cyan-50/30 border-cyan-100",
  rose: "from-rose-50 to-rose-50/30 border-rose-100",
  amber: "from-amber-50 to-amber-50/30 border-amber-100",
  violet: "from-violet-50 to-violet-50/30 border-violet-100",
}

function UsageCard({
  label,
  value,
  subtle,
  icon,
  tone = "blue",
}: {
  label: string
  value: number | string
  subtle?: string
  icon: React.ReactNode
  tone?: keyof typeof TONE_BG
}) {
  return (
    <Card className={`bg-gradient-to-br ${TONE_BG[tone] || TONE_BG.blue}`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 text-slate-500 text-[10px] uppercase tracking-wider font-medium">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-semibold text-slate-800 mt-1 tabular-nums leading-tight">
          {value}
        </div>
        {subtle && (
          <div className="text-[11px] text-slate-500 mt-0.5">{subtle}</div>
        )}
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    queued: "bg-slate-100 text-slate-700 border border-slate-200",
    sent: "bg-blue-50 text-blue-700 border border-blue-200",
    delivered: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    read: "bg-emerald-100 text-emerald-800 border border-emerald-300",
    failed: "bg-rose-50 text-rose-700 border border-rose-200",
  }
  return (
    <Badge className={`${map[status || ""] || "bg-slate-100 text-slate-700"} border-0 text-[10px]`}>
      {status || "unknown"}
    </Badge>
  )
}

function DirectionIcon({ direction }: { direction?: "inbound" | "outbound" }) {
  if (direction === "inbound") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-blue-600">
        <ArrowDownLeft className="h-3 w-3" />
      </span>
    )
  }
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
      <ArrowUpRight className="h-3 w-3" />
    </span>
  )
}

function DetailRow({
  label,
  value,
  mono,
  highlight,
}: {
  label: string
  value: string
  mono?: boolean
  highlight?: "rose"
}) {
  return (
    <div className="grid grid-cols-3 gap-2 items-start">
      <span className="text-xs uppercase tracking-wide text-slate-500 col-span-1">
        {label}
      </span>
      <span
        className={`col-span-2 text-sm break-all ${
          mono ? "font-mono text-xs" : ""
        } ${highlight === "rose" ? "text-rose-700" : "text-slate-700"}`}
      >
        {value}
      </span>
    </div>
  )
}

/* ============================== utils ============================== */

function formatPhone(p?: string) {
  if (!p) return ""
  const digits = String(p).replace(/\D/g, "")
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`
  }
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`
  return `+${digits}`
}

function downloadCsv(rows: Row[]) {
  const headers = [
    "Time",
    "Direction",
    "Client",
    "Phone",
    "Template",
    "Campaign",
    "Category",
    "Status",
    "Failure code",
    "Failure reason",
    "Cost (₹)",
    "Free window",
    "Dedupe key",
    "Meta message ID",
  ]
  const escape = (v: any) => {
    const s = v == null ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(",")]
  for (const m of rows) {
    lines.push(
      [
        m.timestamp ? format(new Date(m.timestamp), "yyyy-MM-dd HH:mm:ss") : "",
        m.direction || "",
        m.clientName || "",
        m.recipientPhone || "",
        m.templateName || "",
        m.campaignName || "",
        m.category || "",
        m.status || "",
        m.failureCode ?? "",
        m.failureReason || "",
        m.costPaise ? (m.costPaise / 100).toFixed(2) : "",
        m.freeWindow ? "yes" : "no",
        m.dedupeKey || "",
        m.metaMessageId || "",
      ]
        .map(escape)
        .join(",")
    )
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `whatsapp-messages-${format(new Date(), "yyyyMMdd-HHmm")}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
