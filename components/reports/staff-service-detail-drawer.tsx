"use client"

import { useState, useEffect, useMemo } from "react"
import { format } from "date-fns"
import type { DateRange } from "react-day-picker"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Calendar } from "lucide-react"
import {
  type DatePeriod,
  getPerformanceFilterBounds,
} from "@/lib/staff-performance-period"
import { SalesAPI, CommissionProfileAPI, StaffDirectoryAPI, ServicesAPI } from "@/lib/api"
import { toDateStringIST, getStartOfDayIST, getEndOfDayIST } from "@/lib/date-utils"
import { CommissionProfileCalculator, enrichSalesWithServiceIdsFromCatalog } from "@/lib/commission-profile-calculator"
import type { CommissionProfile } from "@/lib/commission-profile-types"
import type { Sale } from "@/lib/commission-profile-calculator"
import {
  getAttributedRevenueForStaff,
  getLinePreTaxTotal,
} from "@/lib/staff-line-revenue"

interface StaffServiceDetailDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  staffId: string
  staffName: string
  staffRole?: string
  /** Matches Staff Performance report period dropdown */
  datePeriod: DatePeriod
  /** When period is custom range, parent’s from/to */
  parentCustomDateRange?: DateRange | undefined
  currencySymbol: string
}

interface AggregatedRow {
  name: string
  quantitySold: number
  netTotal: number
  taxAmount: number
  grossTotal: number
}

/** Qty is staff-attributed (fractional when a line is split); strip float noise for display. */
function formatAttributedQtyForDisplay(n: number): string {
  const x = Number(n.toFixed(6))
  if (Number.isInteger(x)) return String(x)
  const y = Number(x.toFixed(4))
  return y % 1 === 0 ? String(y) : y.toFixed(2).replace(/\.?0+$/, "") || "0"
}

function toSale(sale: any): Sale {
  return {
    id: sale._id || sale.id,
    receiptNumber: sale.receiptNumber || sale.billNo || "",
    clientId: sale.clientId || sale.customerId || "",
    clientName: sale.clientName || sale.customerName || "",
    clientPhone: sale.clientPhone || "",
    date: sale.date,
    time: sale.time || "",
    items: (sale.items || []).map((item: any) => ({
      id: item._id || item.id || "",
      name: item.name,
      type: (item.type === "service" ? "service" : item.type === "product" ? "product" : item.type === "membership" ? "membership" : item.type === "package" ? "package" : item.type === "prepaid" ? "prepaid" : "service") as "service" | "product" | "membership" | "package" | "prepaid",
      quantity: item.quantity ?? 1,
      price: item.price ?? 0,
      total: item.total ?? (item.price ?? 0) * (item.quantity ?? 1),
      serviceId: item.serviceId,
      staffId: item.staffId,
      staffName: item.staffName,
      discount: item.discount,
      discountType: item.discountType,
      staffContributions: item.staffContributions,
      priceExcludingGST: item.priceExcludingGST,
      taxRate: item.taxRate,
      taxAmount: item.taxAmount,
    })),
    subtotal: sale.subtotal ?? 0,
    tip: sale.tip ?? 0,
    discount: sale.discount ?? 0,
    tax: sale.tax ?? 0,
    total: sale.total ?? 0,
    payments: sale.payments || [],
    staffId: sale.staffId,
    staffName: sale.staffName,
    notes: sale.notes
  }
}

export function StaffServiceDetailDrawer({
  open,
  onOpenChange,
  staffId,
  staffName,
  staffRole,
  datePeriod: parentDatePeriod,
  parentCustomDateRange,
  currencySymbol: currencySym
}: StaffServiceDetailDrawerProps) {
  const [localPeriod, setLocalPeriod] = useState<DatePeriod>(parentDatePeriod)
  const [localCustomRange, setLocalCustomRange] = useState<DateRange | undefined>(parentCustomDateRange)
  const [sales, setSales] = useState<any[]>([])
  const [commissionProfiles, setCommissionProfiles] = useState<CommissionProfile[]>([])
  const [staffMembers, setStaffMembers] = useState<any[]>([])
  const [catalogServices, setCatalogServices] = useState<Array<{ _id?: string; id?: string; name?: string }>>([])
  const [loading, setLoading] = useState(false)
  const [showServices, setShowServices] = useState(true)
  const [showProducts, setShowProducts] = useState(true)
  const [showMemberships, setShowMemberships] = useState(true)
  const [showPackages, setShowPackages] = useState(true)
  const [selectedServiceFilter, setSelectedServiceFilter] = useState<string>("all")
  const [selectedProductFilter, setSelectedProductFilter] = useState<string>("all")
  const [selectedPackageFilter, setSelectedPackageFilter] = useState<string>("all")
  useEffect(() => {
    if (open) {
      setLocalPeriod(parentDatePeriod)
      setLocalCustomRange(parentCustomDateRange)
    }
  }, [open, parentDatePeriod, parentCustomDateRange])

  const { startDate, endDate } = useMemo(
    () => getPerformanceFilterBounds(localPeriod, localCustomRange),
    [localPeriod, localCustomRange]
  )

  useEffect(() => {
    if (!open || !staffId) return
    const load = async () => {
      setLoading(true)
      try {
        const salesParams: Parameters<typeof SalesAPI.getAllMergePages>[0] = { batchSize: 500 }
        if (localPeriod !== "all") {
          salesParams.dateFrom = getStartOfDayIST(toDateStringIST(startDate))
          salesParams.dateTo = getEndOfDayIST(toDateStringIST(endDate))
        }
        const [salesRows, profilesRes, staffRes, servicesRes] = await Promise.all([
          SalesAPI.getAllMergePages(salesParams),
          CommissionProfileAPI.getProfiles(),
          StaffDirectoryAPI.getAll(),
          ServicesAPI.getAll({ limit: 2000 })
        ])
        setSales(Array.isArray(salesRows) ? salesRows : [])
        if (profilesRes.success && profilesRes.data) setCommissionProfiles(profilesRes.data)
        if (staffRes.success && staffRes.data) setStaffMembers(staffRes.data)
        if (servicesRes.success && Array.isArray(servicesRes.data)) setCatalogServices(servicesRes.data)
        else setCatalogServices([])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [open, staffId, localPeriod, startDate.getTime(), endDate.getTime()])

  const staff = staffMembers.find((s: any) => (s._id || s.id) === staffId)
  const staffProfileIds = staff?.commissionProfileIds || []
  const staffProfiles = commissionProfiles.filter((p) => {
    const id = p.id ?? p._id
    if (id == null) return false
    const pid = String(id)
    return staffProfileIds.some((cid) => String(cid) === pid)
  })

  const filteredSales = (sales as any[])
    .filter((sale: any) => {
      const d = sale.date ? new Date(sale.date) : null
      if (!d) return false
      return d >= startDate && d <= endDate
    })
    .filter((sale: any) => {
      const saleStaffMatch = sale.staffId === staffId || sale.staffName === staffName
      const itemMatch = sale.items?.some((item: any) => {
        const contribMatch = item.staffContributions?.some(
          (c: any) =>
            (c.staffId != null && String(c.staffId) === String(staffId)) ||
            c.staffName === staffName ||
            c.staffName === staffId
        )
        return (
          contribMatch ||
          (item.staffId != null && String(item.staffId) === String(staffId)) ||
          item.staffName === staffId ||
          item.staffName === staffName
        )
      })
      return saleStaffMatch || itemMatch
    })

  const normalizedSales = (() => {
    const rows = filteredSales.map(toSale)
    enrichSalesWithServiceIdsFromCatalog(rows as Parameters<typeof enrichSalesWithServiceIdsFromCatalog>[0], catalogServices)
    return rows
  })()
  const commissionResult =
    staffProfiles.length > 0
      ? CommissionProfileCalculator.calculateMultipleSalesCommission(
          normalizedSales,
          staffProfiles,
          staffId,
          staffName
        )
      : null

  // When staff has no commission profiles, derive revenue/counts from raw sales (same as detailed tables)
  const fallbackFromAggregates = () => {
    const svc = aggregateByType("service")
    const prod = aggregateByType("product")
    const memb = aggregateByType("membership")
    const pkg = aggregateByType("package")
    return {
      serviceRevenue: svc.reduce((s, r) => s + r.grossTotal, 0),
      productRevenue: prod.reduce((s, r) => s + r.grossTotal, 0),
      membershipRevenue: memb.reduce((s, r) => s + r.grossTotal, 0),
      packageRevenue: pkg.reduce((s, r) => s + r.grossTotal, 0),
      serviceCount: svc.reduce((s, r) => s + r.quantitySold, 0),
      productCount: prod.reduce((s, r) => s + r.quantitySold, 0),
      membershipCount: memb.reduce((s, r) => s + r.quantitySold, 0),
      packageCount: pkg.reduce((s, r) => s + r.quantitySold, 0)
    }
  }
  const fallback = commissionResult == null ? fallbackFromAggregates() : null

  const totalRevenue = commissionResult?.totalRevenue ?? (fallback ? fallback.serviceRevenue + fallback.productRevenue + fallback.membershipRevenue + fallback.packageRevenue : 0)
  const serviceRevenueForStaff = commissionResult?.serviceRevenue ?? fallback?.serviceRevenue ?? 0
  const productRevenueForStaff = commissionResult?.productRevenue ?? fallback?.productRevenue ?? 0
  const totalCommission = commissionResult?.totalCommission ?? 0
  const serviceCommission = commissionResult?.serviceCommission ?? 0
  const productCommissionAmount = commissionResult?.productCommission ?? 0
  const totalServicesPerformed = commissionResult?.serviceCount ?? fallback?.serviceCount ?? 0
  const totalProductCount = commissionResult?.productCount ?? fallback?.productCount ?? 0
  const averageServiceValue =
    totalServicesPerformed > 0 ? serviceRevenueForStaff / totalServicesPerformed : 0

  function aggregateByType(type: "service" | "product" | "membership" | "package"): AggregatedRow[] {
    const map = new Map<string, AggregatedRow>()
    filteredSales.forEach((sale: any) => {
      const saleTotal = sale.total || 0
      const saleTax = sale.tax || 0
      const ratio = saleTotal > 0 ? saleTax / saleTotal : 0
      ;(sale.items || []).forEach((item: any) => {
        const t = (item.type || "").toLowerCase()
        const isService = t === "service"
        const isProduct = t === "product"
        const isMembership = t === "membership"
        const isPackage = t === "package"
        const match =
          (type === "service" && isService) ||
          (type === "product" && isProduct) ||
          (type === "membership" && isMembership) ||
          (type === "package" && isPackage)
        if (!match) return
        const saleFallback = { staffId: sale.staffId, staffName: sale.staffName }
        const gross = getAttributedRevenueForStaff(item, staffId, staffName, saleFallback)
        if (gross <= 0) return
        const lineGross = getLinePreTaxTotal(item)
        const qty = item.quantity ?? 1
        const share =
          lineGross > 0 ? gross / lineGross : 1 / Math.max(1, item.staffContributions?.length ?? 1)
        const qtySold = Number((qty * share).toFixed(6))
        const tax = saleTotal > 0 ? (saleTax / saleTotal) * gross : 0
        const net = gross - tax
        const name = item.name || "—"
        const existing = map.get(name)
        if (existing) {
          existing.quantitySold += qtySold
          existing.netTotal += net
          existing.taxAmount += tax
          existing.grossTotal += gross
        } else {
          map.set(name, { name, quantitySold: qtySold, netTotal: net, taxAmount: tax, grossTotal: gross })
        }
      })
    })
    return Array.from(map.values()).sort((a, b) => b.grossTotal - a.grossTotal)
  }

  const serviceRows = aggregateByType("service")
  const productRows = aggregateByType("product")
  const membershipRows = aggregateByType("membership")
  const packageRows = aggregateByType("package")
  const membershipRevenue = membershipRows.reduce((s, r) => s + r.grossTotal, 0)
  const membershipCount = membershipRows.reduce((s, r) => s + r.quantitySold, 0)
  const packageRevenue = packageRows.reduce((s, r) => s + r.grossTotal, 0)
  const packageCount = packageRows.reduce((s, r) => s + r.quantitySold, 0)
  const serviceNames = [...new Set(serviceRows.map((r) => r.name))]
  const productNames = [...new Set(productRows.map((r) => r.name))]
  const packageNames = [...new Set(packageRows.map((r) => r.name))]

  const filteredServiceRows =
    selectedServiceFilter === "all"
      ? serviceRows
      : serviceRows.filter((r) => r.name === selectedServiceFilter)
  const filteredProductRows =
    selectedProductFilter === "all"
      ? productRows
      : productRows.filter((r) => r.name === selectedProductFilter)
  const filteredPackageRows =
    selectedPackageFilter === "all"
      ? packageRows
      : packageRows.filter((r) => r.name === selectedPackageFilter)

  // Card values filtered by Service/Product/Membership/Package checkboxes
  const displayTotalRevenue =
    (showServices ? serviceRevenueForStaff : 0) +
    (showProducts ? productRevenueForStaff : 0) +
    (showMemberships ? membershipRevenue : 0) +
    (showPackages ? packageRevenue : 0)
  const displayTotalServicesPerformed = showServices ? totalServicesPerformed : 0
  const displayTotalProductsSold = showProducts ? totalProductCount : 0
  const displayServiceRevenue = showServices ? serviceRevenueForStaff : 0
  const displayProductRevenue = showProducts ? productRevenueForStaff : 0
  const displayTotalCommission = (showServices ? serviceCommission : 0) + (showProducts ? productCommissionAmount : 0)
  const displayServiceCommission = showServices ? serviceCommission : 0
  const displayProductCommission = showProducts ? productCommissionAmount : 0
  const displayAverageServiceValue = showServices && totalServicesPerformed > 0 ? serviceRevenueForStaff / totalServicesPerformed : 0
  const displayMembershipRevenue = showMemberships ? membershipRevenue : 0
  const displayPackageRevenue = showPackages ? packageRevenue : 0
  const displayMembershipCount = showMemberships ? membershipCount : 0
  const displayPackageCount = showPackages ? packageCount : 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="border-b border-border/60 pb-4">
          <SheetTitle className="text-base font-semibold tracking-tight">
            {staffName}
            {staffRole ? (
              <span className="font-normal text-muted-foreground"> · {staffRole}</span>
            ) : null}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-5 space-y-5">
          {/* Period — same control pattern as Staff Performance report */}
          <section className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Period</label>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={localPeriod}
                onValueChange={(value: DatePeriod) => {
                  setLocalPeriod(value)
                  if (value !== "customRange") {
                    setLocalCustomRange(undefined)
                  }
                }}
              >
                <SelectTrigger className="h-10 w-40 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="last7days">Last 7 days</SelectItem>
                  <SelectItem value="last30days">Last 30 days</SelectItem>
                  <SelectItem value="currentMonth">Current month</SelectItem>
                  <SelectItem value="previousMonth">Previous month</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="customRange">Custom range</SelectItem>
                </SelectContent>
              </Select>
              {localPeriod === "customRange" && (
                <div className="flex flex-wrap gap-2 items-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 w-36 justify-start text-left font-normal border-slate-200"
                      >
                        <Calendar className="mr-2 h-4 w-4 shrink-0" />
                        {localCustomRange?.from ? format(localCustomRange.from, "MMM dd, yyyy") : "From"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        initialFocus
                        mode="single"
                        selected={localCustomRange?.from}
                        onSelect={(date) =>
                          setLocalCustomRange((prev) => ({ from: date, to: prev?.to }))
                        }
                        disabled={(date) =>
                          date > new Date() || (localCustomRange?.to ? date > localCustomRange.to : false)
                        }
                      />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 w-36 justify-start text-left font-normal border-slate-200"
                      >
                        <Calendar className="mr-2 h-4 w-4 shrink-0" />
                        {localCustomRange?.to ? format(localCustomRange.to, "MMM dd, yyyy") : "To"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        initialFocus
                        mode="single"
                        selected={localCustomRange?.to}
                        onSelect={(date) =>
                          setLocalCustomRange((prev) => ({ from: prev?.from, to: date }))
                        }
                        disabled={(date) =>
                          date > new Date() || (localCustomRange?.from ? date < localCustomRange.from : false)
                        }
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
          </section>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Loading…
            </div>
          ) : (
            <>
              {/* Summary */}
              <section className="space-y-3">
                <h3 className="text-xs font-medium text-muted-foreground">Summary</h3>
                <div className="grid grid-cols-2 gap-2.5">
                  <Card className="border-border/60">
                    <CardHeader className="p-3 pb-0">
                      <CardTitle className="text-xs font-medium text-muted-foreground">
                        Total Revenue
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1.5">
                      <p className="text-lg font-semibold tabular-nums text-right">
                        {currencySym}{displayTotalRevenue.toFixed(2)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/60">
                    <CardHeader className="p-3 pb-0">
                      <CardTitle className="text-xs font-medium text-muted-foreground">
                        Average Service Value
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1.5">
                      <p className="text-lg font-semibold tabular-nums text-right">
                        {currencySym}{displayAverageServiceValue.toFixed(2)}
                      </p>
                    </CardContent>
                  </Card>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <Card className="h-full border-border/60">
                    <CardHeader className="p-3 pb-0">
                      <CardTitle className="text-xs font-medium text-muted-foreground">
                        Service Revenue
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1.5 overflow-hidden h-[3.75rem]">
                      <div className="flex flex-col items-end justify-center gap-0.5 h-full">
                        <p className="text-lg font-semibold tabular-nums leading-tight">
                          {currencySym}{displayServiceRevenue.toFixed(2)}
                        </p>
                        <p className="text-xs font-semibold text-green-600 tabular-nums leading-tight">
                          {currencySym}{displayServiceCommission.toFixed(2)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="h-full border-border/60">
                    <CardHeader className="p-3 pb-0">
                      <CardTitle className="text-xs font-medium text-muted-foreground">
                        Product Revenue
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1.5 overflow-hidden h-[3.75rem]">
                      <div className="flex flex-col items-end justify-center gap-0.5 h-full">
                        <p className="text-lg font-semibold tabular-nums leading-tight">
                          {currencySym}{displayProductRevenue.toFixed(2)}
                        </p>
                        <p className="text-xs font-semibold text-green-600 tabular-nums leading-tight">
                          {currencySym}{displayProductCommission.toFixed(2)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="h-full border-border/60">
                    <CardHeader className="p-3 pb-0">
                      <CardTitle className="text-xs font-medium text-muted-foreground">
                        Total Commission
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1.5 overflow-hidden h-[3.75rem]">
                      <div className="flex items-center justify-end h-full">
                        <p className="text-lg font-semibold tabular-nums">
                          {currencySym}{displayTotalCommission.toFixed(2)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Card className="border-border/60">
                    <CardHeader className="p-3 pb-0">
                      <CardTitle className="text-xs font-medium text-muted-foreground">
                        Membership Revenue
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1.5">
                      <p className="text-lg font-semibold tabular-nums text-right">
                        {currencySym}{displayMembershipRevenue.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground text-right tabular-nums mt-0.5">
                        {displayMembershipCount} sold
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/60">
                    <CardHeader className="p-3 pb-0">
                      <CardTitle className="text-xs font-medium text-muted-foreground">
                        Package Revenue
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1.5">
                      <p className="text-lg font-semibold tabular-nums text-right">
                        {currencySym}{displayPackageRevenue.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground text-right tabular-nums mt-0.5">
                        {displayPackageCount} sold
                      </p>
                    </CardContent>
                  </Card>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Card className="border-border/60">
                    <CardHeader className="p-3 pb-0">
                      <CardTitle className="text-xs font-medium text-muted-foreground">
                        Total Services Performed
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1.5">
                      <p className="text-lg font-semibold tabular-nums text-right">{displayTotalServicesPerformed}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/60">
                    <CardHeader className="p-3 pb-0">
                      <CardTitle className="text-xs font-medium text-muted-foreground">
                        Total Product Sold
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1.5">
                      <p className="text-lg font-semibold tabular-nums text-right">{displayTotalProductsSold}</p>
                    </CardContent>
                  </Card>
                </div>
              </section>

              {/* Filters */}
              <section className="space-y-2.5">
                <h3 className="text-xs font-medium text-muted-foreground">Filters</h3>
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={showServices}
                      onCheckedChange={(c) => setShowServices(!!c)}
                    />
                    <span className="text-sm text-foreground">Service</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={showProducts}
                      onCheckedChange={(c) => setShowProducts(!!c)}
                    />
                    <span className="text-sm text-foreground">Product</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={showMemberships}
                      onCheckedChange={(c) => setShowMemberships(!!c)}
                    />
                    <span className="text-sm text-foreground">Memberships</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={showPackages}
                      onCheckedChange={(c) => setShowPackages(!!c)}
                    />
                    <span className="text-sm text-foreground">Packages</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={selectedServiceFilter}
                      onValueChange={setSelectedServiceFilter}
                    >
                      <SelectTrigger className="h-8 w-[160px]" disabled={!showServices}>
                        <SelectValue placeholder="All services" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All services</SelectItem>
                        {serviceNames.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={selectedProductFilter}
                      onValueChange={setSelectedProductFilter}
                    >
                      <SelectTrigger className="h-8 w-[160px]" disabled={!showProducts}>
                        <SelectValue placeholder="All products" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All products</SelectItem>
                        {productNames.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={selectedPackageFilter}
                      onValueChange={setSelectedPackageFilter}
                    >
                      <SelectTrigger className="h-8 w-[160px]" disabled={!showPackages}>
                        <SelectValue placeholder="All packages" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All packages</SelectItem>
                        {packageNames.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              {showServices && (
                <section className="space-y-2">
                  <h3 className="text-xs font-medium text-muted-foreground">Services</h3>
                  <div className="rounded-lg border border-border/60 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs font-medium text-muted-foreground">Service Name</TableHead>
                          <TableHead
                            className="text-right text-xs font-medium text-muted-foreground"
                            title="Staff share of quantity (can be fractional when multiple staff split a line)"
                          >
                            Qty
                          </TableHead>
                          <TableHead className="text-right text-xs font-medium text-muted-foreground">Net Total</TableHead>
                          <TableHead className="text-right text-xs font-medium text-muted-foreground">Tax</TableHead>
                          <TableHead className="text-right text-xs font-medium text-muted-foreground">Gross Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredServiceRows.length === 0 ? (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">
                              No services
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredServiceRows.map((row) => (
                            <TableRow key={row.name} className="border-border/60">
                              <TableCell className="text-sm font-medium py-2">{row.name}</TableCell>
                              <TableCell className="text-right text-sm tabular-nums py-2">
                                {formatAttributedQtyForDisplay(row.quantitySold)}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums py-2">{currencySym}{row.netTotal.toFixed(2)}</TableCell>
                              <TableCell className="text-right text-sm tabular-nums py-2">{currencySym}{row.taxAmount.toFixed(2)}</TableCell>
                              <TableCell className="text-right text-sm tabular-nums py-2">{currencySym}{row.grossTotal.toFixed(2)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              )}

              {showProducts && (
                <section className="space-y-2">
                  <h3 className="text-xs font-medium text-muted-foreground">Products</h3>
                  <div className="rounded-lg border border-border/60 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs font-medium text-muted-foreground">Product Name</TableHead>
                          <TableHead
                            className="text-right text-xs font-medium text-muted-foreground"
                            title="Staff share of quantity (can be fractional when multiple staff split a line)"
                          >
                            Qty
                          </TableHead>
                          <TableHead className="text-right text-xs font-medium text-muted-foreground">Net Total</TableHead>
                          <TableHead className="text-right text-xs font-medium text-muted-foreground">Tax</TableHead>
                          <TableHead className="text-right text-xs font-medium text-muted-foreground">Gross Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProductRows.length === 0 ? (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">
                              No products
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredProductRows.map((row) => (
                            <TableRow key={row.name} className="border-border/60">
                              <TableCell className="text-sm font-medium py-2">{row.name}</TableCell>
                              <TableCell className="text-right text-sm tabular-nums py-2">
                                {formatAttributedQtyForDisplay(row.quantitySold)}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums py-2">{currencySym}{row.netTotal.toFixed(2)}</TableCell>
                              <TableCell className="text-right text-sm tabular-nums py-2">{currencySym}{row.taxAmount.toFixed(2)}</TableCell>
                              <TableCell className="text-right text-sm tabular-nums py-2">{currencySym}{row.grossTotal.toFixed(2)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              )}

              {showMemberships && (
                <section className="space-y-2">
                  <h3 className="text-xs font-medium text-muted-foreground">Memberships</h3>
                  <div className="rounded-lg border border-border/60 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs font-medium text-muted-foreground">Plan Name</TableHead>
                          <TableHead
                            className="text-right text-xs font-medium text-muted-foreground"
                            title="Staff share of quantity (can be fractional when multiple staff split a line)"
                          >
                            Qty
                          </TableHead>
                          <TableHead className="text-right text-xs font-medium text-muted-foreground">Net Total</TableHead>
                          <TableHead className="text-right text-xs font-medium text-muted-foreground">Tax</TableHead>
                          <TableHead className="text-right text-xs font-medium text-muted-foreground">Gross Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {membershipRows.length === 0 ? (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">
                              No memberships
                            </TableCell>
                          </TableRow>
                        ) : (
                          membershipRows.map((row) => (
                            <TableRow key={row.name} className="border-border/60">
                              <TableCell className="text-sm font-medium py-2">{row.name}</TableCell>
                              <TableCell className="text-right text-sm tabular-nums py-2">
                                {formatAttributedQtyForDisplay(row.quantitySold)}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums py-2">{currencySym}{row.netTotal.toFixed(2)}</TableCell>
                              <TableCell className="text-right text-sm tabular-nums py-2">{currencySym}{row.taxAmount.toFixed(2)}</TableCell>
                              <TableCell className="text-right text-sm tabular-nums py-2">{currencySym}{row.grossTotal.toFixed(2)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              )}

              {showPackages && (
                <section className="space-y-2">
                  <h3 className="text-xs font-medium text-muted-foreground">Packages</h3>
                  <div className="rounded-lg border border-border/60 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs font-medium text-muted-foreground">Package Name</TableHead>
                          <TableHead
                            className="text-right text-xs font-medium text-muted-foreground"
                            title="Staff share of quantity (can be fractional when multiple staff split a line)"
                          >
                            Qty
                          </TableHead>
                          <TableHead className="text-right text-xs font-medium text-muted-foreground">Net Total</TableHead>
                          <TableHead className="text-right text-xs font-medium text-muted-foreground">Tax</TableHead>
                          <TableHead className="text-right text-xs font-medium text-muted-foreground">Gross Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPackageRows.length === 0 ? (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">
                              No packages
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredPackageRows.map((row) => (
                            <TableRow key={row.name} className="border-border/60">
                              <TableCell className="text-sm font-medium py-2">{row.name}</TableCell>
                              <TableCell className="text-right text-sm tabular-nums py-2">
                                {formatAttributedQtyForDisplay(row.quantitySold)}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums py-2">{currencySym}{row.netTotal.toFixed(2)}</TableCell>
                              <TableCell className="text-right text-sm tabular-nums py-2">{currencySym}{row.taxAmount.toFixed(2)}</TableCell>
                              <TableCell className="text-right text-sm tabular-nums py-2">{currencySym}{row.grossTotal.toFixed(2)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
