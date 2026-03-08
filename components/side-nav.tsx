"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { CalendarDays, Home, PieChart, Settings, Users, Receipt, Banknote, ChevronLeft, ChevronRight, Phone, Megaphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { useSidebar } from "@/lib/sidebar-context"
import { SETTINGS_MODULES } from "@/lib/permission-mappings"

export function SideNav() {
  const pathname = usePathname()
  const { user } = useAuth()
  const { isCollapsed, toggleCollapsed } = useSidebar() ?? {
    isCollapsed: false,
    toggleCollapsed: () => {},
  }

  const navigationItems = [
    { title: "Dashboard", href: "/dashboard", icon: Home, permissionModule: "dashboard" },
    { title: "Quick Sale", href: "/quick-sale", icon: Receipt, permissionModule: "sales" },
    { title: "Appointments", href: "/appointments", icon: CalendarDays, permissionModule: "appointments" },
    { title: "Clients", href: "/clients", icon: Users, permissionModule: "clients" },
    { title: "Leads", href: "/leads", icon: Phone, permissionModule: "lead_management" },
    { title: "Campaigns", href: "/campaigns", icon: Megaphone, permissionModule: "campaigns" },
    { title: "Cash Register", href: "/cash-registry", icon: Banknote, permissionModule: "cash_registry" },
    { title: "Analytics", href: "/analytics", icon: PieChart, permissionModule: "analytics" },
    { title: "Reports", href: "/reports", icon: PieChart, permissionModule: "reports" },
    { title: "Staff Directory", href: "/staff", icon: Users, permissionModule: "staff" },
    { title: "Settings", href: "/settings", icon: Settings, permissionModule: "settings" },
  ]

  const hasAccess = (item: (typeof navigationItems)[0]) => {
    if (!user) return false
    // Admin role gets full access (matches backend checkPermission behavior)
    if (user.role === "admin") return true
    // Manager role gets Reports access by default (matches backend roleDefinitions)
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
      "hidden border-r bg-gradient-to-b from-slate-50 to-gray-100 md:block shadow-xl transition-all duration-300 relative fixed inset-y-0 left-0 z-40 h-screen shrink-0",
      isCollapsed ? "w-24" : "w-56"
    )}>
      <div className="flex h-full flex-col gap-4 p-5">
        {/* Toggle Button */}
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

        {/* Logo Section */}
        <div className={cn(
          "flex h-16 items-center border-b border-gray-200 mb-2 pb-4 transition-all",
          isCollapsed ? "justify-center px-2" : "px-2"
        )}>
          <Link href="/dashboard" className={cn(
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
                priority
              />
            )}
          </Link>
        </div>
        
        <div className="flex-1 py-2 overflow-y-auto">
          <TooltipProvider delayDuration={50}>
            <nav className="grid gap-2.5">
              {navigationItems.map((item) => {
                const canAccess = hasAccess(item)
                const Icon = item.icon
                const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))

                return (
                  <div key={item.href} className="relative">
                    {isCollapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link 
                            href={canAccess ? item.href : "#"} 
                            className={cn(
                              "flex items-center justify-center w-full h-12 rounded-xl transition-all duration-300 group",
                              !canAccess && "opacity-50 cursor-not-allowed",
                              isActive 
                                ? "bg-indigo-600 text-white shadow-lg hover:bg-indigo-600 hover:text-white" 
                                : "hover:bg-indigo-50 hover:text-indigo-600 text-gray-600"
                            )}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!canAccess) {
                                e.preventDefault()
                              }
                            }}
                          >
                            <Icon className={cn(
                              "h-5 w-5 transition-all",
                              isActive ? "text-white" : ""
                            )} />
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
                          "w-full h-12 rounded-xl transition-all duration-300 group justify-start text-left px-4",
                          !canAccess && "opacity-50 cursor-not-allowed",
                          isActive 
                            ? "bg-indigo-600 text-white shadow-lg !text-white hover:!bg-indigo-600 hover:!text-white" 
                            : "hover:bg-indigo-50 hover:text-indigo-700 hover:shadow-md text-gray-700"
                        )}
                        disabled={!canAccess}
                        asChild
                      >
                        <Link 
                          href={canAccess ? item.href : "#"} 
                          className="flex items-center w-full"
                        >
                          <div className={cn(
                          "p-2 rounded-lg transition-all duration-300 mr-3 flex-shrink-0",
                          isActive 
                            ? "bg-white/20 text-white" 
                            : "bg-gray-100 text-gray-600 group-hover:bg-indigo-100 group-hover:text-indigo-600"
                          )}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <span className={cn(
                          "font-medium flex-1",
                          isActive ? "text-white" : "text-gray-700"
                          )}>{item.title}</span>
                          {!canAccess && (
                            <span className="ml-auto text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full flex-shrink-0">
                              restricted
                            </span>
                          )}
                          {isActive && (
                            <div className="absolute right-4 w-2 h-2 bg-white rounded-full animate-pulse" />
                          )}
                        </Link>
                      </Button>
                    )}
                  
                    {/* Hover indicator */}
                    {!isActive && canAccess && !isCollapsed && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-0 bg-indigo-600 rounded-r-full opacity-0 group-hover:opacity-100 group-hover:h-8 transition-all duration-300" />
                    )}
                  </div>
                )
              })}
            </nav>
          </TooltipProvider>
        </div>
        
        {/* Bottom Section */}
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
