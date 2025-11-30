import { ProtectedLayout } from "@/components/layout/protected-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { FeatureGate } from "@/components/ui/feature-gate"
import { SalesReport } from "@/components/reports/sales-report"
import { ExpenseReport } from "@/components/reports/expense-report"
import { StaffPerformanceReport } from "@/components/reports/staff-performance-report"
import { BarChart3, TrendingUp, Receipt, Users } from "lucide-react"

export default function ReportsPage() {
  return (
    <ProtectedRoute requiredRole="manager">
      <ProtectedLayout>
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
              <Tabs defaultValue="sales" className="space-y-6">
                <TabsList className="grid w-full grid-cols-3 bg-slate-100 p-1 rounded-lg">
                  <TabsTrigger 
                    value="sales" 
                    className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-md transition-all duration-200"
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Sales Report
                  </TabsTrigger>
                  <TabsTrigger 
                    value="expense" 
                    className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-md transition-all duration-200"
                  >
                    <Receipt className="h-4 w-4 mr-2" />
                    Expense Report
                  </TabsTrigger>
                  <TabsTrigger 
                    value="staff" 
                    className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-md transition-all duration-200"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Staff Performance
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="sales" className="space-y-6">
                  <Card className="border-0 shadow-sm bg-slate-50/50">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-xl text-slate-800">Sales Report</CardTitle>
                      <CardDescription className="text-slate-600">
                        View detailed sales performance and revenue analysis
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <SalesReport />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="expense" className="space-y-6">
                  <Card className="border-0 shadow-sm bg-slate-50/50">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-xl text-slate-800">Expense Report</CardTitle>
                      <CardDescription className="text-slate-600">
                        Track and analyze business expenses and costs
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ExpenseReport />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="staff" className="space-y-6">
                  <FeatureGate 
                    featureId="staff_commissions"
                    upgradeMessage="Staff commission tracking is available in Professional and Enterprise plans. Upgrade to track staff commissions and performance analytics."
                  >
                    <Card className="border-0 shadow-sm bg-slate-50/50">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-xl text-slate-800">Staff Performance</CardTitle>
                        <CardDescription className="text-slate-600">
                          Analyze staff performance, commissions, and sales analytics
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <StaffPerformanceReport />
                      </CardContent>
                    </Card>
                  </FeatureGate>
                </TabsContent>

              </Tabs>
            </div>
          </div>
        </div>
      </ProtectedLayout>
    </ProtectedRoute>
  )
} 