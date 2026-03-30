"use client"

import { useState, useEffect, useMemo } from "react"
import { DollarSign, Package, Ticket, TrendingUp, Users, ShoppingBag } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import { SalesAPI, ProductsAPI, StaffDirectoryAPI } from "@/lib/api"
import { useCurrency } from "@/hooks/use-currency"
import { splitLineRevenueByStaff } from "@/lib/staff-line-revenue"
import type { DatePeriod } from "@/components/reports/service-list-report"

interface ProductRow {
  id: string
  saleId: string
  billNo: string
  product: string
  productId?: string
  price: number
  total: number
  quantity: number
  staff: string
  customer: string
  saleDate: Date
  saleTime: string
  status: string
  paidStatus: string
  paymentMode: string
}

export interface ProductListControlledFilters {
  datePeriod: DatePeriod
  setDatePeriod: (p: DatePeriod) => void
  dateRange: { from?: Date; to?: Date }
  setDateRange: (r: { from?: Date; to?: Date }) => void
  productFilter: string
  setProductFilter: (v: string) => void
  staffFilter: string
  setStaffFilter: (v: string) => void
  statusFilter: string
  setStatusFilter: (v: string) => void
  modeFilter: string
  setModeFilter: (v: string) => void
}

interface ProductListReportProps {
  controlledFilters?: ProductListControlledFilters
}

export function ProductListReport({ controlledFilters }: ProductListReportProps) {
  const { getSymbol } = useCurrency()
  const [salesData, setSalesData] = useState<any[]>([])
  const [productsList, setProductsList] = useState<{ _id: string; name: string }[]>([])
  const [staffList, setStaffList] = useState<{ _id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [datePeriod, setDatePeriod] = useState<DatePeriod>("today")
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({})
  const [productFilter, setProductFilter] = useState<string>("all")
  const [staffFilter, setStaffFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [modeFilter, setModeFilter] = useState<string>("all")

  const period = controlledFilters?.datePeriod ?? datePeriod
  const range = controlledFilters?.dateRange ?? dateRange
  const productF = controlledFilters?.productFilter ?? productFilter
  const staffF = controlledFilters?.staffFilter ?? staffFilter
  const statusF = controlledFilters?.statusFilter ?? statusFilter
  const modeF = controlledFilters?.modeFilter ?? modeFilter

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const [salesRows, productsRes, staffRes] = await Promise.all([
          SalesAPI.getAllMergePages({ batchSize: 500 }),
          ProductsAPI.getAll({ limit: 500 }),
          StaffDirectoryAPI.getAll(),
        ])
        setSalesData(Array.isArray(salesRows) ? salesRows : [])
        const pdata = (productsRes as any)?.data
        setProductsList(Array.isArray(pdata) ? pdata : [])
        const staffData = staffRes?.data && Array.isArray(staffRes.data) ? staffRes.data : []
        setStaffList(staffData.map((s: any) => ({ _id: s._id, name: s.name || s.firstName || "—" })))
      } catch {
        setSalesData([])
        setProductsList([])
        setStaffList([])
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  const getDateRangeFromPeriod = (p: DatePeriod) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    switch (p) {
      case "today":
        return { from: today, to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) }
      case "yesterday": {
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
        return { from: yesterday, to: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1) }
      }
      case "last7days":
        return { from: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000), to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) }
      case "last30days":
        return { from: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000), to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) }
      case "currentMonth":
        return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999) }
      case "all":
      case "custom":
      default:
        return { from: undefined, to: undefined }
    }
  }

  const activeDateFrom = range.from ?? getDateRangeFromPeriod(period).from
  const activeDateTo = range.to ?? getDateRangeFromPeriod(period).to

  const flattenedRows = useMemo((): ProductRow[] => {
    const rows: ProductRow[] = []
    salesData.forEach((sale) => {
      const saleDate = new Date(sale.date)
      if (activeDateFrom && saleDate < activeDateFrom) return
      if (activeDateTo && saleDate > activeDateTo) return
      const status = String(sale.status || "").toLowerCase()
      if (statusF !== "all" && status !== statusF) return
      const paymentModes = sale.payments?.map((p: any) => p.mode) || (sale.paymentMode ? [sale.paymentMode] : [])
      if (modeF !== "all" && !paymentModes.includes(modeF)) return

      const paidAmount = sale.paymentStatus?.paidAmount ?? 0
      const totalAmount = sale.paymentStatus?.totalAmount ?? sale.grossTotal ?? 0
      const paidStatus = totalAmount <= 0 ? "—" : paidAmount >= totalAmount ? "Paid" : paidAmount > 0 ? "Partial" : "Unpaid"
      const saleTimeStr = sale.time || ""

      ;(sale.items || []).forEach((item: any, idx: number) => {
        if (item.type !== "product") return
        if (productF !== "all") {
          const pid = item.productId?.toString?.() ?? item.productId
          const matchById = pid === productF
          const matchByName = item.name === productF
          if (!matchById && !matchByName) return
        }

        const lineQtyRaw = item.quantity ?? 1
        const units = Math.max(1, Math.floor(Number(lineQtyRaw)) || 1)

        const saleFallback = { staffId: sale.staffId, staffName: sale.staffName }
        const splits = splitLineRevenueByStaff(item, saleFallback)

        const pushRow = (staffName: string, staffId: string | undefined, attributedTotal: number, rowSuffix: string) => {
          if (staffF !== "all") {
            const selectedStaffName = staffList.find((s) => s._id === staffF)?.name
            if (staffId !== staffF && staffName !== selectedStaffName) return
          }
          const perUnitTotal = attributedTotal / units
          for (let u = 0; u < units; u++) {
            rows.push({
              id: `${sale._id}-${idx}-${rowSuffix}-u${u}`,
              saleId: sale._id,
              billNo: sale.billNo || "—",
              product: item.name || "—",
              productId: item.productId?.toString?.() ?? item.productId,
              price: item.price ?? 0,
              total: perUnitTotal,
              quantity: 1,
              staff: staffName,
              customer: sale.customerName || "—",
              saleDate,
              saleTime: saleTimeStr,
              status: status || "—",
              paidStatus,
              paymentMode: paymentModes.join(", ") || "—",
            })
          }
        }

        if (splits.length === 0) {
          const staffName = item.staffName || sale.staffName || "—"
          const staffId = item.staffId
          pushRow(staffName, staffId, item.total ?? 0, "0")
        } else {
          splits.forEach((s, j) => {
            pushRow(s.staffName || "—", s.staffId, s.revenue, String(j))
          })
        }
      })
    })
    return rows.sort((a, b) => b.saleDate.getTime() - a.saleDate.getTime())
  }, [salesData, activeDateFrom, activeDateTo, statusF, modeF, staffF, productF, staffList])

  const totalRevenue = useMemo(() => flattenedRows.reduce((s, r) => s + r.total, 0), [flattenedRows])
  const unitsSold = flattenedRows.length
  const avgTicketSize = unitsSold > 0 ? totalRevenue / unitsSold : 0
  const topProductByRevenue = useMemo(() => {
    const byName: Record<string, number> = {}
    flattenedRows.forEach((r) => {
      byName[r.product] = (byName[r.product] || 0) + r.total
    })
    const entries = Object.entries(byName).sort((a, b) => b[1] - a[1])
    return entries[0]
      ? `${entries[0][0]} (${getSymbol()}${entries[0][1].toLocaleString("en-IN", { maximumFractionDigits: 0 })})`
      : "—"
  }, [flattenedRows, getSymbol])
  const topStaffByRevenue = useMemo(() => {
    const byStaff: Record<string, number> = {}
    flattenedRows.forEach((r) => {
      byStaff[r.staff] = (byStaff[r.staff] || 0) + r.total
    })
    const entries = Object.entries(byStaff).sort((a, b) => b[1] - a[1])
    return entries[0]
      ? `${entries[0][0]} (${getSymbol()}${entries[0][1].toLocaleString("en-IN", { maximumFractionDigits: 0 })})`
      : "—"
  }, [flattenedRows, getSymbol])

  const uniqueProductNames = useMemo(() => {
    const set = new Set(flattenedRows.map((r) => r.product))
    return Array.from(set).sort()
  }, [flattenedRows])
  const uniqueProductCount = uniqueProductNames.length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-slate-500">Loading product list...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-white border border-slate-200 rounded-lg shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-900">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {getSymbol()}
              {totalRevenue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border border-slate-200 rounded-lg shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-900">Units sold</CardTitle>
            <Package className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{unitsSold}</div>
          </CardContent>
        </Card>
        <Card className="bg-white border border-slate-200 rounded-lg shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-900">Avg per unit</CardTitle>
            <Ticket className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {getSymbol()}
              {avgTicketSize.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border border-slate-200 rounded-lg shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-900">Top product (by revenue)</CardTitle>
            <TrendingUp className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium text-slate-800 truncate" title={topProductByRevenue}>
              {topProductByRevenue}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border border-slate-200 rounded-lg shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-900">Top staff (by revenue)</CardTitle>
            <Users className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium text-slate-800 truncate" title={topStaffByRevenue}>
              {topStaffByRevenue}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border border-slate-200 rounded-lg shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-900">Unique products</CardTitle>
            <ShoppingBag className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{uniqueProductCount}</div>
          </CardContent>
        </Card>
      </div>

      {!controlledFilters && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Select value={productF} onValueChange={controlledFilters?.setProductFilter ?? setProductFilter}>
                <SelectTrigger className="w-44 border-slate-200">
                  <SelectValue placeholder="Product" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All products</SelectItem>
                  {productsList.map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.name}
                    </SelectItem>
                  ))}
                  {uniqueProductNames
                    .filter((n) => !productsList.some((p) => p.name === n))
                    .map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-44 justify-start text-left font-normal border-slate-200">
                    {range.from
                      ? range.to && range.from.getTime() !== range.to.getTime()
                        ? `${format(range.from, "dd MMM yyyy")} – ${format(range.to, "dd MMM yyyy")}`
                        : format(range.from, "dd MMM yyyy")
                      : period === "all"
                        ? "All time"
                        : period.replace(/([A-Z])/g, " $1").trim()}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={{ from: range.from, to: range.to }}
                    onSelect={(r) => (controlledFilters?.setDateRange ?? setDateRange)(r || {})}
                    numberOfMonths={2}
                  />
                  <div className="p-2 border-t flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        (controlledFilters?.setDatePeriod ?? setDatePeriod)("today")
                        ;(controlledFilters?.setDateRange ?? setDateRange)({})
                      }}
                    >
                      Today
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        (controlledFilters?.setDatePeriod ?? setDatePeriod)("last7days")
                        ;(controlledFilters?.setDateRange ?? setDateRange)({})
                      }}
                    >
                      Last 7 days
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        (controlledFilters?.setDatePeriod ?? setDatePeriod)("last30days")
                        ;(controlledFilters?.setDateRange ?? setDateRange)({})
                      }}
                    >
                      Last 30 days
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        (controlledFilters?.setDatePeriod ?? setDatePeriod)("all")
                        ;(controlledFilters?.setDateRange ?? setDateRange)({})
                      }}
                    >
                      All
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Select value={staffF} onValueChange={controlledFilters?.setStaffFilter ?? setStaffFilter}>
                <SelectTrigger className="w-44 border-slate-200">
                  <SelectValue placeholder="Staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All staff</SelectItem>
                  {staffList.map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusF} onValueChange={controlledFilters?.setStatusFilter ?? setStatusFilter}>
                <SelectTrigger className="w-40 border-slate-200">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={modeF} onValueChange={controlledFilters?.setModeFilter ?? setModeFilter}>
                <SelectTrigger className="w-40 border-slate-200">
                  <SelectValue placeholder="Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All modes</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Card">Card</SelectItem>
                  <SelectItem value="Online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 border-b border-slate-200">
                <TableHead className="font-semibold text-slate-800 whitespace-nowrap">Invoice</TableHead>
                <TableHead className="font-semibold text-slate-800 whitespace-nowrap">Date</TableHead>
                <TableHead className="font-semibold text-slate-800">Product</TableHead>
                <TableHead className="font-semibold text-slate-800">Amount</TableHead>
                <TableHead className="font-semibold text-slate-800">Staff</TableHead>
                <TableHead className="font-semibold text-slate-800">Customer</TableHead>
                <TableHead className="font-semibold text-slate-800">Time</TableHead>
                <TableHead className="font-semibold text-slate-800">Status</TableHead>
                <TableHead className="font-semibold text-slate-800">Paid Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flattenedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-slate-500">
                    No product records found for the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                flattenedRows.map((row) => (
                  <TableRow key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <TableCell className="text-slate-800 font-mono text-sm whitespace-nowrap">{row.billNo}</TableCell>
                    <TableCell className="text-slate-700 whitespace-nowrap">{format(row.saleDate, "dd/MM/yyyy")}</TableCell>
                    <TableCell className="font-medium text-slate-900">{row.product}</TableCell>
                    <TableCell>
                      {getSymbol()}
                      {row.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>{row.staff}</TableCell>
                    <TableCell>{row.customer}</TableCell>
                    <TableCell className="text-slate-600 whitespace-nowrap">{row.saleTime || "—"}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          row.status === "completed"
                            ? "bg-emerald-100 text-emerald-800"
                            : row.status === "cancelled"
                              ? "bg-rose-100 text-rose-800"
                              : row.status === "partial"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-800"
                        }`}
                      >
                        {row.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          row.paidStatus === "Paid"
                            ? "bg-emerald-100 text-emerald-800"
                            : row.paidStatus === "Partial"
                              ? "bg-amber-100 text-amber-800"
                              : row.paidStatus === "Unpaid"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {row.paidStatus}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
