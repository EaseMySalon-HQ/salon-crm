"use client"

import { useState, useEffect } from "react"
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
import { FileText, Loader2, Filter } from "lucide-react"

interface ActivityLog {
  action: string
  user: string
  description: string
  createdAt: string
}

interface BusinessActivityLogsDialogProps {
  businessId: string
  businessName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleString()
  } catch {
    return d
  }
}

function formatAction(a: string) {
  return a.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

export function BusinessActivityLogsDialog({
  businessId,
  businessName,
  open,
  onOpenChange,
}: BusinessActivityLogsDialogProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [actionFilter, setActionFilter] = useState<string>("all")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const fetchLogs = async () => {
    if (!open || !businessId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        ...(actionFilter !== "all" && { action: actionFilter }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      })
      const res = await fetch(`${API_URL}/admin/businesses/${businessId}/logs?${params}`, {
        headers: adminRequestHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setLogs(data.data || [])
          setTotalPages(data.pagination?.totalPages ?? 1)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [open, businessId, page, actionFilter, startDate, endDate])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Activity Logs — {businessName}
          </DialogTitle>
          <DialogDescription>Recent activity for this business</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-4 py-2">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Action</Label>
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="invoice_created">Invoice Created</SelectItem>
                <SelectItem value="staff_added">Staff Added</SelectItem>
                <SelectItem value="appointment_created">Appointment Created</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">From</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="w-[140px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">To</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="w-[140px]"
            />
          </div>
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
            <Filter className="h-4 w-4 mr-2" />
            Apply
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
                  <TableHead>Action</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{formatAction(log.action)}</TableCell>
                    <TableCell>{log.user}</TableCell>
                    <TableCell>{log.description}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(log.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex justify-between items-center pt-2">
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                Next
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
