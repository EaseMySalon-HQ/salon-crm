/**
 * Pricing Plan Configuration
 * Defines features, limits, and pricing for each plan tier
 */

const PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'Perfect for small salons just getting started.',
    monthlyPrice: 999,
    yearlyPrice: 9590, // 20% discount
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
    ],
    limits: {
      locations: 1,
      staff: Infinity, // Unlimited
      // whatsappMessages / smsMessages are DEPRECATED — every message is
      // billed per-message from the business wallet (see lib/wallet-deduction).
      // Kept at 0 for backward-compat with consumers that still read them.
      whatsappMessages: 0,
      smsMessages: 0,
    },
    support: {
      email: true,
      phone: false,
      priority: false,
    },
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    description: 'For growing salons with multiple staff.',
    monthlyPrice: 2499,
    yearlyPrice: 23990, // 20% discount
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
      'advanced_reports',
      'analytics',
      'staff_commissions',
      'incentive_management',
      'custom_receipt_templates',
      'data_export',
    ],
    limits: {
      locations: 3,
      staff: Infinity,
      // DEPRECATED — see starter plan note. Wallet-billed per message.
      whatsappMessages: 0,
      smsMessages: 0,
    },
    support: {
      email: true,
      phone: true,
      priority: true,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For salon chains and large businesses.',
    monthlyPrice: null, // Custom pricing
    yearlyPrice: null,
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
      'advanced_reports',
      'analytics',
      'staff_commissions',
      'incentive_management',
      'custom_receipt_templates',
      'data_export',
      'multi_location',
      'centralized_reporting',
      'api_access',
      'custom_integrations',
      'approval_workflows',
    ],
    limits: {
      locations: Infinity,
      staff: Infinity,
      // DEPRECATED — see starter plan note. Wallet-billed per message.
      whatsappMessages: 0,
      smsMessages: 0,
    },
    support: {
      email: true,
      phone: true,
      priority: true,
      dedicatedManager: true,
      onSiteTraining: true,
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
  staff_commissions: {
    id: 'staff_commissions',
    name: 'Staff Commission Tracking',
    description: 'Track and calculate staff commissions',
    category: 'growth',
  },
  incentive_management: {
    id: 'incentive_management',
    name: 'Incentive Management',
    description: 'Manage staff incentives and targets',
    category: 'core',
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
    category: 'enterprise',
  },
  centralized_reporting: {
    id: 'centralized_reporting',
    name: 'Centralized Reporting',
    description: 'Centralized reports across locations',
    category: 'enterprise',
  },
  api_access: {
    id: 'api_access',
    name: 'API Access',
    description: 'Access to REST API',
    category: 'enterprise',
  },
  custom_integrations: {
    id: 'custom_integrations',
    name: 'Custom Integrations',
    description: 'Custom third-party integrations',
    category: 'enterprise',
  },
  approval_workflows: {
    id: 'approval_workflows',
    name: 'Approval Workflows',
    description: 'Custom approval workflows',
    category: 'enterprise',
  },
};

/**
 * Addon definitions
 */
// NOTE: SMS and WhatsApp addons no longer ship with any free quota — every
// message is debited from the business wallet (see lib/wallet-deduction.js).
// `defaultQuota` is retained at 0 purely for backward compatibility with any
// caller that still reads the value.
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
};

/**
 * Get plan configuration by ID
 */
function getPlanConfig(planId) {
  return PLANS[planId] || null;
}

/**
 * Get all available plans
 */
function getAllPlans() {
  return Object.values(PLANS);
}

/**
 * Get feature definition
 */
function getFeature(featureId) {
  return FEATURES[featureId] || null;
}

/**
 * Get all features
 */
function getAllFeatures() {
  return Object.values(FEATURES);
}

/**
 * Get addon definition
 */
function getAddon(addonId) {
  return ADDONS[addonId] || null;
}

/**
 * Get all addons
 */
function getAllAddons() {
  return Object.values(ADDONS);
}

module.exports = {
  PLANS,
  FEATURES,
  ADDONS,
  getPlanConfig,
  getAllPlans,
  getFeature,
  getAllFeatures,
  getAddon,
  getAllAddons,
};

