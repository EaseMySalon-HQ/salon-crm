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
      'online_booking',
      'mini_website',
      'gmb',
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
      'lead_management',
      'membership',
      'packages',
      'prepaid_wallet',
      'reward_points',
      'feedback_management',
      'online_booking',
      'mini_website',
      'gmb',
      'attendance',
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
      'lead_management',
      'membership',
      'packages',
      'prepaid_wallet',
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
      'online_booking',
      'mini_website',
      'gmb',
      'attendance',
      'payroll',
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
  attendance: {
    id: 'attendance',
    name: 'Attendance & Timesheets',
    description: 'Staff attendance tracking, shifts, holidays, and timesheet exports',
    category: 'growth',
  },
  payroll: {
    id: 'payroll',
    name: 'Payroll',
    description: 'Staff payroll, salary formulas, advances, and leave-based pay rules',
    category: 'pro',
  },
  membership: {
    id: 'membership',
    name: 'Membership',
    description: 'Membership plans, subscriptions, and member benefits',
    category: 'growth',
  },
  lead_management: {
    id: 'lead_management',
    name: 'Lead Management',
    description: 'Capture, track, and convert salon leads with follow-ups',
    category: 'growth',
  },
  packages: {
    id: 'packages',
    name: 'Packages',
    description: 'Multi-session packages, pricing, and redemption',
    category: 'growth',
  },
  prepaid_wallet: {
    id: 'prepaid_wallet',
    name: 'Prepaid Wallet',
    description: 'Client prepaid wallet plans and service credit',
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
  online_booking: {
    id: 'online_booking',
    name: 'Online Booking',
    description: 'Public booking page and shareable link for client self-scheduling',
    category: 'growth',
  },
  mini_website: {
    id: 'mini_website',
    name: 'Salon Mini Website',
    description: 'SEO-friendly public storefront with services, gallery, and booking CTAs',
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
    description: 'Gupshup WABA — templates, campaigns, inbox, and WhatsApp connect',
    category: 'pro',
  },
  gmb: {
    id: 'gmb',
    name: 'Google Business Profile',
    description:
      'Connect, reviews, health dashboard, SEO insights, services sync, and conversion tracking',
    category: 'growth',
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
