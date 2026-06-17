/**
 * Feature -> route registry (single source of truth for API gating).
 *
 * Why a registry: gating must be auditable and consistent. Rather than letting
 * `requireFeature('x')` calls drift across thousands of lines of server.js,
 * every gated route group is declared here once. `gate(FEATURE.x)` is applied
 * inline on the matching routes (after `authenticateToken` + business setup),
 * and the rule list below documents exactly which paths each feature controls.
 *
 * Scalability: `gate()` resolves the business's entitlements from the
 * short-TTL per-business cache (see lib/entitlements-cache.js) — one cache
 * lookup per request, a DB read only on a cache miss. It does NOT re-run auth.
 *
 * Gating is enforced via the SAME path each plan flows through; access is
 * additive to the existing RBAC (requireStaff/requireManager/requireAdmin).
 */

const { requireFeature } = require('../middleware/feature-gate');

/**
 * Canonical feature ids (must match backend/config/plans.js FEATURES).
 */
const FEATURE = {
  // core
  POS: 'pos',
  APPOINTMENTS: 'appointments',
  CRM: 'crm',
  SERVICE_MANAGEMENT: 'service_management',
  PRODUCT_MANAGEMENT: 'product_management',
  BASIC_INVENTORY: 'basic_inventory',
  RECEIPTS: 'receipts',
  CASH_REGISTER: 'cash_register',
  STAFF_MANAGEMENT: 'staff_management',
  BASIC_REPORTS: 'basic_reports',
  // growth
  ADVANCED_INVENTORY: 'advanced_inventory',
  ADVANCED_REPORTS: 'advanced_reports',
  ANALYTICS: 'analytics',
  INCENTIVE_MANAGEMENT: 'incentive_management',
  CUSTOM_RECEIPT_TEMPLATES: 'custom_receipt_templates',
  DATA_EXPORT: 'data_export',
  REWARD_POINTS: 'reward_points',
  FEEDBACK_MANAGEMENT: 'feedback_management',
  CUSTOM_INTEGRATIONS: 'custom_integrations',
  WHATSAPP_INTEGRATION: 'whatsapp_integration',
  MULTI_LOCATION: 'multi_location',
  GMB_CONNECT: 'gmb_connect',
  GMB_REVIEWS_READ: 'gmb_reviews_read',
  GMB_REVIEWS_REPLY: 'gmb_reviews_reply',
  GMB_HEALTH: 'gmb_health',
  GMB_SYNC: 'gmb_sync',
  GMB_INSIGHTS: 'gmb_insights',
  GMB_CONVERSION_TRACKING: 'gmb_conversion_tracking',
};

/**
 * Inline gate. Thin wrapper over the cache-backed requireFeature so callers
 * read clearly at the route definition: `gate(FEATURE.ANALYTICS)`.
 * @param {string} featureId
 */
function gate(featureId) {
  return requireFeature(featureId);
}

/**
 * Declarative audit map: which API surfaces each feature controls. Kept in sync
 * with the inline `gate(...)` calls in server.js / routers. Used for docs and
 * the verification matrix; `pathPattern` is a RegExp on the request path.
 */
const FEATURE_ROUTE_RULES = [
  {
    feature: FEATURE.ANALYTICS,
    methods: ['GET'],
    pathPattern: /^\/api\/analytics(\/|$)/,
    description: 'Business analytics dashboards',
  },
  {
    feature: FEATURE.ADVANCED_INVENTORY,
    methods: ['GET'],
    pathPattern: /^\/api\/consumption-logs(\/|$)/,
    description: 'Inventory consumption logs',
  },
  {
    feature: FEATURE.ADVANCED_REPORTS,
    methods: ['GET', 'POST'],
    pathPattern: /^\/api\/reports\/(supplier|purchase|deleted-invoices|unpaid-part-paid|tip-payouts)(\/|$)/,
    description: 'Advanced report types beyond the basic sales/expense set',
  },
  {
    feature: FEATURE.DATA_EXPORT,
    methods: ['POST', 'GET'],
    pathPattern: /^\/api\/reports\/export(\/|$)/,
    description: 'Excel/PDF export of report data',
  },
  {
    feature: FEATURE.INCENTIVE_MANAGEMENT,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    pathPattern: /^\/api\/commission-profiles(\/|$)/,
    description: 'Incentive Management — commission profile CRUD (target, service, item)',
  },
  {
    feature: FEATURE.REWARD_POINTS,
    methods: ['GET', 'PUT', 'POST'],
    pathPattern: /^\/api\/reward-points(\/|$)/,
    description: 'Reward / loyalty points settings, ledger, and redemption',
  },
  {
    feature: FEATURE.FEEDBACK_MANAGEMENT,
    methods: ['GET', 'PATCH', 'POST', 'PUT'],
    pathPattern: /^\/api\/feedback(\/|$)/,
    description: 'Tenant feedback dashboard, stats, and status updates',
  },
  {
    feature: FEATURE.CUSTOM_RECEIPT_TEMPLATES,
    methods: ['GET', 'PUT'],
    pathPattern: /^\/api\/settings\/receipt-template(\/|$)/,
    description: 'Custom receipt template / branding settings',
  },
  {
    feature: FEATURE.CUSTOM_INTEGRATIONS,
    methods: ['PUT', 'POST', 'DELETE'],
    pathPattern: /^\/api\/integrations(\/|$)/,
    description: 'Third-party integration configuration',
  },
  {
    feature: FEATURE.WHATSAPP_INTEGRATION,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    pathPattern: /^\/api\/whatsapp(\/|$)/,
    description: 'Meta WABA module — connect, templates, campaigns, inbox',
  },
  {
    feature: FEATURE.MULTI_LOCATION,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    pathPattern: /^\/api\/branch-management(\/|$)/,
    description: 'Multi-branch admin dashboard, add/deactivate branches, cross-branch reports',
  },
  {
    feature: FEATURE.GMB_CONNECT,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    pathPattern: /^\/api\/gmb(\/|$)/,
    description: 'Google Business Profile OAuth connect and settings',
  },
];

/**
 * Resolve the feature id that gates a given request, if any (for audits/tests).
 */
function matchFeatureForRequest(method, path) {
  const m = (method || 'GET').toUpperCase();
  const rule = FEATURE_ROUTE_RULES.find(
    (r) => r.methods.includes(m) && r.pathPattern.test(path),
  );
  return rule ? rule.feature : null;
}

module.exports = {
  FEATURE,
  gate,
  FEATURE_ROUTE_RULES,
  matchFeatureForRequest,
};
