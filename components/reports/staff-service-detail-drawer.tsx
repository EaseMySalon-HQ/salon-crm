"use client"

import { useState, useEffect } from "react"
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
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { SalesAPI, CommissionProfileAPI, StaffDirectoryAPI } from "@/lib/api"
import { CommissionProfileCalculator } from "@/lib/commission-profile-calculator"
import type { CommissionProfile } from "@/lib/commission-profile-types"
import type { Sale } from "@/lib/commission-profile-calculator"

interface StaffServiceDetailDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  staffId: string
  staffName: string
  staffRole?: string
  dateRange: DateRange | undefined
  currencySymbol: string
}

interface AggregatedRow {
  name: string
  quantitySold: number
  netTotal: number
  taxAmount: number
  grossTotal: number
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
      type: (item.type === "service" ? "service" : item.type === "product" ? "product" : "service") as "service" | "product",
      quantity: item.quantity ?? 1,
      price: item.price ?? 0,
      total: item.total ?? (item.price ?? 0) * (item.quantity ?? 1),
      staffId: item.staffId,
      staffName: item.staffName,
      discount: item.discount,
      discountType: item.discountType
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
  dateRange,
  currencySymbol: currencySym
}: StaffServiceDetailDrawerProps) {
  const [drawerDateRange, setDrawerDateRange] = useState<DateRange | undefined>(dateRange)
  const [sales, setSales] = useState<any[]>([])
  const [commissionProfiles, setCommissionProfiles] = useState<CommissionProfile[]>([])
  const [staffMembers, setStaffMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showServices, setShowServices] = useState(true)
  const [showProducts, setShowProducts] = useState(true)
  const [selectedServiceFilter, setSelectedServiceFilter] = useState<string>("all")
  const [selectedProductFilter, setSelectedProductFilter] = useState<string>("all")
  // Sync drawer date range from parent when it changes
  useEffect(() => {
    if (dateRange) setDrawerDateRange(dateRange)
  }, [dateRange, open])

  const from = drawerDateRange?.from
  const to = drawerDateRange?.to
  const startDate = from ? new Date(from.getFullYear(), from.getMonth(), from.getDate()) : null
  const endDate = to ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999) : null

  useEffect(() => {
    if (!open || !staffId) return
    const load = async () => {
      setLoading(true)
      try {
        const [salesRes, profilesRes, staffRes] = await Promise.all([
          SalesAPI.getAll(),
          CommissionProfileAPI.getProfiles(),
          StaffDirectoryAPI.getAll()
        ])
        if (salesRes.success && salesRes.data) setSales(salesRes.data)
        if (profilesRes.success && profilesRes.data) setCommissionProfiles(profilesRes.data)
        if (staffRes.success && staffRes.data) setStaffMembers(staffRes.data)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [open, staffId])

  const staff = staffMembers.find((s: any) => (s._id || s.id) === staffId)
  const staffProfileIds = staff?.commissionProfileIds || []
  const staffProfiles = commissionProfiles.filter((p) => {
    const id = p.id ?? p._id
    return id != null && staffProfileIds.includes(id)
  })

  const filteredSales = (sales as any[])
    .filter((sale: any) => {
      const d = sale.date ? new Date(sale.date) : null
      if (!d || !startDate || !endDate) return false
      return d >= startDate && d <= endDate
    })
    .filter((sale: any) => {
      const saleStaffMatch = sale.staffId === staffId || sale.staffName === staffName
      const itemMatch = sale.items?.some(
        (item: any) =>
          (item.staffId != null && String(item.staffId) === String(staffId)) ||
          item.staffName === staffId ||
          item.staffName === staffName
      )
      return saleStaffMatch || itemMatch
    })

  const normalizedSales = filteredSales.map(toSale)
  const commissionResult =
    staffProfiles.length > 0
      ? CommissionProfileCalculator.calculateMultipleSalesCommission(
          normalizedSales,
          staffProfiles,
          staffId,
          staffName
        )
      : null

  const totalRevenue = commissionResult?.totalRevenue ?? 0
  const serviceRevenueForStaff = commissionResult?.serviceRevenue ?? 0
  const productRevenueForStaff = commissionResult?.productRevenue ?? 0
  const totalCommission = commissionResult?.totalCommission ?? 0
  const serviceCommission = commissionResult?.serviceCommission ?? 0
  const productCommissionAmount = commissionResult?.productCommission ?? 0
  const totalServicesPerformed = commissionResult?.serviceCount ?? 0
  const totalProductCount = commissionResult?.productCount ?? 0
  const averageServiceValue =
    totalServicesPerformed > 0 ? serviceRevenueForStaff / totalServicesPerformed : 0

  // Card values filtered by Service/Product checkboxes
  const displayTotalRevenue = (showServices ? serviceRevenueForStaff : 0) + (showProducts ? productRevenueForStaff : 0)
  const displayTotalServicesPerformed = showServices ? totalServicesPerformed : 0
  const displayTotalProductsSold = showProducts ? totalProductCount : 0
  const displayServiceRevenue = showServices ? serviceRevenueForStaff : 0
  const displayProductRevenue = showProducts ? productRevenueForStaff : 0
  const displayTotalCommission = (showServices ? serviceCommission : 0) + (showProducts ? productCommissionAmount : 0)
  const displayServiceCommission = showServices ? serviceCommission : 0
  const displayProductCommission = showProducts ? productCommissionAmount : 0
  const displayAverageServiceValue = showServices && totalServicesPerformed > 0 ? serviceRevenueForStaff / totalServicesPerformed : 0

  function aggregateByType(type: "service" | "product"): AggregatedRow[] {
    const map = new Map<string, AggregatedRow>()
    filteredSales.forEach((sale: any) => {
      const saleTotal = sale.total || 0
      const saleTax = sale.tax || 0
      const ratio = saleTotal > 0 ? saleTax / saleTotal : 0
      ;(sale.items || []).forEach((item: any) => {
        const isService = (item.type || "").toLowerCase() === "service"
        const isProduct = (item.type || "").toLowerCase() === "product"
        const match =
          (type === "service" && isService) || (type === "product" && isProduct)
        if (!match) return
        const staffMatch =
          (item.staffId != null && String(item.staffId) === String(staffId)) ||
          item.staffName === staffId ||
          item.staffName === staffName
        if (!staffMatch) return
        const gross = item.total ?? (item.price ?? 0) * (item.quantity ?? 1)
        const tax = saleTotal > 0 ? (saleTax / saleTotal) * gross : 0
        const net = gross - tax
        const qty = item.quantity ?? 1
        const name = item.name || "—"
        const existing = map.get(name)
        if (existing) {
          existing.quantitySold += qty
          existing.netTotal += net
          existing.taxAmount += tax
          existing.grossTotal += gross
        } else {
          map.set(name, { name, quantitySold: qty, netTotal: net, taxAmount: tax, grossTotal: gross })
        }
      })
    })
    return Array.from(map.values()).sort((a, b) => b.grossTotal - a.grossTotal)
  }

  const serviceRows = aggregateByType("service")
  const productRows = aggregateByType("product")
  const serviceNames = [...new Set(serviceRows.map((r) => r.name))]
  const productNames = [...new Set(productRows.map((r) => r.name))]

  const filteredServiceRows =
    selectedServiceFilter === "all"
      ? serviceRows
      : serviceRows.filter((r) => r.name === selectedServiceFilter)
  const filteredProductRows =
    selectedProductFilter === "all"
      ? productRows
      : productRows.filter((r) => r.name === selectedProductFilter)

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
          {/* Date range */}
          <section className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Date range</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-9 w-full justify-start text-left font-normal",
                    !drawerDateRange?.from && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {drawerDateRange?.from ? (
                    drawerDateRange.to ? (
                      <>
                        {format(drawerDateRange.from, "MMM d, yyyy")} – {format(drawerDateRange.to, "MMM d, yyyy")}
                      </>
                    ) : (
                      format(drawerDateRange.from, "MMM d, yyyy")
                    )
                  ) : (
                    "Pick dates"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="range"
                  selected={drawerDateRange}
                  onSelect={setDrawerDateRange}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
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
                  <div className="flex items-center gap-2 flex-nowrap">
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
                          <TableHead className="text-right text-xs font-medium text-muted-foreground">Qty</TableHead>
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
                              <TableCell className="text-right text-sm tabular-nums py-2">{row.quantitySold}</TableCell>
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
                          <TableHead className="text-right text-xs font-medium text-muted-foreground">Qty</TableHead>
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
                              <TableCell className="text-right text-sm tabular-nums py-2">{row.quantitySold}</TableCell>
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
