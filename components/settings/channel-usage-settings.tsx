"use client"

import * as React from "react"
import {
  BarChart2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  MessageSquare,
  Smartphone,
  XCircle,
  Clock,
  AlertCircle,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
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
  ChannelUsageAPI,
  type ChannelUsageResponse,
  type ChannelUsageLog,
  type ChannelKind,
} from "@/lib/api"

type TabValue = ChannelKind

function formatDateTime(value: string | undefined | null) {
  if (!value) return "—"
  try {
    const d = new Date(value)
    return d.toLocaleString("en-IN", {
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

function humanizeMessageType(type: string | undefined | null) {
  if (!type) return "—"
  return type
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function StatusBadge({ status }: { status: ChannelUsageLog["status"] }) {
  if (status === "sent") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Delivered
      </Badge>
    )
  }
  if (status === "failed") {
    return (
      <Badge className="bg-red-100 text-red-700 border border-red-200 hover:bg-red-100 gap-1">
        <XCircle className="h-3 w-3" />
        Failed
      </Badge>
    )
  }
  return (
    <Badge className="bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-100 gap-1">
      <Clock className="h-3 w-3" />
      Pending
    </Badge>
  )
}

function StatsSummary({
  channel,
  stats,
}: {
  channel: TabValue
  stats: ChannelUsageResponse["stats"]
}) {
  const billedChannel = channel === "whatsapp" || channel === "sms"
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Messages sent
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">
            {stats.total.toLocaleString()}
          </div>
        </div>
        {billedChannel ? (
          <Badge variant="secondary" className="bg-indigo-50 text-indigo-700">
            Billed per message from wallet
          </Badge>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-xs text-slate-500">Total logged</div>
          <div className="text-base font-semibold text-slate-900">
            {stats.total.toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
          <div className="text-xs text-emerald-600">Delivered</div>
          <div className="text-base font-semibold text-emerald-700">
            {stats.sent.toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2">
          <div className="text-xs text-red-600">Failed</div>
          <div className="text-base font-semibold text-red-700">
            {stats.failed.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  )
}

interface ChannelTabPanelProps {
  channel: TabValue
  active: boolean
}

function ChannelTabPanel({ channel, active }: ChannelTabPanelProps) {
  const [data, setData] = React.useState<ChannelUsageResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [page, setPage] = React.useState(1)
  const pageSize = 20

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const filters = { page, limit: pageSize }
      const fetcher =
        channel === "whatsapp"
          ? ChannelUsageAPI.getWhatsAppUsage
          : channel === "sms"
          ? ChannelUsageAPI.getSmsUsage
          : ChannelUsageAPI.getEmailUsage
      const res = await fetcher(filters)
      if (res?.success && res.data) {
        setData(res.data)
      } else {
        setError(res?.error || "Failed to load channel usage")
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load channel usage")
    } finally {
      setLoading(false)
    }
  }, [channel, page])

  React.useEffect(() => {
    if (!active) return
    load()
  }, [active, load])

  const logs = data?.logs ?? []
  const pagination = data?.pagination
  const canPrev = !!pagination && pagination.page > 1
  const canNext = !!pagination && pagination.page < pagination.totalPages

  return (
    <div className="space-y-5">
      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-10">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
        </div>
      ) : data ? (
        <StatsSummary channel={channel} stats={data.stats} />
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-800">Recent messages</div>
            <div className="text-xs text-slate-500">
              Showing most recent delivery attempts for this channel
            </div>
          </div>
          {loading && data ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recipient</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-slate-500">
                    No messages logged yet for this channel.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map(log => (
                  <TableRow key={log._id}>
                    <TableCell className="font-medium text-slate-800">
                      {log.recipientPhone || log.recipientEmail || "—"}
                      {log.error ? (
                        <div className="mt-1 text-xs text-red-600 line-clamp-1" title={log.error}>
                          {log.error}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-slate-700">
                      {humanizeMessageType(log.messageType)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={log.status} />
                    </TableCell>
                    <TableCell className="text-right text-slate-600">
                      {formatDateTime(log.timestamp)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {pagination && pagination.total > 0 ? (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div>
              Page {pagination.page} of {pagination.totalPages} · {pagination.total.toLocaleString()}{" "}
              messages
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canPrev || loading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canNext || loading}
                onClick={() => setPage(p => p + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function ChannelUsageSettings() {
  const [tab, setTab] = React.useState<TabValue>("whatsapp")

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <BarChart2 className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>Channel Usage</CardTitle>
            <CardDescription>
              Delivery logs for WhatsApp, SMS, and Email messages.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={v => setTab(v as TabValue)} className="w-full">
          <TabsList className="mb-5 grid grid-cols-3 sm:inline-flex sm:w-auto">
            <TabsTrigger value="whatsapp" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="sms" className="gap-2">
              <Smartphone className="h-4 w-4" />
              SMS
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-2">
              <Mail className="h-4 w-4" />
              Email
            </TabsTrigger>
          </TabsList>
          <TabsContent value="whatsapp">
            <ChannelTabPanel channel="whatsapp" active={tab === "whatsapp"} />
          </TabsContent>
          <TabsContent value="sms">
            <ChannelTabPanel channel="sms" active={tab === "sms"} />
          </TabsContent>
          <TabsContent value="email">
            <ChannelTabPanel channel="email" active={tab === "email"} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

export default ChannelUsageSettings
