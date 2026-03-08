"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { CreditCard, DollarSign, CalendarDays, Settings, Download, ChevronDown, FileSpreadsheet, Users } from "lucide-react"
import { ReportsAPI, MembershipAPI } from "@/lib/api"
import { MembershipPlansTable } from "@/components/membership/membership-plans-table"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns"

export function MembershipReport() {
  const { toast } = useToast()
  const [manageDrawerOpen, setManageDrawerOpen] = useState(false)
  const [stats, setStats] = useState({
    totalActiveMembers: 0,
    membershipRevenue: 0,
    membersExpiringIn30Days: 0,
  })
  const [plans, setPlans] = useState<any[]>([])
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [planFilter, setPlanFilter] = useState<string>("all")

  const formatAmount = (amount: number) => `₹${amount.toFixed(2)}`

  const fetchSubscriptions = useCallback(async () => {
    try {
      const res = await MembershipAPI.getSubscriptions({
        planId: planFilter && planFilter !== "all" ? planFilter : undefined,
        search: searchQuery.trim() || undefined,
        status: "ACTIVE",
      })
      if (res?.success && Array.isArray(res.data)) setSubscriptions(res.data)
      else setSubscriptions([])
    } catch {
      setSubscriptions([])
    }
  }, [planFilter, searchQuery])

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
            membershipRevenue: statsRes.data.membershipRevenue ?? 0,
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
    if (!loading) fetchSubscriptions()
  }, [loading, fetchSubscriptions])

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
            membershipRevenue: statsRes.data.membershipRevenue ?? 0,
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

  const handleExport = () => {
    const rows = subscriptions.map((s) => ({
      customer: s.customerId?.name || "—",
      phone: s.customerId?.phone || "—",
      email: s.customerId?.email || "—",
      plan: s.planId?.planName || "—",
      startDate: s.startDate ? new Date(s.startDate).toLocaleDateString() : "—",
      expiryDate: s.expiryDate ? new Date(s.expiryDate).toLocaleDateString() : "—",
    }))
    const headers = ["Customer", "Phone", "Email", "Plan", "Start Date", "Expiry Date"]
    const csv = [headers.join(","), ...rows.map((r) => [r.customer, r.phone, r.email, r.plan, r.startDate, r.expiryDate].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `membership-active-members-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: "Export complete", description: "Active members list exported as CSV." })
  }

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
                placeholder="Search active members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-52 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
              />
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
            <div className="text-2xl font-bold text-slate-900">{formatAmount(stats.membershipRevenue)}</div>
            <p className="text-xs text-slate-500 mt-1">From active subscriptions</p>
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
        <div className="p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Active Members</h2>
            <p className="text-sm text-slate-500 mt-0.5">Members with active subscriptions</p>
          </div>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                      <Users className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                      <p className="font-medium">No active members found</p>
                      <p className="text-sm mt-1">Use search and filters above, or create subscriptions to see members here</p>
                      <Button variant="outline" size="sm" className="mt-4" onClick={() => setManageDrawerOpen(true)}>
                        Manage Plans
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  subscriptions.map((sub) => (
                    <TableRow key={sub._id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <TableCell className="font-medium text-slate-900">
                        {sub.customerId?.name || "—"}
                      </TableCell>
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
                      <TableCell className="text-slate-600">
                        {sub.expiryDate ? format(new Date(sub.expiryDate), "MMM dd, yyyy") : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  )
}
