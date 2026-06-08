"use client"

import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  Boxes,
  Scissors,
  UserSearch,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const BRANCH_MANAGEMENT_NAV = [
  { title: "Dashboard", href: "/branch-management/dashboard", icon: LayoutDashboard },
  { title: "Staff", href: "/branch-management/staff", icon: Users },
  { title: "Inventory", href: "/branch-management/inventory", icon: Boxes },
  { title: "Services", href: "/branch-management/services", icon: Scissors },
  { title: "Clients", href: "/branch-management/clients", icon: UserSearch },
  { title: "Settings", href: "/branch-management/settings", icon: SlidersHorizontal },
] as const satisfies ReadonlyArray<{
  title: string
  href: string
  icon: LucideIcon
}>

function activeHref(pathname: string) {
  const match = BRANCH_MANAGEMENT_NAV.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  )
  return match?.href ?? BRANCH_MANAGEMENT_NAV[0].href
}

/** Horizontal tab bar for branch-management sections (replaces the secondary sidebar). */
export function BranchManagementTabsNav() {
  const pathname = usePathname()
  const router = useRouter()
  const active = activeHref(pathname)

  return (
    <Tabs value={active} onValueChange={(href) => router.push(href)} className="w-full min-w-0">
      <TabsList className="mb-2 flex h-auto min-h-11 w-full justify-start gap-1 overflow-x-auto p-1 sm:flex-wrap">
        {BRANCH_MANAGEMENT_NAV.map((item) => {
          const Icon = item.icon
          return (
            <TabsTrigger
              key={item.href}
              value={item.href}
              className="inline-flex shrink-0 items-center gap-1.5 px-3 py-2 data-[state=active]:bg-background"
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.title}
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}
