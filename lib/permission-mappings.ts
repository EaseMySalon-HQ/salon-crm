/**
 * Central permission mappings - single source of truth for all permission checks.
 * Must stay in sync with staff-permissions-modal.tsx SIDEBAR_MODULES and SETTINGS_CATEGORIES.
 *
 * === SIDEBAR MODULES (staff-permissions-modal) ===
 * dashboard, sales, appointments, clients, lead_management, campaigns, services, products,
 * cash_registry, analytics, reports, staff, settings
 *
 * === SETTINGS CATEGORIES (staff-permissions-modal) ===
 * general_settings, business_settings, appointment_settings, currency_settings, tax_settings,
 * payment_settings, pos_settings, notification_settings, plan_billing
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
 * /campaigns → campaigns
 * /services, /services/new → services
 * /products, /products/new → products
 * /cash-registry → cash_registry
 * /analytics → analytics
 * /reports, /reports/unpaid-bills → reports
 * /staff, /staff/new, /staff/commission, /staff/working-hours, /users → staff
 * /settings → settings (any subcategory uses SETTINGS_PERMISSION_MAP)
 *
 * === SETTINGS SECTION ID → MODULE ===
 * general → general_settings, business → business_settings, appointments → appointment_settings,
 * currency → currency_settings, tax → tax_settings, payments → payment_settings,
 * pos → pos_settings, notifications → notification_settings, plan-billing → plan_billing
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
  "/campaigns": "campaigns",
  "/membership": "membership",
  "/packages": "packages",
  "/packages/new": "packages",
  "/packages/sell": "packages",
  "/packages/reports": "packages",
  "/redeem": "packages",
  "/wallet/sell": "packages",
  "/services": "services",
  "/products": "products",
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
  pos: "pos_settings",
  notifications: "notification_settings",
  "plan-billing": "plan_billing",
  membership: "membership",
  packages: "packages",
  "prepaid-wallet": "packages",
  services: "services",
  products: "products",
  "channel-usage": "notification_settings",
  recharge: "plan_billing",
}

// All settings modules (for "has any settings access" check)
export const SETTINGS_MODULES = Object.values(SETTINGS_PERMISSION_MAP)

// Reports granular permissions
export const REPORTS_VIEW_PERMISSIONS = ["view", "view_financial_reports", "view_staff_commission"] as const
