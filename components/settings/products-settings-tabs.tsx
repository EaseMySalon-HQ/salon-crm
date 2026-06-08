"use client"

import { Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Package, FolderTree, Truck, ArrowRightLeft } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProductStatsCards } from "@/components/dashboard/stats-cards"
import { ProductsTable } from "@/components/products/products-table"
import { CategoryManagement } from "@/components/categories/category-management"
import { SuppliersAndOrdersTab } from "@/components/suppliers/suppliers-and-orders-tab"
import { TransferRequestsTab } from "@/components/products/transfer-requests-tab"
import { useTransferEligibility } from "@/hooks/use-transfer-eligibility"

function ProductsSettingsTabsInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: eligibility, isFetched, isError } = useTransferEligibility()

  const transfersEnabled = isFetched && !isError && eligibility?.enabled === true
  const productsTabRaw = searchParams.get("productsTab")
  let productsTab = "products"
  if (productsTabRaw === "categories") productsTab = "categories"
  else if (productsTabRaw === "suppliers") productsTab = "suppliers"
  else if (productsTabRaw === "transfers" && transfersEnabled) productsTab = "transfers"

  const setProductsTab = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("section", "products")
    params.set("productsTab", tab)
    if (tab !== "suppliers") {
      params.delete("supplierOrdersTab")
      params.delete("pi")
      params.delete("piEdit")
      params.delete("purchaseOrderId")
      params.delete("newPurchaseInvoice")
      params.delete("purchaseInvoiceSupplierId")
    }
    if (tab !== "transfers") {
      params.delete("create")
      params.delete("productId")
    }
    router.replace(`/settings?${params.toString()}`)
  }

  const tabCols = transfersEnabled ? 4 : 3

  return (
    <Tabs value={productsTab} onValueChange={setProductsTab} className="w-full">
      <TabsList className={`mb-6 grid grid-cols-${tabCols}`} style={{ gridTemplateColumns: `repeat(${tabCols}, minmax(0, 1fr))` }}>
        <TabsTrigger value="products" className="gap-2">
          <Package className="h-4 w-4" />
          Products
        </TabsTrigger>
        <TabsTrigger value="categories" className="gap-2">
          <FolderTree className="h-4 w-4" />
          Categories
        </TabsTrigger>
        <TabsTrigger value="suppliers" className="gap-2">
          <Truck className="h-4 w-4" />
          Suppliers & orders
        </TabsTrigger>
        {transfersEnabled && (
          <TabsTrigger value="transfers" className="gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Transfer requests
          </TabsTrigger>
        )}
      </TabsList>
      <TabsContent value="products" className="space-y-6">
        <ProductStatsCards />
        <div className="overflow-hidden rounded-xl border border-slate-200/80">
          <ProductsTable transfersEnabled={transfersEnabled} />
        </div>
      </TabsContent>
      <TabsContent value="categories">
        <CategoryManagement
          type="product"
          title="Product categories"
          description="Manage categories for your salon products"
        />
      </TabsContent>
      <TabsContent value="suppliers">
        <SuppliersAndOrdersTab />
      </TabsContent>
      {transfersEnabled && (
        <TabsContent value="transfers">
          <TransferRequestsTab />
        </TabsContent>
      )}
    </Tabs>
  )
}

export function ProductsSettingsTabs() {
  return (
    <Suspense fallback={null}>
      <ProductsSettingsTabsInner />
    </Suspense>
  )
}
