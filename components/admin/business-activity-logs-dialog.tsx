"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { adminRequestHeaders } from "@/lib/admin-request-headers"
import { useToast } from "@/hooks/use-toast"
import { FileText, Loader2, Filter } from "lucide-react"

interface ActivityLogRow {
  id?: string
  action: string
  actorType: string
  actorId?: string | null
  entity?: string
  entityId?: string | null
  summary: string
  metadata?: {
    ip?: string
    userAgent?: string
    source?: string
  }
  createdAt: string
}

interface BusinessActivityLogsDialogProps {
  businessId: string
  businessName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

function formatDate(d: string | Date) {
  try {
    return new Date(d).toLocaleString()
  } catch {
    return String(d)
  }
}

function formatAction(a: string) {
  return a.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

function truncate(s: string, n: number) {
  if (!s) return "—"
  return s.length <= n ? s : `${s.slice(0, n)}…`
}

export function BusinessActivityLogsDialog({
  businessId,
  businessName,
  open,
  onOpenChange,
}: BusinessActivityLogsDialogProps) {
  const { toast } = useToast()
  const [logs, setLogs] = useState<ActivityLogRow[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [actionFilter, setActionFilter] = useState("")
  const [actorTypeFilter, setActorTypeFilter] = useState<string>("all")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const filtersRef = useRef({
    actionFilter,
    actorTypeFilter,
    startDate,
    endDate,
  })
  filtersRef.current = { actionFilter, actorTypeFilter, startDate, endDate }

  const fetchLogs = useCallback(async () => {
    if (!open || !businessId) return
    const f = filtersRef.current
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "50",
        ...(f.actionFilter.trim() && { action: f.actionFilter.trim() }),
        ...(f.actorTypeFilter !== "all" && { actorType: f.actorTypeFilter }),
        ...(f.startDate && { startDate: f.startDate }),
        ...(f.endDate && { endDate: f.endDate }),
      })
      const res = await fetch(`${API_URL}/admin/businesses/${businessId}/logs?${params}`, {
        headers: adminRequestHeaders(),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          title: "Could not load activity logs",
          description: typeof data.error === "string" ? data.error : res.statusText,
          variant: "destructive",
        })
        setLogs([])
        setTotalPages(1)
        setTotalCount(0)
        return
      }
      if (data.success) {
        setLogs(data.data || [])
        setTotalPages(data.pagination?.totalPages ?? 1)
        setTotalCount(data.pagination?.total ?? 0)
      }
    } catch (e) {
      console.error(e)
      toast({
        title: "Could not load activity logs",
        description: e instanceof Error ? e.message : "Network error",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [open, businessId, page, toast])

  useEffect(() => {
    if (open) {
      void fetchLogs()
    }
  }, [open, fetchLogs])

  useEffect(() => {
    if (!open) {
      setPage(1)
      setActionFilter("")
      setActorTypeFilter("all")
      setStartDate("")
      setEndDate("")
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Activity Logs — {businessName}
          </DialogTitle>
          <DialogDescription>
            Audit trail for this business (salon staff and system events). New entries appear as actions occur.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-3 py-2 items-end">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Action</Label>
            <Input
              placeholder="e.g. CREATE_INVOICE"
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value)
                setPage(1)
              }}
              className="w-[200px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Actor type</Label>
            <Select
              value={actorTypeFilter}
              onValueChange={(v) => {
                setActorTypeFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                setPage(1)
              }}
              className="w-[140px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value)
                setPage(1)
              }}
              className="w-[140px]"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchLogs()} disabled={loading}>
            <Filter className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="flex-1 overflow-auto border rounded-lg">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No activity logs found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead className="min-w-[200px]">Summary</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead className="text-muted-foreground text-xs">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id || `${log.action}-${log.createdAt}`}>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap align-top">
                      {formatDate(log.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium align-top">{formatAction(log.action)}</TableCell>
                    <TableCell className="align-top">
                      <span className="text-xs uppercase text-muted-foreground">{log.actorType}</span>
                      {log.actorId ? (
                        <div className="font-mono text-[11px] text-muted-foreground break-all">{log.actorId}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top text-sm">{log.summary}</TableCell>
                    <TableCell className="align-top text-sm text-muted-foreground">
                      {log.entity || "—"}
                      {log.entityId ? (
                        <div className="font-mono text-[11px] break-all">{log.entityId}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top text-xs text-muted-foreground max-w-[120px]">
                      {log.metadata?.source || "—"}
                      {log.metadata?.ip ? (
                        <div title={log.metadata.ip}>{truncate(log.metadata.ip, 24)}</div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="flex justify-between items-center pt-2 border-t">
          <span className="text-sm text-muted-foreground">
            {totalCount > 0 ? `${totalCount} total · ` : ""}
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              Next
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
