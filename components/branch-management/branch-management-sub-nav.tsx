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

const TAB_TRIGGER_CLASS =
  "data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-md transition-all duration-200"

/** Grid column layout aligned with Reports (`app/reports/page.tsx`). */
function tabGridClass(tabCount: number) {
  if (tabCount <= 1) return "grid-cols-1"
  if (tabCount === 2) return "grid-cols-2"
  if (tabCount === 3) return "grid-cols-3"
  if (tabCount === 4) return "grid-cols-2 sm:grid-cols-4"
  if (tabCount === 5) return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
  if (tabCount === 6) return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
  return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-7"
}

/** Horizontal tab bar for branch-management sections (styled like Reports tabs). */
export function BranchManagementTabsNav() {
  const pathname = usePathname()
  const router = useRouter()
  const active = activeHref(pathname)
  const tabCount = BRANCH_MANAGEMENT_NAV.length

  return (
    <Tabs value={active} onValueChange={(href) => router.push(href)} className="w-full min-w-0">
      <TabsList
        className={`grid w-full bg-slate-100 p-1 rounded-lg gap-1 ${tabGridClass(tabCount)}`}
      >
        {BRANCH_MANAGEMENT_NAV.map((item) => {
          const Icon = item.icon
          return (
            <TabsTrigger key={item.href} value={item.href} className={TAB_TRIGGER_CLASS}>
              <Icon className="h-4 w-4 mr-2 shrink-0" aria-hidden />
              {item.title}
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}
