"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Settings, Building2, Calendar, CreditCard, Bell, ChevronRight, Receipt, DollarSign, Calculator, Wallet } from "lucide-react"
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
]

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const { user, isLoading, hasPermission } = useAuth()
  const router = useRouter()

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
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      {/* Elegant Header Section */}
      <div className="mb-8">
        <div className="rounded-3xl border border-slate-100 bg-white/80 shadow-sm backdrop-blur">
          <div className="grid gap-6 p-6 lg:grid-cols-[auto_minmax(0,1fr)]">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/80 p-3 text-blue-700">
                <Settings className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-3xl font-semibold text-slate-900">Settings & Configuration</h1>
                <p className="text-slate-500">
                  Personalize every touchpoint—from branding to billing—without leaving this space.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

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
        /* After Selection: Sidebar + Content Layout */
        <div className="grid gap-6 lg:grid-cols-4">
          {/* Settings Navigation - Left Sidebar */}
          <div className="lg:col-span-1">
            <Card className="border border-slate-200 bg-white/90 shadow-sm backdrop-blur">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
                  <Settings className="h-5 w-5 text-blue-600" />
                  Settings Categories
                </CardTitle>
                <CardDescription>Pick a category to configure</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {settingsCategories.map((category) => {
                  const Icon = category.icon
                  const hasAccess = canAccessSetting(category.id)

                  return (
                    <button
                      key={category.id}
                      onClick={() => setActiveSection(category.id)}
                      className={`w-full flex items-center justify-between p-4 rounded-xl text-left transition-all duration-200 ${
                        activeSection === category.id
                          ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg"
                          : hasAccess
                          ? "hover:bg-slate-50 hover:shadow-md border border-transparent hover:border-slate-200"
                          : "opacity-50 cursor-not-allowed bg-slate-50"
                      }`}
                      disabled={!hasAccess}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2.5 rounded-lg transition-all duration-200 ${
                            activeSection === category.id ? "bg-white/20" : "bg-blue-50"
                          }`}
                        >
                          <Icon
                            className={`h-5 w-5 ${
                              activeSection === category.id ? "text-white" : "text-blue-600"
                            }`}
                          />
                        </div>
                        <div>
                          <div
                            className={`font-semibold text-sm ${
                              activeSection === category.id ? "text-white" : "text-slate-900"
                            }`}
                          >
                            {category.title}
                          </div>
                          <div
                            className={`text-xs ${
                              activeSection === category.id ? "text-white/90" : "text-slate-500"
                            }`}
                          >
                            {category.description}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!hasAccess && (
                          <Badge
                            variant="secondary"
                            className="text-xs bg-slate-200 text-slate-600 px-2 py-1"
                          >
                            restricted
                          </Badge>
                        )}
                        <ChevronRight
                          className={`h-4 w-4 transition-transform duration-200 ${
                            activeSection === category.id
                              ? "text-white transform rotate-90"
                              : "text-slate-400"
                          }`}
                        />
                      </div>
                    </button>
                  )
                })}
              </CardContent>
            </Card>
          </div>

          {/* Settings Content - Right Panel */}
          <div className="lg:col-span-3">
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
        </div>
      )}
    </div>
  )
}
