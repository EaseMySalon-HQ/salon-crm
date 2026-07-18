"use client"

import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TableSkeleton } from "@/components/loading"
import {
  AdminPlatformWhatsAppCampaignsAPI,
  type PlatformCampaignPerformanceReport,
} from "@/lib/admin-platform-whatsapp-api"
import { format } from "date-fns"
import { AlertCircle, BarChart3, Loader2, RefreshCw } from "lucide-react"

function pct(value: number) {
  return `${value.toFixed(1)}%`
}

function formatDuration(ms: number | null) {
  if (ms == null) return "—"
  if (ms < 1000) return `${ms}ms`
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    queued: "bg-slate-100 text-slate-700",
    sent: "bg-blue-100 text-blue-800",
    delivered: "bg-emerald-100 text-emerald-800",
    read: "bg-indigo-100 text-indigo-800",
    failed: "bg-red-100 text-red-700",
  }
  return <Badge className={map[status] || map.queued}>{status}</Badge>
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold mt-0.5">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground mt-0.5">{sub}</p> : null}
    </div>
  )
}

type Props = {
  campaignId: string | null
  campaignName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PlatformWhatsAppCampaignReportDialog({
  campaignId,
  campaignName,
  open,
  onOpenChange,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<PlatformCampaignPerformanceReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!campaignId) return
    setLoading(true)
    setError(null)
    try {
      const data = await AdminPlatformWhatsAppCampaignsAPI.performanceReport(campaignId)
      setReport(data)
    } catch (err) {
      setReport(null)
      setError(err instanceof Error ? err.message : "Failed to load report")
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => {
    if (!open || !campaignId) {
      setReport(null)
      setError(null)
      return
    }
    load()
    const timer = setInterval(load, 8000)
    return () => clearInterval(timer)
  }, [open, campaignId, load])

  const m = report?.metrics

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Campaign performance
          </DialogTitle>
          <DialogDescription>
            {report?.campaign.name || campaignName || "Delivery and engagement metrics from message records."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={load} disabled={loading || !campaignId}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {loading && !report ? (
          <TableSkeleton rows={4} columns={4} />
        ) : error ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            {error}
          </div>
        ) : report && m ? (
          <div className="space-y-6">
            {report.campaign.failureReason ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                Campaign error: {report.campaign.failureReason}
              </div>
            ) : null}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard label="Recipients" value={report.campaign.recipientCount ?? m.total} />
              <MetricCard
                label="Delivered"
                value={m.delivered + m.read}
                sub={pct(report.rates.deliveryRate)}
              />
              <MetricCard label="Read" value={m.read} sub={pct(report.rates.readRate)} />
              <MetricCard label="Failed" value={m.failed} sub={pct(report.rates.failureRate)} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <MetricCard label="Queued" value={m.queued} />
              <MetricCard label="Sent" value={m.sent} />
              <MetricCard label="Delivered" value={m.delivered} />
              <MetricCard label="Read" value={m.read} />
              <MetricCard label="Failed" value={m.failed} />
            </div>

            <div className="rounded-lg border p-4 space-y-2 text-sm">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                <span>
                  Status: <span className="text-foreground font-medium">{report.campaign.status}</span>
                </span>
                {report.template ? (
                  <span>
                    Template:{" "}
                    <span className="text-foreground font-medium">{report.template.name}</span>
                  </span>
                ) : null}
                <span>
                  Duration:{" "}
                  <span className="text-foreground font-medium">
                    {formatDuration(report.durationMs)}
                  </span>
                </span>
                {report.campaign.startedAt ? (
                  <span>
                    Started:{" "}
                    <span className="text-foreground">
                      {format(new Date(report.campaign.startedAt), "MMM d, yyyy h:mm a")}
                    </span>
                  </span>
                ) : null}
              </div>
            </div>

            {report.failureReasons.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Top failure reasons</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right w-24">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.failureReasons.map((row) => (
                      <TableRow key={row.reason}>
                        <TableCell className="text-sm">{row.reason}</TableCell>
                        <TableCell className="text-right">{row.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Recipients ({report.recipients.length})</h3>
              {report.recipients.length === 0 ? (
                <p className="text-sm text-muted-foreground">No outbound messages recorded yet.</p>
              ) : (
                <div className="rounded-md border max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Sent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.recipients.map((r) => (
                        <TableRow key={r.messageId}>
                          <TableCell className="text-sm">
                            {r.lead?.name || r.lead?.salonName || "—"}
                          </TableCell>
                          <TableCell className="text-xs font-mono">{r.recipientPhone}</TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              {statusBadge(r.status)}
                              {r.failureReason ? (
                                <p className="text-xs text-red-600 max-w-[200px] truncate" title={r.failureReason}>
                                  {r.failureReason}
                                </p>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.timestamp
                              ? format(new Date(r.timestamp), "MMM d, h:mm a")
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
