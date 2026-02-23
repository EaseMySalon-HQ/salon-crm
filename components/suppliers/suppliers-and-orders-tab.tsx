"use client"

import * as React from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Users, FileText, CreditCard, ShoppingCart, AlertCircle, Loader2 } from "lucide-react"
import { SupplierTable } from "./supplier-table"
import { POList } from "@/components/purchase-orders/po-list"
import { PayableList } from "./payable-list"
import { SuppliersAPI } from "@/lib/api"

export function SuppliersAndOrdersTab() {
  const [refreshKey, setRefreshKey] = React.useState(0)
  const [summary, setSummary] = React.useState<{
    totalSuppliers: number
    totalOutstanding: number
    purchasesThisMonth: number
    overdueAmount: number
  } | null>(null)
  const [summaryLoading, setSummaryLoading] = React.useState(true)

  const onRefresh = React.useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  React.useEffect(() => {
    setSummaryLoading(true)
    SuppliersAPI.getSummary()
      .then((r) => {
        const data = r?.success && r?.data ? r.data : null
        setSummary(data ?? { totalSuppliers: 0, totalOutstanding: 0, purchasesThisMonth: 0, overdueAmount: 0 })
      })
      .catch(() => setSummary({ totalSuppliers: 0, totalOutstanding: 0, purchasesThisMonth: 0, overdueAmount: 0 }))
      .finally(() => setSummaryLoading(false))
  }, [refreshKey])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Suppliers & Orders</h2>
        <p className="text-sm text-gray-600">
          Manage suppliers, purchase orders, and supplier payables
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Suppliers</p>
                <p className="text-xl font-semibold">{summaryLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (summary ? summary.totalSuppliers : "-")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <CreditCard className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Outstanding</p>
                <p className="text-xl font-semibold">
                  {summaryLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (summary ? `₹${(summary.totalOutstanding ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <ShoppingCart className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Purchases This Month</p>
                <p className="text-xl font-semibold">
                  {summaryLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (summary ? `₹${(summary.purchasesThisMonth ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Overdue Amount</p>
                <p className="text-xl font-semibold text-red-600">
                  {summaryLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (summary ? `₹${(summary.overdueAmount ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="suppliers" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="suppliers" className="gap-2">
            <Users className="h-4 w-4" />
            Suppliers
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-2">
            <FileText className="h-4 w-4" />
            Purchase Orders
          </TabsTrigger>
          <TabsTrigger value="payables" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Payables
          </TabsTrigger>
        </TabsList>

        <TabsContent value="suppliers">
          <SupplierTable key={refreshKey} onRefresh={onRefresh} />
        </TabsContent>

        <TabsContent value="orders">
          <POList key={refreshKey} onRefresh={onRefresh} />
        </TabsContent>

        <TabsContent value="payables">
          <PayableList key={refreshKey} onRefresh={onRefresh} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
