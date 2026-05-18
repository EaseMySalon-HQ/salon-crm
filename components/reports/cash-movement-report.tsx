"use client"

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react"
import { format } from "date-fns"
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Wallet } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { CashMovementsAPI } from "@/lib/api"
import {
  CASH_MOVEMENT_TYPE_OPTIONS,
  labelForCashMovementType,
  type CashMovementRow,
} from "@/lib/cash-movements"
import { getEndOfDayIST, getStartOfDayIST, getTodayIST, toDateStringIST } from "@/lib/date-utils"
import * as XLSX from "xlsx"

export type CashMovementDatePeriod =
  | "today"
  | "yesterday"
  | "last7days"
  | "last30days"
  | "currentMonth"
  | "all"
  | "custom"

export interface CashMovementControlledFilters {
  datePeriod: CashMovementDatePeriod
  dateRange: { from?: Date; to?: Date }
  typeFilter: string
  directionFilter: string
}

export interface CashMovementReportHandle {
  exportExcel: () => void
}

interface CashMovementReportProps {
  controlledFilters: CashMovementControlledFilters
}

function getDateRangeFromPeriod(period: CashMovementDatePeriod): { from?: Date; to?: Date } {
  const todayStr = getTodayIST()
  const today = new Date(getStartOfDayIST(todayStr))
  switch (period) {
    case "today":
      return { from: today, to: new Date(getEndOfDayIST(todayStr)) }
    case "yesterday": {
      const todayNoon = new Date(`${todayStr}T12:00:00+05:30`)
      const yesterdayNoon = new Date(todayNoon.getTime() - 24 * 60 * 60 * 1000)
      const yesterdayStr = toDateStringIST(yesterdayNoon)
      return {
        from: new Date(getStartOfDayIST(yesterdayStr)),
        to: new Date(getEndOfDayIST(yesterdayStr)),
      }
    }
    case "last7days": {
      const todayNoon = new Date(`${todayStr}T12:00:00+05:30`)
      const fromNoon = new Date(todayNoon.getTime() - 7 * 24 * 60 * 60 * 1000)
      const fromStr = toDateStringIST(fromNoon)
      return { from: new Date(getStartOfDayIST(fromStr)), to: new Date(getEndOfDayIST(todayStr)) }
    }
    case "last30days": {
      const todayNoon = new Date(`${todayStr}T12:00:00+05:30`)
      const fromNoon = new Date(todayNoon.getTime() - 30 * 24 * 60 * 60 * 1000)
      const fromStr = toDateStringIST(fromNoon)
      return { from: new Date(getStartOfDayIST(fromStr)), to: new Date(getEndOfDayIST(todayStr)) }
    }
    case "currentMonth": {
      const [y, m] = todayStr.split("-").map(Number)
      const firstStr = `${y}-${String(m).padStart(2, "0")}-01`
      const firstOfMonth = new Date(`${firstStr}T12:00:00+05:30`)
      const lastOfMonth = new Date(firstOfMonth)
      lastOfMonth.setUTCMonth(lastOfMonth.getUTCMonth() + 1)
      lastOfMonth.setUTCDate(0)
      const lastStr = toDateStringIST(lastOfMonth)
      return {
        from: new Date(getStartOfDayIST(firstStr)),
        to: new Date(getEndOfDayIST(lastStr)),
      }
    }
    default:
      return { from: undefined, to: undefined }
  }
}

function resolveApiDateParams(
  datePeriod: CashMovementDatePeriod,
  dateRange: { from?: Date; to?: Date }
): { dateFrom?: string; dateTo?: string } {
  if (datePeriod === "all") return {}
  const range =
    datePeriod === "custom"
      ? dateRange.from && dateRange.to
        ? dateRange
        : getDateRangeFromPeriod("last7days")
      : getDateRangeFromPeriod(datePeriod)
  if (!range.from || !range.to) return {}
  return {
    dateFrom: getStartOfDayIST(toDateStringIST(range.from)),
    dateTo: getEndOfDayIST(toDateStringIST(range.to)),
  }
}

export const CashMovementReport = forwardRef<CashMovementReportHandle, CashMovementReportProps>(
  function CashMovementReport({ controlledFilters }, ref) {
    const { datePeriod, dateRange, typeFilter, directionFilter } = controlledFilters
    const [rows, setRows] = useState<CashMovementRow[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
      const params = resolveApiDateParams(datePeriod, dateRange)
      let cancelled = false
      setLoading(true)
      CashMovementsAPI.getAll({ ...params, status: "active" })
        .then((res) => {
          if (cancelled) return
          setRows(Array.isArray(res.data) ? res.data : [])
        })
        .catch(() => {
          if (!cancelled) setRows([])
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
      return () => {
        cancelled = true
      }
    }, [datePeriod, dateRange.from, dateRange.to, typeFilter, directionFilter])

    const filteredRows = useMemo(() => {
      return rows
        .filter((r) => {
          if (typeFilter !== "all" && r.type !== typeFilter) return false
          if (directionFilter !== "all" && r.direction !== directionFilter) return false
          return true
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    }, [rows, typeFilter, directionFilter])

    const summary = useMemo(() => {
      let cashIn = 0
      let cashOut = 0
      filteredRows.forEach((r) => {
        const amt = Number(r.amount) || 0
        if (r.direction === "in") cashIn += amt
        else cashOut += amt
      })
      return {
        count: filteredRows.length,
        cashIn,
        cashOut,
        net: cashIn - cashOut,
      }
    }, [filteredRows])

    const exportExcel = () => {
      const sheetRows = filteredRows.map((r) => ({
        Date: format(new Date(r.date), "dd MMM yyyy"),
        Type: labelForCashMovementType(r.type),
        Direction: r.direction === "in" ? "In" : "Out",
        "Amount (₹)": Number(r.amount) || 0,
        Reference: r.referenceNo || "",
        Note: r.reason || "",
        "Recorded by": r.createdBy || "",
      }))
      sheetRows.push({
        Date: "",
        Type: "TOTALS",
        Direction: "",
        "Amount (₹)": 0,
        Reference: `In: ₹${summary.cashIn.toFixed(2)} | Out: ₹${summary.cashOut.toFixed(2)} | Net: ₹${summary.net.toFixed(2)}`,
        Note: "",
        "Recorded by": "",
      })
      const ws = XLSX.utils.json_to_sheet(sheetRows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Cash Movements")
      XLSX.writeFile(wb, `cash-movements-${getTodayIST()}.xlsx`)
    }

    useImperativeHandle(ref, () => ({ exportExcel }), [filteredRows, summary])

    const formatInr = (n: number) =>
      `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

    return (
      <div className="min-h-[400px] bg-slate-50/80 rounded-2xl p-6 space-y-6">
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              <p className="text-slate-500 text-sm">Loading cash movements...</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-white border-slate-100">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-500">Movements</CardTitle>
                  <ArrowLeftRight className="h-4 w-4 text-slate-400" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-slate-900">{summary.count}</p>
                </CardContent>
              </Card>
              <Card className="bg-white border-slate-100">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-500">Cash in</CardTitle>
                  <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-emerald-700">{formatInr(summary.cashIn)}</p>
                </CardContent>
              </Card>
              <Card className="bg-white border-slate-100">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-500">Cash out</CardTitle>
                  <ArrowUpRight className="h-4 w-4 text-amber-600" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-amber-700">{formatInr(summary.cashOut)}</p>
                </CardContent>
              </Card>
              <Card className="bg-white border-slate-100">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-500">Net movement</CardTitle>
                  <Wallet className="h-4 w-4 text-indigo-500" />
                </CardHeader>
                <CardContent>
                  <p
                    className={`text-2xl font-bold ${
                      summary.net >= 0 ? "text-slate-900" : "text-red-600"
                    }`}
                  >
                    {formatInr(summary.net)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">In − out (drawer reconciliation)</p>
                </CardContent>
              </Card>
            </div>

            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-100 hover:bg-transparent">
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Type</TableHead>
                    <TableHead className="font-semibold">Direction</TableHead>
                    <TableHead className="font-semibold text-right">Amount</TableHead>
                    <TableHead className="font-semibold">Reference</TableHead>
                    <TableHead className="font-semibold">Note</TableHead>
                    <TableHead className="font-semibold">Recorded by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-slate-500">
                        No cash movements for selected filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((r) => (
                      <TableRow key={r._id} className="border-slate-50">
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(r.date), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell>{labelForCashMovementType(r.type)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              r.direction === "in"
                                ? "text-emerald-700 border-emerald-200"
                                : "text-amber-700 border-amber-200"
                            }
                          >
                            {r.direction === "in" ? "In" : "Out"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatInr(Number(r.amount) || 0)}</TableCell>
                        <TableCell className="text-sm text-slate-600 max-w-[120px] truncate">
                          {r.referenceNo || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600 max-w-[160px] truncate">
                          {r.reason || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">{r.createdBy || "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <p className="text-xs text-slate-500">
              These movements adjust expected cash in the drawer; they are not expense entries. Record or correct
              entries under Cash Registry → Movement log.
            </p>
          </>
        )}
      </div>
    )
  }
)
