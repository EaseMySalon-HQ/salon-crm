"use client"

import { useState, useEffect, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Settings,
  Building2,
  Calendar,
  CreditCard,
  Bell,
  ChevronRight,
  Receipt,
  DollarSign,
  Calculator,
  Wallet,
  Wrench,
  Package,
  BarChart2,
  Zap,
  Scissors,
  FolderTree,
  Truck,
  Layers,
  Search,
  IdCard,
  CircleDollarSign,
  Gift,
} from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { buildLoginRedirectHref } from "@/lib/auth-utils"
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
import { ChannelUsageSettings } from "./channel-usage-settings"
import RechargeSettings from "./recharge-settings"
import { PrepaidWalletSettings } from "./prepaid-wallet-settings"
import { RewardPointsProgramSettings } from "./reward-points-settings"
import { ServicesTable } from "@/components/services/services-table"
import { ServiceStatsCards } from "@/components/dashboard/stats-cards"
import { ProductsTable } from "@/components/products/products-table"
import { ProductStatsCards } from "@/components/dashboard/stats-cards"
import { CategoryManagement } from "@/components/categories/category-management"
import { SuppliersAndOrdersTab } from "@/components/suppliers/suppliers-and-orders-tab"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { SETTINGS_PERMISSION_MAP } from "@/lib/permission-mappings"
import type { LucideIcon } from "lucide-react"

const SETTINGS_SECTION_IDS = [
  "general",
  "business",
  "appointments",
  "currency",
  "tax",
  "payments",
  "pos",
  "notifications",
  "plan-billing",
  "membership",
  "services",
  "products",
  "packages",
  "channel-usage",
  "recharge",
  "prepaid-wallet",
  "reward-points",
] as const

function isSettingsSectionId(id: string | null): id is (typeof SETTINGS_SECTION_IDS)[number] {
  return id != null && (SETTINGS_SECTION_IDS as readonly string[]).includes(id)
}

type SettingsItemId = (typeof SETTINGS_SECTION_IDS)[number]

type SettingsItem = {
  id: SettingsItemId
  title: string
  description: string
  icon: LucideIcon
  /** Extra strings matched by search (e.g. synonyms, acronyms) */
  searchTerms?: string[]
}

type SettingsSection = {
  id: string
  title: string
  description: string
  items: SettingsItem[]
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "business-setup",
    title: "Business setup",
    description: "Identity, compliance, and financial basics for your business.",
    items: [
      {
        id: "business",
        title: "Business settings",
        description: "Company name, contact, branding, and business profile.",
        icon: Building2,
        searchTerms: ["company", "logo", "profile", "store"],
      },
      {
        id: "tax",
        title: "Tax settings",
        description: "GST, tax rates, and how tax is applied on sales.",
        icon: Calculator,
        searchTerms: ["gst", "vat", "hst"],
      },
      {
        id: "currency",
        title: "Currency settings",
        description: "Default currency, symbols, and how amounts are shown.",
        icon: DollarSign,
        searchTerms: ["money", "inr", "format"],
      },
    ],
  },
  {
    id: "operations",
    title: "Operations",
    description: "Day-to-day salon workflows, catalog, memberships, and sellable offers.",
    items: [
      {
        id: "appointments",
        title: "Appointment settings",
        description: "Booking rules, time slots, and scheduling preferences.",
        icon: Calendar,
        searchTerms: ["booking", "schedule", "calendar"],
      },
      {
        id: "services",
        title: "Services",
        description: "Service menu, pricing, and service categories.",
        icon: Wrench,
        searchTerms: ["menu", "scissors", "categories"],
      },
      {
        id: "products",
        title: "Products",
        description: "Retail products, stock, categories, and suppliers.",
        icon: Package,
        searchTerms: ["inventory", "retail", "stock"],
      },
      {
        id: "packages",
        title: "Packages",
        description: "Bundles, sittings, redemptions, and package sales.",
        icon: Layers,
        searchTerms: ["bundle", "deals"],
      },
      {
        id: "membership",
        title: "Membership",
        description: "Membership tiers, benefits, and customer subscriptions.",
        icon: IdCard,
        searchTerms: ["subscription", "tiers", "loyalty"],
      },
      {
        id: "prepaid-wallet",
        title: "Prepaid wallet",
        description: "Client wallet plans, credit rules, liability, and expiry alerts.",
        icon: CircleDollarSign,
        searchTerms: ["prepaid", "credit", "wallet plans", "liability"],
      },
    ],
  },
  {
    id: "billing",
    title: "Billing & payments",
    description: "Checkout, in-store sales, plans, and recurring revenue.",
    items: [
      {
        id: "pos",
        title: "POS settings",
        description: "Invoice numbers, bill prefixes, and point-of-sale flow.",
        icon: Receipt,
        searchTerms: ["invoice", "bill", "counter"],
      },
      {
        id: "payments",
        title: "Payment settings",
        description: "Tender types, payment methods, and how you get paid.",
        icon: CreditCard,
        searchTerms: ["upi", "card", "methods"],
      },
      {
        id: "reward-points",
        title: "Reward points",
        description: "Loyalty earning and redemption rules for customer bills.",
        icon: Gift,
        searchTerms: ["loyalty", "points", "rewards", "earn", "redeem"],
      },
      {
        id: "plan-billing",
        title: "Plan & billing",
        description: "Your EaseMySalon plan, usage, and subscription checkout.",
        icon: Wallet,
        searchTerms: ["saas", "subscription", "invoice"],
      },
    ],
  },
  {
    id: "communication",
    title: "Communication",
    description: "Alerts to customers and internal usage for messaging channels.",
    items: [
      {
        id: "notifications",
        title: "Notifications",
        description: "Email, SMS, and reminder preferences for your team and clients.",
        icon: Bell,
        searchTerms: ["alerts", "reminders", "email"],
      },
      {
        id: "channel-usage",
        title: "Channel usage",
        description: "WhatsApp, SMS, and email delivery stats and message logs.",
        icon: BarChart2,
        searchTerms: ["whatsapp", "logs", "delivered"],
      },
      {
        id: "recharge",
        title: "Recharge",
        description: "Top up your messaging wallet for SMS and WhatsApp.",
        icon: Zap,
        searchTerms: ["wallet", "credits", "top up"],
      },
    ],
  },
  {
    id: "system",
    title: "System",
    description: "Application-level preferences and defaults.",
    items: [
      {
        id: "general",
        title: "General settings",
        description: "Locale, theme, and basic app behavior.",
        icon: Settings,
        searchTerms: ["preferences", "language", "theme"],
      },
    ],
  },
]

const ALL_SETTING_ITEMS: SettingsItem[] = SETTINGS_SECTIONS.flatMap((s) => s.items)

function itemMatchesQuery(item: SettingsItem, q: string): boolean {
  if (!q.trim()) return true
  const needle = q.trim().toLowerCase()
  const hay = [item.title, item.description, ...(item.searchTerms || [])]
    .join(" ")
    .toLowerCase()
  return hay.includes(needle)
}

function sectionAfterSearch(section: SettingsSection, q: string): SettingsSection | null {
  const items = section.items.filter((it) => itemMatchesQuery(it, q))
  if (items.length === 0) return null
  return { ...section, items }
}

export function SettingsPage() {
  const searchParams = useSearchParams()
  const sectionParam = searchParams.get("section")
  const [activeSection, setActiveSection] = useState<string | null>(() =>
    isSettingsSectionId(sectionParam) ? sectionParam : null
  )
  const [search, setSearch] = useState("")
  const { user, isLoading, hasPermission } = useAuth()
  const router = useRouter()

  // Keep UI in sync with ?section= (refresh, back/forward, external links)
  useEffect(() => {
    if (isSettingsSectionId(sectionParam)) {
      setActiveSection(sectionParam)
    } else {
      setActiveSection(null)
    }
  }, [sectionParam])

  // Basic authentication check
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(buildLoginRedirectHref())
    }
  }, [user, isLoading, router])

  const filteredSections = useMemo(
    () => SETTINGS_SECTIONS.map((s) => sectionAfterSearch(s, search)).filter(Boolean) as SettingsSection[],
    [search]
  )

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-9 w-9 border-2 border-slate-200 border-t-slate-600 mx-auto mb-3"
            aria-hidden
          />
          <p className="text-sm text-slate-600">Loading settings…</p>
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
    const permissionModule = SETTINGS_PERMISSION_MAP[categoryId]
    if (!permissionModule) return false
    return hasPermission(permissionModule, "view")
  }

  const navigateToSection = (id: string) => {
    if (!canAccessSetting(id)) return
    router.push(`/settings?section=${encodeURIComponent(id)}`)
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
              <div className="rounded-xl border border-slate-200/80 overflow-hidden">
                <ServicesTable />
              </div>
            </TabsContent>
            <TabsContent value="categories">
              <CategoryManagement
                type="service"
                title="Service categories"
                description="Manage categories for your salon services"
              />
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
                Suppliers & orders
              </TabsTrigger>
            </TabsList>
            <TabsContent value="products" className="space-y-6">
              <ProductStatsCards />
              <div className="rounded-xl border border-slate-200/80 overflow-hidden">
                <ProductsTable />
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
          </Tabs>
        )
      case "packages":
        return <PackagesSettingsPanel />
      case "channel-usage":
        return <ChannelUsageSettings />
      case "recharge":
        return <RechargeSettings />
      case "prepaid-wallet":
        return <PrepaidWalletSettings />
      case "reward-points":
        return <RewardPointsProgramSettings />
      default:
        return null
    }
  }

  return (
    <div
      className={
        activeSection
          ? "min-h-screen w-full max-w-none bg-slate-50/80 px-0 py-4 sm:py-6 md:py-8"
          : "min-h-screen bg-slate-50/80 p-4 sm:p-6 md:p-8"
      }
    >
      {!activeSection ? (
        <div className="mx-auto max-w-6xl space-y-8">
          {/* Header + search */}
          <header className="space-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
              Settings
            </h1>
            <p className="text-sm text-slate-500 max-w-2xl">
              Configure your business, operations, and billing. Use search to jump to a module quickly.
            </p>
          </header>

          <div
            className="relative"
            role="search"
            aria-label="Filter settings by name or topic"
          >
            <Label htmlFor="settings-search" className="sr-only">
              Search settings
            </Label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              id="settings-search"
              type="search"
              autoComplete="off"
              placeholder="Search settings…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 pl-9 pr-3 border-slate-200 bg-white text-sm shadow-sm placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-slate-400/30"
            />
          </div>

          {/* Sections */}
          {filteredSections.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-xl bg-white">
              No settings match your search. Try a different term.
            </p>
          ) : (
            filteredSections.map((section, sectionIndex) => (
              <section
                key={section.id}
                className={`space-y-3 ${sectionIndex > 0 ? "pt-8 border-t border-slate-200/80" : ""}`}
                aria-labelledby={`section-${section.id}`}
              >
                <div>
                  <h2
                    id={`section-${section.id}`}
                    className="text-base font-semibold text-slate-900 tracking-tight"
                  >
                    {section.title}
                  </h2>
                  <p className="mt-0.5 text-sm text-slate-500 max-w-3xl">
                    {section.description}
                  </p>
                </div>

                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 list-none p-0 m-0">
                  {section.items.map((item) => {
                    const Icon = item.icon
                    const hasAccess = canAccessSetting(item.id)
                    return (
                      <li key={item.id} className="min-w-0">
                        <button
                          type="button"
                          onClick={() => navigateToSection(item.id)}
                          disabled={!hasAccess}
                          className={[
                            "group w-full text-left rounded-xl border p-3.5 min-h-[88px] transition-all",
                            "focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50",
                            hasAccess
                              ? "border-slate-200/90 bg-white shadow-sm hover:border-slate-300 hover:shadow-md active:scale-[0.99]"
                              : "border-slate-100 bg-slate-50/80 cursor-not-allowed opacity-70",
                          ].join(" ")}
                          aria-label={
                            hasAccess
                              ? `Open ${item.title}`
                              : `${item.title} (restricted)`
                          }
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={[
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                                hasAccess
                                  ? "border-slate-200/80 bg-slate-50 text-slate-700 group-hover:border-slate-300 group-hover:bg-white"
                                  : "border-slate-200 text-slate-400",
                              ].join(" ")}
                            >
                              <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="text-sm font-medium text-slate-900 leading-snug pr-1">
                                  {item.title}
                                </h3>
                                {hasAccess && (
                                  <ChevronRight
                                    className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600 mt-0.5"
                                    aria-hidden
                                  />
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-slate-500 leading-relaxed line-clamp-2">
                                {item.description}
                              </p>
                              {!hasAccess && (
                                <Badge
                                  variant="secondary"
                                  className="mt-2 h-5 text-[10px] font-medium uppercase tracking-wide text-slate-500 border-slate-200"
                                >
                                  No access
                                </Badge>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))
          )}

          {search.trim() && filteredSections.length > 0 && (
            <p className="text-xs text-slate-400">
              {filteredSections.reduce((n, s) => n + s.items.length, 0)} of {ALL_SETTING_ITEMS.length}{" "}
              settings shown
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Bleed to full width of main (p-6): -mx-6 + calc cancels horizontal padding */}
          <div className="-mx-6 w-[calc(100%+3rem)] max-w-none space-y-4 px-6">
          <button
            type="button"
            onClick={() => router.replace("/settings")}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors -ml-0.5"
          >
            <ChevronRight className="h-4 w-4 rotate-180" aria-hidden />
            Back to settings
          </button>
          <Card className="w-full max-w-none border-slate-200/90 bg-white shadow-sm">
            <CardContent className="p-4 sm:p-6 lg:p-8">
              {activeSection && !canAccessSetting(activeSection) ? (
                <p className="text-sm text-slate-600">You don&apos;t have permission to access this setting.</p>
              ) : (
                renderSettingComponent()
              )}
            </CardContent>
          </Card>
        </div>
        </>
      )}
    </div>
  )
}
