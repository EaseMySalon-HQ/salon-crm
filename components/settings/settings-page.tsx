"use client"

import { useState, useEffect, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageSkeleton } from "@/components/loading"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Settings,
  Building2,
  Calendar,
  CreditCard,
  ChevronRight,
  Receipt,
  DollarSign,
  Calculator,
  Wallet,
  Wrench,
  Package,
  BarChart2,
  MessageCircle,
  Zap,
  Scissors,
  FolderTree,
  Truck,
  Search,
  IdCard,
  CircleDollarSign,
  Gift,
  MessageSquare,
  Bell,
  Boxes,
  Globe,
  Banknote,
  UserCog,
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
import { ChannelUsageSettings } from "./channel-usage-settings"
import { WhatsAppIntegrationSettings } from "./whatsapp-business-settings"
import { FeedbackManagementSettings } from "./feedback-management-settings"
import { GoogleBusinessSettings } from "./google-business-settings"
import RechargeSettings from "./recharge-settings"
import { PrepaidWalletSettings } from "./prepaid-wallet-settings"
import { RewardPointsProgramSettings } from "./reward-points-settings"
import { AttendancePayrollSettings } from "./attendance-payroll-settings"
import { StaffDirectory } from "./staff-directory"
import { ServicesTable } from "@/components/services/services-table"
import { ServiceStatsCards } from "@/components/dashboard/stats-cards"
import { PackagesSettingsPanel } from "@/components/packages/packages-settings-panel"
import { ProductsSettingsTabs } from "@/components/settings/products-settings-tabs"
import { CategoryManagement } from "@/components/categories/category-management"

import { SETTINGS_PERMISSION_MAP } from "@/lib/permission-mappings"
import { useEntitlements } from "@/hooks/use-entitlements"
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
  "channel-usage",
  "whatsapp-integration",
  "google-business",
  "feedback",
  "recharge",
  "prepaid-wallet",
  "reward-points",
  "packages",
  "attendance-payroll",
  "staff-directory",
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
  /** Tailwind classes for the icon tile (background, border, icon color). */
  iconColors: string
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
        iconColors:
          "bg-blue-50 text-blue-600 border-blue-100 group-hover:bg-blue-100/80 group-hover:border-blue-200",
        searchTerms: ["company", "logo", "profile", "store"],
      },
      {
        id: "tax",
        title: "Tax settings",
        description: "GST, tax rates, and how tax is applied on sales.",
        icon: Calculator,
        iconColors:
          "bg-emerald-50 text-emerald-600 border-emerald-100 group-hover:bg-emerald-100/80 group-hover:border-emerald-200",
        searchTerms: ["gst", "vat", "hst"],
      },
      {
        id: "currency",
        title: "Currency settings",
        description: "Default currency, symbols, and how amounts are shown.",
        icon: DollarSign,
        iconColors:
          "bg-amber-50 text-amber-600 border-amber-100 group-hover:bg-amber-100/80 group-hover:border-amber-200",
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
        description: "Online booking, time slots, working hours, and scheduling rules.",
        icon: Calendar,
        iconColors:
          "bg-violet-50 text-violet-600 border-violet-100 group-hover:bg-violet-100/80 group-hover:border-violet-200",
        searchTerms: ["booking", "schedule", "calendar", "online booking", "public link"],
      },
      {
        id: "services",
        title: "Services",
        description: "Service menu, pricing, and service categories.",
        icon: Wrench,
        iconColors:
          "bg-rose-50 text-rose-600 border-rose-100 group-hover:bg-rose-100/80 group-hover:border-rose-200",
        searchTerms: ["menu", "scissors", "categories"],
      },
      {
        id: "products",
        title: "Products",
        description: "Retail products, stock, categories, and suppliers.",
        icon: Package,
        iconColors:
          "bg-orange-50 text-orange-600 border-orange-100 group-hover:bg-orange-100/80 group-hover:border-orange-200",
        searchTerms: ["inventory", "retail", "stock"],
      },
      {
        id: "membership",
        title: "Membership",
        description: "Membership tiers, benefits, and customer subscriptions.",
        icon: IdCard,
        iconColors:
          "bg-cyan-50 text-cyan-600 border-cyan-100 group-hover:bg-cyan-100/80 group-hover:border-cyan-200",
        searchTerms: ["subscription", "tiers", "loyalty"],
      },
      {
        id: "packages",
        title: "Packages",
        description: "Multi-session packages, pricing, and sellable bundles.",
        icon: Boxes,
        iconColors:
          "bg-purple-50 text-purple-600 border-purple-100 group-hover:bg-purple-100/80 group-hover:border-purple-200",
        searchTerms: ["bundle", "sittings", "sessions", "prepaid"],
      },
      {
        id: "prepaid-wallet",
        title: "Prepaid wallet",
        description: "Client wallet plans, credit rules, liability, and expiry alerts.",
        icon: CircleDollarSign,
        iconColors:
          "bg-teal-50 text-teal-600 border-teal-100 group-hover:bg-teal-100/80 group-hover:border-teal-200",
        searchTerms: ["prepaid", "credit", "wallet plans", "liability"],
      },
      {
        id: "reward-points",
        title: "Reward points",
        description: "Loyalty earning and redemption rules for customer bills.",
        icon: Gift,
        iconColors:
          "bg-fuchsia-50 text-fuchsia-600 border-fuchsia-100 group-hover:bg-fuchsia-100/80 group-hover:border-fuchsia-200",
        searchTerms: ["loyalty", "points", "rewards", "earn", "redeem"],
      },
    ],
  },
  {
    id: "team-management",
    title: "Team Management",
    description: "Staff roster, attendance, timesheets, payroll rules, and salary settings.",
    items: [
      {
        id: "staff-directory",
        title: "Staff Directory",
        description: "Team roster, timesheets, attendance, payroll, and commission assignments.",
        icon: UserCog,
        iconColors:
          "bg-blue-50 text-blue-600 border-blue-100 group-hover:bg-blue-100/80 group-hover:border-blue-200",
        searchTerms: ["staff", "team", "roster", "employees", "timesheet", "commission", "shifts"],
      },
      {
        id: "attendance-payroll",
        title: "Attendance & Payroll",
        description:
          "Working days, late/overtime rules, salary formula, holidays, and per-staff overrides.",
        icon: Banknote,
        iconColors:
          "bg-lime-50 text-lime-700 border-lime-100 group-hover:bg-lime-100/80 group-hover:border-lime-200",
        searchTerms: [
          "attendance",
          "payroll",
          "salary",
          "overtime",
          "leave",
          "holiday",
          "commission",
          "formula",
          "salary formula",
          "advance",
        ],
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
        iconColors:
          "bg-slate-100 text-slate-700 border-slate-200 group-hover:bg-slate-200/60 group-hover:border-slate-300",
        searchTerms: ["invoice", "bill", "counter"],
      },
      {
        id: "payments",
        title: "Payment settings",
        description: "Tender types, payment methods, and how you get paid.",
        icon: CreditCard,
        iconColors:
          "bg-sky-50 text-sky-600 border-sky-100 group-hover:bg-sky-100/80 group-hover:border-sky-200",
        searchTerms: ["upi", "card", "methods"],
      },
      {
        id: "plan-billing",
        title: "Plan & billing",
        description: "Your EaseMySalon plan, usage, and subscription checkout.",
        icon: Wallet,
        iconColors:
          "bg-indigo-50 text-indigo-600 border-indigo-100 group-hover:bg-indigo-100/80 group-hover:border-indigo-200",
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
        description: "Email and WhatsApp message preferences — receipts, appointments, and alerts.",
        icon: Bell,
        iconColors:
          "bg-yellow-50 text-yellow-700 border-yellow-100 group-hover:bg-yellow-100/80 group-hover:border-yellow-200",
        searchTerms: ["alerts", "reminders", "email", "whatsapp", "sms"],
      },
      {
        id: "whatsapp-integration",
        title: "WhatsApp Integration",
        description: "Connect your WhatsApp Business number via Meta Cloud API (Embedded Signup).",
        icon: MessageCircle,
        iconColors:
          "bg-green-50 text-green-600 border-green-100 group-hover:bg-green-100/80 group-hover:border-green-200",
        searchTerms: ["whatsapp", "meta", "business api", "waba", "embedded signup"],
      },
      {
        id: "channel-usage",
        title: "Channel usage",
        description: "WhatsApp, SMS, and email delivery stats and message logs.",
        icon: BarChart2,
        iconColors:
          "bg-sky-50 text-sky-700 border-sky-100 group-hover:bg-sky-100/80 group-hover:border-sky-200",
        searchTerms: ["whatsapp", "logs", "delivered"],
      },
      {
        id: "google-business",
        title: "Google Business Profile",
        description: "Connect Google, sync reviews, auto-reply, and local SEO tools.",
        icon: Globe,
        searchTerms: ["gmb", "google", "reviews", "seo", "maps"],
      },
      {
        id: "feedback",
        title: "Feedback management",
        description: "Customer ratings, reviews, and follow-up after visits.",
        icon: MessageSquare,
        iconColors:
          "bg-orange-50 text-orange-700 border-orange-100 group-hover:bg-orange-100/80 group-hover:border-orange-200",
        searchTerms: ["reviews", "ratings", "google", "nps"],
      },
      {
        id: "recharge",
        title: "Recharge",
        description: "Top up your messaging wallet for SMS and WhatsApp.",
        icon: Zap,
        iconColors:
          "bg-amber-50 text-amber-700 border-amber-100 group-hover:bg-amber-100/80 group-hover:border-amber-200",
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
        iconColors:
          "bg-slate-100 text-slate-600 border-slate-200 group-hover:bg-slate-200/60 group-hover:border-slate-300",
        searchTerms: ["preferences", "language", "theme"],
      },
    ],
  },
]

const ALL_SETTING_ITEMS: SettingsItem[] = SETTINGS_SECTIONS.flatMap((s) => s.items)

/** Plan features required to open a settings module (beyond RBAC). */
const SETTINGS_PLAN_FEATURES: Partial<Record<SettingsSectionId, string>> = {
  feedback: "feedback_management",
  membership: "membership",
  packages: "packages",
  "prepaid-wallet": "prepaid_wallet",
  "reward-points": "reward_points",
  "whatsapp-integration": "whatsapp_integration",
  "google-business": "gmb",
  "attendance-payroll": "attendance",
}

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
  const { hasFeature, isLoading: entitlementsLoading } = useEntitlements()
  const router = useRouter()

  useEffect(() => {
    if (!activeSection || isLoading || entitlementsLoading || !user) return
    const permissionModule = SETTINGS_PERMISSION_MAP[activeSection]
    if (!permissionModule || !hasPermission(permissionModule, "view")) {
      router.replace("/settings")
      return
    }
    const requiredFeature = SETTINGS_PLAN_FEATURES[activeSection as SettingsSectionId]
    if (requiredFeature && !hasFeature(requiredFeature)) {
      router.replace("/settings")
    }
  }, [activeSection, isLoading, entitlementsLoading, user, hasFeature, hasPermission, router])

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

  const canAccessSetting = (categoryId: string) => {
    if (!user) return false
    const permissionModule = SETTINGS_PERMISSION_MAP[categoryId]
    if (!permissionModule) return false
    if (!hasPermission(permissionModule, "view")) return false
    const requiredFeature = SETTINGS_PLAN_FEATURES[categoryId as SettingsSectionId]
    if (requiredFeature && !hasFeature(requiredFeature)) return false
    return true
  }

  const filteredSections = useMemo(() => {
    return SETTINGS_SECTIONS.map((section) => {
      const afterSearch = sectionAfterSearch(section, search)
      if (!afterSearch) return null
      const items = afterSearch.items.filter((item) => canAccessSetting(item.id))
      if (items.length === 0) return null
      return { ...afterSearch, items }
    }).filter(Boolean) as SettingsSection[]
  }, [search, user, hasPermission, hasFeature])

  // Show loading while checking authentication
  if (isLoading) {
    return <PageSkeleton variant="form" />
  }

  // Don't render if not authenticated
  if (!user) {
    return null
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
      case "packages":
        return <PackagesSettingsPanel />
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
        return <ProductsSettingsTabs />
      case "packages":
        return <PackagesSettingsPanel />
      case "whatsapp-integration":
        return <WhatsAppIntegrationSettings />
      case "google-business":
        return <GoogleBusinessSettings />
      case "channel-usage":
        return <ChannelUsageSettings />
      case "feedback":
        return <FeedbackManagementSettings />
      case "recharge":
        return <RechargeSettings />
      case "prepaid-wallet":
        return <PrepaidWalletSettings />
      case "reward-points":
        return <RewardPointsProgramSettings />
      case "attendance-payroll":
        return <AttendancePayrollSettings />
      case "staff-directory":
        return <StaffDirectory inSettings />
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
                    return (
                      <li key={item.id} className="min-w-0">
                        <button
                          type="button"
                          onClick={() => navigateToSection(item.id)}
                          className="group w-full text-left rounded-xl border border-slate-200/90 bg-white p-3.5 min-h-[88px] shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
                          aria-label={`Open ${item.title}`}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${item.iconColors}`}
                            >
                              <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="text-sm font-medium text-slate-900 leading-snug pr-1">
                                  {item.title}
                                </h3>
                                <ChevronRight
                                  className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600 mt-0.5"
                                  aria-hidden
                                />
                              </div>
                              <p className="mt-0.5 text-xs text-slate-500 leading-relaxed line-clamp-2">
                                {item.description}
                              </p>
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
              {activeSection && (isLoading || entitlementsLoading) ? (
                <div className="flex items-center justify-center py-12">
                  <div
                    className="animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-slate-600"
                    aria-hidden
                  />
                </div>
              ) : activeSection && !canAccessSetting(activeSection) ? (
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
