"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react"
import { format } from "date-fns"
import { Loader2, Receipt } from "lucide-react"
import * as XLSX from "xlsx"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SalesAPI, SettingsAPI } from "@/lib/api"
import { getEndOfDayIST, getStartOfDayIST, getTodayIST, toDateStringIST } from "@/lib/date-utils"
import { useToast } from "@/hooks/use-toast"

export type GstDatePeriod =
  | "today"
  | "yesterday"
  | "last7days"
  | "last30days"
  | "currentMonth"
  | "all"
  | "custom"

interface SaleRow {
  _id?: string
  id?: string
  billNo: string
  date: string
  customerName?: string
  customerPhone?: string
  status?: string
  netTotal?: number
  taxAmount?: number
  grossTotal?: number
  tip?: number
  discount?: number
  items?: Array<{
    type?: string
    name?: string
    quantity?: number
    total?: number
    taxRate?: number
    hsnSacCode?: string
    priceExcludingGST?: number
  }>
  taxBreakdown?: {
    serviceTax?: number
    serviceRate?: number
    productTaxByRate?: Record<string, number>
  }
}

interface GstRow {
  id: string
  billNo: string
  date: string
  customer: string
  itemsCount: number
  hsnSacList: string
  taxableValue: number
  cgst: number
  sgst: number
  totalTax: number
  billTotal: number
  rate: number
}

function formatINR(value: number): string {
  return `₹${(Number(value) || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function getDateRangeFromPeriod(period: GstDatePeriod): { from?: Date; to?: Date } {
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
  datePeriod: GstDatePeriod,
  dateRange: { from?: Date; to?: Date }
): { dateFrom?: string; dateTo?: string } {
  if (datePeriod === "all") return {}
  const range =
    datePeriod === "custom"
      ? dateRange.from && dateRange.to
        ? dateRange
        : getDateRangeFromPeriod("last30days")
      : getDateRangeFromPeriod(datePeriod)
  if (!range.from || !range.to) return {}
  return {
    dateFrom: getStartOfDayIST(toDateStringIST(range.from)),
    dateTo: getEndOfDayIST(toDateStringIST(range.to)),
  }
}

const STATE_NAME_TO_CODE: Record<string, string> = {
  "jammu and kashmir": "01",
  "himachal pradesh": "02",
  punjab: "03",
  chandigarh: "04",
  uttarakhand: "05",
  haryana: "06",
  delhi: "07",
  rajasthan: "08",
  "uttar pradesh": "09",
  bihar: "10",
  sikkim: "11",
  "arunachal pradesh": "12",
  nagaland: "13",
  manipur: "14",
  mizoram: "15",
  tripura: "16",
  meghalaya: "17",
  assam: "18",
  "west bengal": "19",
  jharkhand: "20",
  odisha: "21",
  chhattisgarh: "22",
  "madhya pradesh": "23",
  gujarat: "24",
  maharashtra: "27",
  karnataka: "29",
  goa: "30",
  lakshadweep: "31",
  kerala: "32",
  "tamil nadu": "33",
  puducherry: "34",
  telangana: "36",
  "andhra pradesh": "37",
  ladakh: "38",
}

function resolveStateCode(state?: string | null): string {
  const raw = String(state || "").trim().toLowerCase()
  if (!raw) return ""
  if (/^\d{1,2}$/.test(raw)) return raw.padStart(2, "0")
  return STATE_NAME_TO_CODE[raw] || ""
}

function fpFromRange(from?: Date, to?: Date): string {
  const ref = from || to || new Date()
  const m = String(ref.getMonth() + 1).padStart(2, "0")
  return `${m}${ref.getFullYear()}`
}

export interface GstControlledFilters {
  datePeriod: GstDatePeriod
  dateRange: { from?: Date; to?: Date }
}

export interface GstReportHandle {
  exportCsv: () => void
  exportXlsx: () => void
  exportJson: () => void
}

interface GstReportProps {
  controlledFilters: GstControlledFilters
}

export const GstReport = forwardRef<GstReportHandle, GstReportProps>(function GstReport(
  { controlledFilters },
  ref
) {
  const { datePeriod, dateRange } = controlledFilters
  const { toast } = useToast()
  const [rows, setRows] = useState<GstRow[]>([])
  const [loading, setLoading] = useState(false)
  const [businessGstin, setBusinessGstin] = useState<string>("")
  const [businessState, setBusinessState] = useState<string>("")
  useEffect(() => {
    SettingsAPI.getBusinessSettings()
      .then((res) => {
        const data = (res?.data || {}) as { gstNumber?: string; state?: string }
        setBusinessGstin(String(data.gstNumber || ""))
        setBusinessState(String(data.state || ""))
      })
      .catch(() => {
        setBusinessGstin("")
        setBusinessState("")
      })
  }, [])

  const loadSales = useCallback(async () => {
    setLoading(true)
    try {
      const params = resolveApiDateParams(datePeriod, dateRange)
      const sales = (await SalesAPI.getAllMergePages({
        ...params,
        batchSize: 500,
      })) as SaleRow[]

      const filtered = (sales || []).filter((s) => {
        const status = String(s.status || "").toLowerCase()
        return status !== "cancelled"
      })

      const computed: GstRow[] = filtered.map((s) => {
        const billTotal = Number(s.grossTotal ?? 0) || 0
        const tax = Number(s.taxAmount ?? 0) || 0
        const taxableValue = Math.max(0, billTotal - tax)
        const cgst = Math.round((tax / 2) * 100) / 100
        const sgst = Math.round((tax - cgst) * 100) / 100
        const items = Array.isArray(s.items) ? s.items : []
        const hsnSacList = Array.from(
          new Set(items.map((it) => String(it?.hsnSacCode || "").trim()).filter(Boolean))
        ).join(", ")
        const rates = items
          .map((it) => Number(it?.taxRate || 0))
          .filter((n) => n > 0)
        const rate = rates.length ? Math.max(...rates) : taxableValue > 0 ? Math.round((tax / taxableValue) * 100) : 0

        return {
          id: String(s._id || s.id || s.billNo),
          billNo: s.billNo,
          date: s.date,
          customer: String(s.customerName || ""),
          itemsCount: items.length,
          hsnSacList,
          taxableValue,
          cgst,
          sgst,
          totalTax: cgst + sgst,
          billTotal,
          rate,
        }
      })
      setRows(computed)
    } catch (err) {
      toast({
        title: "Failed to load GST report",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      })
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [datePeriod, dateRange, toast])

  useEffect(() => {
    loadSales()
  }, [loadSales])

  const totals = useMemo(() => {
    const t = {
      count: rows.length,
      taxable: 0,
      cgst: 0,
      sgst: 0,
      tax: 0,
      total: 0,
    }
    for (const r of rows) {
      t.taxable += r.taxableValue
      t.cgst += r.cgst
      t.sgst += r.sgst
      t.tax += r.totalTax
      t.total += r.billTotal
    }
    return t
  }, [rows])

  const rateBreakdown = useMemo(() => {
    const map = new Map<number, { taxable: number; cgst: number; sgst: number; total: number; bills: number }>()
    for (const r of rows) {
      const key = Math.round(r.rate)
      if (!map.has(key)) {
        map.set(key, { taxable: 0, cgst: 0, sgst: 0, total: 0, bills: 0 })
      }
      const agg = map.get(key)!
      agg.taxable += r.taxableValue
      agg.cgst += r.cgst
      agg.sgst += r.sgst
      agg.total += r.totalTax
      agg.bills += 1
    }
    return Array.from(map.entries())
      .map(([rate, v]) => ({ rate, ...v }))
      .sort((a, b) => a.rate - b.rate)
  }, [rows])

  const downloadBlob = (content: BlobPart, mime: string, filename: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const exportStamp = useMemo(() => {
    const range = resolveApiDateParams(datePeriod, dateRange)
    if (range.dateFrom && range.dateTo) {
      const f = range.dateFrom.slice(0, 10)
      const t = range.dateTo.slice(0, 10)
      return `${f}_to_${t}`
    }
    return format(new Date(), "yyyyMMdd")
  }, [datePeriod, dateRange.from, dateRange.to])

  const handleExportCsv = useCallback(() => {
    try {
      const data = rows.map((r) => ({
        "Bill No": r.billNo,
        Date: format(new Date(r.date), "dd-MM-yyyy"),
        Customer: r.customer,
        "HSN/SAC": r.hsnSacList || "",
        "Tax Rate %": r.rate || "",
        "Taxable Value": r.taxableValue.toFixed(2),
        CGST: r.cgst.toFixed(2),
        SGST: r.sgst.toFixed(2),
        "Total Tax": r.totalTax.toFixed(2),
        "Invoice Value": r.billTotal.toFixed(2),
      }))
      const ws = XLSX.utils.json_to_sheet(data)
      const csv = XLSX.utils.sheet_to_csv(ws)
      downloadBlob(csv, "text/csv;charset=utf-8", `gst-report-${exportStamp}.csv`)
      toast({ title: "Export ready", description: "GST report CSV downloaded." })
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      })
    }
  }, [rows, exportStamp, toast])

  const handleExportXlsx = useCallback(() => {
    try {
      const detail = rows.map((r) => ({
        "Bill No": r.billNo,
        Date: format(new Date(r.date), "dd-MM-yyyy"),
        Customer: r.customer,
        "HSN/SAC": r.hsnSacList || "",
        "Tax Rate %": r.rate || "",
        "Taxable Value": r.taxableValue.toFixed(2),
        CGST: r.cgst.toFixed(2),
        SGST: r.sgst.toFixed(2),
        "Total Tax": r.totalTax.toFixed(2),
        "Invoice Value": r.billTotal.toFixed(2),
      }))
      const summary = rateBreakdown.map((r) => ({
        "Tax Rate %": r.rate,
        Bills: r.bills,
        "Taxable Value": r.taxable.toFixed(2),
        CGST: r.cgst.toFixed(2),
        SGST: r.sgst.toFixed(2),
        "Total Tax": r.total.toFixed(2),
      }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary")
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "Detail")
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" })
      downloadBlob(
        buf,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        `gst-report-${exportStamp}.xlsx`
      )
      toast({ title: "Export ready", description: "GST report Excel downloaded." })
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      })
    }
  }, [rows, rateBreakdown, exportStamp, toast])

  const handleExportJson = useCallback(() => {
    try {
      const pos =
        resolveStateCode(businessState) ||
        (businessGstin ? businessGstin.slice(0, 2) : "")
      const b2cs = rateBreakdown.map((r) => ({
        sply_ty: "INTRA",
        rt: r.rate,
        typ: "OE",
        pos,
        txval: Number(r.taxable.toFixed(2)),
        iamt: 0,
        camt: Number(r.cgst.toFixed(2)),
        samt: Number(r.sgst.toFixed(2)),
        csamt: 0,
      }))
      const payload = {
        gstin: businessGstin || "",
        fp: fpFromRange(dateRange.from, dateRange.to),
        gt: Number(totals.total.toFixed(2)),
        cur_gt: 0,
        b2cs,
      }
      downloadBlob(
        JSON.stringify(payload, null, 2),
        "application/json;charset=utf-8",
        `gstr1-${exportStamp}.json`
      )
      toast({
        title: "GSTR-1 JSON ready",
        description: businessGstin
          ? "Upload via the GST portal's offline tool."
          : "GSTIN missing in business settings — set it before filing.",
      })
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      })
    }
  }, [
    businessGstin,
    businessState,
    dateRange.from,
    dateRange.to,
    rateBreakdown,
    exportStamp,
    toast,
    totals.total,
  ])

  useImperativeHandle(
    ref,
    () => ({
      exportCsv: handleExportCsv,
      exportXlsx: handleExportXlsx,
      exportJson: handleExportJson,
    }),
    [handleExportCsv, handleExportXlsx, handleExportJson]
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="bg-white border-slate-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Bills
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{loading ? "—" : totals.count}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Taxable Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{loading ? "—" : formatINR(totals.taxable)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              CGST
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{loading ? "—" : formatINR(totals.cgst)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              SGST
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{loading ? "—" : formatINR(totals.sgst)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Bill Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{loading ? "—" : formatINR(totals.total)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-100">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Summary by tax rate</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rate</TableHead>
                <TableHead className="text-right">Bills</TableHead>
                <TableHead className="text-right">Taxable Value</TableHead>
                <TableHead className="text-right">CGST</TableHead>
                <TableHead className="text-right">SGST</TableHead>
                <TableHead className="text-right">Total Tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin inline" />
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rateBreakdown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                    No GST transactions for the selected period.
                  </TableCell>
                </TableRow>
              ) : (
                rateBreakdown.map((r) => (
                  <TableRow key={r.rate}>
                    <TableCell>{r.rate}%</TableCell>
                    <TableCell className="text-right tabular-nums">{r.bills}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(r.taxable)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(r.cgst)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(r.sgst)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(r.total)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-slate-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-900">
            <Receipt className="h-4 w-4" />
            Per-bill GST detail
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>HSN/SAC</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">CGST</TableHead>
                  <TableHead className="text-right">SGST</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Invoice Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-slate-500">
                      <Loader2 className="h-4 w-4 mr-2 animate-spin inline" />
                      Loading bills…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-slate-500">
                      No bills with GST recorded in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.billNo}</TableCell>
                      <TableCell>{format(new Date(r.date), "dd MMM yyyy")}</TableCell>
                      <TableCell className="max-w-[180px] truncate">{r.customer || "—"}</TableCell>
                      <TableCell className="max-w-[140px] truncate">{r.hsnSacList || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.rate ? `${r.rate}%` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatINR(r.taxableValue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatINR(r.cgst)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatINR(r.sgst)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatINR(r.totalTax)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatINR(r.billTotal)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
})
