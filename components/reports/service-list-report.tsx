"use client"

import { useState, useEffect, useMemo } from "react"
import { DollarSign, Scissors, Ticket, TrendingUp, Users, Clock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import { SalesAPI, ServicesAPI, StaffDirectoryAPI } from "@/lib/api"
import { useCurrency } from "@/hooks/use-currency"

interface ServiceRow {
  id: string
  saleId: string
  billNo: string
  service: string
  serviceId?: string
  price: number
  total: number
  quantity: number
  staff: string
  durationMinutes: number
  totalDurationMinutes: number
  customer: string
  saleDate: Date
  saleTime: string
  startEndTime: string
  status: string
  paidStatus: string
  paymentMode: string
}

export type DatePeriod = "today" | "yesterday" | "last7days" | "last30days" | "currentMonth" | "all"

export interface ServiceListControlledFilters {
  datePeriod: DatePeriod
  setDatePeriod: (p: DatePeriod) => void
  dateRange: { from?: Date; to?: Date }
  setDateRange: (r: { from?: Date; to?: Date }) => void
  serviceFilter: string
  setServiceFilter: (v: string) => void
  staffFilter: string
  setStaffFilter: (v: string) => void
  statusFilter: string
  setStatusFilter: (v: string) => void
  modeFilter: string
  setModeFilter: (v: string) => void
}

interface ServiceListReportProps {
  /** When provided, filters are controlled by parent and the filter bar is not rendered */
  controlledFilters?: ServiceListControlledFilters
}

export function ServiceListReport({ controlledFilters }: ServiceListReportProps) {
  const { getSymbol } = useCurrency()
  const [salesData, setSalesData] = useState<any[]>([])
  const [servicesList, setServicesList] = useState<{ _id: string; name: string; duration?: number }[]>([])
  const [staffList, setStaffList] = useState<{ _id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [datePeriod, setDatePeriod] = useState<DatePeriod>("today")
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({})
  const [serviceFilter, setServiceFilter] = useState<string>("all")
  const [staffFilter, setStaffFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [modeFilter, setModeFilter] = useState<string>("all")

  const period = controlledFilters?.datePeriod ?? datePeriod
  const range = controlledFilters?.dateRange ?? dateRange
  const serviceF = controlledFilters?.serviceFilter ?? serviceFilter
  const staffF = controlledFilters?.staffFilter ?? staffFilter
  const statusF = controlledFilters?.statusFilter ?? statusFilter
  const modeF = controlledFilters?.modeFilter ?? modeFilter

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const [salesRes, servicesRes, staffRes] = await Promise.all([
          SalesAPI.getAll({ limit: 5000 }),
          ServicesAPI.getAll({ limit: 500 }),
          StaffDirectoryAPI.getAll()
        ])
        setSalesData((salesRes?.data && Array.isArray(salesRes.data)) ? salesRes.data : [])
        setServicesList((servicesRes?.data && Array.isArray(servicesRes.data)) ? servicesRes.data : [])
        const staffData = staffRes?.data && Array.isArray(staffRes.data) ? staffRes.data : []
        setStaffList(staffData.map((s: any) => ({ _id: s._id, name: s.name || s.firstName || "—" })))
      } catch {
        setSalesData([])
        setServicesList([])
        setStaffList([])
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  const serviceDurationMap = useMemo(() => {
    const map: Record<string, number> = {}
    servicesList.forEach((s) => {
      map[s._id] = s.duration ?? 0
    })
    return map
  }, [servicesList])

  const getDateRangeFromPeriod = (period: DatePeriod) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    switch (period) {
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
      default:
        return { from: undefined, to: undefined }
    }
  }

  const activeDateFrom = range.from ?? getDateRangeFromPeriod(period).from
  const activeDateTo = range.to ?? getDateRangeFromPeriod(period).to

  const flattenedRows = useMemo((): ServiceRow[] => {
    const rows: ServiceRow[] = []
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
      const saleDateStr = format(saleDate, "yyyy-MM-dd")

      ;(sale.items || []).forEach((item: any, idx: number) => {
        if (item.type !== "service") return
        const staffName = item.staffContributions?.[0]?.staffName || item.staffName || sale.staffName || "—"
        const staffId = item.staffContributions?.[0]?.staffId || item.staffId
        if (staffF !== "all") {
          const selectedStaffName = staffList.find((s) => s._id === staffF)?.name
          if (staffId !== staffF && staffName !== selectedStaffName) return
        }
        if (serviceF !== "all") {
          const sid = item.serviceId?.toString?.() ?? item.serviceId
          const matchById = sid === serviceF
          const matchByName = item.name === serviceF
          if (!matchById && !matchByName) return
        }

        const perUnitDuration = item.serviceId ? (serviceDurationMap[item.serviceId] ?? 0) : 0
        const totalDurationMinutes = perUnitDuration * (item.quantity || 1)
        let startEndTime = saleTimeStr
        if (totalDurationMinutes > 0 && saleTimeStr) {
          try {
            const [timePart] = saleTimeStr.split(" ")
            const [h, m] = (timePart || "").split(":").map(Number)
            const startMins = (h || 0) * 60 + (m || 0)
            const endMins = startMins + totalDurationMinutes
            const endH = Math.floor(endMins / 60) % 24
            const endM = endMins % 60
            const endStr = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`
            startEndTime = `${saleTimeStr} – ${endStr}`
          } catch {
            startEndTime = saleTimeStr
          }
        }

        rows.push({
          id: `${sale._id}-${idx}`,
          saleId: sale._id,
          billNo: sale.billNo || "—",
          service: item.name || "—",
          serviceId: item.serviceId?.toString?.() ?? item.serviceId,
          price: item.price ?? 0,
          total: item.total ?? 0,
          quantity: item.quantity ?? 1,
          staff: staffName,
          durationMinutes: perUnitDuration,
          totalDurationMinutes,
          customer: sale.customerName || "—",
          saleDate,
          saleTime: saleTimeStr,
          startEndTime: startEndTime || `${saleDateStr} ${saleTimeStr}`.trim() || "—",
          status: status || "—",
          paidStatus,
          paymentMode: paymentModes.join(", ") || "—"
        })
      })
    })
    return rows.sort((a, b) => b.saleDate.getTime() - a.saleDate.getTime())
  }, [salesData, serviceDurationMap, activeDateFrom, activeDateTo, statusF, modeF, staffF, serviceF, staffList])

  const totalRevenue = useMemo(() => flattenedRows.reduce((s, r) => s + r.total, 0), [flattenedRows])
  const noOfServices = flattenedRows.length
  const avgTicketSize = noOfServices > 0 ? totalRevenue / noOfServices : 0
  const topServiceByRevenue = useMemo(() => {
    const byName: Record<string, number> = {}
    flattenedRows.forEach((r) => { byName[r.service] = (byName[r.service] || 0) + r.total })
    const entries = Object.entries(byName).sort((a, b) => b[1] - a[1])
    return entries[0] ? `${entries[0][0]} (${getSymbol()}${entries[0][1].toLocaleString("en-IN", { maximumFractionDigits: 0 })})` : "—"
  }, [flattenedRows, getSymbol])
  const topStaffByRevenue = useMemo(() => {
    const byStaff: Record<string, number> = {}
    flattenedRows.forEach((r) => { byStaff[r.staff] = (byStaff[r.staff] || 0) + r.total })
    const entries = Object.entries(byStaff).sort((a, b) => b[1] - a[1])
    return entries[0] ? `${entries[0][0]} (${getSymbol()}${entries[0][1].toLocaleString("en-IN", { maximumFractionDigits: 0 })})` : "—"
  }, [flattenedRows, getSymbol])
  const serviceHoursUtilized = useMemo(() => {
    const totalMins = flattenedRows.reduce((s, r) => s + r.totalDurationMinutes, 0)
    const h = Math.floor(totalMins / 60)
    const m = totalMins % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }, [flattenedRows])

  const uniqueServiceNames = useMemo(() => {
    const set = new Set(flattenedRows.map((r) => r.service))
    return Array.from(set).sort()
  }, [flattenedRows])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-slate-500">Loading service list...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-white border border-slate-200 rounded-lg shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-900">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{getSymbol()}{totalRevenue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>
        <Card className="bg-white border border-slate-200 rounded-lg shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-900">No. of Services</CardTitle>
            <Scissors className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{noOfServices}</div>
          </CardContent>
        </Card>
        <Card className="bg-white border border-slate-200 rounded-lg shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-900">Avg Ticket Size</CardTitle>
            <Ticket className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{getSymbol()}{avgTicketSize.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>
        <Card className="bg-white border border-slate-200 rounded-lg shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-900">Top Service (by revenue)</CardTitle>
            <TrendingUp className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium text-slate-800 truncate" title={topServiceByRevenue}>{topServiceByRevenue}</div>
          </CardContent>
        </Card>
        <Card className="bg-white border border-slate-200 rounded-lg shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-900">Top Staff (by revenue)</CardTitle>
            <Users className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium text-slate-800 truncate" title={topStaffByRevenue}>{topStaffByRevenue}</div>
          </CardContent>
        </Card>
        <Card className="bg-white border border-slate-200 rounded-lg shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-900">Service Hours Utilized</CardTitle>
            <Clock className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{serviceHoursUtilized}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters – only when not controlled by parent */}
      {!controlledFilters && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Select value={serviceF} onValueChange={controlledFilters?.setServiceFilter ?? setServiceFilter}>
                <SelectTrigger className="w-44 border-slate-200">
                  <SelectValue placeholder="Service" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All services</SelectItem>
                  {servicesList.map((s) => (
                    <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                  ))}
                  {uniqueServiceNames.filter((n) => !servicesList.some((s) => s.name === n)).map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-44 justify-start text-left font-normal border-slate-200">
                    {range.from ? (range.to && range.from.getTime() !== range.to.getTime()
                      ? `${format(range.from, "dd MMM yyyy")} – ${format(range.to, "dd MMM yyyy")}`
                      : format(range.from, "dd MMM yyyy")) : period === "all" ? "All time" : period.replace(/([A-Z])/g, " $1").trim()}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="range" selected={{ from: range.from, to: range.to }} onSelect={(r) => (controlledFilters?.setDateRange ?? setDateRange)(r || {})} numberOfMonths={2} />
                  <div className="p-2 border-t flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { (controlledFilters?.setDatePeriod ?? setDatePeriod)("today"); (controlledFilters?.setDateRange ?? setDateRange)({}) }}>Today</Button>
                    <Button size="sm" variant="outline" onClick={() => { (controlledFilters?.setDatePeriod ?? setDatePeriod)("last7days"); (controlledFilters?.setDateRange ?? setDateRange)({}) }}>Last 7 days</Button>
                    <Button size="sm" variant="outline" onClick={() => { (controlledFilters?.setDatePeriod ?? setDatePeriod)("last30days"); (controlledFilters?.setDateRange ?? setDateRange)({}) }}>Last 30 days</Button>
                    <Button size="sm" variant="outline" onClick={() => { (controlledFilters?.setDatePeriod ?? setDatePeriod)("all"); (controlledFilters?.setDateRange ?? setDateRange)({}) }}>All</Button>
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
                    <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
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

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 border-b border-slate-200">
                <TableHead className="font-semibold text-slate-800">Service</TableHead>
                <TableHead className="font-semibold text-slate-800">Price</TableHead>
                <TableHead className="font-semibold text-slate-800">Staff</TableHead>
                <TableHead className="font-semibold text-slate-800">Duration</TableHead>
                <TableHead className="font-semibold text-slate-800">Customer</TableHead>
                <TableHead className="font-semibold text-slate-800">Start–End Time</TableHead>
                <TableHead className="font-semibold text-slate-800">Status</TableHead>
                <TableHead className="font-semibold text-slate-800">Paid Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flattenedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-slate-500">
                    No service records found for the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                flattenedRows.map((row) => (
                  <TableRow key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <TableCell className="font-medium text-slate-900">{row.service}</TableCell>
                    <TableCell>{getSymbol()}{row.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell>{row.staff}</TableCell>
                    <TableCell>{row.totalDurationMinutes > 0 ? `${row.totalDurationMinutes} min` : "—"}</TableCell>
                    <TableCell>{row.customer}</TableCell>
                    <TableCell className="text-slate-600">{row.startEndTime}</TableCell>
                    <TableCell>
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        row.status === "completed" ? "bg-emerald-100 text-emerald-800" :
                        row.status === "cancelled" ? "bg-rose-100 text-rose-800" :
                        row.status === "partial" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-800"
                      }`}>
                        {row.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        row.paidStatus === "Paid" ? "bg-emerald-100 text-emerald-800" :
                        row.paidStatus === "Partial" ? "bg-amber-100 text-amber-800" :
                        row.paidStatus === "Unpaid" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-600"
                      }`}>
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
