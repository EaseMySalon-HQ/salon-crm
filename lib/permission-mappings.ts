/**
 * Central permission mappings - single source of truth for all permission checks.
 * Must stay in sync with staff-permissions-modal.tsx SIDEBAR_MODULES and SETTINGS_CATEGORIES.
 *
 * === SIDEBAR MODULES (staff-permissions-modal) ===
 * dashboard, sales, appointments, clients, lead_management, campaigns, services, products,
 * cash_registry, analytics, reports, staff, settings
 *
 * === STAFF DIRECTORY TABS (staff-permissions-modal) ===
 * staff (Staff List), staff_timesheet, staff_attendance, staff_payroll, staff_incentive
 *
 * === SETTINGS CATEGORIES (staff-permissions-modal) ===
 * general_settings, business_settings, appointment_settings, currency_settings, tax_settings,
 * payment_settings, payroll_settings, pos_settings, notification_settings, plan_billing, feedback
 * (Incentive Management lives under Staff Directory as staff_incentive — not a Settings category.)
 *
 * === REPORTS GRANULAR ===
 * view_financial_reports → Sales tab, Expense tab, Unpaid Bills
 * view_staff_commission → Staff Performance tab
 *
 * === ROUTE → MODULE MAPPING (all protected routes) ===
 * /dashboard → dashboard
 * /quick-sale, /billing/*, /bills/*, /receipt/* → sales
 * /appointments, /appointments/new, /appointments/[id]/edit → appointments
 * /clients, /clients/new, /clients/[id] → clients
 * /leads → lead_management
 * /services, /services/new → services
 * /products, /products/new → products; /purchase-invoices/* (redirects into Settings → Products → Suppliers & orders)
 * /cash-registry → cash_registry
 * /analytics → analytics
 * /reports, /reports/unpaid-bills → reports
 * /staff, /staff/new, /staff/commission, /staff/working-hours, /users → staff
 * /settings → settings (any subcategory uses SETTINGS_PERMISSION_MAP)
 *
 * === SETTINGS SECTION ID → MODULE ===
 * general → general_settings, business → business_settings, appointments → appointment_settings,
 * currency → currency_settings, tax → tax_settings, payments → payment_settings,
 * attendance-payroll → payroll_settings, staff-directory → staff, pos → pos_settings,
 * notifications → notification_settings, whatsapp-integration → notification_settings,
 * plan-billing → plan_billing, feedback → feedback
 */

// Sidebar/route: permission module for page-level access (check "view" feature)
// Used for documentation; each page uses requiredModule on ProtectedRoute/ProtectedLayout
export const ROUTE_PERMISSION_MAP: Record<string, string> = {
  "/dashboard": "dashboard",
  "/quick-sale": "sales",
  "/billing": "sales", // bill edit/exchange - uses sales module
  "/bills": "sales", // bill edit - uses sales module
  "/receipt": "sales", // receipt view/print - uses sales module
  "/appointments": "appointments",
  "/clients": "clients",
  "/leads": "lead_management",
  "/whatsapp/templates": "campaigns",
  "/whatsapp/campaigns": "campaigns",
  "/whatsapp/inbox": "campaigns",
  "/membership": "membership",
  "/wallet/sell": "sales",
  "/services": "services",
  "/products": "products",
  "/purchase-invoices": "products",
  "/cash-registry": "cash_registry",
  "/analytics": "analytics",
  "/reports": "reports",
  "/reports/unpaid-bills": "reports", // financial report - view_financial_reports
  "/staff": "staff",
  "/users": "staff", // user management - uses staff module
  "/settings": "settings",
}

// Settings category id -> permission module
export const SETTINGS_PERMISSION_MAP: Record<string, string> = {
  general: "general_settings",
  business: "business_settings",
  appointments: "appointment_settings",
  currency: "currency_settings",
  tax: "tax_settings",
  payments: "payment_settings",
  "attendance-payroll": "payroll_settings",
  "staff-directory": "staff",
  pos: "pos_settings",
  "reward-points": "pos_settings",
  notifications: "notification_settings",
  "plan-billing": "plan_billing",
  membership: "membership",
  packages: "sales",
  "prepaid-wallet": "payment_settings",
  services: "services",
  products: "products",
  "channel-usage": "notification_settings",
  "whatsapp-integration": "notification_settings",
  "google-business": "business_settings",
  recharge: "plan_billing",
  feedback: "feedback",
}

// All settings modules (for "has any settings access" check)
export const SETTINGS_MODULES = Object.values(SETTINGS_PERMISSION_MAP)

// Reports granular permissions
export const REPORTS_VIEW_PERMISSIONS = ["view", "view_financial_reports", "view_staff_commission"] as const

/** Staff Directory tab permission modules (sync with staff-permissions-modal STAFF_DIRECTORY_TABS). */
export const STAFF_DIRECTORY_TAB_MODULES = [
  "staff",
  "staff_timesheet",
  "staff_attendance",
  "staff_payroll",
  "staff_incentive",
] as const

/** Canonical permission module for Incentive Management (Staff Directory tab + commission APIs). */
export const INCENTIVE_PERMISSION_MODULE = "staff_incentive"

/** @deprecated Legacy alias — kept for existing saved permissions; mirrors backend alias map. */
export const INCENTIVE_PERMISSION_LEGACY_MODULE = "incentive_settings"

/** Bidirectional aliases — either module satisfies checks for the other. */
export const PERMISSION_MODULE_ALIASES: Record<string, string> = {
  staff_incentive: INCENTIVE_PERMISSION_LEGACY_MODULE,
  incentive_settings: INCENTIVE_PERMISSION_MODULE,
}

/** Legacy module used before per-tab staff directory permissions. */
export const STAFF_DIRECTORY_LEGACY_TAB_FALLBACK: Record<string, string> = {
  staff_timesheet: "payroll_settings",
  staff_attendance: "payroll_settings",
  staff_payroll: "payroll_settings",
  staff_incentive: INCENTIVE_PERMISSION_LEGACY_MODULE,
}

export function permissionModulesEquivalent(a: string, b: string): boolean {
  if (a === b) return true
  return PERMISSION_MODULE_ALIASES[a] === b || PERMISSION_MODULE_ALIASES[b] === a
}

/** Migrate legacy incentive_settings rows to staff_incentive for storage/display. */
export function normalizeIncentivePermissions<T extends { module: string; feature: string; enabled: boolean }>(
  permissions: T[],
): T[] {
  const byKey = new Map<string, T>()
  for (const p of permissions) {
    if (p.module === INCENTIVE_PERMISSION_LEGACY_MODULE) {
      const canonicalKey = `${INCENTIVE_PERMISSION_MODULE}:${p.feature}`
      if (!byKey.has(canonicalKey)) {
        byKey.set(canonicalKey, { ...p, module: INCENTIVE_PERMISSION_MODULE })
      }
      continue
    }
    byKey.set(`${p.module}:${p.feature}`, p)
  }
  return Array.from(byKey.values())
}

/** Per-tab Staff Directory modules (excluding Staff List). */
export const GRANULAR_STAFF_DIRECTORY_TAB_MODULES = [
  "staff_timesheet",
  "staff_attendance",
  "staff_payroll",
  "staff_incentive",
] as const

export type StaffDirectoryPermission = { module: string; feature: string; enabled: boolean }

/**
 * Staff Directory tab access with explicit per-tab overrides.
 * When a tab module appears in the user's permissions array, only enabled rows grant access
 * (legacy payroll_settings / incentive_settings fallback is skipped).
 * Legacy fallback applies only when no granular tab modules are configured.
 */
export function staffDirectoryTabPermissionGranted(
  permissions: StaffDirectoryPermission[] | null | undefined,
  tabModule: (typeof STAFF_DIRECTORY_TAB_MODULES)[number],
  feature: string,
  hasPermission: (module: string, feature: string) => boolean,
): boolean {
  const perms = permissions ?? []
  const tabConfigured = perms.some((p) => p.module === tabModule)
  if (tabConfigured) {
    return perms.some((p) => p.module === tabModule && p.feature === feature && p.enabled)
  }

  const hasGranularTabs = perms.some((p) =>
    (GRANULAR_STAFF_DIRECTORY_TAB_MODULES as readonly string[]).includes(p.module),
  )
  if (hasGranularTabs && tabModule !== "staff") {
    return false
  }

  if (hasPermission(tabModule, feature)) return true
  const legacy = STAFF_DIRECTORY_LEGACY_TAB_FALLBACK[tabModule]
  if (legacy) return hasPermission(legacy, feature)
  return false
}

export function hasStaffDirectoryTabPermission(
  hasPermission: (module: string, feature: string) => boolean,
  tabModule: (typeof STAFF_DIRECTORY_TAB_MODULES)[number],
  feature = "view",
  permissions?: StaffDirectoryPermission[] | null,
): boolean {
  return staffDirectoryTabPermissionGranted(permissions, tabModule, feature, hasPermission)
}

export function canAccessStaffDirectory(
  hasPermission: (module: string, feature: string) => boolean
): boolean {
  return STAFF_DIRECTORY_TAB_MODULES.some((m) => hasStaffDirectoryTabPermission(hasPermission, m, "view"))
}
