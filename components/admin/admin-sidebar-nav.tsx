"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  BarChart3,
  Bell,
  Building2,
  ChevronRight,
  CreditCard,
  FileText,
  LayoutDashboard,
  ScrollText,
  Settings,
  Shield,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

export type NavItem = {
  title: string
  href: string
  icon: LucideIcon
  /** If set, active when pathname is `/admin/settings` and `tab` matches (system also matches empty/missing tab). */
  settingsTab?: string
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

export const adminNavGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", href: "/admin", icon: LayoutDashboard }],
  },
  {
    label: "Business",
    items: [
      { title: "Businesses", href: "/admin/businesses", icon: Building2 },
      { title: "Settings", href: "/admin/notifications", icon: Bell },
    ],
  },
  {
    label: "Platform",
    items: [
      { title: "Settings", href: "/admin/settings?tab=system", icon: Settings, settingsTab: "system" },
      { title: "Plans", href: "/admin/plans", icon: CreditCard },
      { title: "Access", href: "/admin/users", icon: Shield },
      { title: "Logs", href: "/admin/logs", icon: ScrollText },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Invoice & GST", href: "/admin/finance/invoice-gst", icon: FileText },
      { title: "GST Reports", href: "/admin/finance/gst-reports", icon: BarChart3 },
    ],
  },
]

function isNavItemActive(
  pathname: string,
  searchParams: { get: (key: string) => string | null },
  item: NavItem
) {
  const pathOnly = item.href.split("?")[0]
  if (item.settingsTab !== undefined) {
    if (pathname !== "/admin/settings") return false
    const tab = searchParams.get("tab")
    if (item.settingsTab === "system") {
      return tab === null || tab === "" || tab === "system"
    }
    return tab === item.settingsTab
  }
  if (pathOnly === "/admin") {
    return pathname === "/admin" || pathname === "/admin/"
  }
  return pathname === pathOnly || (pathOnly !== "/admin" && pathname.startsWith(pathOnly))
}

type AdminSidebarNavProps = {
  onNavigate?: () => void
}

export function AdminSidebarNav({ onNavigate }: AdminSidebarNavProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return (
    <nav className="flex-1 overflow-y-auto py-5 px-3">
      {adminNavGroups.map((group) => (
        <div key={group.label} className="mb-8">
          <div className="px-3 mb-2.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              {group.label}
            </span>
          </div>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const isActive = isNavItemActive(pathname, searchParams, item)
              const Icon = item.icon
              return (
                <li key={item.href + item.title}>
                  <button
                    type="button"
                    onClick={() => {
                      router.push(item.href)
                      onNavigate?.()
                    }}
                    className={cn(
                      "group w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all duration-150",
                      isActive
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    <Icon
                      className={cn("h-4 w-4 shrink-0", isActive ? "text-slate-700" : "text-slate-400")}
                    />
                    <span className="flex-1">{item.title}</span>
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity",
                        isActive && "opacity-70"
                      )}
                    />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function AdminSidebarNavSkeleton() {
  return (
    <div className="flex-1 min-h-0 py-5 px-3 space-y-6 animate-pulse overflow-y-auto">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-16 rounded bg-slate-100 ml-3" />
          <div className="space-y-1">
            {[1, 2, 3].map((j) => (
              <div key={j} className="h-9 rounded-lg bg-slate-50" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
