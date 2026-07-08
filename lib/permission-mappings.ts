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
 * payment_settings, payroll_settings, incentive_settings, pos_settings, notification_settings, plan_billing, feedback
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

/** Legacy module used before per-tab staff directory permissions. */
export const STAFF_DIRECTORY_LEGACY_TAB_FALLBACK: Record<string, string> = {
  staff_timesheet: "payroll_settings",
  staff_attendance: "payroll_settings",
  staff_payroll: "payroll_settings",
  staff_incentive: "incentive_settings",
}

export function hasStaffDirectoryTabPermission(
  hasPermission: (module: string, feature: string) => boolean,
  tabModule: (typeof STAFF_DIRECTORY_TAB_MODULES)[number],
  feature = "view"
): boolean {
  if (hasPermission(tabModule, feature)) return true
  const legacy = STAFF_DIRECTORY_LEGACY_TAB_FALLBACK[tabModule]
  if (legacy) return hasPermission(legacy, feature)
  return false
}

export function canAccessStaffDirectory(
  hasPermission: (module: string, feature: string) => boolean
): boolean {
  return STAFF_DIRECTORY_TAB_MODULES.some((m) => hasStaffDirectoryTabPermission(hasPermission, m, "view"))
}
