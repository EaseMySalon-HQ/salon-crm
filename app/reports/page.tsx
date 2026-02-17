"use client"

import { ProtectedLayout } from "@/components/layout/protected-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { FeatureGate } from "@/components/ui/feature-gate"
import { SalesReport } from "@/components/reports/sales-report"
import { ExpenseReport } from "@/components/reports/expense-report"
import { StaffPerformanceReport } from "@/components/reports/staff-performance-report"
import { SupplierReport } from "@/components/reports/supplier-report"
import { PurchaseReport } from "@/components/reports/purchase-report"
import { BarChart3, TrendingUp, Receipt, Users, Truck, ShoppingCart } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

export default function ReportsPage() {
  const { user, hasPermission } = useAuth()
  const canViewFinancialReports = !user || hasPermission("reports", "view_financial_reports")
  const canViewStaffCommission = !user || hasPermission("reports", "view_staff_commission")
  const tabCount = (canViewFinancialReports ? 4 : 0) + (canViewStaffCommission ? 1 : 0)

  return (
    <ProtectedRoute requiredModule="reports">
      <ProtectedLayout requiredModule="reports">
        <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
          {/* Elegant Header Section */}
          <div className="mb-8">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              {/* Header Background */}
              <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 px-8 py-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white rounded-xl shadow-sm">
                    <BarChart3 className="h-7 w-7 text-blue-600" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-slate-800 mb-1">
                      Business Reports
                    </h1>
                    <p className="text-slate-600 text-base">
                      Generate and view detailed business reports for informed decision making
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Feature Highlights */}
              <div className="px-8 py-4 bg-white border-t border-slate-100">
                <div className="flex items-center gap-8 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span>Sales performance analysis</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                    <span>Expense tracking & insights</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <span>Staff performance analytics</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Enhanced Tabs Section */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6">
              <Tabs
                defaultValue={
                  canViewFinancialReports ? "sales" : canViewStaffCommission ? "staff" : "sales"
                }
                className="space-y-6"
              >
                <TabsList
                  className={`grid w-full bg-slate-100 p-1 rounded-lg ${
                    tabCount === 1 ? "grid-cols-1" : tabCount === 2 ? "grid-cols-2" : tabCount === 4 ? "grid-cols-4" : "grid-cols-5"
                  }`}
                >
                  {canViewFinancialReports && (
                    <>
                      <TabsTrigger
                        value="sales"
                        className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-md transition-all duration-200"
                      >
                        <TrendingUp className="h-4 w-4 mr-2" />
                        Sales
                      </TabsTrigger>
                      <TabsTrigger
                        value="expense"
                        className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-md transition-all duration-200"
                      >
                        <Receipt className="h-4 w-4 mr-2" />
                        Expense
                      </TabsTrigger>
                      <TabsTrigger
                        value="supplier"
                        className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-md transition-all duration-200"
                      >
                        <Truck className="h-4 w-4 mr-2" />
                        Supplier
                      </TabsTrigger>
                      <TabsTrigger
                        value="purchase"
                        className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-md transition-all duration-200"
                      >
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        Purchase
                      </TabsTrigger>
                    </>
                  )}
                  {canViewStaffCommission && (
                    <TabsTrigger
                      value="staff"
                      className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-md transition-all duration-200"
                    >
                      <Users className="h-4 w-4 mr-2" />
                      Staff Performance
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

                    <TabsContent value="expense" className="space-y-6">
                      <Card className="border-0 shadow-sm bg-slate-50/50">
                        <CardContent className="pt-6">
                          <ExpenseReport />
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="supplier" className="space-y-6">
                      <Card className="border-0 shadow-sm bg-slate-50/50">
                        <CardContent className="pt-6">
                          <SupplierReport />
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="purchase" className="space-y-6">
                      <Card className="border-0 shadow-sm bg-slate-50/50">
                        <CardContent className="pt-6">
                          <PurchaseReport />
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

              </Tabs>
            </div>
          </div>
        </div>
      </ProtectedLayout>
    </ProtectedRoute>
  )
} 