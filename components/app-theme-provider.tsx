"use client"

import { useMemo } from "react"
import { usePathname } from "next/navigation"
import { ThemeProvider as NextThemesProvider } from "next-themes"

import { useAuth } from "@/lib/auth-context"
import { useAdminAuth } from "@/lib/admin-auth-context"
import { isDarkModeAllowed } from "@/lib/theme-scope"

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ""
  const { user, isLoading: tenantLoading } = useAuth()
  const { admin, isLoading: adminLoading } = useAdminAuth()

  const allowDark = useMemo(() => {
    if (tenantLoading || adminLoading) return false
    return isDarkModeAllowed(pathname, {
      tenantAuthenticated: Boolean(user),
      adminAuthenticated: Boolean(admin),
    })
  }, [pathname, user, admin, tenantLoading, adminLoading])

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      storageKey="salon-ems-theme"
      forcedTheme={allowDark ? undefined : "light"}
    >
      {children}
    </NextThemesProvider>
  )
}
