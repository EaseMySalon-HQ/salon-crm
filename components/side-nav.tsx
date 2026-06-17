"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import {
  CalendarDays,
  Home,
  BarChart3,
  PieChart,
  Settings,
  Users,
  Receipt,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Phone,
  MessageCircle,
  FileText,
  Megaphone,
  ChevronDown,
  Building2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { useSidebar } from "@/lib/sidebar-context"
import { SETTINGS_MODULES } from "@/lib/permission-mappings"
import { useEntitlements } from "@/hooks/use-entitlements"
import { useMyBranches } from "@/hooks/use-my-branches"

type NavLinkItem = {
  kind: "link"
  title: string
  href: string
  icon: LucideIcon
  permissionModule: string
  featureId?: string
}

type NavGroupItem = {
  kind: "group"
  title: string
  icon: LucideIcon
  permissionModule: string
  featureId?: string
  items: { title: string; href: string; icon: LucideIcon }[]
}

const MARKETING_PREFIXES = ["/whatsapp/templates", "/whatsapp/campaigns", "/whatsapp/inbox"] as const

function isMarketingPath(path: string) {
  return MARKETING_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
}

export function SideNav({ isImpersonation = false }: { isImpersonation?: boolean } = {}) {
  const pathname = usePathname()
  const { user } = useAuth()
  const { hasFeature, isLoading: entitlementsLoading } = useEntitlements()
  const { canManageBranches } = useMyBranches()
  const { isCollapsed, toggleCollapsed } = useSidebar() ?? {
    isCollapsed: false,
    toggleCollapsed: () => {},
  }

  const [marketingOpen, setMarketingOpen] = useState(() => isMarketingPath(pathname))

  useEffect(() => {
    if (isMarketingPath(pathname)) setMarketingOpen(true)
  }, [pathname])

  const navigationEntries: (NavLinkItem | NavGroupItem)[] = [
    { kind: "link", title: "Dashboard", href: "/dashboard", icon: Home, permissionModule: "dashboard" },
    { kind: "link", title: "Quick Sale", href: "/quick-sale", icon: Receipt, permissionModule: "sales" },
    { kind: "link", title: "Appointments", href: "/appointments", icon: CalendarDays, permissionModule: "appointments" },
    { kind: "link", title: "Clients", href: "/clients", icon: Users, permissionModule: "clients" },
    { kind: "link", title: "Leads", href: "/leads", icon: Phone, permissionModule: "lead_management" },
    {
      kind: "group",
      title: "Marketing",
      icon: Megaphone,
      permissionModule: "campaigns",
      featureId: "whatsapp_integration",
      items: [
        { title: "WA Templates", href: "/whatsapp/templates", icon: FileText },
        { title: "WA Campaigns", href: "/whatsapp/campaigns", icon: MessageCircle },
      ],
    },
    { kind: "link", title: "Cash Register", href: "/cash-registry", icon: Banknote, permissionModule: "cash_registry" },
    {
      kind: "link",
      title: "Analytics",
      href: "/analytics",
      icon: BarChart3,
      permissionModule: "analytics",
      featureId: "analytics",
    },
    { kind: "link", title: "Reports", href: "/reports", icon: PieChart, permissionModule: "reports" },
    // Owner-only; requires Multi-Location Support plan feature and 2+ branches.
    ...(canManageBranches
      ? [
          {
            kind: "link" as const,
            title: "Branch Management",
            href: "/branch-management/dashboard",
            icon: Building2,
            permissionModule: "dashboard",
            featureId: "multi_location",
          },
        ]
      : []),
    { kind: "link", title: "Staff Directory", href: "/staff", icon: Users, permissionModule: "staff" },
    { kind: "link", title: "Settings", href: "/settings", icon: Settings, permissionModule: "settings" },
  ]

  const isFeatureAllowed = (item: { featureId?: string }) => {
    if (!item.featureId) return true
    if (entitlementsLoading) return true
    return hasFeature(item.featureId)
  }

  const hasAccess = (item: { permissionModule: string }) => {
    if (!user) return false
    if (user.role === "admin") return true
    if (user.role === "manager" && item.permissionModule === "reports") return true
    if (item.permissionModule === "settings") {
      return SETTINGS_MODULES.some((m) =>
        user.permissions?.some((p) => p.module === m && p.feature === "view" && p.enabled)
      )
    }
    if (item.permissionModule === "reports") {
      return (
        user.permissions?.some(
          (p) =>
            p.module === "reports" &&
            p.enabled &&
            (p.feature === "view" ||
              p.feature === "view_financial_reports" ||
              p.feature === "view_staff_commission")
        ) ?? false
      )
    }
    return (
      user.permissions?.some(
        (p) => p.module === item.permissionModule && p.feature === "view" && p.enabled
      ) ?? false
    )
  }

  return (
    <aside className={cn(
      "hidden border-r bg-gradient-to-b from-slate-50 to-gray-100 md:block shadow-xl transition-all duration-300 fixed left-0 z-50 shrink-0",
      isImpersonation ? "top-10 h-[calc(100vh-2.5rem)]" : "top-0 h-screen",
      isCollapsed ? "w-24" : "w-72"
    )}>
      <div className="flex h-full flex-col gap-4 p-5">
        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-3 top-20 z-10 h-6 w-6 rounded-full bg-white border-2 border-gray-200 shadow-md hover:shadow-lg transition-all"
          onClick={toggleCollapsed}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>

        <div className={cn(
          "flex h-16 items-center border-b border-gray-200 mb-2 pb-4 transition-all",
          isCollapsed ? "justify-center px-2" : "px-2"
        )}>
          <Link prefetch={false} href="/dashboard" className={cn(
            "flex items-center group transition-all",
            isCollapsed ? "justify-center" : "justify-center gap-3 w-full"
          )}>
            {isCollapsed ? (
              <Image
                src="/images/monogram-circle-color-transparent.png"
                alt="EaseMySalon"
                width={40}
                height={40}
                className="object-contain transition-all duration-300 group-hover:scale-105"
                priority
              />
            ) : (
              <Image
                src="/images/logo-no-background.png"
                alt="EaseMySalon"
                width={150}
                height={40}
                className="object-contain transition-all duration-300 group-hover:scale-105"
                style={{ width: "auto", height: "auto" }}
                priority
              />
            )}
          </Link>
        </div>

        <div className="flex-1 py-2 overflow-y-auto">
          <TooltipProvider delayDuration={50}>
            <nav className="grid gap-2.5">
              {navigationEntries.map((entry) => {
                if (entry.kind === "link") {
                  const item = entry
                  if (!isFeatureAllowed(item)) return null
                  if (!hasAccess(item)) return null
                  const Icon = item.icon
                  const isActive =
                    pathname === item.href ||
                    (item.href.startsWith("/branch-management") &&
                      pathname.startsWith("/branch-management")) ||
                    (item.href !== "/" &&
                      !item.href.startsWith("/branch-management") &&
                      pathname.startsWith(item.href))

                  return (
                    <div key={item.href} className="relative group/item">
                      {isCollapsed ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              prefetch={false}
                              href={item.href}
                              className={cn(
                                "flex items-center justify-center w-full h-12 rounded-xl transition-all duration-300 group",
                                isActive
                                  ? "bg-indigo-600 text-white shadow-lg hover:bg-indigo-600 hover:text-white"
                                  : "hover:bg-indigo-50 hover:text-indigo-600 text-gray-600"
                              )}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Icon className={cn("h-5 w-5 transition-all", isActive ? "text-white" : "")} />
                              {isActive && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-indigo-600 rounded-r-full" />
                              )}
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent side="right" sideOffset={8}>
                            {item.title}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Button
                          variant={isActive ? "secondary" : "ghost"}
                          className={cn(
                            "w-full h-12 rounded-xl transition-all duration-300 group/item justify-start text-left px-4",
                            isActive
                              ? "bg-indigo-600 text-white shadow-lg !text-white hover:!bg-indigo-600 hover:!text-white"
                              : "hover:bg-indigo-50 hover:text-indigo-700 hover:shadow-md text-gray-700"
                          )}
                          asChild
                        >
                          <Link prefetch={false} href={item.href} className="flex items-center w-full">
                            <div
                              className={cn(
                                "p-2 rounded-lg transition-all duration-300 mr-3 flex-shrink-0",
                                isActive
                                  ? "bg-white/20 text-white"
                                  : "bg-gray-100 text-gray-600 group-hover/item:bg-indigo-100 group-hover/item:text-indigo-600"
                              )}
                            >
                              <Icon className="h-5 w-5" />
                            </div>
                            <span
                              className={cn(
                                "font-medium flex-1 min-w-0 truncate",
                                isActive ? "text-white" : "text-gray-700"
                              )}
                            >
                              {item.title}
                            </span>
                            {isActive && (
                              <div className="absolute right-4 w-2 h-2 bg-white rounded-full animate-pulse" />
                            )}
                          </Link>
                        </Button>
                      )}
                      {!isActive && !isCollapsed && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-0 bg-indigo-600 rounded-r-full opacity-0 group-hover/item:opacity-100 group-hover/item:h-8 transition-all duration-300" />
                      )}
                    </div>
                  )
                }

                const group = entry
                if (!isFeatureAllowed(group)) return null
                if (!hasAccess(group)) return null
                const GroupIcon = group.icon
                const childActive = group.items.some(
                  (c) => pathname === c.href || pathname.startsWith(`${c.href}/`)
                )

                if (isCollapsed) {
                  return (
                    <div key="marketing" className="relative">
                      <DropdownMenu>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className={cn(
                                  "flex items-center justify-center w-full h-12 rounded-xl transition-all duration-300 outline-none",
                                  childActive
                                    ? "bg-indigo-600 text-white shadow-lg"
                                    : "text-gray-600 hover:bg-indigo-50 hover:text-indigo-600"
                                )}
                              >
                                <GroupIcon className={cn("h-5 w-5", childActive && "text-white")} />
                                {childActive && (
                                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-indigo-600 rounded-r-full" />
                                )}
                              </button>
                            </DropdownMenuTrigger>
                          </TooltipTrigger>
                          <TooltipContent side="right" sideOffset={8}>
                            Marketing
                          </TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent side="right" align="start" sideOffset={12} className="w-52">
                          {group.items.map((child) => {
                            const Ch = child.icon
                            const active =
                              pathname === child.href || pathname.startsWith(`${child.href}/`)
                            return (
                              <DropdownMenuItem key={child.href} asChild className="p-0">
                                <Link
                                  prefetch={false}
                                  href={child.href}
                                  className={cn(
                                    "flex w-full cursor-pointer items-center gap-2 px-2 py-2 text-sm rounded-sm",
                                    active && "bg-indigo-50 text-indigo-900"
                                  )}
                                >
                                  <Ch className="h-4 w-4 shrink-0 text-gray-500" />
                                  {child.title}
                                </Link>
                              </DropdownMenuItem>
                            )
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )
                }

                return (
                  <div key="marketing" className="relative space-y-1">
                    <Button
                      type="button"
                      variant="ghost"
                      className={cn(
                        "w-full h-12 rounded-xl transition-all duration-300 justify-start text-left px-4",
                        marketingOpen && childActive
                          ? "bg-indigo-600 text-white shadow-lg !text-white hover:!bg-indigo-700 hover:!text-white"
                          : marketingOpen && !childActive
                            ? "bg-indigo-50 text-indigo-900 hover:bg-indigo-100"
                            : "hover:bg-indigo-50 hover:text-indigo-700 hover:shadow-md text-gray-700"
                      )}
                      onClick={() => setMarketingOpen((v) => !v)}
                    >
                      <div
                        className={cn(
                          "p-2 rounded-lg transition-all duration-300 mr-3 flex-shrink-0",
                          marketingOpen && childActive
                            ? "bg-white/20 text-white"
                            : marketingOpen && !childActive
                              ? "bg-indigo-100 text-indigo-700"
                              : "bg-gray-100 text-gray-600"
                        )}
                      >
                        <GroupIcon className="h-5 w-5" />
                      </div>
                      <span className="font-medium flex-1 min-w-0 truncate text-left">Marketing</span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 transition-transform opacity-70",
                          marketingOpen && "rotate-180"
                        )}
                      />
                    </Button>
                    {marketingOpen && (
                      <div className="ml-3 pl-3 border-l-2 border-indigo-100 flex flex-col gap-0.5 pb-1">
                        {group.items.map((child) => {
                          const Ch = child.icon
                          const isActive =
                            pathname === child.href || pathname.startsWith(`${child.href}/`)
                          return (
                            <Button
                              key={child.href}
                              variant={isActive ? "secondary" : "ghost"}
                              className={cn(
                                "w-full h-10 rounded-lg justify-start text-left pl-2 pr-2 gap-2 font-normal",
                                isActive
                                  ? "bg-indigo-600 text-white shadow-md !text-white hover:!bg-indigo-600 hover:!text-white"
                                  : "text-gray-600 hover:bg-indigo-50 hover:text-indigo-800"
                              )}
                              asChild
                            >
                              <Link prefetch={false} href={child.href} className="flex items-center w-full gap-2">
                                <Ch className={cn("h-4 w-4 shrink-0", isActive ? "text-white" : "")} />
                                <span className={cn("truncate", isActive ? "text-white font-medium" : "")}>
                                  {child.title}
                                </span>
                              </Link>
                            </Button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </nav>
          </TooltipProvider>
        </div>

        <div className="border-t border-gray-200 pt-4 mt-auto">
          <div className={cn(
            "py-4 bg-gradient-to-r from-gray-50 to-slate-50 rounded-xl transition-all",
            isCollapsed ? "px-2" : "px-4"
          )}>
            <div className={cn(
              "flex items-center",
              isCollapsed ? "justify-center" : "gap-3"
            )}>
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-md text-white text-sm font-bold">
                {(() => {
                  const userName = user?.name || (user as any)?.firstName || ''
                  return userName.charAt(0).toUpperCase() || 'U'
                })()}
              </div>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {user?.name || `${(user as any)?.firstName || ''} ${(user as any)?.lastName || ''}`.trim() || 'User'}
                  </p>
                  <p className="text-xs text-gray-500 capitalize mt-0.5">
                    {user?.role || 'User'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
