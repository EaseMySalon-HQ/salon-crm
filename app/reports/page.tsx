"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { FeatureGate } from "@/components/ui/feature-gate"
import { SalesReport } from "@/components/reports/sales-report"
import { MembershipReport } from "@/components/reports/membership-report"
import { ExpenseReport } from "@/components/reports/expense-report"
import { StaffPerformanceReport } from "@/components/reports/staff-performance-report"
import { PackageReport } from "@/components/reports/package-report"
import { BarChart3, TrendingUp, Receipt, Users, CreditCard, Package } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

function ReportsTabsBody() {
  const { user, hasPermission } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const canViewFinancialReports = !user || hasPermission("reports", "view_financial_reports")
  const canViewStaffCommission = !user || hasPermission("reports", "view_staff_commission")
  const canViewPackageReports = !user || hasPermission("packages", "view")

  const allowedTabs = useMemo(() => {
    const t: string[] = []
    if (canViewFinancialReports) t.push("sales", "membership", "expense")
    if (canViewStaffCommission) t.push("staff")
    if (canViewPackageReports) t.push("package")
    return t
  }, [canViewFinancialReports, canViewStaffCommission, canViewPackageReports])

  const tabCount = allowedTabs.length

  const tabGridClass =
    tabCount <= 1
      ? "grid-cols-1"
      : tabCount === 2
        ? "grid-cols-2"
        : tabCount === 3
          ? "grid-cols-3"
          : tabCount === 4
            ? "grid-cols-2 sm:grid-cols-4"
            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"

  const [activeTab, setActiveTab] = useState<string>(() => {
    const u = searchParams.get("tab")
    if (u && allowedTabs.includes(u)) return u
    return allowedTabs[0] || "sales"
  })

  useEffect(() => {
    const u = searchParams.get("tab")
    if (u && allowedTabs.includes(u)) {
      setActiveTab(u)
      return
    }
    setActiveTab(prev => (allowedTabs.includes(prev) ? prev : allowedTabs[0] || "sales"))
  }, [searchParams, allowedTabs])

  const onTabChange = (value: string) => {
    setActiveTab(value)
    router.replace(`/reports?tab=${value}`, { scroll: false })
  }

  return (
    <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="mb-8">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 px-8 py-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white rounded-xl shadow-sm">
                <BarChart3 className="h-7 w-7 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-800 mb-1">Business Reports</h1>
                <p className="text-slate-600 text-base">
                  Generate and view detailed business reports for informed decision making
                </p>
              </div>
            </div>
          </div>

          <div className="px-8 py-4 bg-white border-t border-slate-100">
            <div className="flex items-center gap-8 text-sm text-slate-600 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                <span>Sales performance analysis</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                <span>Membership overview</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-indigo-500 rounded-full" />
                <span>Expense tracking & insights</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full" />
                <span>Staff performance analytics</span>
              </div>
              {canViewPackageReports && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-cyan-500 rounded-full" />
                  <span>Package sales & utilization</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-6">
            <TabsList className={`grid w-full bg-slate-100 p-1 rounded-lg gap-1 ${tabGridClass}`}>
              {canViewFinancialReports && (
                <>
                  <TabsTrigger
                    value="sales"
                    className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-md transition-all duration-200"
                  >
                    <TrendingUp className="h-4 w-4 mr-2 shrink-0" />
                    Sales
                  </TabsTrigger>
                  <TabsTrigger
                    value="membership"
                    className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-md transition-all duration-200"
                  >
                    <CreditCard className="h-4 w-4 mr-2 shrink-0" />
                    Membership
                  </TabsTrigger>
                  <TabsTrigger
                    value="expense"
                    className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-md transition-all duration-200"
                  >
                    <Receipt className="h-4 w-4 mr-2 shrink-0" />
                    Expense
                  </TabsTrigger>
                </>
              )}
              {canViewStaffCommission && (
                <TabsTrigger
                  value="staff"
                  className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-md transition-all duration-200"
                >
                  <Users className="h-4 w-4 mr-2 shrink-0" />
                  Staff Performance
                </TabsTrigger>
              )}
              {canViewPackageReports && (
                <TabsTrigger
                  value="package"
                  className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-md transition-all duration-200"
                >
                  <Package className="h-4 w-4 mr-2 shrink-0" />
                  Package
                </TabsTrigger>
              )}
            </TabsList>

            {canViewFinancialReports && (
              <>
                <TabsContent value="sales" className="space-y-6">
                  <Card className="border-0 shadow-sm bg-slate-50/50">
                    <CardContent className="pt-6">
                      <SalesReport />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="membership" className="space-y-6">
                  <Card className="border-0 shadow-sm bg-slate-50/50">
                    <CardContent className="pt-6">
                      <MembershipReport />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="expense" className="space-y-6">
                  <Card className="border-0 shadow-sm bg-slate-50/50">
                    <CardContent className="pt-6">
                      <ExpenseReport />
                    </CardContent>
                  </Card>
                </TabsContent>
              </>
            )}

            {canViewStaffCommission && (
              <TabsContent value="staff" className="space-y-6">
                <FeatureGate
                  featureId="staff_commissions"
                  upgradeMessage="Staff commission tracking is available in Professional and Enterprise plans. Upgrade to track staff commissions and performance analytics."
                >
                  <Card className="border-0 shadow-sm bg-slate-50/50">
                    <CardContent className="pt-6">
                      <StaffPerformanceReport />
                    </CardContent>
                  </Card>
                </FeatureGate>
              </TabsContent>
            )}

            {canViewPackageReports && (
              <TabsContent value="package" className="space-y-6">
                <Card className="border-0 shadow-sm bg-slate-50/50">
                  <CardContent className="pt-6">
                    <PackageReport embedded />
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </div>
  )
}

function ReportsTabsFallback() {
  return (
    <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 min-h-[320px] flex items-center justify-center rounded-2xl border border-slate-100">
      <p className="text-slate-500 text-sm">Loading reports…</p>
    </div>
  )
}

export default function ReportsPage() {
  return (
    <ProtectedRoute requiredModule="reports">
      <ProtectedLayout requiredModule="reports">
        <Suspense fallback={<ReportsTabsFallback />}>
          <ReportsTabsBody />
        </Suspense>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
