"use client"

import { useAuth } from "@/lib/auth-context"
import { buildLoginRedirectHref } from "@/lib/auth-utils"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { SideNav } from "@/components/side-nav"
import { TopNav } from "@/components/top-nav"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"
import { SidebarProvider, useSidebar } from "@/lib/sidebar-context"
import { NavigationProgress } from "@/components/loading/navigation-progress"
import { LoadingSpinnerPage } from "@/components/loading"
import { cn } from "@/lib/utils"
interface ProtectedLayoutProps {
  children: React.ReactNode
  /** Permission module to check. Access granted only when user has the required feature on this module. */
  requiredModule?: string
  /** Feature within the module to require. Defaults to "view" for page-level access. */
  requiredFeature?: string
  topNavQuickAdd?: boolean
  topNavRightSlot?: React.ReactNode
  /** Optional secondary nav rendered between the main sidebar and page content. */
  secondaryNav?: React.ReactNode
}

function ProtectedLayoutContent({
  children,
  user,
  exitImpersonation,
  topNavQuickAdd,
  topNavRightSlot,
  secondaryNav,
}: {
  children: React.ReactNode
  user: NonNullable<ReturnType<typeof useAuth>["user"]>
  exitImpersonation: () => void
  topNavQuickAdd: boolean
  topNavRightSlot?: React.ReactNode
  secondaryNav?: React.ReactNode
}) {
  const sidebar = useSidebar()

  return (
    <div className="flex h-screen min-w-0 flex-col overflow-hidden">
      {user?.isImpersonation && (
        <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between gap-4 shrink-0 sticky top-0 z-50">
          <span className="text-sm font-medium">You are impersonating this business</span>
          <Button
            variant="outline"
            size="sm"
            onClick={exitImpersonation}
            className="border-amber-700 text-amber-950 hover:bg-amber-600 hover:text-white shrink-0"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Exit Impersonation
          </Button>
        </div>
      )}
      <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden">
        <SideNav isImpersonation={!!user?.isImpersonation} />
        {secondaryNav}
        <div
          className={cn(
            "relative flex-1 flex flex-col min-w-0 min-h-0 overflow-x-hidden",
            secondaryNav
              ? sidebar?.isCollapsed
                ? "md:ml-[18rem]"
                : "md:ml-[26rem]"
              : sidebar?.isCollapsed
                ? "md:ml-24"
                : "md:ml-56"
          )}
        >
          <NavigationProgress />
          <TopNav showQuickAdd={topNavQuickAdd} rightSlot={topNavRightSlot} />
          <main className="flex-1 min-h-0 overflow-auto p-6 min-w-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}

export function ProtectedLayout({ children, requiredModule, requiredFeature = "view", topNavQuickAdd = true, topNavRightSlot, secondaryNav }: ProtectedLayoutProps) {
  const { user, isLoading, hasPermission, exitImpersonation } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(buildLoginRedirectHref())
    }
  }, [user, isLoading, router])

  useEffect(() => {
    if (isLoading || !user?.businessSuspended) return
    router.replace("/account-suspended")
  }, [user, isLoading, router])

  if (isLoading) {
    return <LoadingSpinnerPage label="Loading" />
  }

  // Don't render layout if not authenticated - let the redirect happen
  if (!user) {
    return <LoadingSpinnerPage label="Redirecting to login…" />
  }

  if (user.businessSuspended) {
    return <LoadingSpinnerPage label="Opening account status…" />
  }

  // Check permission-based access
  if (requiredModule && !hasPermission(requiredModule, requiredFeature)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-4">
            You don&apos;t have permission to access this page.
          </p>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                router.back()
              } else {
                router.push("/dashboard")
              }
            }}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Go back
          </button>
        </div>
      </div>
    )
  }

  return (
    <SidebarProvider>
      <ProtectedLayoutContent
        user={user}
        exitImpersonation={exitImpersonation}
        topNavQuickAdd={topNavQuickAdd}
        topNavRightSlot={topNavRightSlot}
        secondaryNav={secondaryNav}
      >
        {children}
      </ProtectedLayoutContent>
    </SidebarProvider>
  )
} 