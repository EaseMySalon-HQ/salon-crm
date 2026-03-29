"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Download,
  TrendingUp,
  Package,
  Clock,
  DollarSign,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { PackagesAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

export type PackageReportProps = {
  /** When true, omit back button and outer page padding (embedded in Reports tabs) */
  embedded?: boolean
}

export function PackageReport({ embedded }: PackageReportProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [loading, setLoading] = useState(true)

  const [sales, setSales] = useState<any>(null)
  const [utilization, setUtilization] = useState<any[]>([])
  const [expiring, setExpiring] = useState<any>(null)

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [salesRes, utilRes, expRes] = await Promise.all([
        PackagesAPI.getSalesReport({ from: dateFrom || undefined, to: dateTo || undefined }),
        PackagesAPI.getUtilizationReport(),
        PackagesAPI.getExpiringReport(7),
      ])
      if (salesRes.success) setSales(salesRes.data)
      if (utilRes.success) setUtilization(utilRes.data || [])
      if (expRes.success) setExpiring(expRes.data)
    } catch {
      toast({ title: "Failed to load reports", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async (format: "excel" | "pdf") => {
    try {
      const blob = await PackagesAPI.exportReport({
        format,
        from: dateFrom || undefined,
        to: dateTo || undefined,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `packages-report.${format === "excel" ? "xlsx" : "pdf"}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast({ title: "Export failed", variant: "destructive" })
    }
  }

  const top5 = [...utilization]
    .sort((a, b) => (b.total_sold || 0) - (a.total_sold || 0))
    .slice(0, 5)
    .map(u => ({ name: u.package_name || "—", sold: u.total_sold || 0 }))

  const rootClass = cn(!embedded && "p-6 max-w-5xl mx-auto", "space-y-8")

  if (loading) {
    return (
      <div className={rootClass}>
        {!embedded && (
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-slate-200 animate-pulse" />
            <div className="h-7 w-48 bg-slate-200 rounded animate-pulse" />
          </div>
        )}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6">
            <div className="h-10 w-full max-w-md bg-slate-100 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="border-slate-200/80">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
                <div className="h-9 w-9 bg-slate-100 rounded-lg animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-20 bg-slate-200 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="border-slate-200/80">
          <CardContent className="pt-6">
            <div className="h-52 bg-slate-100 rounded-lg animate-pulse" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className={rootClass}>
      {!embedded && (
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" type="button" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold text-slate-900">Package Reports</h1>
        </div>
      )}

      {/* Filter bar — aligned with Membership / Expense reports */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 lg:gap-6">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600 whitespace-nowrap">From</span>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-40 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600 whitespace-nowrap">To</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-40 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                onClick={fetchAll}
              >
                Apply
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 shadow-md hover:shadow-lg transition-all duration-300 rounded-lg font-medium">
                    <Download className="h-4 w-4 mr-2" />
                    Export Report
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Export format</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer" onClick={() => handleExport("excel")}>
                    Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => handleExport("pdf")}>
                    PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Packages Sold</CardTitle>
            <div className="p-2 bg-indigo-50 rounded-lg">
              <Package className="h-4 w-4 text-indigo-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{sales?.count ?? 0}</div>
            <p className="text-xs text-slate-500 mt-1">In selected date range</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Revenue Collected</CardTitle>
            <div className="p-2 bg-emerald-50 rounded-lg">
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              ₹{(sales?.totalRevenue || 0).toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-slate-500 mt-1">From package sales</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Sold (all time)</CardTitle>
            <div className="p-2 bg-blue-50 rounded-lg">
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {utilization.reduce((s, u) => s + (u.total_sold || 0), 0)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Across all packages</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Expiring in 7 Days</CardTitle>
            <div className="p-2 bg-amber-50 rounded-lg">
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{expiring?.count ?? 0}</div>
            <p className="text-xs text-slate-500 mt-1">Client packages ending soon</p>
          </CardContent>
        </Card>
      </div>

      {top5.length > 0 && (
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold text-slate-900">Top 5 Selling Packages</CardTitle>
            <p className="text-sm text-slate-500 font-normal">By units sold (all time)</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={top5} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#64748b" />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} stroke="#64748b" />
                <Tooltip />
                <Bar dataKey="sold" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {utilization.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Utilization by Package</h2>
              <p className="text-sm text-slate-500 mt-0.5">Sales, sittings used, and expiry metrics</p>
            </div>
            <div className="overflow-x-auto -mx-1">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 border-b border-slate-200 hover:bg-slate-50">
                    <TableHead className="font-semibold text-slate-800">Package</TableHead>
                    <TableHead className="font-semibold text-slate-800 text-right">Sold</TableHead>
                    <TableHead className="font-semibold text-slate-800 text-right">Sittings Used</TableHead>
                    <TableHead className="font-semibold text-slate-800 text-right">Utilization</TableHead>
                    <TableHead className="font-semibold text-slate-800 text-right">Expired Unused</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {utilization.map((u, i) => (
                    <TableRow key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <TableCell className="font-medium text-slate-900">{u.package_name || "—"}</TableCell>
                      <TableCell className="text-right text-slate-600">{u.total_sold}</TableCell>
                      <TableCell className="text-right text-slate-600">
                        {u.total_sittings_used} / {u.total_sittings_issued}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`font-medium ${
                            u.utilization_pct >= 70
                              ? "text-green-600"
                              : u.utilization_pct >= 40
                                ? "text-amber-600"
                                : "text-red-500"
                          }`}
                        >
                          {Math.round(u.utilization_pct || 0)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-slate-600">{u.expired_unused}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {utilization.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-12 text-center text-slate-500">
            <Package className="h-12 w-12 mx-auto mb-4 text-slate-300" />
            <p className="font-medium text-slate-700">No package data yet</p>
            <p className="text-sm mt-1">Sell some packages to see utilization and charts here.</p>
          </div>
        </div>
      )}
    </div>
  )
}
