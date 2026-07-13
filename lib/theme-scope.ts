import { isPublicClientRoute } from "@/lib/public-routes"

/** Routes that stay light even when a session exists (e.g. branch picker). */
const LIGHT_ONLY_EXACT = new Set(["/select-branch"])

export function isDarkModeAllowed(
  pathname: string,
  opts: { tenantAuthenticated: boolean; adminAuthenticated: boolean }
): boolean {
  if (isPublicClientRoute(pathname) || LIGHT_ONLY_EXACT.has(pathname)) {
    return false
  }

  if (pathname.startsWith("/admin")) {
    return opts.adminAuthenticated
  }

  return opts.tenantAuthenticated
}
