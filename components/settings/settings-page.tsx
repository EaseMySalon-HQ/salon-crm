"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Settings, Building2, Calendar, CreditCard, Bell, ChevronRight, Receipt, DollarSign, Calculator, Wallet, Wrench, Package } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { GeneralSettings } from "./general-settings"
import { BusinessSettings } from "./business-settings"
import { AppointmentSettings } from "./appointment-settings"
import { PaymentSettings } from "./payment-settings"
import { CurrencySettings } from "./currency-settings"
import { TaxSettings } from "./tax-settings"
import { NotificationSettings } from "./notification-settings"
import { POSSettings } from "./pos-settings"
import { PlanBilling } from "./plan-billing"
import { MembershipPlansTable } from "@/components/membership/membership-plans-table"
import { PackagesSettingsPanel } from "@/components/packages/PackagesSettingsPanel"
import { ServicesTable } from "@/components/services/services-table"
import { ServiceStatsCards } from "@/components/dashboard/stats-cards"
import { ProductsTable } from "@/components/products/products-table"
import { ProductStatsCards } from "@/components/dashboard/stats-cards"
import { CategoryManagement } from "@/components/categories/category-management"
import { SuppliersAndOrdersTab } from "@/components/suppliers/suppliers-and-orders-tab"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Scissors, FolderTree, Truck, Layers } from "lucide-react"

import { SETTINGS_PERMISSION_MAP } from "@/lib/permission-mappings"

const settingsCategories = [
  { id: "general", title: "General Settings", description: "Basic application preferences and configurations", icon: Settings },
  { id: "business", title: "Business Settings", description: "Company information, branding, and business details", icon: Building2 },
  { id: "appointments", title: "Appointment Settings", description: "Booking rules, time slots, and appointment preferences", icon: Calendar },
  { id: "currency", title: "Currency Settings", description: "Default currency, symbols, and formatting options", icon: DollarSign },
  { id: "tax", title: "Tax Settings", description: "Tax rates, GST configuration, and calculation methods", icon: Calculator },
  { id: "payments", title: "Payment Settings", description: "Payment methods and processing configuration", icon: CreditCard },
  { id: "pos", title: "POS Settings", description: "Invoice sequence management and custom prefix configuration", icon: Receipt },
  { id: "notifications", title: "Notifications", description: "Email alerts, SMS notifications, and reminder settings", icon: Bell },
  { id: "plan-billing", title: "Plan & Billing", description: "View plan details, billing information, and manage subscription", icon: Wallet },
  { id: "membership", title: "Membership", description: "Create tier-based plans and assign memberships to customers", icon: CreditCard },
  { id: "services", title: "Services", description: "Manage salon services, pricing, and categories", icon: Wrench },
  { id: "products", title: "Products", description: "Product inventory, stock levels, and suppliers", icon: Package },
  { id: "packages", title: "Packages", description: "Bundle services into sellable packages, track sittings and redemptions", icon: Layers },
]

export function SettingsPage() {
  const searchParams = useSearchParams()
  const sectionParam = searchParams.get("section")
  const [activeSection, setActiveSection] = useState<string | null>(sectionParam || null)
  const { user, isLoading, hasPermission } = useAuth()
  const router = useRouter()

  // Sync activeSection from URL when section param changes
  useEffect(() => {
    if (sectionParam && ["general", "business", "appointments", "currency", "tax", "payments", "pos", "notifications", "plan-billing", "membership", "services", "products", "packages"].includes(sectionParam)) {
      setActiveSection(sectionParam)
    }
  }, [sectionParam])

  // Basic authentication check
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login")
    }
  }, [user, isLoading, router])

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading settings...</p>
        </div>
      </div>
    )
  }

  // Don't render if not authenticated
  if (!user) {
    return null
  }

  const canAccessSetting = (categoryId: string) => {
    if (!user) return false

    // Permission-only check
    const permissionModule = SETTINGS_PERMISSION_MAP[categoryId]
    if (!permissionModule) return false
    return hasPermission(permissionModule, "view")
  }

  const renderSettingComponent = () => {
    switch (activeSection) {
      case "general":
        return <GeneralSettings />
      case "business":
        return <BusinessSettings />
      case "appointments":
        return <AppointmentSettings />
      case "currency":
        return <CurrencySettings />
      case "tax":
        return <TaxSettings />
      case "payments":
        return <PaymentSettings />
      case "pos":
        return <POSSettings />
      case "notifications":
        return <NotificationSettings />
      case "plan-billing":
        return <PlanBilling />
      case "membership":
        return (
          <div className="space-y-6">
            <MembershipPlansTable />
          </div>
        )
      case "services":
        return (
          <Tabs defaultValue="services" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="services" className="gap-2">
                <Scissors className="h-4 w-4" />
                Services
              </TabsTrigger>
              <TabsTrigger value="categories" className="gap-2">
                <FolderTree className="h-4 w-4" />
                Categories
              </TabsTrigger>
            </TabsList>
            <TabsContent value="services" className="space-y-6">
              <ServiceStatsCards />
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <ServicesTable />
              </div>
            </TabsContent>
            <TabsContent value="categories">
              <CategoryManagement type="service" title="Service Categories" description="Manage categories for your salon services" />
            </TabsContent>
          </Tabs>
        )
      case "products":
        return (
          <Tabs defaultValue="products" className="w-full">
            <TabsList className="mb-6 grid grid-cols-3">
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
                Suppliers & Orders
              </TabsTrigger>
            </TabsList>
            <TabsContent value="products" className="space-y-6">
              <ProductStatsCards />
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <ProductsTable />
              </div>
            </TabsContent>
            <TabsContent value="categories">
              <CategoryManagement type="product" title="Product Categories" description="Manage categories for your salon products" />
            </TabsContent>
            <TabsContent value="suppliers">
              <SuppliersAndOrdersTab />
            </TabsContent>
          </Tabs>
        )
      case "packages":
        return <PackagesSettingsPanel />
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      {!activeSection ? (
        /* Initial State: Categories as Cards in Grid */
        <div className="rounded-3xl border border-slate-100 bg-white/90 p-6 shadow-sm backdrop-blur">
          <div className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                <Settings className="h-5 w-5 text-blue-600" />
                Settings Categories
              </h2>
              <p className="text-sm text-slate-500">Switch between modules effortlessly</p>
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {settingsCategories.map((category) => {
                const Icon = category.icon
                const hasAccess = canAccessSetting(category.id)

                return (
                  <button
                    key={category.id}
                    onClick={() => setActiveSection(category.id)}
                    className={`group w-full rounded-2xl border text-left transition-all duration-300 ${
                      activeSection === category.id
                        ? "border-blue-200 bg-gradient-to-br from-blue-50 to-white shadow-md ring-2 ring-blue-100"
                        : hasAccess
                        ? "border-slate-200 bg-slate-50/60 hover:border-blue-200 hover:bg-blue-50/40 hover:shadow-md"
                        : "border-slate-100 bg-slate-100/60 text-slate-400 cursor-not-allowed"
                    }`}
                    disabled={!hasAccess}
                  >
                    <div className="flex flex-col gap-4 p-5">
                      <div className="flex items-center justify-between">
                        <div
                          className={`rounded-2xl p-2.5 shadow-sm ${
                            activeSection === category.id
                              ? "bg-white text-blue-600"
                              : "bg-white text-blue-500"
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <ChevronRight
                          className={`h-4 w-4 transition-transform ${
                            activeSection === category.id
                              ? "text-blue-600 rotate-90"
                              : "text-slate-400"
                          }`}
                        />
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-slate-900">
                          {category.title}
                        </div>
                        <div className="text-xs text-slate-500 leading-relaxed">
                          {category.description}
                        </div>
                      </div>
                      {!hasAccess && (
                        <Badge
                          variant="secondary"
                          className="self-start text-xs bg-white text-slate-600"
                        >
                          restricted
                        </Badge>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        /* After Selection: Content only, with back button */
        <div className="space-y-6">
          <button
            onClick={() => setActiveSection(null)}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
            Back to Settings
          </button>
          <Card className="border border-slate-200 bg-white/90 shadow-sm backdrop-blur">
            <CardContent className="p-6">
              {activeSection && !canAccessSetting(activeSection) ? (
                <p className="text-slate-600">You don&apos;t have permission to access this setting.</p>
              ) : (
                renderSettingComponent()
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
