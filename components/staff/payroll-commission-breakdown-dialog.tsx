"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
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
import { Badge } from "@/components/ui/badge"
import { PayrollAPI, type PayrollCommissionBreakdown } from "@/lib/api"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  staffId: string
  staffName: string
  month: string
  formatAmount: (n: number) => string
}

export function PayrollCommissionBreakdownDialog({
  open,
  onOpenChange,
  staffId,
  staffName,
  month,
  formatAmount,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<PayrollCommissionBreakdown | null>(null)

  useEffect(() => {
    if (!open || !staffId) return
    setLoading(true)
    PayrollAPI.getCommissionBreakdown(staffId, month)
      .then((res) => {
        if (res?.success) setData(res.data)
        else setData(null)
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [open, staffId, month])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Commission breakdown — {staffName}</DialogTitle>
          <DialogDescription>{data?.periodLabel || month}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <p className="py-8 text-center text-muted-foreground">No commission data found.</p>
        ) : (
          <div className="space-y-6">
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-sm text-muted-foreground">Total commission</p>
              <p className="text-2xl font-bold text-slate-900">
                {formatAmount(data.totalCommission)}
              </p>
            </div>

            {data.profileBreakdown.length > 0 ? (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-700">By profile</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Profile</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.profileBreakdown.map((p, i) => (
                      <TableRow key={p.profileId || i}>
                        <TableCell>
                          <div className="font-medium">{p.profileName}</div>
                          {p.profileType ? (
                            <Badge variant="secondary" className="mt-1 text-xs capitalize">
                              {p.profileType.replace(/_/g, " ")}
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatAmount(p.revenue)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatAmount(p.commission)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            {data.sales.length > 0 ? (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-700">By bill</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.sales.map((s, i) => (
                      <TableRow key={`${s.billNo}-${i}`}>
                        <TableCell className="font-medium">{s.billNo || "—"}</TableCell>
                        <TableCell>
                          {s.date ? new Date(s.date).toLocaleDateString("en-IN") : "—"}
                        </TableCell>
                        <TableCell>{s.customerName || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatAmount(s.revenue)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatAmount(s.commission)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No qualifying sales this month.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
