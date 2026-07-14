/**
 * Route classification for SEO / robots control.
 * PUBLIC_MARKETING_PREFIXES stay indexable; everything else gets noindex.
 */

export const PUBLIC_MARKETING_PREFIXES = [
  "/about",
  "/features",
  "/pricing",
  "/solutions",
  "/contact",
  "/blog",
  "/faq",
  "/privacy-policy",
  "/terms-and-conditions",
  "/refund-policy",
  "/grievance",
  "/salon-billing-software",
  "/salon-crm",
  "/appointment-management",
  "/inventory-management",
  "/staff-management",
  "/payroll-management",
  "/whatsapp-marketing",
  "/reports-analytics",
  "/demo",
  "/business",
] as const

/** App / auth routes that must not appear in search results. */
export const NOINDEX_PREFIXES = [
  "/dashboard",
  "/profile",
  "/select-branch",
  "/appointments",
  "/clients",
  "/staff",
  "/products",
  "/services",
  "/packages",
  "/bills",
  "/billing",
  "/analytics",
  "/settings",
  "/admin",
  "/branch-management",
  "/whatsapp",
  "/gmb",
  "/reports",
  "/leads",
  "/cash-registry",
  "/quick-sale",
  "/users",
  "/membership",
  "/wallet",
  "/purchase-invoices",
  "/receipt",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/account-suspended",
  "/unauthorized",
  "/feedback",
  "/book",
] as const

/**
 * Phase 2 robots.txt disallows — enable ~2–4 weeks after noindex deploy,
 * once GSC confirms app URLs have dropped from the index.
 */
export const ROBOTS_DISALLOW_PHASE2 = [
  "/api/",
  "/profile",
  "/dashboard",
  "/select-branch",
  "/appointments",
  "/clients",
  "/staff",
  "/products",
  "/services",
  "/packages",
  "/bills",
  "/billing",
  "/analytics",
  "/settings",
  "/admin",
  "/branch-management",
  "/whatsapp",
  "/gmb",
  "/reports",
  "/leads",
  "/cash-registry",
  "/quick-sale",
  "/users",
  "/membership",
  "/wallet",
  "/purchase-invoices",
  "/receipt",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/account-suspended",
  "/unauthorized",
  "/feedback",
] as const

export function isPublicMarketingPath(pathname: string): boolean {
  if (pathname === "/") return true
  return PUBLIC_MARKETING_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

export function shouldNoindex(pathname: string): boolean {
  if (isPublicMarketingPath(pathname)) return false
  // Next.js internals and static assets
  if (pathname.startsWith("/_next") || pathname.startsWith("/api")) return true
  return NOINDEX_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}
