"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { CreditCard, DollarSign, CalendarDays, Settings, Download, ChevronDown, FileSpreadsheet, Users, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { ReportsAPI, MembershipAPI } from "@/lib/api"
import { MembershipPlansTable } from "@/components/membership/membership-plans-table"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

type DatePeriod = "today" | "yesterday" | "last7days" | "last30days" | "currentMonth" | "all"

type MembershipStatusFilter = "all" | "active" | "expired" | "cancelled"

const MEMBERSHIP_SEARCH_DEBOUNCE_MS = 400
const DEFAULT_PAGE_SIZE = 25

function getDateRangeFromPeriod(period: DatePeriod): { from?: Date; to?: Date } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (period) {
    case "today":
      return { from: today, to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) }
    case "yesterday": {
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
      return { from: yesterday, to: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1) }
    }
    case "last7days": {
      const last7 = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      return { from: last7, to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) }
    }
    case "last30days": {
      const last30 = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
      return { from: last30, to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) }
    }
    case "currentMonth": {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { from: firstDay, to: new Date(lastDay.getTime() + 24 * 60 * 60 * 1000 - 1) }
    }
    case "all":
    default:
      return { from: undefined, to: undefined }
  }
}

function membershipStatusLabel(sub: { status?: string; expiryDate?: string | Date }): string {
  const s = String(sub.status || "").toUpperCase()
  if (s === "CANCELLED") return "Cancelled"
  if (s === "EXPIRED") return "Expired"
  if (s === "ACTIVE") {
    if (!sub.expiryDate) return "Active"
    const exp = new Date(sub.expiryDate)
    const today = new Date()
    const expDay = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate())
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (expDay.getTime() < todayDay.getTime()) return "Expired"
    return "Active"
  }
  return s || "—"
}

function statusBadgeClass(label: string): string {
  if (label === "Active") return "bg-emerald-100 text-emerald-800"
  if (label === "Expired") return "bg-red-100 text-red-800"
  if (label === "Cancelled") return "bg-slate-100 text-slate-700"
  return "bg-slate-100 text-slate-700"
}

export function MembershipReport() {
  const { toast } = useToast()
  const [manageDrawerOpen, setManageDrawerOpen] = useState(false)
  const [stats, setStats] = useState({
    totalActiveMembers: 0,
    membersExpiringIn30Days: 0,
  })
  const [plans, setPlans] = useState<any[]>([])
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [planFilter, setPlanFilter] = useState<string>("all")
  const [datePeriod, setDatePeriod] = useState<DatePeriod>("all")
  const [statusFilter, setStatusFilter] = useState<MembershipStatusFilter>("active")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [totalRows, setTotalRows] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [filteredMembershipRevenue, setFilteredMembershipRevenue] = useState(0)

  const formatAmount = (amount: number) => `₹${amount.toFixed(2)}`

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), MEMBERSHIP_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [searchQuery])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, planFilter, datePeriod, statusFilter, pageSize])

  const fetchSubscriptions = useCallback(async () => {
    setSubscriptionsLoading(true)
    try {
      const range = getDateRangeFromPeriod(datePeriod)
      const statusParam =
        statusFilter === "all"
          ? "ALL"
          : statusFilter === "active"
            ? "ACTIVE"
            : statusFilter === "expired"
              ? "EXPIRED"
              : "CANCELLED"

      const res = await MembershipAPI.getSubscriptions({
        planId: planFilter && planFilter !== "all" ? planFilter : undefined,
        search: debouncedSearch || undefined,
        status: statusParam,
        dateFrom: range.from ? range.from.toISOString() : undefined,
        dateTo: range.to ? range.to.toISOString() : undefined,
        page,
        limit: pageSize,
      })
      if (res?.success && Array.isArray(res.data)) {
        setSubscriptions(res.data)
        setTotalRows(res.total ?? res.data.length)
        setTotalPages(Math.max(1, res.totalPages ?? 1))
        setFilteredMembershipRevenue(Number(res.totalRevenue) || 0)
      } else {
        setSubscriptions([])
        setTotalRows(0)
        setTotalPages(1)
        setFilteredMembershipRevenue(0)
      }
    } catch {
      setSubscriptions([])
      setTotalRows(0)
      setTotalPages(1)
      setFilteredMembershipRevenue(0)
    } finally {
      setSubscriptionsLoading(false)
    }
  }, [planFilter, debouncedSearch, datePeriod, statusFilter, page, pageSize])

  const fetchSubscriptionsRef = useRef(fetchSubscriptions)
  fetchSubscriptionsRef.current = fetchSubscriptions

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [statsRes, plansRes] = await Promise.all([
          ReportsAPI.getDashboardStats(),
          MembershipAPI.getPlans(),
        ])
        if (statsRes?.success && statsRes.data) {
          setStats({
            totalActiveMembers: statsRes.data.totalActiveMembers ?? 0,
            membersExpiringIn30Days: statsRes.data.membersExpiringIn30Days ?? 0,
          })
        }
        if (plansRes?.success && Array.isArray(plansRes.data)) {
          setPlans(plansRes.data)
        } else {
          setPlans([])
        }
      } catch (error) {
        console.error("Failed to fetch membership report:", error)
        setPlans([])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  useEffect(() => {
    if (!loading) void fetchSubscriptions()
  }, [loading, fetchSubscriptions])

  const buildSubscriptionQueryParams = useCallback(
    (pageNum: number, limit: number) => {
      const range = getDateRangeFromPeriod(datePeriod)
      const statusParam =
        statusFilter === "all"
          ? "ALL"
          : statusFilter === "active"
            ? "ACTIVE"
            : statusFilter === "expired"
              ? "EXPIRED"
              : "CANCELLED"
      return {
        planId: planFilter && planFilter !== "all" ? planFilter : undefined,
        search: debouncedSearch || undefined,
        status: statusParam,
        dateFrom: range.from ? range.from.toISOString() : undefined,
        dateTo: range.to ? range.to.toISOString() : undefined,
        page: pageNum,
        limit,
      }
    },
    [planFilter, debouncedSearch, datePeriod, statusFilter]
  )

  const fetchAllSubscriptionsForExport = useCallback(async () => {
    const batchSize = 500
    const first = await MembershipAPI.getSubscriptions(buildSubscriptionQueryParams(1, batchSize))
    if (!first?.success || !Array.isArray(first.data)) return []
    const all = [...first.data]
    const pages = Math.max(1, first.totalPages ?? 1)
    for (let p = 2; p <= pages; p += 1) {
      const res = await MembershipAPI.getSubscriptions(buildSubscriptionQueryParams(p, batchSize))
      if (res?.success && Array.isArray(res.data)) all.push(...res.data)
    }
    return all
  }, [buildSubscriptionQueryParams])

  const refreshData = () => {
    const fetchData = async () => {
      try {
        const [statsRes, plansRes] = await Promise.all([
          ReportsAPI.getDashboardStats(),
          MembershipAPI.getPlans(),
        ])
        if (statsRes?.success && statsRes.data) {
          setStats({
            totalActiveMembers: statsRes.data.totalActiveMembers ?? 0,
            membersExpiringIn30Days: statsRes.data.membersExpiringIn30Days ?? 0,
          })
        }
        if (plansRes?.success && Array.isArray(plansRes.data)) {
          setPlans(plansRes.data)
        } else {
          setPlans([])
        }
        fetchSubscriptionsRef.current()
      } catch {
        setPlans([])
      }
    }
    fetchData()
  }

  const handleExport = async () => {
    const rows = (await fetchAllSubscriptionsForExport()).map((s) => ({
      customer: s.customerId?.name || "—",
      phone: s.customerId?.phone || "—",
      email: s.customerId?.email || "—",
      plan: s.planId?.planName || "—",
      startDate: s.startDate ? new Date(s.startDate).toLocaleDateString() : "—",
      expiryDate: s.expiryDate ? new Date(s.expiryDate).toLocaleDateString() : "—",
      status: membershipStatusLabel(s),
    }))
    const headers = ["Customer", "Phone", "Email", "Plan", "Start Date", "Expiry Date", "Status"]
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        [r.customer, r.phone, r.email, r.plan, r.startDate, r.expiryDate, r.status]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `membership-active-members-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: "Export complete", description: `${rows.length} membership row(s) exported as CSV.` })
  }

  const pageStartRow = totalRows === 0 ? 0 : (page - 1) * pageSize + 1
  const pageEndRow = totalRows === 0 ? 0 : Math.min(page * pageSize, totalRows)

  useEffect(() => {
    const handler = () => refreshData()
    window.addEventListener("membership-plan-added", handler)
    return () => window.removeEventListener("membership-plan-added", handler)
  }, [])

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-20 bg-slate-200 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="h-64 bg-slate-100 rounded animate-pulse" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Filter Bar – above cards */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 lg:gap-6">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <Input
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-52 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
              />
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as MembershipStatusFilter)}>
                <SelectTrigger className="w-[160px] border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={datePeriod} onValueChange={(v) => setDatePeriod(v as DatePeriod)}>
                <SelectTrigger className="w-[180px] border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                  <SelectValue placeholder="Date period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="last7days">Last 7 days</SelectItem>
                  <SelectItem value="last30days">Last 30 days</SelectItem>
                  <SelectItem value="currentMonth">This month</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
              <Select value={planFilter} onValueChange={setPlanFilter}>
                <SelectTrigger className="w-40 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                  <SelectValue placeholder="All Plans" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Plans</SelectItem>
                  {plans.map((plan) => (
                    <SelectItem key={plan._id || plan.id} value={plan._id || plan.id}>
                      {plan.planName || plan.name || "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Sheet open={manageDrawerOpen} onOpenChange={setManageDrawerOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                    <Settings className="h-4 w-4 mr-2" />
                    Manage Plans
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>Manage Membership Plans</SheetTitle>
                    <SheetDescription>Create, edit, and manage your membership plans</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6">
                    <MembershipPlansTable />
                  </div>
                </SheetContent>
              </Sheet>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 shadow-md hover:shadow-lg transition-all duration-300 rounded-lg font-medium">
                    <Download className="h-4 w-4 mr-2" />
                    Export Report
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleExport} className="cursor-pointer">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export as CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-slate-200/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Active Members</CardTitle>
            <div className="p-2 bg-indigo-50 rounded-lg">
              <CreditCard className="h-4 w-4 text-indigo-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{stats.totalActiveMembers}</div>
            <p className="text-xs text-slate-500 mt-1">With active membership</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Membership Revenue</CardTitle>
            <div className="p-2 bg-emerald-50 rounded-lg">
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{formatAmount(filteredMembershipRevenue)}</div>
            <p className="text-xs text-slate-500 mt-1">Plan prices for the filtered list (same as table)</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Expiring in 30 Days</CardTitle>
            <div className="p-2 bg-amber-50 rounded-lg">
              <CalendarDays className="h-4 w-4 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{stats.membersExpiringIn30Days}</div>
            <p className="text-xs text-slate-500 mt-1">Memberships expiring soon</p>
          </CardContent>
        </Card>
      </div>

      {/* Active Members Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-slate-50 border-b border-gray-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Memberships</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Start date within the selected period (All time = no date filter). Status filters by subscription state;
                Active means valid through expiry date.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
              <span>
                {subscriptionsLoading
                  ? "Loading…"
                  : totalRows > 0
                    ? `Showing ${pageStartRow}-${pageEndRow} of ${totalRows.toLocaleString()}`
                    : "No memberships"}
              </span>
              <div className="flex items-center gap-2">
                <span>Rows per page:</span>
                <Select
                  value={String(pageSize)}
                  disabled={subscriptionsLoading}
                  onValueChange={(v) => setPageSize(parseInt(v, 10))}
                >
                  <SelectTrigger className="h-8 w-[90px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
        <div className="p-6 pt-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 border-b border-slate-200">
                  <TableHead className="font-semibold text-slate-800">Customer</TableHead>
                  <TableHead className="font-semibold text-slate-800">Phone</TableHead>
                  <TableHead className="font-semibold text-slate-800">Email</TableHead>
                  <TableHead className="font-semibold text-slate-800">Plan</TableHead>
                  <TableHead className="font-semibold text-slate-800">Start Date</TableHead>
                  <TableHead className="font-semibold text-slate-800">Expiry Date</TableHead>
                  <TableHead className="font-semibold text-slate-800">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptionsLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-slate-500">
                      <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-slate-400" />
                      <p className="text-sm">Loading memberships…</p>
                    </TableCell>
                  </TableRow>
                ) : subscriptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-slate-500">
                      <Users className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                      <p className="font-medium">No memberships match your filters</p>
                      <p className="text-sm mt-1">Try All time, All status, or adjust search</p>
                      <Button variant="outline" size="sm" className="mt-4" onClick={() => setManageDrawerOpen(true)}>
                        Manage Plans
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  subscriptions.map((sub) => {
                    const label = membershipStatusLabel(sub)
                    return (
                      <TableRow key={sub._id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <TableCell className="font-medium text-slate-900">{sub.customerId?.name || "—"}</TableCell>
                        <TableCell className="text-slate-600">{sub.customerId?.phone || "—"}</TableCell>
                        <TableCell className="text-slate-600">{sub.customerId?.email || "—"}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                            {sub.planId?.planName || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {sub.startDate ? format(new Date(sub.startDate), "MMM dd, yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-slate-600 font-medium">
                          {sub.expiryDate ? format(new Date(sub.expiryDate), "MMM dd, yyyy") : "—"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                              statusBadgeClass(label)
                            )}
                          >
                            {label}
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {!subscriptionsLoading && totalRows > 0 && (
            <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                {totalRows.toLocaleString()} membership{totalRows === 1 ? "" : "s"}
                {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ""}
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
