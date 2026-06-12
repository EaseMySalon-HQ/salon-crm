/**
 * Pricing Plan Configuration
 * Defines features, limits, and pricing for each plan tier.
 *
 * Product has three tiers: Starter (`starter`), Growth (`growth`), Pro (`pro`).
 */

const PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'Everything you need to run your salon smoothly — no credit card required.',
    monthlyPrice: 199,
    yearlyPrice: 1990,
    features: [
      'pos',
      'appointments',
      'crm',
      'service_management',
      'product_management',
      'basic_inventory',
      'receipts',
      'cash_register',
      'staff_management',
      'basic_reports',
      'gmb_connect',
      'gmb_reviews_read',
    ],
    limits: {
      locations: 1,
      staff: Infinity,
      whatsappMessages: 0,
      smsMessages: 0,
    },
    support: {
      email: true,
      phone: false,
      priority: false,
    },
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    description: 'Win back clients and build lasting loyalty with automated feedback and rewards.',
    monthlyPrice: 699,
    yearlyPrice: 6990,
    features: [
      'pos',
      'appointments',
      'crm',
      'service_management',
      'product_management',
      'basic_inventory',
      'receipts',
      'cash_register',
      'staff_management',
      'basic_reports',
      'incentive_management',
      'reward_points',
      'feedback_management',
      'gmb_connect',
      'gmb_reviews_read',
      'gmb_reviews_reply',
    ],
    limits: {
      locations: 1,
      staff: Infinity,
      whatsappMessages: 0,
      smsMessages: 0,
    },
    support: {
      email: true,
      phone: false,
      priority: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'The full growth stack — loyalty, feedback, analytics, and automation in one plan.',
    monthlyPrice: 999,
    yearlyPrice: 9990,
    features: [
      'pos',
      'appointments',
      'crm',
      'service_management',
      'product_management',
      'advanced_inventory',
      'receipts',
      'cash_register',
      'staff_management',
      'basic_reports',
      'advanced_reports',
      'analytics',
      'incentive_management',
      'reward_points',
      'feedback_management',
      'custom_receipt_templates',
      'data_export',
      'multi_location',
      'centralized_reporting',
      'api_access',
      'custom_integrations',
      'approval_workflows',
      'whatsapp_integration',
      'gmb_connect',
      'gmb_reviews_read',
      'gmb_reviews_reply',
      'gmb_health',
      'gmb_sync',
      'gmb_conversion_tracking',
    ],
    limits: {
      locations: 3,
      staff: Infinity,
      whatsappMessages: 0,
      smsMessages: 0,
    },
    support: {
      email: true,
      phone: true,
      priority: true,
    },
  },
};

/**
 * Feature definitions with descriptions
 */
const FEATURES = {
  pos: {
    id: 'pos',
    name: 'POS & Billing',
    description: 'Point of sale and billing system',
    category: 'core',
  },
  appointments: {
    id: 'appointments',
    name: 'Appointment Management',
    description: 'Schedule and manage appointments',
    category: 'core',
  },
  crm: {
    id: 'crm',
    name: 'Client Management',
    description: 'Customer relationship management',
    category: 'core',
  },
  service_management: {
    id: 'service_management',
    name: 'Service Management',
    description: 'Create and manage services',
    category: 'core',
  },
  product_management: {
    id: 'product_management',
    name: 'Product Management',
    description: 'Create and manage products',
    category: 'core',
  },
  basic_inventory: {
    id: 'basic_inventory',
    name: 'Basic Inventory',
    description: 'Basic inventory tracking',
    category: 'core',
  },
  advanced_inventory: {
    id: 'advanced_inventory',
    name: 'Advanced Inventory Management',
    description: 'Advanced inventory with logs, alerts, and tracking',
    category: 'growth',
  },
  receipts: {
    id: 'receipts',
    name: 'Receipts',
    description: 'Generate and manage receipts',
    category: 'core',
  },
  cash_register: {
    id: 'cash_register',
    name: 'Cash Register Management',
    description: 'Daily cash register operations',
    category: 'core',
  },
  staff_management: {
    id: 'staff_management',
    name: 'Staff Management',
    description: 'Manage staff accounts and permissions',
    category: 'core',
  },
  basic_reports: {
    id: 'basic_reports',
    name: 'Basic Reports',
    description: 'Basic reporting and analytics',
    category: 'core',
  },
  advanced_reports: {
    id: 'advanced_reports',
    name: 'Advanced Reports',
    description: 'Advanced reporting with custom filters',
    category: 'growth',
  },
  analytics: {
    id: 'analytics',
    name: 'Analytics',
    description: 'Business analytics and insights',
    category: 'growth',
  },
  incentive_management: {
    id: 'incentive_management',
    name: 'Incentive Management',
    description: 'Commission profiles — by target, service, or item — and staff assignments',
    category: 'growth',
  },
  reward_points: {
    id: 'reward_points',
    name: 'Reward Points',
    description: 'Customer loyalty points — earn and redeem on bills',
    category: 'growth',
  },
  feedback_management: {
    id: 'feedback_management',
    name: 'Feedback Management',
    description: 'Post-visit feedback collection, NPS, and review follow-up',
    category: 'growth',
  },
  custom_receipt_templates: {
    id: 'custom_receipt_templates',
    name: 'Custom Receipt Templates',
    description: 'Customize receipt templates',
    category: 'growth',
  },
  data_export: {
    id: 'data_export',
    name: 'Data Export',
    description: 'Export data to Excel/PDF',
    category: 'growth',
  },
  multi_location: {
    id: 'multi_location',
    name: 'Multi-Location Support',
    description: 'Manage multiple salon locations',
    category: 'pro',
  },
  centralized_reporting: {
    id: 'centralized_reporting',
    name: 'Centralized Reporting',
    description: 'Centralized reports across locations',
    category: 'pro',
  },
  api_access: {
    id: 'api_access',
    name: 'API Access',
    description: 'Access to REST API',
    category: 'pro',
  },
  custom_integrations: {
    id: 'custom_integrations',
    name: 'Custom Integrations',
    description: 'Custom third-party integrations',
    category: 'pro',
  },
  approval_workflows: {
    id: 'approval_workflows',
    name: 'Approval Workflows',
    description: 'Custom approval workflows',
    category: 'pro',
  },
  whatsapp_integration: {
    id: 'whatsapp_integration',
    name: 'WhatsApp Integration',
    description: 'Meta WABA — templates, campaigns, inbox, and Business API connect',
    category: 'pro',
  },
  gmb_connect: {
    id: 'gmb_connect',
    name: 'Google Business Connect',
    description: 'Connect Google Business Profile via OAuth',
    category: 'growth',
  },
  gmb_reviews_read: {
    id: 'gmb_reviews_read',
    name: 'GMB Reviews (Read)',
    description: 'View synced Google reviews in dashboard',
    category: 'growth',
  },
  gmb_reviews_reply: {
    id: 'gmb_reviews_reply',
    name: 'GMB Reviews (Reply)',
    description: 'Reply to Google reviews from dashboard',
    category: 'growth',
  },
  gmb_health: {
    id: 'gmb_health',
    name: 'GMB Health Dashboard',
    description: 'Google Business Profile health score and recommendations',
    category: 'pro',
  },
  gmb_sync: {
    id: 'gmb_sync',
    name: 'GMB Services & Hours Sync',
    description: 'Sync salon catalog and hours to Google Business Profile',
    category: 'pro',
  },
  gmb_insights: {
    id: 'gmb_insights',
    name: 'GMB Local SEO Insights',
    description: 'Google discovery metrics, auto posts, and AI ad triggers',
    category: 'pro',
  },
  gmb_conversion_tracking: {
    id: 'gmb_conversion_tracking',
    name: 'GMB Conversion Tracking',
    description: 'Track bookings and revenue from Google Business Profile',
    category: 'pro',
  },
};

/**
 * Addon definitions
 */
const ADDONS = {
  whatsapp: {
    id: 'whatsapp',
    name: 'WhatsApp Receipts',
    description: 'Send receipts via WhatsApp (billed per message from wallet)',
    defaultQuota: 0,
  },
  sms: {
    id: 'sms',
    name: 'SMS Notifications',
    description: 'Send SMS notifications (billed per message from wallet)',
    defaultQuota: 0,
  },
  googleBusiness: {
    id: 'googleBusiness',
    name: 'Google Business Profile Booster',
    description: 'AI auto-reply, review requests, auto posts, insights, and ad triggers',
    defaultQuota: 0,
    monthlyPriceInr: 499,
  },
};

function getPlanConfig(planId) {
  const { normalizePlanId } = require('../lib/plan-id');
  const id = normalizePlanId(planId);
  return PLANS[id] || null;
}

function getAllPlans() {
  return Object.values(PLANS);
}

function getAllPlanIds() {
  return Object.keys(PLANS);
}

function isBuiltInPlanId(planId) {
  const { normalizePlanId } = require('../lib/plan-id');
  const id = normalizePlanId(planId);
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(PLANS, id);
}

function getFeature(featureId) {
  return FEATURES[featureId] || null;
}

function getAllFeatures() {
  return Object.values(FEATURES);
}

function getAddon(addonId) {
  return ADDONS[addonId] || null;
}

function getAllAddons() {
  return Object.values(ADDONS);
}

module.exports = {
  PLANS,
  FEATURES,
  ADDONS,
  getPlanConfig,
  getAllPlans,
  getAllPlanIds,
  isBuiltInPlanId,
  getFeature,
  getAllFeatures,
  getAddon,
  getAllAddons,
};
