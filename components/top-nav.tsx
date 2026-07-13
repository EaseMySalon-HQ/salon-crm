"use client"

import { useState, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter, usePathname } from "next/navigation"
import { Bell, Plus, User, Receipt, Settings, LogOut, Banknote, Clock, Search, Wallet, AlertTriangle, CreditCard, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { NotificationCountBadgeLabel } from "@/components/notifications/notification-count-badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/lib/auth-context"
import { SettingsAPI, ClientsAPI, WalletAPI, WhatsAppInboxAPI } from "@/lib/api"
import { useAddon, useFeature, useEntitlements } from "@/hooks/use-entitlements"
import { STALE_TIME } from "@/lib/queries/staleness"
import { Input } from "@/components/ui/input"
import { useTodayOnlineSales } from "@/hooks/use-today-online-sales"
import { ExpenseForm } from "@/components/expenses/expense-form"
import { CashRegistryModal } from "@/components/cash-registry/cash-registry-modal"
import { SessionStatus } from "@/components/auth/session-status"
import { ClientDetailsDrawer } from "@/components/clients/client-details-drawer"
import { BranchSwitcher } from "@/components/branch-switcher/branch-switcher"
import { useToast } from "@/hooks/use-toast"
import type { Client } from "@/lib/client-store"
import { ensureLocalSharedClient, isSharedPreviewClient } from "@/lib/shared-client-import"
import {
  FathersDayNavBackground,
  NavBannerBackground,
  NavBannerMessage,
} from "@/components/top-nav/fathers-day-banner"
import { useNavBannerActive, useNavBannerConfig } from "@/hooks/use-nav-banner-config"
import { cn } from "@/lib/utils"
import { ThemeToggleMenuItem } from "@/components/theme-toggle"
import {
  NotificationsSidebar,
  useDismissedNotificationAlerts,
  useDismissedNotificationReviews,
  useNotificationCenterBadgeCount,
} from "@/components/notifications/notifications-sidebar"

function searchHitToClient(c: any): Client {
  const id = String(c._id || c.id || "")
  return {
    ...c,
    id,
    _id: c.sharedPreview ? undefined : id,
    name: c.name || "",
    phone: c.phone || "",
    email: c.email,
    birthdate: c.birthdate || c.dob || undefined,
    sharedPreview: c.sharedPreview === true,
    sourceBranchId: c.sourceBranchId,
  }
}

interface TopNavProps {
  showQuickAdd?: boolean
  rightSlot?: React.ReactNode
}

const QUICK_ADD_MENU_ITEM_CLASS =
  "quick-add-menu-item group flex items-center gap-3 p-3 m-1 cursor-pointer rounded-lg"
const QUICK_ADD_ICON_WRAP_CLASS =
  "quick-add-menu-icon rounded-lg bg-blue-100 p-2 transition-colors duration-200 dark:bg-blue-950/60"
const QUICK_ADD_ICON_CLASS = "quick-add-menu-icon-svg h-4 w-4 text-blue-600 dark:text-blue-400"
const QUICK_ADD_LABEL_CLASS = "quick-add-menu-label font-medium text-gray-700 dark:text-foreground"

function normalizePathname(value: unknown): string {
  return typeof value === "string" ? value : ""
}

export function TopNav({ showQuickAdd = true, rightSlot }: TopNavProps) {
  const { user, logout, hasPermission } = useAuth()
  const router = useRouter()
  const pathname = normalizePathname(usePathname())
  const { hasAccess: hasWhatsAppIntegration, isLoading: whatsAppEntitlementsLoading } =
    useFeature("whatsapp_integration")
  const { status: wabaAddon, isLoading: wabaAddonLoading } = useAddon("waba")
  const canAccessWhatsAppInbox =
    hasPermission("campaigns", "view") &&
    !whatsAppEntitlementsLoading &&
    !wabaAddonLoading &&
    hasWhatsAppIntegration &&
    wabaAddon.enabled
  const isInboxActive = pathname.startsWith("/whatsapp/inbox")
  const [showExpenseDialog, setShowExpenseDialog] = useState(false)
  const [showCashRegistryModal, setShowCashRegistryModal] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const { amount: todayOnlineSales } = useTodayOnlineSales(showCashRegistryModal)
  const queryClient = useQueryClient()
  const { hasFeature, isLoading: entitlementsLoading } = useEntitlements()

  const canViewAppointments = hasPermission("appointments", "view")
  const canViewReviews =
    hasPermission("feedback", "view") && !entitlementsLoading && hasFeature("feedback_management")

  const { visibleCount: alertCount, ...alertsRest } = useDismissedNotificationAlerts(true)
  const { visibleCount: reviewCount, ...reviewsRest } = useDismissedNotificationReviews(
    canViewReviews
  )
  const notificationBadgeLabel = useNotificationCenterBadgeCount({
    canViewAppointments,
    canViewReviews,
    canViewMessages: canAccessWhatsAppInbox,
    alertCount,
    reviewCount,
  })

  const { data: inboxUnreadTotal = 0 } = useQuery({
    queryKey: ["whatsapp", "inbox", "unread-total"],
    queryFn: async () => {
      try {
        const res = await WhatsAppInboxAPI.list({ filter: "unread", limit: 100 })
        if (!res.success || !Array.isArray(res.data)) return 0
        return res.data.reduce((sum, row) => sum + Number(row?.unreadCount || 0), 0)
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number; data?: { code?: string } } })?.response?.status
        const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code
        if (status === 403 && (code === "WABA_ADDON_DISABLED" || code === "FEATURE_NOT_AVAILABLE")) {
          return 0
        }
        throw err
      }
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    enabled: !!user && canAccessWhatsAppInbox,
    retry: false,
  })

  const inboxBadgeLabel =
    inboxUnreadTotal > 9 ? "9+" : inboxUnreadTotal > 0 ? String(inboxUnreadTotal) : ""

  const { data: businessSettingsData, isLoading: isLoadingBusinessName } = useQuery({
    queryKey: ["settings", "business"],
    queryFn: async () => {
      const response = await SettingsAPI.getBusinessSettings()
      if (!response?.success || !response.data) {
        throw new Error(typeof response?.error === "string" ? response.error : "Failed to load business settings")
      }
      return response.data
    },
    staleTime: STALE_TIME.businessSettings,
    enabled: !!user,
  })
  const businessName = businessSettingsData?.name || "EaseMySalon"

  const { data: walletBalance, isLoading: isLoadingWallet, isError: walletError } = useQuery({
    queryKey: ["wallet", "balance"],
    queryFn: async () => {
      const res = await WalletAPI.getBalance()
      if (!res?.success || res.data == null) {
        throw new Error(typeof res?.error === "string" ? res.error : "Failed to load wallet")
      }
      return res.data
    },
    staleTime: STALE_TIME.walletBalance,
    refetchOnWindowFocus: true,
    enabled: !!user,
    retry: 1,
  })

  const walletDisplay = (() => {
    if (isLoadingWallet) return null
    if (walletError) return "—"
    const r = Number(walletBalance?.balanceRupees ?? 0)
    return `₹${r.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  })()

  const planRenewalWarningDays = user?.planRenewalWarningDaysLeft ?? null
  const planRenewalExpiringToday = !!user?.planRenewalExpiringToday

  const { toast } = useToast()
  const [clientSearch, setClientSearch] = useState("")
  const [clientResults, setClientResults] = useState<any[]>([])
  const [clientSearchOpen, setClientSearchOpen] = useState(false)
  const clientSearchRef = useRef<HTMLDivElement>(null)
  const [clientDetailsDrawerOpen, setClientDetailsDrawerOpen] = useState(false)
  const [clientDetailsDrawerClient, setClientDetailsDrawerClient] = useState<Client | null>(null)
  const [clientImporting, setClientImporting] = useState(false)

  useEffect(() => {
    const handleBusinessSettingsUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "business"] })
    }
    window.addEventListener("business-settings-updated", handleBusinessSettingsUpdate)
    return () => window.removeEventListener("business-settings-updated", handleBusinessSettingsUpdate)
  }, [queryClient])

  useEffect(() => {
    const q = clientSearch.trim()
    if (q.length < 2) {
      setClientResults([])
      return
    }
    const t = setTimeout(() => {
      ClientsAPI.search(q)
        .then((res) => {
          if (res.success && Array.isArray(res.data)) setClientResults(res.data)
          else setClientResults([])
        })
        .catch(() => setClientResults([]))
    }, 350)
    return () => clearTimeout(t)
  }, [clientSearch])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!clientSearchRef.current?.contains(e.target as Node)) setClientSearchOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [])

  const handleQuickAdd = (path: string) => {
    if (path === "/expenses/new") {
      window.setTimeout(() => setShowExpenseDialog(true), 0)
    } else {
      router.push(path)
    }
  }

  const handleLogout = () => {
    logout()
  }

  const isManager = () => {
    return user?.role === "manager" || user?.role === "admin"
  }

  const isAdmin = () => {
    return user?.role === "admin"
  }

  const onClientDetailsDrawerOpenChange = (open: boolean) => {
    setClientDetailsDrawerOpen(open)
    if (!open) {
      window.setTimeout(() => setClientDetailsDrawerClient(null), 350)
    }
  }

  const fathersDayNav = useNavBannerActive()
  const { data: navBannerConfig } = useNavBannerConfig()

  return (
    <header
      className={cn(
        "fathers-day-nav sticky top-0 z-30 w-full shrink-0 px-4 py-3 shadow-sm backdrop-blur-sm sm:px-6 sm:py-4 lg:px-8",
        fathersDayNav
          ? "relative border-b border-amber-400/25"
          : "border-b border-gray-200/60 bg-gradient-to-r from-white via-slate-50 to-blue-50/30 dark:border-border dark:from-background dark:via-background dark:to-background"
      )}
    >
      {fathersDayNav && navBannerConfig ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <NavBannerBackground theme={navBannerConfig.theme} />
        </div>
      ) : null}
      <div
        className={cn(
          "relative z-10 grid items-center gap-x-2 gap-y-2 sm:gap-x-3",
          fathersDayNav && navBannerConfig
            ? "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)]"
            : "grid-cols-[minmax(0,1fr)_auto]"
        )}
      >
        {/* Left — business name + messaging wallet balance */}
        <div className="col-start-1 row-start-1 flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          <BranchSwitcher businessName={businessName} isLoadingName={isLoadingBusinessName} />

          <button
            type="button"
            onClick={() => router.push("/settings?section=recharge")}
            className="group inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-left shadow-sm transition-all hover:border-emerald-300/60 hover:shadow-sm hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-1"
            aria-label="Messaging wallet balance, open recharge"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-emerald-100 bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100/80">
              <Wallet className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="min-w-0 flex items-center pr-0.5">
              {isLoadingWallet ? (
                <span className="block h-3.5 w-[4.5rem] rounded bg-slate-200/80" aria-hidden />
              ) : (
                <span className="text-sm font-semibold leading-none tabular-nums text-foreground">
                  {walletDisplay ?? "—"}
                </span>
              )}
            </span>
          </button>

          <div className="md:hidden">
            {fathersDayNav && navBannerConfig ? <NavBannerMessage config={navBannerConfig} /> : null}
          </div>

          {planRenewalExpiringToday ? (
            <p
              role="alert"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-300/90 bg-red-50/95 px-2.5 py-1.5 text-xs font-semibold text-red-900 sm:text-sm"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" aria-hidden />
              <span>Please Renew. Expiring Today</span>
            </p>
          ) : planRenewalWarningDays != null ? (
            <p
              role="alert"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-200/90 bg-amber-50/95 px-2.5 py-1.5 text-xs font-medium text-amber-900 sm:text-sm"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
              <span>
                Please renew the plan. {planRenewalWarningDays}{" "}
                {planRenewalWarningDays === 1 ? "day" : "days"} left
              </span>
            </p>
          ) : null}
        </div>

        {fathersDayNav && navBannerConfig ? (
          <div className="hidden min-w-0 justify-self-center px-1 md:col-start-2 md:row-start-1 md:flex lg:px-2">
            <NavBannerMessage config={navBannerConfig} />
          </div>
        ) : null}

        {/* Right side - Quick Add, Notifications, and User */}
        <div
          className={cn(
            "col-start-2 row-start-1 flex min-w-0 items-center justify-end gap-1.5 sm:gap-2 md:col-start-3 md:gap-3",
            fathersDayNav && navBannerConfig ? "" : "md:col-start-2"
          )}
        >
          {/* Session Status */}
          <SessionStatus showAlways={false} />

          {/* Client search — opens client details drawer on select */}
          <div
            ref={clientSearchRef}
            className="relative z-50 min-w-0 w-full max-w-[7.5rem] sm:max-w-[9rem] md:max-w-[10rem] lg:max-w-[12rem] xl:max-w-56"
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 sm:h-4 sm:w-4" />
            <Input
              type="search"
              value={clientSearch}
              onChange={(e) => {
                setClientSearch(e.target.value)
                setClientSearchOpen(true)
              }}
              onFocus={() => setClientSearchOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setClientSearchOpen(false)
              }}
              placeholder="Search clients…"
              autoComplete="off"
              className="h-9 pl-8 pr-2 text-xs sm:text-sm border-slate-200/80 bg-white/90 shadow-sm"
            />
            {clientSearchOpen && clientResults.length > 0 && (
              <ul
                role="listbox"
                className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
              >
                {clientResults.map((c) => {
                  const id = c._id || c.id
                  if (!id) return null
                  return (
                    <li key={String(id)} role="option">
                      <button
                        type="button"
                        disabled={clientImporting}
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-60"
                        onClick={() => {
                          void (async () => {
                            setClientImporting(true)
                            try {
                              const hit = searchHitToClient(c)
                              const client = await ensureLocalSharedClient(hit)
                              setClientDetailsDrawerClient(client)
                              setClientDetailsDrawerOpen(true)
                              setClientSearch("")
                              setClientResults([])
                              setClientSearchOpen(false)
                            } catch (err) {
                              toast({
                                title: "Could not open profile",
                                description:
                                  err instanceof Error ? err.message : "Failed to import client profile",
                                variant: "destructive",
                              })
                            } finally {
                              setClientImporting(false)
                            }
                          })()
                        }}
                      >
                        <span className="flex w-full items-center gap-2">
                          <span className="font-medium text-slate-800">{c.name || "Client"}</span>
                          {isSharedPreviewClient(c) && (
                            <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                              Other branch
                            </Badge>
                          )}
                        </span>
                        {c.phone && (
                          <span className="text-xs text-slate-500 tabular-nums">{c.phone}</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Quick Add */}
          {showQuickAdd && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  aria-label="Quick add"
                  className="bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-blue-200 text-blue-700 hover:text-blue-800 hover:border-blue-300 dark:from-blue-950/40 dark:to-indigo-950/30 dark:hover:from-blue-950/60 dark:hover:to-indigo-950/45 dark:border-blue-500/30 dark:text-blue-300 dark:hover:text-blue-200 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-3 py-2"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 rounded-xl border border-border bg-white/95 shadow-xl backdrop-blur-sm dark:bg-card/95"
              >
                <DropdownMenuItem
                  onClick={() => setTimeout(() => setShowCashRegistryModal(true), 0)}
                  className={QUICK_ADD_MENU_ITEM_CLASS}
                >
                  <div className={QUICK_ADD_ICON_WRAP_CLASS}>
                    <Banknote className={QUICK_ADD_ICON_CLASS} />
                  </div>
                  <span className={QUICK_ADD_LABEL_CLASS}>Opening/Closing</span>
                </DropdownMenuItem>
                {(isManager() || isAdmin()) && (
                  <>
                <DropdownMenuItem
                  onClick={() => router.push("/settings?section=staff-directory&tab=attendance")}
                  className={QUICK_ADD_MENU_ITEM_CLASS}
                >
                  <div className={QUICK_ADD_ICON_WRAP_CLASS}>
                    <Clock className={QUICK_ADD_ICON_CLASS} />
                  </div>
                  <span className={QUICK_ADD_LABEL_CLASS}>Attendance</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleQuickAdd("/expenses/new")}
                  className={QUICK_ADD_MENU_ITEM_CLASS}
                >
                  <div className={QUICK_ADD_ICON_WRAP_CLASS}>
                    <Receipt className={QUICK_ADD_ICON_CLASS} />
                  </div>
                  <span className={QUICK_ADD_LABEL_CLASS}>Expense</span>
                </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {rightSlot}

          {canAccessWhatsAppInbox ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label="WhatsApp inbox"
              title="WhatsApp inbox"
              onClick={() => router.push("/whatsapp/inbox")}
              className={`relative rounded-lg p-2.5 transition-all duration-300 transform hover:scale-105 hover:shadow-md group ${
                isInboxActive
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                  : "bg-emerald-50/95 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/80"
              }`}
            >
              <MessageCircle
                className={`h-4 w-4 transition-colors duration-300 ${
                  isInboxActive ? "text-emerald-700" : "text-emerald-600 group-hover:text-emerald-700"
                }`}
                strokeWidth={2}
              />
              {inboxBadgeLabel ? (
                <NotificationCountBadgeLabel
                  label={inboxBadgeLabel}
                  size="md"
                  className="absolute -top-1 -right-1 shadow-md group-hover:animate-none"
                />
              ) : null}
            </Button>
          ) : null}

          {/* Notifications — tabbed sidebar */}
          <Button
            variant="ghost"
            size="sm"
            aria-haspopup="dialog"
            aria-label="Open notifications"
            aria-expanded={notificationsOpen}
            onClick={() => setNotificationsOpen(true)}
            className="group relative rounded-lg border border-amber-200/80 bg-amber-50/95 dark:border-amber-500/30 dark:bg-amber-950/40 p-2.5 transition-all duration-300 transform hover:scale-105 hover:bg-amber-100 dark:hover:bg-amber-950/60 hover:shadow-md"
          >
            <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400 transition-colors duration-300 group-hover:text-amber-700 dark:group-hover:text-amber-300" strokeWidth={2} />
            {notificationBadgeLabel ? (
              <NotificationCountBadgeLabel
                label={notificationBadgeLabel}
                size="md"
                className="absolute -top-1 -right-1 shadow-md group-hover:animate-none"
              />
            ) : null}
          </Button>

          <NotificationsSidebar
            open={notificationsOpen}
            onOpenChange={setNotificationsOpen}
            canViewAppointments={canViewAppointments}
            canViewReviews={canViewReviews}
            canViewMessages={canAccessWhatsAppInbox}
            alerts={{
              notificationItems: alertsRest.notificationItems,
              visibleNotificationItems: alertsRest.visibleNotificationItems,
              notificationsPending: alertsRest.notificationsPending,
              notificationsError: alertsRest.notificationsError,
              markAlertRead: alertsRest.markAlertRead,
              markAllAlertsRead: alertsRest.markAllAlertsRead,
            }}
            reviews={{
              reviewItems: reviewsRest.reviewItems,
              visibleReviewItems: reviewsRest.visibleReviewItems,
              reviewsPending: reviewsRest.reviewsPending,
              reviewsError: reviewsRest.reviewsError,
              markReviewRead: reviewsRest.markReviewRead,
              markAllReviewsRead: reviewsRest.markAllReviewsRead,
            }}
          />

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                className="relative h-10 w-10 rounded-full p-0 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 transition-all duration-300 transform hover:scale-105 hover:shadow-md border-2 border-transparent hover:border-indigo-200 ml-1"
              >
                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-md text-white text-sm font-bold">
                  {(() => {
                    const userName = user?.name || (user as any)?.firstName || user?.email || ''
                    return userName.charAt(0).toUpperCase() || 'U'
                  })()}
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64 border shadow-xl bg-popover/95 backdrop-blur-sm rounded-xl p-2" align="end" forceMount>
              <DropdownMenuLabel className="font-normal p-3">
                <div className="flex items-center gap-3 p-3 bg-muted/60 rounded-lg">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-md text-white text-base font-bold">
                    {(() => {
                      const userName = user?.name || (user as any)?.firstName || user?.email || ''
                      return userName.charAt(0).toUpperCase() || 'U'
                    })()}
                  </div>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-semibold leading-none text-foreground">{user?.name || user?.email}</p>
                    <p className="text-xs leading-none text-muted-foreground capitalize">{user?.role || 'User'}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="my-2" />
              <DropdownMenuItem 
                onClick={() => router.push("/profile")}
                className="flex items-center gap-3 p-3 hover:bg-accent transition-all duration-200 cursor-pointer rounded-lg m-1"
              >
                <div className="p-2 bg-blue-100 dark:bg-blue-950 rounded-lg">
                  <User className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                </div>
                <span className="font-medium text-foreground">Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => router.push("/settings")}
                className="flex items-center gap-3 p-3 hover:bg-accent transition-all duration-200 cursor-pointer rounded-lg m-1"
              >
                <div className="p-2 bg-emerald-100 dark:bg-emerald-950 rounded-lg">
                  <Settings className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                </div>
                <span className="font-medium text-foreground">Settings</span>
              </DropdownMenuItem>
              <ThemeToggleMenuItem />
              <DropdownMenuSeparator className="my-2" />
              <DropdownMenuItem 
                onClick={handleLogout}
                className="flex items-center gap-3 p-3 hover:bg-gradient-to-r hover:from-red-50 hover:to-rose-50 transition-all duration-200 cursor-pointer rounded-lg m-1 text-red-600 hover:text-red-700"
              >
                <div className="p-2 bg-red-100 rounded-lg">
                  <LogOut className="h-4 w-4 text-red-600" />
                </div>
                <span className="font-medium">Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Cash Registry Modal - full functionality: online sales, save event for report refresh */}
      <CashRegistryModal
        open={showCashRegistryModal}
        onOpenChange={setShowCashRegistryModal}
        onSaveSuccess={() => {
          window.dispatchEvent(new CustomEvent("cash-registry-saved"))
        }}
        onlineSalesAmount={todayOnlineSales}
        onPosCashChange={() => {}}
      />

      {/* Expense Form Dialog */}
      <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
            <DialogDescription>
              Add a new expense to track your business costs.
            </DialogDescription>
          </DialogHeader>
          <ExpenseForm onClose={() => setShowExpenseDialog(false)} />
        </DialogContent>
      </Dialog>

      <ClientDetailsDrawer
        open={clientDetailsDrawerOpen}
        onOpenChange={onClientDetailsDrawerOpenChange}
        client={clientDetailsDrawerClient}
        initialExpandProfile={false}
        initialEditMode={false}
      />
    </header>
  )
}
