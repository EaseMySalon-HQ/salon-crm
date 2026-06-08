"use client"

import { useState, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter, usePathname } from "next/navigation"
import { Bell, Plus, User, Receipt, Settings, LogOut, Banknote, Clock, Search, Wallet, AlertTriangle, CreditCard, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { SettingsAPI, ClientsAPI, WalletAPI, WhatsAppInboxAPI, type NotificationFeedItem } from "@/lib/api"
import { useFeature } from "@/hooks/use-entitlements"
import { STALE_TIME } from "@/lib/queries/staleness"
import { useNotificationsFeed } from "@/lib/queries/notifications"
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

/** v2 entries are `alertId::fingerprint` so the same logical alert can reappear when server counts update. */
const DISMISSED_ALERTS_STORAGE_PREFIX = "salon-ems-alerts-dismissed-v2:"

function notificationDismissStorageKey(item: NotificationFeedItem): string {
  return `${item.id}::${item.fingerprint}`
}

function NotificationRowIcon({ type }: { type: NotificationFeedItem["type"] }) {
  switch (type) {
    case "low_stock":
      return (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100">
          <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden />
        </div>
      )
    case "membership_expiry":
      return (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100">
          <CreditCard className="h-4 w-4 text-sky-700" aria-hidden />
        </div>
      )
    case "package_expiry":
      return (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100">
          <Receipt className="h-4 w-4 text-violet-700" aria-hidden />
        </div>
      )
    default:
      return (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
          <Bell className="h-4 w-4 text-slate-600" aria-hidden />
        </div>
      )
  }
}

/** Ref gate: Radix `DropdownMenuItem` still fires `onSelect` when a nested button is clicked; bypass navigation for "Mark as read". */
function NotificationAlertMenuRow({
  item,
  router,
  onMarkRead,
}: {
  item: NotificationFeedItem
  router: ReturnType<typeof useRouter>
  onMarkRead: (item: NotificationFeedItem) => void
}) {
  const skipNavigateOnSelectRef = useRef(false)

  return (
    <DropdownMenuItem
      className="group/alert relative mx-2 my-1 flex cursor-pointer gap-3 rounded-lg px-3 py-2.5 items-start focus:bg-slate-50"
      onSelect={(event) => {
        if (skipNavigateOnSelectRef.current) {
          skipNavigateOnSelectRef.current = false
          event.preventDefault()
          return
        }
        router.push(item.href)
      }}
    >
      <NotificationRowIcon type={item.type} />
      <div className="min-w-0 flex-1 space-y-0.5 text-left pr-1">
        <p className="text-sm font-semibold text-slate-800 leading-tight">{item.title}</p>
        <p className="text-xs text-slate-600 leading-snug">{item.body}</p>
      </div>
      <button
        type="button"
        aria-label={`Mark "${item.title}" as read`}
        className="shrink-0 self-center whitespace-nowrap rounded px-1.5 py-1 text-xs font-medium text-slate-500 opacity-0 transition-opacity hover:text-slate-800 hover:underline group-hover/alert:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 pointer-events-auto"
        onPointerDown={() => {
          skipNavigateOnSelectRef.current = true
        }}
        onPointerDownCapture={() => {
          skipNavigateOnSelectRef.current = true
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            skipNavigateOnSelectRef.current = true
          }
        }}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onMarkRead(item)
        }}
      >
        Mark as read
      </button>
    </DropdownMenuItem>
  )
}

function normalizePathname(value: unknown): string {
  return typeof value === "string" ? value : ""
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Whole days until suspension grace ends (minimum 1 while grace is active). */
function suspensionGraceDaysLeft(endsAt: string | null | undefined): number {
  if (!endsAt) return 3
  const end = new Date(endsAt).getTime()
  if (Number.isNaN(end)) return 3
  const ms = end - Date.now()
  if (ms <= 0) return 0
  return Math.max(1, Math.ceil(ms / MS_PER_DAY))
}

export function TopNav({ showQuickAdd = true, rightSlot }: TopNavProps) {
  const { user, logout, hasPermission } = useAuth()
  const router = useRouter()
  const pathname = normalizePathname(usePathname())
  const { hasAccess: hasWhatsAppIntegration, isLoading: whatsAppEntitlementsLoading } =
    useFeature("whatsapp_integration")
  const canAccessWhatsAppInbox =
    hasPermission("campaigns", "view") &&
    !whatsAppEntitlementsLoading &&
    hasWhatsAppIntegration
  const isInboxActive = pathname.startsWith("/whatsapp/inbox")
  const [showExpenseDialog, setShowExpenseDialog] = useState(false)
  const [showCashRegistryModal, setShowCashRegistryModal] = useState(false)
  const { amount: todayOnlineSales } = useTodayOnlineSales(showCashRegistryModal)
  const queryClient = useQueryClient()

  const {
    data: notificationItems = [],
    isPending: notificationsPending,
    isError: notificationsError,
  } = useNotificationsFeed()

  const notificationBranchKey = user?.branchId ?? user?._id ?? "none"
  const dismissedAlertsStorageKey = `${DISMISSED_ALERTS_STORAGE_PREFIX}${notificationBranchKey}`
  const [dismissedAlertKeys, setDismissedAlertKeys] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (typeof window === "undefined" || notificationBranchKey === "none") return
    try {
      const raw = sessionStorage.getItem(dismissedAlertsStorageKey)
      if (!raw) {
        setDismissedAlertKeys(new Set())
        return
      }
      const ids = JSON.parse(raw) as unknown
      if (Array.isArray(ids) && ids.every((x) => typeof x === "string")) {
        /** Only persisted `id::fingerprint` keys; ignore stale v1 plain ids */
        const v2 = ids.filter((k) => k.includes("::"))
        setDismissedAlertKeys(new Set(v2))
      }
    } catch {
      setDismissedAlertKeys(new Set())
    }
  }, [dismissedAlertsStorageKey, notificationBranchKey])

  const persistDismissedAlertKeys = (next: Set<string>) => {
    try {
      if (next.size === 0) {
        sessionStorage.removeItem(dismissedAlertsStorageKey)
      } else {
        sessionStorage.setItem(dismissedAlertsStorageKey, JSON.stringify([...next]))
      }
    } catch {
      /* ignore quota / private mode */
    }
  }

  const markAlertRead = (alert: NotificationFeedItem) => {
    const key = notificationDismissStorageKey(alert)
    setDismissedAlertKeys((prev) => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      persistDismissedAlertKeys(next)
      return next
    })
  }

  const markAllAlertsRead = () => {
    setDismissedAlertKeys((prev) => {
      const next = new Set(prev)
      for (const item of notificationItems) {
        next.add(notificationDismissStorageKey(item))
      }
      persistDismissedAlertKeys(next)
      return next
    })
  }

  const visibleNotificationItems = notificationItems.filter((item) => !dismissedAlertKeys.has(notificationDismissStorageKey(item)))
  const notifCount = visibleNotificationItems.length
  const badgeLabel =
    notifCount > 9 ? "9+" : notifCount > 0 ? String(notifCount) : ""

  const { data: inboxUnreadTotal = 0 } = useQuery({
    queryKey: ["whatsapp", "inbox", "unread-total"],
    queryFn: async () => {
      const res = await WhatsAppInboxAPI.list({ filter: "unread", limit: 100 })
      if (!res.success || !Array.isArray(res.data)) return 0
      return res.data.reduce((sum, row) => sum + Number(row?.unreadCount || 0), 0)
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

  const suspensionGraceDays =
    user?.suspensionGraceActive ? suspensionGraceDaysLeft(user.suspensionGraceEndsAt) : null

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

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-gray-200/60 bg-gradient-to-r from-white via-slate-50 to-blue-50/30 backdrop-blur-sm w-full px-8 py-4 shadow-sm">
      <div className="flex items-center justify-between">
        {/* Left — business name + messaging wallet balance */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
          <BranchSwitcher businessName={businessName} isLoadingName={isLoadingBusinessName} />

          <button
            type="button"
            onClick={() => router.push("/settings?section=recharge")}
            className="group inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white/95 px-2.5 text-left shadow-sm transition-all hover:border-emerald-300/60 hover:shadow-sm hover:bg-emerald-50/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-1"
            aria-label="Messaging wallet balance, open recharge"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-emerald-100 bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100/80">
              <Wallet className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="min-w-0 flex items-center pr-0.5">
              {isLoadingWallet ? (
                <span className="block h-3.5 w-[4.5rem] rounded bg-slate-200/80" aria-hidden />
              ) : (
                <span className="text-sm font-semibold leading-none tabular-nums text-slate-900">
                  {walletDisplay ?? "—"}
                </span>
              )}
            </span>
          </button>

          {suspensionGraceDays != null && (
            <p
              role="alert"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-200/90 bg-amber-50/95 px-2.5 py-1.5 text-xs font-medium text-amber-900 sm:text-sm"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
              <span>
                Please renew the plan. {suspensionGraceDays}{" "}
                {suspensionGraceDays === 1 ? "day" : "days"} left
              </span>
            </p>
          )}
        </div>

        {/* Right side - Quick Add, Notifications, and User */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Session Status */}
          <SessionStatus showAlways={false} />

          {/* Client search — opens client details drawer on select */}
          <div ref={clientSearchRef} className="relative w-36 shrink-0 sm:w-48 lg:w-56 z-40">
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
                className="absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
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
                  className="bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-blue-200 text-blue-700 hover:text-blue-800 hover:border-blue-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-3 py-2"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 border-0 shadow-xl bg-white/95 backdrop-blur-sm rounded-xl">
                <DropdownMenuItem 
                  onClick={() => setTimeout(() => setShowCashRegistryModal(true), 0)}
                  className="flex items-center gap-3 p-3 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200 cursor-pointer rounded-lg m-1"
                >
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Banknote className="h-4 w-4 text-blue-600" />
                  </div>
                  <span className="font-medium text-gray-700">Opening/Closing</span>
                </DropdownMenuItem>
                {(isManager() || isAdmin()) && (
                  <>
                <DropdownMenuItem 
                  onClick={() => router.push("/staff/working-hours")}
                  className="flex items-center gap-3 p-3 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200 cursor-pointer rounded-lg m-1"
                >
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Clock className="h-4 w-4 text-blue-600" />
                  </div>
                  <span className="font-medium text-gray-700">Attendance</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleQuickAdd("/expenses/new")}
                  className="flex items-center gap-3 p-3 hover:bg-gradient-to-r hover:from-red-50 hover:to-rose-50 transition-all duration-200 cursor-pointer rounded-lg m-1"
                >
                  <div className="p-2 bg-red-100 rounded-lg">
                    <Receipt className="h-4 w-4 text-red-600" />
                  </div>
                  <span className="font-medium text-gray-700">Expense</span>
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
              className={`relative p-2.5 transition-all duration-300 transform hover:scale-105 hover:shadow-md rounded-lg group ${
                isInboxActive
                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : "hover:bg-gradient-to-r hover:from-emerald-50 hover:to-green-50"
              }`}
            >
              <MessageCircle
                className={`h-4 w-4 transition-colors duration-300 ${
                  isInboxActive ? "text-emerald-700" : "text-gray-600 group-hover:text-emerald-600"
                }`}
              />
              {inboxBadgeLabel ? (
                <Badge
                  variant="destructive"
                  className="absolute -top-1 -right-1 min-h-5 min-w-5 px-0 flex items-center justify-center text-[10px] font-bold p-0 shadow-md group-hover:animate-none"
                >
                  {inboxBadgeLabel}
                </Badge>
              ) : null}
            </Button>
          ) : null}

          {/* Notifications — server-derived alerts (inventory & expiries) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-haspopup="menu"
                aria-label="Alerts and notifications"
                className="relative p-2.5 hover:bg-gradient-to-r hover:from-amber-50 hover:to-yellow-50 transition-all duration-300 transform hover:scale-105 hover:shadow-md rounded-lg group"
              >
                <Bell className="h-4 w-4 text-gray-600 group-hover:text-amber-600 transition-colors duration-300" />
                {!notificationsPending && badgeLabel ? (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 min-h-5 min-w-5 px-0 flex items-center justify-center text-[10px] font-bold p-0 shadow-md group-hover:animate-none"
                  >
                    {badgeLabel}
                  </Badge>
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-[min(22rem,calc(100vw-2rem))] border-0 shadow-xl bg-white/95 backdrop-blur-sm rounded-xl p-0"
            >
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800">Alerts</p>
                  {!notificationsPending && !notificationsError && notifCount > 0 ? (
                    <button
                      type="button"
                      className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded px-1 -mr-1"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        markAllAlertsRead()
                      }}
                    >
                      Mark all as read
                    </button>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Operational reminders from your salon data.</p>
              </div>
              <div className="max-h-80 overflow-y-auto py-2">
                {notificationsPending ? (
                  <div className="px-4 py-8 text-center text-sm text-slate-500">Loading alerts…</div>
                ) : notificationsError ? (
                  <div className="px-4 py-8 text-center text-sm text-red-600">Could not load alerts. Try again later.</div>
                ) : notifCount === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-slate-500">
                    {notificationItems.length > 0 ? (
                      <>
                        <p>You marked all current alerts as read.</p>
                        <p className="mt-2 text-xs text-slate-400">
                          They will show again automatically when counts change for that alert type.
                        </p>
                      </>
                    ) : (
                      <p>You're all caught up — no actionable alerts right now.</p>
                    )}
                  </div>
                ) : (
                  visibleNotificationItems.map((item) => (
                    <NotificationAlertMenuRow
                      key={item.id}
                      item={item}
                      router={router}
                      onMarkRead={markAlertRead}
                    />
                  ))
                )}
              </div>
              <DropdownMenuSeparator className="my-0" />
              <DropdownMenuItem
                className="cursor-pointer mx-2 mb-2 justify-center text-xs font-medium text-slate-600 focus:text-slate-800"
                onSelect={(e) => {
                  e.preventDefault()
                  queryClient.invalidateQueries({ queryKey: ["notifications", "feed"] })
                }}
              >
                Refresh alerts
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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
            <DropdownMenuContent className="w-64 border-0 shadow-xl bg-white/95 backdrop-blur-sm rounded-xl p-2" align="end" forceMount>
              <DropdownMenuLabel className="font-normal p-3">
                <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-md text-white text-base font-bold">
                    {(() => {
                      const userName = user?.name || (user as any)?.firstName || user?.email || ''
                      return userName.charAt(0).toUpperCase() || 'U'
                    })()}
                  </div>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-semibold leading-none text-gray-800">{user?.name || user?.email}</p>
                    <p className="text-xs leading-none text-gray-600 capitalize">{user?.role || 'User'}</p>
                    <p className="text-xs leading-none text-gray-500">{user?.email}</p>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="my-2" />
              <DropdownMenuItem 
                onClick={() => router.push("/profile")}
                className="flex items-center gap-3 p-3 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200 cursor-pointer rounded-lg m-1"
              >
                <div className="p-2 bg-blue-100 rounded-lg">
                  <User className="h-4 w-4 text-blue-600" />
                </div>
                <span className="font-medium text-gray-700">Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => router.push("/settings")}
                className="flex items-center gap-3 p-3 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-green-50 transition-all duration-200 cursor-pointer rounded-lg m-1"
              >
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Settings className="h-4 w-4 text-emerald-600" />
                </div>
                <span className="font-medium text-gray-700">Settings</span>
              </DropdownMenuItem>
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
