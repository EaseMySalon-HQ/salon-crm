const { logger } = require('./utils/logger');
logger.info('Starting EaseMySalon Backend Server...');
const express = require('express');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const mongoose = require('mongoose');
const connectDB = require('./config/database');
const { ensureAdminAccessDefaults } = require('./utils/admin-access');
const { parseDateIST, getStartOfDayIST, getEndOfDayIST, getTodayIST, toDateStringIST, parseTimeToMinutes, minutesToTimeString, parseSupplierPaymentDateInput } = require('./utils/date-utils');
const { billChangeCreditedToWalletCashAddition } = require('./utils/bill-change-wallet-cash');
const { supplierPayableReferenceLabel: formatSupplierPayableBillRef } = require('./utils/supplier-payable-reference-label');
const {
  buildSalesListMatch,
  buildSalesListDuePaymentSplitMatches,
  fetchSalesListPageMerged,
  parseSalesListPagination,
  mergeEditedFlagsFromHistory,
  computeSalesSummaryTotals,
  computeSalesSummaryTotalsSplit,
} = require('./lib/sales-list-query');
const { isAdminReceiptNotificationsEnabled } = require('./lib/whatsapp-admin-gates');
const { getWhatsAppSettingsWithDefaults } = require('./lib/whatsapp-settings-defaults');
const { sendAppointmentWhatsAppAfterCreate, sendAppointmentRescheduleWhatsApp, sendAppointmentCancellationWhatsApp } = require('./lib/send-appointment-whatsapp');
const { logSmsMessage, logEmailMessage } = require('./lib/channel-logs');
const { canDeductSms, deductSms, canDeductWhatsApp, deductWhatsApp } = require('./lib/wallet-deduction');
const serviceBundle = require('./lib/service-bundle');
const { buildDashboardInitPayload, buildAppointmentsSummary } = require('./lib/dashboard-init');
const { buildNotificationsFeed } = require('./lib/notifications-feed');
const {
  listNewWebsiteEnquiriesForNotifications,
} = require('./lib/website-enquiries-notifications');
const {
  activeMembershipMongoMatch,
  expiringMembershipMongoMatch,
  membershipExpiredMongoMatch,
  subscriptionExpiryDateForPlan,
  resetAppliesToAllClientsExcept,
  assignUniversalMembershipToNewClient,
  ensureAllClientsSubscribedToUniversalPlan,
} = require('./lib/membership-subscription-helpers');
const {
  buildAnalyticsRevenueTab,
  buildAnalyticsServicesTab,
  buildAnalyticsClientsTab,
  buildAnalyticsProductsTab,
  buildAnalyticsStaffTab,
  buildAnalyticsStaffDrillDown,
} = require('./lib/analytics-tabs');
const { resolveReportRecipients } = require('./lib/report-email-recipients');

// Import database manager and middleware
const databaseManager = require('./config/database-manager');
const modelFactory = require('./models/model-factory');
// Central feature-gating registry (cache-backed; see config/feature-routes.js)
const { gate, FEATURE } = require('./config/feature-routes');
const INCENTIVE_MANAGEMENT = gate(FEATURE.INCENTIVE_MANAGEMENT);
const PAYROLL = gate(FEATURE.PAYROLL);
const ATTENDANCE = gate(FEATURE.ATTENDANCE);
const MEMBERSHIP = gate(FEATURE.MEMBERSHIP);
const LEAD_MANAGEMENT = gate(FEATURE.LEAD_MANAGEMENT);
const { setupBusinessDatabase, setupMainDatabase } = require('./middleware/business-db');
const { WALK_IN_PHONE } = require('./lib/ensure-walk-in-client');

// Import main database models (for admin operations)
const User = require('./models/User').model;
const Admin = require('./models/Admin').model;
const Business = require('./models/Business').model;
const PasswordResetToken = require('./models/PasswordResetToken').model;

// Import business-specific models (for backward compatibility)
const BusinessSettings = require('./models/BusinessSettings').model;
const Service = require('./models/Service').model;
const Product = require('./models/Product').model;
const Staff = require('./models/Staff').model;
const Client = require('./models/Client').model;
const Appointment = require('./models/Appointment').model;
const Receipt = require('./models/Receipt').model;
const Sale = require('./models/Sale').model;
const Expense = require('./models/Expense').model;
const CashRegistry = require('./models/CashRegistry').model;
const InventoryTransaction = require('./models/InventoryTransaction').model;
const BillEditHistory = require('./models/BillEditHistory').model;
const BillArchive = require('./models/BillArchive').model;

const ACTIVITY_ACTIONS = require('./constants/activity-log-actions');
const { scheduleActivityLog, tenantActorTypeFromRole } = require('./utils/activity-logger');

/**
 * Normalize `payrollOverrides` payload from staff create/update requests.
 * Returns a stable object shape or null if input is unusable.
 */
function normalizePayrollOverrides(input) {
  if (input == null || typeof input !== 'object') return null;
  const numOrNull = (v) => {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const boolOrNull = (v) => {
    if (v === true || v === false) return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return null;
  };
  return {
    useBusinessRules: input.useBusinessRules !== false,
    salary: numOrNull(input.salary),
    lateDeductionEnabled: boolOrNull(input.lateDeductionEnabled),
    overtimeEnabled: boolOrNull(input.overtimeEnabled),
    commissionPercent: numOrNull(input.commissionPercent),
  };
}

/** Apply staff payroll overrides only when the tenant has the payroll entitlement and RBAC allows it. */
async function applyPayrollOverridesIfAllowed(req, target, payrollOverrides) {
  const normalized = normalizePayrollOverrides(payrollOverrides);
  if (!normalized) return;
  const { businessHasPayrollFeature } = require('./lib/payroll-feature-access');
  const { userHasPermission } = require('./middleware/permissions');
  if (
    (await businessHasPayrollFeature(req)) &&
    userHasPermission(req.user, 'payroll_settings', 'edit')
  ) {
    target.payrollOverrides = normalized;
  }
}

async function applyStaffShiftFromSettings(businessModels, payload) {
  const { BusinessSettings } = businessModels;
  const {
    mergeAttendancePayrollSettings,
    syncStaffScheduleWithShift,
  } = require('./lib/attendance-payroll-settings');
  const settingsDoc = BusinessSettings
    ? await BusinessSettings.findOne().select('attendancePayroll').lean()
    : null;
  const merged = mergeAttendancePayrollSettings(settingsDoc?.attendancePayroll);
  if (payload?.shiftId !== undefined || Array.isArray(payload?.workSchedule)) {
    return syncStaffScheduleWithShift(payload, merged);
  }
  return null;
}
const {
  logTenantLoginSuccess,
  logTenantLogoutSuccess,
  logTenantRefreshFailure,
  logTenantSessionExpiredClient,
} = require('./utils/auth-audit-log');

// Import Routes
const cashRegistryRoutes = require('./routes/cashRegistry');
const purchaseInvoicesRoutes = require('./routes/purchaseInvoices');
const adminRoutes = require('./routes/admin');

require('dotenv').config();
/** Fail fast in production if JWT_SECRET missing */
const { JWT_SECRET } = require('./config/jwt');

const cookieParser = require('cookie-parser');
const {
  configureTrustProxy,
  validateProductionRateLimitConfig,
  generalApiLimiter,
  authClusterLimiter,
  reportsExportLimiter,
  aiIntegrationLimiter,
  AUTH_PATH_PREFIXES,
  shutdownRateLimitInfrastructure,
  getRateLimitHealthPayload,
} = require('./middleware/rate-limit');
const { apiV1AliasMiddleware } = require('./middleware/api-v1-alias');
const { perfLogMiddleware, markCache } = require('./middleware/perf-log');
const {
  getDashboardCacheEntry,
  setDashboardCache,
  dashboardInvalidateOnMutation,
} = require('./lib/dashboard-cache');
const { withReportCache, reportCacheMiddleware } = require('./lib/report-cache');

const app = express();
const PORT = process.env.PORT || 3001;

configureTrustProxy(app);
validateProductionRateLimitConfig(app);

// Connect to MongoDB and initialize admin access defaults
const dbPromise = connectDB();
dbPromise
  .then(() => ensureAdminAccessDefaults())
  .then(() => logger.info('Admin access defaults ensured'))
  .catch((error) => {
    logger.error('Failed to initialize admin access defaults:', error);
  });

// Warm the plan-template cache so the first entitlement checks use the
// admin-editable DB plans rather than the static config fallback.
dbPromise
  .then(() => require('./lib/plan-resolver').warmup())
  .then(() => logger.info('Plan template cache warmed'))
  .catch((error) => {
    logger.warn('Failed to warm plan template cache:', error.message);
  });

// Middleware
app.use(helmet());

// Enhanced CORS configuration for Railway deployment
const rawCorsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

/**
 * Browsers send an exact Origin string; tablets often land on www vs apex first.
 * Expand allowlist with the alternate hostname (skip IP / localhost).
 */
function expandAllowedOrigins(origins) {
  const set = new Set(origins.filter(Boolean));
  for (const o of [...set]) {
    try {
      const u = new URL(o);
      if (u.hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) continue;
      if (u.hostname.startsWith('www.')) {
        const alt = new URL(o);
        alt.hostname = u.hostname.slice(4);
        set.add(alt.origin);
      } else {
        const alt = new URL(o);
        alt.hostname = `www.${u.hostname}`;
        set.add(alt.origin);
      }
    } catch {
      /* ignore non-URL entries */
    }
  }
  return [...set];
}

const allowedOrigins = expandAllowedOrigins(rawCorsOrigins);

logger.info('Environment: %s, CORS Origins: %s, MongoDB URI: %s, JWT Secret: %s',
  process.env.NODE_ENV || 'development', allowedOrigins,
  process.env.MONGODB_URI ? 'Set' : 'Not set', process.env.JWT_SECRET ? 'Set' : 'Not set');

const tenantCorsOptions = {
  origin(origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked origin: %s (allowed: %s)', origin, allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token', 'X-XSRF-Token'],
  preflightContinue: false,
  optionsSuccessStatus: 200,
};

// Dynamic CORS configuration (must match explicit OPTIONS handler for credentialed Safari preflights)
app.use(cors(tenantCorsOptions));

// Per-request perf log (active in dev or when ENABLE_PERF_LOGS=true). Mounted early so it
// captures even auth/CSRF rejections. Never logs cookies, tokens, request bodies, or PII.
app.use(perfLogMiddleware);

/**
 * gzip/deflate JSON responses above 1KB to cut Railway egress. `compression()` only
 * wraps `res.write`/`res.end`; it does not alter request-body parsing, so webhooks /
 * raw-body parsers are unaffected. Health probes are skipped to keep them deterministic
 * and CPU-light, and clients can opt out per-request with `X-No-Compression: 1`.
 */
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    const p = req.path || '';
    if (p === '/health' || p === '/api/health') return false;
    return compression.filter(req, res);
  },
}));

app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'), {
    maxAge: '7d',
    fallthrough: true,
  })
);

// Body + cookies before rate limiters so auth routes can key off JSON (email, etc.)
app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());

// /api/v1/* is an alias for /api/* (same handlers; no duplicated route tables)
app.use(apiV1AliasMiddleware);

async function buildHealthPayload() {
  const { pingRedis, redisUrl } = require('./lib/redis');
  const dbState = mongoose.connection.readyState;
  const redisConfigured = Boolean(redisUrl());
  const redisOk = redisConfigured ? await pingRedis() : null;
  const services = {
    db: dbState === 1 ? 'ok' : 'down',
    redis: redisConfigured ? (redisOk ? 'ok' : 'degraded') : 'disabled',
    rateLimit: getRateLimitHealthPayload(),
    tenantConnections: databaseManager.getActiveConnections().length,
  };
  const degraded = services.db !== 'ok';
  return {
    success: !degraded,
    status: degraded ? 'degraded' : 'ok',
    message: 'EaseMySalon API is running',
    timestamp: new Date().toISOString(),
    uptime: `${Math.round(process.uptime())}s`,
    memory: {
      usedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      totalMb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
    services,
  };
}

// Health checks before /api rate limiters (load balancers / k8s probes)
app.get('/health', async (req, res) => {
  const health = await buildHealthPayload();
  res.status(health.services.db === 'ok' ? 200 : 503).json(health);
});
app.get('/api/health', async (req, res) => {
  const health = await buildHealthPayload();
  res.status(health.services.db === 'ok' ? 200 : 503).json(health);
});

// Rate limits: global API + stricter auth + heavy exports + reserved AI prefix (see middleware/rate-limit.js)
app.use('/api', generalApiLimiter);
AUTH_PATH_PREFIXES.forEach((p) => app.use(p, authClusterLimiter));
app.use('/api/reports/export', reportsExportLimiter);
app.use('/api/integrations/ai', aiIntegrationLimiter);

// Per-request HTTP log (dev only). Set HTTP_LOG=0 to disable morgan during local profiling.
if (process.env.NODE_ENV !== 'production' && process.env.HTTP_LOG !== '0') {
  app.use(morgan('short'));
}

const { csrfProtection, setCsrfCookie } = require('./middleware/csrf');
app.use(csrfProtection);

/**
 * After CSRF and (per-route) auth populate `req.user`, drop the tenant's dashboard cache
 * when a 2xx mutation lands on any resource feeding the summary. The hook runs on
 * `res.on('finish')` so it never delays the response, and silently no-ops on auth
 * failures (no `branchId` → no eviction needed).
 */
app.use(dashboardInvalidateOnMutation);

// Handle CORS preflight for all routes (same options as app.use — avoid default cors() without credentials)
app.options('*', cors(tenantCorsOptions));

/** Public: set `ems_csrf` cookie for double-submit CSRF (safe before login; no auth). */
app.get('/api/auth/csrf', (req, res) => {
  const csrfToken = setCsrfCookie(res);
  res.json({ success: true, csrfToken });
});

// Helper function to apply Email settings defaults
// This ensures that even if settings don't exist in DB, we use defaults
function getEmailSettingsWithDefaults(emailSettings) {
  // Default values from email-notifications route
  const defaults = {
    enabled: true,
    recipientStaffIds: [],
    dailySummary: {
      enabled: true,
      time: '21:00'
    },
    weeklySummary: {
      enabled: true,
      day: 'monday',
      time: '09:00'
    },
    monthlySummary: {
      enabled: true,
      time: '09:00'
    },
    payrollNotifications: {
      enabled: true,
      time: '12:00',
      attachSalarySlip: true,
      recipientStaffIds: []
    },
    timesheetNotifications: {
      enabled: true,
      time: '12:00',
      format: 'xlsx'
    },
    appointmentNotifications: {
      enabled: true,
      // Must match Business.settings.emailNotificationSettings + notification UI (plural key)
      newAppointments: true,
      cancellations: true,
      noShows: false,
      reminders: false,
      reminderHoursBefore: 24,
      recipientStaffIds: []
    },
    receiptNotifications: {
      enabled: true,
      sendToClients: true,
      sendToStaff: true,
      highValueTransactionThreshold: 10000
    },
    exportNotifications: {
      enabled: true,
      reportExport: true,
      dataExport: true
    },
    systemAlerts: {
      enabled: true,
      lowInventory: true,
      paymentFailures: true,
      systemErrors: true
    }
  };

  // If no settings exist, return defaults
  if (!emailSettings || typeof emailSettings !== 'object' || Array.isArray(emailSettings)) {
    return defaults;
  }

  // Merge with defaults, preserving existing values (including false)
  const merged = {
    ...defaults,
    ...emailSettings,
    // Explicitly handle enabled field - use saved value if it exists, otherwise default
    enabled: emailSettings.hasOwnProperty('enabled') ? emailSettings.enabled : defaults.enabled,
    // Merge nested objects, explicitly preserving enabled fields
    dailySummary: emailSettings.dailySummary ? {
      ...defaults.dailySummary,
      ...emailSettings.dailySummary,
      enabled: emailSettings.dailySummary.hasOwnProperty('enabled')
        ? emailSettings.dailySummary.enabled
        : defaults.dailySummary.enabled
    } : defaults.dailySummary,
    weeklySummary: emailSettings.weeklySummary ? {
      ...defaults.weeklySummary,
      ...emailSettings.weeklySummary,
      enabled: emailSettings.weeklySummary.hasOwnProperty('enabled')
        ? emailSettings.weeklySummary.enabled
        : defaults.weeklySummary.enabled
    } : defaults.weeklySummary,
    monthlySummary: emailSettings.monthlySummary ? {
      ...defaults.monthlySummary,
      ...emailSettings.monthlySummary,
      enabled: emailSettings.monthlySummary.hasOwnProperty('enabled')
        ? emailSettings.monthlySummary.enabled
        : defaults.monthlySummary.enabled
    } : defaults.monthlySummary,
    payrollNotifications: emailSettings.payrollNotifications ? {
      ...defaults.payrollNotifications,
      ...emailSettings.payrollNotifications,
      enabled: emailSettings.payrollNotifications.hasOwnProperty('enabled')
        ? emailSettings.payrollNotifications.enabled
        : defaults.payrollNotifications.enabled,
      attachSalarySlip: emailSettings.payrollNotifications.hasOwnProperty('attachSalarySlip')
        ? emailSettings.payrollNotifications.attachSalarySlip
        : defaults.payrollNotifications.attachSalarySlip
    } : defaults.payrollNotifications,
    timesheetNotifications: emailSettings.timesheetNotifications ? {
      ...defaults.timesheetNotifications,
      ...emailSettings.timesheetNotifications,
      enabled: emailSettings.timesheetNotifications.hasOwnProperty('enabled')
        ? emailSettings.timesheetNotifications.enabled
        : defaults.timesheetNotifications.enabled,
      format: emailSettings.timesheetNotifications.format === 'pdf' ? 'pdf' : 'xlsx'
    } : defaults.timesheetNotifications,
    receiptNotifications: emailSettings.receiptNotifications ? {
      ...defaults.receiptNotifications,
      ...emailSettings.receiptNotifications,
      // CRITICAL: Explicitly preserve enabled field if it exists (even if false)
      enabled: emailSettings.receiptNotifications.hasOwnProperty('enabled')
        ? emailSettings.receiptNotifications.enabled
        : defaults.receiptNotifications.enabled,
      // CRITICAL: Explicitly preserve sendToClients if it exists (even if false)
      sendToClients: emailSettings.receiptNotifications.hasOwnProperty('sendToClients')
        ? emailSettings.receiptNotifications.sendToClients
        : defaults.receiptNotifications.sendToClients
    } : defaults.receiptNotifications,
    appointmentNotifications: emailSettings.appointmentNotifications ? {
      ...defaults.appointmentNotifications,
      ...emailSettings.appointmentNotifications,
      // CRITICAL: Explicitly preserve enabled field if it exists (even if false)
      enabled: emailSettings.appointmentNotifications.hasOwnProperty('enabled')
        ? emailSettings.appointmentNotifications.enabled
        : defaults.appointmentNotifications.enabled
    } : defaults.appointmentNotifications,
    exportNotifications: emailSettings.exportNotifications ? {
      ...defaults.exportNotifications,
      ...emailSettings.exportNotifications,
      enabled: emailSettings.exportNotifications.hasOwnProperty('enabled')
        ? emailSettings.exportNotifications.enabled
        : defaults.exportNotifications.enabled
    } : defaults.exportNotifications,
    systemAlerts: emailSettings.systemAlerts ? {
      ...defaults.systemAlerts,
      ...emailSettings.systemAlerts,
      // CRITICAL: Explicitly preserve enabled field if it exists (even if false)
      enabled: emailSettings.systemAlerts.hasOwnProperty('enabled')
        ? emailSettings.systemAlerts.enabled
        : defaults.systemAlerts.enabled
    } : defaults.systemAlerts
  };
  
  logger.debug('[getEmailSettingsWithDefaults] Merged settings: %o', {
    rawEnabled: emailSettings?.enabled,
    mergedEnabled: merged.enabled,
    rawReceiptEnabled: emailSettings?.receiptNotifications?.enabled,
    mergedReceiptEnabled: merged.receiptNotifications?.enabled,
    rawSendToClients: emailSettings?.receiptNotifications?.sendToClients,
    mergedSendToClients: merged.receiptNotifications?.sendToClients
  });
  
  return merged;
}

const { isPlatformEmailDisabled } = require('./lib/business-email-policy');

// Register Routes
app.use('/api/admin', adminRoutes);
app.use('/api/admin/settings', require('./routes/admin-settings'));
app.use('/api/admin/gst', require('./routes/admin-gst-reports'));
app.use('/api/admin/plans', require('./routes/admin-plans'));
app.use('/api/admin/plan-promos', require('./routes/admin-plan-promos'));
app.use('/api/admin/access', require('./routes/admin-access'));
app.use('/api/admin/logs', require('./routes/admin-logs'));
app.use('/api/admin/leads', require('./routes/admin-leads'));
app.use('/api/email-notifications', require('./routes/email-notifications'));
const whatsappMsg91Router = require('./routes/whatsapp');
app.use('/api/whatsapp/gupshup', require('./routes/whatsapp-gupshup'));
const whatsappTemplatesRouter = require('./routes/whatsapp-templates');
const whatsappCampaignsRouter = require('./routes/whatsapp-campaigns');
const whatsappMessagesRouter = require('./routes/whatsapp-messages');
const whatsappInboxRouter = require('./routes/whatsapp-inbox');
app.use('/api/whatsapp/gupshup/templates', whatsappTemplatesRouter);
app.use('/api/whatsapp/v2/templates', whatsappTemplatesRouter);
app.use('/api/whatsapp/gupshup/campaigns', whatsappCampaignsRouter);
app.use('/api/whatsapp/v2/campaigns', whatsappCampaignsRouter);
app.use('/api/whatsapp/gupshup/messages', whatsappMessagesRouter);
app.use('/api/whatsapp/v2/messages', whatsappMessagesRouter);
app.use('/api/whatsapp/gupshup/inbox', whatsappInboxRouter);
app.use('/api/whatsapp/v2/inbox', whatsappInboxRouter);
app.use('/api/whatsapp/msg91', whatsappMsg91Router);
app.use('/api/whatsapp', whatsappMsg91Router);
app.use('/api/webhooks/whatsapp/gupshup', require('./routes/gupshup-webhook'));
app.use('/api/admin/gupshup', require('./routes/admin-gupshup'));
app.use('/api/channel-usage', require('./routes/channel-usage'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/platform', require('./routes/platform-ui'));
app.use('/api/client-wallet', require('./routes/client-wallet'));
app.use('/api/reward-points', require('./routes/reward-points'));
app.use('/api/plan', require('./routes/plan-checkout'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/purchase-invoices', purchaseInvoicesRoutes);
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/packages', require('./routes/packages'));
app.use('/api/public/feedback', require('./routes/public-feedback'));
app.use('/api/public/demo-lead', require('./routes/public-demo-lead'));
app.use('/api/public/booking/:code', require('./routes/public-booking'));
app.use('/api/public/site/:slug', require('./routes/public-site'));
app.use('/api/public/sites', require('./routes/public-sites-index'));
app.use('/api/settings/website', require('./routes/settings-website'));
app.use('/api/settings/appointments', require('./routes/settings-appointments'));
app.use('/api/public/pricing-matrix', require('./routes/public-pricing-matrix'));
app.use('/api/public/plans', require('./routes/public-plans'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/appointments', require('./routes/appointments-scheduling'));
app.use('/api/branch-management', require('./routes/branch-management'));
app.use('/api/inventory/transfers', require('./routes/inventory-transfers'));
app.use('/api/gmb', require('./routes/gmb'));
app.use('/api/admin/gmb-config', require('./routes/admin-gmb-config'));

const {
  signTenantAccess,
  setTenantAuthCookies,
  clearTenantAuthCookies,
  COOKIE,
  TOKEN_USE,
} = require('./lib/auth-tokens');
const { createRefreshSession, rotateRefreshSession, revokeRefreshFamily } = require('./lib/refresh-session');
const { validate, validateAll } = require('./middleware/validate');
const {
  tenantLoginSchema,
  staffLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  mongoIdParamSchema,
  createClientBodySchema,
  updateClientBodySchema,
  createStaffBodySchema,
  staffUpdateBodySchema,
  staffChangePasswordBodySchema,
  salePaymentBodySchema,
  saleExchangeBodySchema,
  createUserBodySchema,
  updateUserBodySchema,
  userChangePasswordBodySchema,
  verifyAdminPasswordBodySchema,
  createExpenseBodySchema,
  updateExpenseBodySchema,
} = require('./validation/schemas');

// Initialize default users if they don't exist
const initializeDefaultUsers = async () => {
  try {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      const defaultUsers = [
        {
          firstName: 'John',
          lastName: 'Doe',
          email: 'admin@salon.com',
          password: '$2a$10$20S481avXVWGJ3bN.6NJD.t6j/f771tQZkiz6CUQbUo460YXb15Fa',
          role: 'admin',
          hasLoginAccess: true,
          allowAppointmentScheduling: true,
          isActive: true,
          permissions: [
            // Admin gets all permissions
            { module: 'dashboard', feature: 'view', enabled: true },
            { module: 'dashboard', feature: 'edit', enabled: true },
            { module: 'appointments', feature: 'view', enabled: true },
            { module: 'appointments', feature: 'create', enabled: true },
            { module: 'appointments', feature: 'edit', enabled: true },
            { module: 'appointments', feature: 'delete', enabled: true },
            { module: 'customers', feature: 'view', enabled: true },
            { module: 'customers', feature: 'create', enabled: true },
            { module: 'customers', feature: 'edit', enabled: true },
            { module: 'customers', feature: 'delete', enabled: true },
            { module: 'services', feature: 'view', enabled: true },
            { module: 'services', feature: 'create', enabled: true },
            { module: 'services', feature: 'edit', enabled: true },
            { module: 'services', feature: 'delete', enabled: true },
            { module: 'products', feature: 'view', enabled: true },
            { module: 'products', feature: 'create', enabled: true },
            { module: 'products', feature: 'edit', enabled: true },
            { module: 'products', feature: 'delete', enabled: true },
            { module: 'staff', feature: 'view', enabled: true },
            { module: 'staff', feature: 'create', enabled: true },
            { module: 'staff', feature: 'edit', enabled: true },
            { module: 'staff', feature: 'delete', enabled: true },
            { module: 'sales', feature: 'view', enabled: true },
            { module: 'sales', feature: 'create', enabled: true },
            { module: 'sales', feature: 'edit', enabled: true },
            { module: 'sales', feature: 'delete', enabled: true },
            { module: 'reports', feature: 'view', enabled: true },
            { module: 'settings', feature: 'view', enabled: true },
            { module: 'settings', feature: 'edit', enabled: true },
          ]
        }
      ];

      await User.insertMany(defaultUsers);
      logger.info('Default admin user created');
    }
  } catch (error) {
    logger.error('Error initializing default users:', error);
  }
};

// Initialize default business settings
const initializeBusinessSettings = async () => {
  try {
    const settingsCount = await BusinessSettings.countDocuments();
    if (settingsCount === 0) {
      const defaultSettings = new BusinessSettings({
        name: "Glamour Salon & Spa",
        email: "info@glamoursalon.com",
        phone: "(555) 123-4567",
        website: "www.glamoursalon.com",
        description: "Premium salon and spa services in the heart of the city",
        address: "123 Beauty Street",
        city: "New York",
        state: "NY",
        zipCode: "10001",
        receiptPrefix: "INV",
        invoicePrefix: "INV",
        receiptNumber: 1,
        autoIncrementReceipt: true,
        socialMedia: "@glamoursalon"
      });
      await defaultSettings.save();
      logger.info('Default business settings created');
    }
  } catch (error) {
    logger.error('Error initializing business settings:', error);
  }
};
// Import authentication middleware
const { authenticateToken, requireAdmin, requireManager, requireStaff } = require('./middleware/auth');
const { requirePermission } = require('./middleware/permissions');

// Payroll routes (Pro plan) — mounted after auth middleware is available
app.use('/api/payroll', authenticateToken, setupBusinessDatabase, PAYROLL, require('./routes/payroll'));
app.use('/api/staff-advances', authenticateToken, setupBusinessDatabase, PAYROLL, require('./routes/staff-advances'));
app.use('/api/staff-leaves', authenticateToken, setupBusinessDatabase, PAYROLL, require('./routes/staff-leaves'));
app.use('/api/staff-leave-credits', authenticateToken, setupBusinessDatabase, PAYROLL, require('./routes/staff-leave-credits'));
// Attendance & timesheet routes (Growth+ plan). Payroll-specific settings within
// the shared settings endpoint are stripped for non-payroll tenants server-side.
app.use('/api/settings', authenticateToken, setupBusinessDatabase, ATTENDANCE, require('./routes/settings-attendance-payroll'));
app.use('/api/settings', authenticateToken, setupBusinessDatabase, require('./routes/settings-client-segments'));
app.use('/api/staff-attendance', authenticateToken, setupBusinessDatabase, ATTENDANCE, require('./routes/staff-attendance'));

// Granular permission middleware
const checkPermission = (module, feature) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Admin has all permissions
    if (req.user.role === 'admin') {
      return next();
    }

    // Check if user has login access
    if (!req.user.hasLoginAccess) {
      return res.status(403).json({ 
        success: false, 
        error: 'Login access not granted' 
      });
    }

    // Check specific permission
    const hasPermission = req.user.permissions?.some(p => 
      p.module === module && p.feature === feature && p.enabled
    );

    if (!hasPermission) {
      return res.status(403).json({ 
        success: false, 
        error: `Access denied. Required permission: ${module}.${feature}` 
      });
    }

    next();
  };
};

/**
 * Issue tenant session: short-lived access + rotated refresh (DB-backed jti) in HttpOnly cookies.
 * JSON access token retained for clients still using Authorization + localStorage (migration).
 * @param {'user'|'staff'} subjectType
 * @param {string} [accessExpiresOverride] — e.g. '1h' for impersonation sessions
 */
async function issueTenantSession(res, user, accessExpiresOverride, subjectType = 'user') {
  const mainConnection = await databaseManager.getMainConnection();
  const { refreshToken } = await createRefreshSession(mainConnection, {
    subjectType,
    userId: subjectType === 'user' ? user._id || user.id : undefined,
    staffId: subjectType === 'staff' ? user._id || user.id : undefined,
    branchId: user.branchId,
  });
  const accessToken = signTenantAccess(user, accessExpiresOverride);
  setTenantAuthCookies(res, { accessToken, refreshToken });
  return accessToken;
}

// Helper function to hash password
const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

// Helper function to compare password
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Routes

// Authentication routes
app.post('/api/auth/login', setupMainDatabase, validate(tenantLoginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Use main database User model
    const { User } = req.mainModels;
    
    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check password
    const isValidPassword = await comparePassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    let ownerBusiness = null;
    // If user is a business owner, check business status
    if (user.branchId) {
      const databaseManager = require('./config/database-manager');
      const mainConnection = await databaseManager.getMainConnection();
      const Business = mainConnection.model('Business', require('./models/Business').schema);

      // Reactivate inactive (manually paused) businesses, but not suspended ones.
      // Done before listing so they count as active branches below.
      const { statusUpdateFields } = require('./lib/suspension-grace');
      await Business.updateMany(
        { owner: user._id, status: 'inactive' },
        statusUpdateFields('active')
      );

      // List all branches this owner has, to decide single- vs multi-branch login.
      const ownedBranches = await Business.find({
        owner: user._id,
        status: { $ne: 'deleted' },
      }).select('_id code name address status settings.branding.logo');

      const activeBranches = ownedBranches.filter((b) => b.status === 'active');

      // MULTI-BRANCH FLOW: any owner with 2+ active branches picks a branch at login.
      // Branch Management remains gated by the multi_location plan feature separately.
      if (activeBranches.length >= 2) {
        const branchList = activeBranches.map((b) => ({
          id: b._id,
          code: b.code,
          name: b.name,
          city: b.address?.city || '',
          logo: b.settings?.branding?.logo || '',
        }));

        const preAuthToken = jwt.sign(
          {
            id: user._id,
            email: user.email,
            role: user.role,
            tokenUse: 'tenant_preauth',
            stage: 'branch-select',
            branchList,
          },
          JWT_SECRET,
          { expiresIn: '15m' }
        );

        await User.findByIdAndUpdate(user._id, {
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        });

        logTenantLoginSuccess(req, {
          subjectType: 'user',
          userId: user._id,
          email: user.email,
          branchId: undefined,
        });

        return res.json({
          success: true,
          data: {
            requiresBranchSelect: true,
            preAuthToken,
            branches: branchList,
          },
        });
      }

      // SINGLE-BRANCH (or zero active, or multi-location not on plan) — unchanged behavior.
      const preferredBranch =
        activeBranches.find((b) => String(b._id) === String(user.branchId)) ||
        activeBranches[0] ||
        ownedBranches[0] ||
        null;
      ownerBusiness = preferredBranch;

      if (!ownerBusiness) {
        return res.status(403).json({
          success: false,
          error: 'Business not found for this user'
        });
      }

      // Suspended businesses may sign in; tenant APIs are blocked in auth middleware (except auth routes)
    }

    // Update last login timestamp
    await User.findByIdAndUpdate(user._id, { 
      lastLoginAt: new Date(),
      updatedAt: new Date()
    });

    await issueTenantSession(res, user);
    const csrfToken = setCsrfCookie(res);
    const { password: _, ...userWithoutPassword } = user.toObject();

    const { buildSuspensionMeta } = require('./lib/suspension-grace');
    const suspensionMeta =
      user.branchId && ownerBusiness ? buildSuspensionMeta(ownerBusiness) : {};

    if (user.branchId) {
      scheduleActivityLog(
        {
          businessId: user.branchId,
          actorType: tenantActorTypeFromRole(user.role),
          actorId: user._id,
          action: ACTIVITY_ACTIONS.USER_LOGIN,
          entity: 'auth',
          summary: `User login: ${user.email}`,
        },
        req
      );
    }

    logTenantLoginSuccess(req, {
      subjectType: 'user',
      userId: user._id,
      email: user.email,
      branchId: user.branchId,
    });

    res.json({
      success: true,
      data: {
        user: { ...userWithoutPassword, ...suspensionMeta },
        csrfToken,
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Multi-branch: owner picks a branch from the picker screen.
 * Auth surface is the short-lived pre-auth token issued by /api/auth/login
 * (Authorization: Bearer <preAuthToken>). No tenant session exists yet, so this
 * route is exempt from CSRF (see SKIP_PREFIXES in middleware/csrf.js). The DB is
 * the source of truth — the branch must still be active and owned by this user.
 */
app.post('/api/auth/select-branch', setupMainDatabase, async (req, res) => {
  try {
    const header = req.headers['authorization'] || '';
    const preAuthToken = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!preAuthToken) {
      return res.status(401).json({ success: false, error: 'Missing pre-auth token' });
    }

    let decoded;
    try {
      decoded = jwt.verify(preAuthToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, error: 'Invalid or expired pre-auth token' });
    }

    if (decoded.tokenUse !== 'tenant_preauth' || decoded.stage !== 'branch-select') {
      return res.status(403).json({ success: false, error: 'Invalid pre-auth token' });
    }

    const requestedBranchId = String(req.body?.branchId || '');
    if (!requestedBranchId) {
      return res.status(400).json({ success: false, error: 'branchId required' });
    }

    const inList =
      Array.isArray(decoded.branchList) &&
      decoded.branchList.some((b) => String(b.id) === requestedBranchId);
    if (!inList) {
      return res.status(403).json({ success: false, error: 'Branch not allowed for this session' });
    }

    const databaseManager = require('./config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('./models/Business').schema);

    // Re-verify against the DB — branches may have been suspended or deleted
    // between login and selection.
    const branch = await Business.findOne({
      _id: requestedBranchId,
      owner: decoded.id,
      status: 'active',
    });
    if (!branch) {
      return res.status(403).json({ success: false, error: 'Branch is no longer available' });
    }

    const { User } = req.mainModels;
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    // Persist the chosen branch as the owner's active branch. For owners,
    // middleware/auth.js resolves req.user.branchId from the User document (not the
    // JWT), so the DB must reflect the selection for it to take effect everywhere.
    await User.findByIdAndUpdate(user._id, {
      branchId: branch._id,
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    });

    // Issue full tenant session for the chosen branch.
    await issueTenantSession(res, { ...user.toObject(), branchId: branch._id });
    const csrfToken = setCsrfCookie(res);

    const { buildSuspensionMeta } = require('./lib/suspension-grace');
    const { password: _, ...userWithoutPassword } = user.toObject();

    scheduleActivityLog(
      {
        businessId: branch._id,
        actorType: tenantActorTypeFromRole(user.role),
        actorId: user._id,
        action: ACTIVITY_ACTIONS.USER_LOGIN,
        entity: 'auth',
        summary: `Branch selected: ${user.email} → ${branch.code}`,
      },
      req
    );

    logTenantLoginSuccess(req, {
      subjectType: 'user',
      userId: user._id,
      email: user.email,
      branchId: branch._id,
    });

    return res.json({
      success: true,
      data: {
        user: {
          ...userWithoutPassword,
          branchId: branch._id,
          isOwner: true,
          ...buildSuspensionMeta(branch),
        },
        csrfToken,
      },
    });
  } catch (error) {
    logger.error('select-branch error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * Multi-branch: owner switches branch mid-session from the top nav.
 * Auth surface is the existing full tenant session (authenticateToken + standard
 * CSRF). Branch eligibility is derived from the DB (owner + active), never from a
 * JWT claim, so middleware/auth.js is left untouched.
 */
app.post('/api/auth/switch-branch', authenticateToken, async (req, res) => {
  try {
    const requestedBranchId = String(req.body?.branchId || '');
    if (!requestedBranchId) {
      return res.status(400).json({ success: false, error: 'branchId required' });
    }

    // Owners only — staff sessions never span multiple branches.
    if (!req.user || req.user.authSubject !== 'user') {
      return res.status(403).json({ success: false, error: 'Branch switching is owner-only' });
    }

    if (req.user.isImpersonation) {
      return res.status(403).json({
        success: false,
        error: 'Branch switching is disabled during impersonation. Exit impersonation to select another business.',
      });
    }

    const databaseManager = require('./config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('./models/Business').schema);

    const branch = await Business.findOne({
      _id: requestedBranchId,
      owner: req.user._id,
      status: 'active',
    });
    if (!branch) {
      return res.status(403).json({ success: false, error: 'Branch not allowed' });
    }

    const User = mainConnection.model('User', require('./models/User').schema);
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    // Persist the active branch. middleware/auth.js derives req.user.branchId from
    // the User document for owners, so without this the switch would not stick.
    await User.findByIdAndUpdate(user._id, {
      branchId: branch._id,
      updatedAt: new Date(),
    });

    await issueTenantSession(res, { ...user.toObject(), branchId: branch._id });
    const csrfToken = setCsrfCookie(res);

    scheduleActivityLog(
      {
        businessId: branch._id,
        actorType: tenantActorTypeFromRole(user.role),
        actorId: user._id,
        action: ACTIVITY_ACTIONS.USER_LOGIN,
        entity: 'auth',
        summary: `Branch switched: ${user.email} → ${branch.code}`,
      },
      req
    );

    return res.json({ success: true, data: { csrfToken } });
  } catch (error) {
    logger.error('switch-branch error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * Multi-branch: list the active branches owned by the current owner. Used by the
 * SPA to decide whether to render the branch switcher (the branch list cannot be
 * read from the HttpOnly access JWT). Owner-only; staff get an empty list.
 */
app.get('/api/auth/my-branches', authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.authSubject !== 'user') {
      return res.json({ success: true, data: { branches: [] } });
    }

    if (req.user.isImpersonation) {
      return res.json({ success: true, data: { branches: [] } });
    }

    const { cacheGet, cacheSet, myBranchesCacheKey } = require('./lib/cache');
    const cacheKey = myBranchesCacheKey(req.user._id);
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const databaseManager = require('./config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('./models/Business').schema);

    const branches = await Business.find({
      owner: req.user._id,
      status: 'active',
    }).select('_id code name address settings.branding.logo');

    const responseBody = {
      success: true,
      data: {
        branches: branches.map((b) => ({
          id: b._id,
          code: b.code,
          name: b.name,
          city: b.address?.city || '',
          logo: b.settings?.branding?.logo || '',
        })),
      },
    };
    void cacheSet(cacheKey, responseBody, parseInt(process.env.LIST_REDIS_TTL_SEC, 10) || 120);
    return res.json(responseBody);
  } catch (error) {
    logger.error('my-branches error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Staff login endpoint
app.post('/api/auth/staff-login', validate(staffLoginSchema), async (req, res) => {
  try {
    const { email, password, businessCode } = req.body;

    // Get business ID from business code
    const databaseManager = require('./config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('./models/Business').schema);
    const business = await Business.findOne({ code: businessCode });
    
    if (!business) {
      return res.status(400).json({
        success: false,
        error: 'Invalid business code'
      });
    }
    
    // Connect to business-specific database using business code
    const businessDb = await databaseManager.getConnection(business.code || business._id, mainConnection);
    const Staff = businessDb.model('Staff', require('./models/Staff').schema);
    
    // Find staff member
    const staff = await Staff.findOne({ 
      email: email.toLowerCase(),
      hasLoginAccess: true,
      isActive: true
    });
    
    if (!staff) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials or no login access'
      });
    }

    // Check password
    const isValidPassword = await comparePassword(password, staff.password);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Update last login timestamp
    await Staff.findByIdAndUpdate(staff._id, { 
      lastLoginAt: new Date(),
      updatedAt: new Date()
    });

    // Generate token with staff info - ensure branchId is set (fallback to business._id for legacy staff)
    const effectiveBranchId = staff.branchId || business._id;
    await issueTenantSession(
      res,
      {
        _id: staff._id,
        email: staff.email,
        role: staff.role,
        branchId: effectiveBranchId,
        firstName: staff.name.split(' ')[0],
        lastName: staff.name.split(' ').slice(1).join(' ') || '',
        mobile: staff.phone,
        hasLoginAccess: staff.hasLoginAccess,
        allowAppointmentScheduling: staff.allowAppointmentScheduling,
        isActive: staff.isActive
      },
      undefined,
      'staff'
    );
    const csrfToken = setCsrfCookie(res);

    const { password: _, ...staffWithoutPassword } = staff.toObject();

    // Use default permissions for role when staff has none configured
    let staffPermissions = staff.permissions || [];
    if (!staffPermissions.length && staff.role) {
      const { roleDefinitions } = require('./models/Permission');
      staffPermissions = roleDefinitions[staff.role]?.permissions || [];
    }

    const { buildSuspensionMeta: buildStaffSuspensionMeta } = require('./lib/suspension-grace');
    const staffSuspensionMeta = buildStaffSuspensionMeta(business);

    scheduleActivityLog(
      {
        businessId: effectiveBranchId,
        actorType: tenantActorTypeFromRole(staff.role),
        actorId: staff._id,
        action: ACTIVITY_ACTIONS.STAFF_LOGIN,
        entity: 'auth',
        summary: `Staff login: ${staff.email}`,
      },
      req
    );

    logTenantLoginSuccess(req, {
      subjectType: 'staff',
      userId: staff._id,
      email: staff.email,
      branchId: effectiveBranchId,
      businessCode: businessCode,
    });

    res.json({
      success: true,
      data: {
        user: {
          _id: staff._id,
          name: staff.name,
          firstName: staff.name.split(' ')[0],
          lastName: staff.name.split(' ').slice(1).join(' ') || '',
          email: staff.email,
          mobile: staff.phone,
          role: staff.role,
          branchId: effectiveBranchId,
          isOwner: false,
          hasLoginAccess: staff.hasLoginAccess,
          allowAppointmentScheduling: staff.allowAppointmentScheduling,
          isActive: staff.isActive,
          permissions: staffPermissions,
          specialties: staff.specialties,
          commissionProfileIds: staff.commissionProfileIds,
          notes: staff.notes,
          createdAt: staff.createdAt,
          updatedAt: staff.updatedAt,
          ...staffSuspensionMeta,
        },
        csrfToken,
      }
    });
  } catch (error) {
    logger.error('Staff login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Unauthenticated beacon: the SPA posts here right before redirecting to /login after a 401/403
 * cascade, so the server-side audit trail captures forced/unexpected logouts even though the
 * client's /logout call never happens.
 *
 * Accepts `text/plain` bodies specifically — a JSON Blob would trigger CORS preflight, which
 * browsers routinely cancel during page unload. The client sends a JSON-encoded string with
 * Content-Type text/plain, and we parse it here. Still accepts application/json for resilience.
 * All body fields are untrusted — the helper sanitizes and caps lengths.
 */
app.post(
  '/api/auth/session-expired-beacon',
  express.text({ type: ['text/plain', 'application/json'], limit: '4kb' }),
  (req, res) => {
    try {
      if (typeof req.body === 'string' && req.body) {
        try {
          req.body = JSON.parse(req.body);
        } catch {
          req.body = {};
        }
      } else if (!req.body || typeof req.body !== 'object') {
        req.body = {};
      }
      logTenantSessionExpiredClient(req);
    } catch (err) {
      logger.warn('[auth/session-expired-beacon] logging failed:', err);
    }
    res.status(204).end();
  }
);

/**
 * Logout is intentionally auth-tolerant: if the access token is missing or expired
 * (common after session timeout or when called from the post-401 cascade on /login)
 * we still revoke the refresh family (if the refresh cookie is intact) and clear all
 * auth cookies. Requiring authenticateToken here caused spurious 401s that fed the
 * client interceptor into a refresh/session-expired cascade, producing phantom
 * `tenant_refresh_failure` + `tenant_session_expired_client` audit entries for what
 * is actually a normal logout.
 */
app.post('/api/auth/logout', async (req, res) => {
  try {
    const accessTokenRaw =
      (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]) ||
      (req.cookies && req.cookies[COOKIE.tenantAccess]) ||
      null;
    if (accessTokenRaw && !accessTokenRaw.startsWith('mock-token-')) {
      try {
        const decodedAccess = jwt.verify(accessTokenRaw, JWT_SECRET);
        if (
          decodedAccess &&
          decodedAccess.tokenUse !== TOKEN_USE.tenantRefresh &&
          decodedAccess.tokenUse !== TOKEN_USE.platformAdmin
        ) {
          req.user = {
            _id: decodedAccess.id,
            id: decodedAccess.id,
            email: decodedAccess.email,
            role: decodedAccess.role,
            branchId: decodedAccess.branchId,
            authSubject: decodedAccess.branchId ? 'staff' : 'user',
            isImpersonation: Boolean(decodedAccess.isImpersonation),
            impersonatedBy: decodedAccess.impersonatedBy,
          };
        }
      } catch {
        /* expired/invalid access token on logout is fine — proceed best-effort */
      }
    }
  } catch {
    /* ignore — logout must never fail */
  }

  let refreshFamilyId;
  try {
    const refreshCookie = req.cookies && req.cookies[COOKIE.tenantRefresh];
    if (refreshCookie) {
      const decoded = jwt.decode(refreshCookie);
      if (decoded && decoded.familyId) {
        refreshFamilyId = String(decoded.familyId);
        const mainConnection = await databaseManager.getMainConnection();
        await revokeRefreshFamily(mainConnection, decoded.familyId);
      }
    }
  } catch (err) {
    logger.warn('[auth/logout] Failed to revoke refresh family:', err);
  }
  logTenantLogoutSuccess(req, refreshFamilyId ? { refreshFamilyId } : {});
  clearTenantAuthCookies(res);
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

/** Sliding / grace refresh — allows new JWT after idle expiry without re-login (within grace window). */
const JWT_REFRESH_GRACE_SEC = 7 * 24 * 60 * 60;

app.post('/api/auth/refresh', setupMainDatabase, async (req, res) => {
  try {
    const mainConnection = await databaseManager.getMainConnection();
    const UserModel = mainConnection.model('User', require('./models/User').schema);
    const BusinessModel = mainConnection.model('Business', require('./models/Business').schema);

    const refreshCookie = req.cookies && req.cookies[COOKIE.tenantRefresh];
    if (refreshCookie) {
      let rdecoded;
      try {
        rdecoded = jwt.verify(refreshCookie, JWT_SECRET);
      } catch (e) {
        const opaque = jwt.decode(refreshCookie);
        logTenantRefreshFailure(req, {
          path: 'refresh_cookie',
          reason: 'refresh_jwt_verify_failed',
          statusCode: 401,
          userId: opaque?.id != null ? String(opaque.id) : undefined,
          branchId: opaque?.branchId != null ? String(opaque.branchId) : undefined,
          refreshFamilyId: opaque?.familyId != null ? String(opaque.familyId) : undefined,
          verifyErrorName: e && e.name ? String(e.name) : undefined,
        });
        return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
      }
      if (rdecoded.tokenUse !== TOKEN_USE.tenantRefresh || !rdecoded.id) {
        logTenantRefreshFailure(req, {
          path: 'refresh_cookie',
          reason: 'refresh_invalid_claims',
          statusCode: 403,
          tokenUse: rdecoded.tokenUse,
          hasId: Boolean(rdecoded.id),
        });
        return res.status(403).json({ success: false, error: 'Invalid refresh token' });
      }

      let newRefreshToken = refreshCookie;
      if (rdecoded.jti && rdecoded.familyId) {
        const rotated = await rotateRefreshSession(mainConnection, rdecoded);
        if (!rotated.ok) {
          logTenantRefreshFailure(req, {
            path: 'refresh_cookie',
            reason: 'refresh_rotation_failed',
            statusCode: 401,
            rotationReason: rotated.reason,
            userId: String(rdecoded.id),
            branchId: rdecoded.branchId != null ? String(rdecoded.branchId) : undefined,
            refreshFamilyId: String(rdecoded.familyId),
          });
          return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
        }
        newRefreshToken = rotated.refreshToken;
      } else {
        const userTry = await UserModel.findById(rdecoded.id).select('-password');
        if (userTry) {
          const created = await createRefreshSession(mainConnection, {
            subjectType: 'user',
            userId: userTry._id,
            branchId: userTry.branchId,
          });
          newRefreshToken = created.refreshToken;
        } else {
          const bid = rdecoded.branchId;
          if (!bid) {
            logTenantRefreshFailure(req, {
              path: 'refresh_cookie',
              reason: 'refresh_jti_migration_missing_branch',
              statusCode: 403,
              userId: String(rdecoded.id),
            });
            return res.status(403).json({ success: false, error: 'Invalid or expired token' });
          }
          const businessDb = await databaseManager.getConnection(bid, mainConnection);
          const StaffModel = businessDb.model('Staff', require('./models/Staff').schema);
          const staffTry = await StaffModel.findById(rdecoded.id).select('-password');
          if (!staffTry || !staffTry.isActive || !staffTry.hasLoginAccess) {
            logTenantRefreshFailure(req, {
              path: 'refresh_cookie',
              reason: 'refresh_jti_migration_staff_denied',
              statusCode: 403,
              userId: String(rdecoded.id),
              branchId: String(bid),
              staffActive: staffTry ? staffTry.isActive : false,
              staffHasLoginAccess: staffTry ? staffTry.hasLoginAccess : false,
            });
            return res.status(403).json({ success: false, error: 'Invalid or expired token' });
          }
          const business = await BusinessModel.findById(bid);
          const effectiveBranchId = staffTry.branchId || business?._id || bid;
          const created = await createRefreshSession(mainConnection, {
            subjectType: 'staff',
            staffId: staffTry._id,
            branchId: effectiveBranchId,
          });
          newRefreshToken = created.refreshToken;
        }
      }

      const userDoc = await UserModel.findById(rdecoded.id).select('-password');
      if (userDoc) {
        const userForToken = {
          _id: userDoc._id,
          email: userDoc.email,
          role: userDoc.role,
          branchId: userDoc.branchId,
        };
        if (rdecoded.isImpersonation && rdecoded.branchId) {
          userForToken.branchId = rdecoded.branchId;
          userForToken.isImpersonation = true;
          userForToken.impersonatedBy = rdecoded.impersonatedBy;
        }
        const accessTtl = rdecoded.isImpersonation ? '1h' : undefined;
        const newToken = signTenantAccess(userForToken, accessTtl);
        setTenantAuthCookies(res, { accessToken: newToken, refreshToken: newRefreshToken });
        const csrfToken = setCsrfCookie(res);
        return res.json({ success: true, csrfToken });
      }

      const businessId = rdecoded.branchId;
      if (!businessId) {
        logTenantRefreshFailure(req, {
          path: 'refresh_cookie',
          reason: 'refresh_staff_missing_branch',
          statusCode: 403,
          userId: String(rdecoded.id),
        });
        return res.status(403).json({ success: false, error: 'Invalid or expired token' });
      }
      const businessDb = await databaseManager.getConnection(businessId, mainConnection);
      const StaffModel = businessDb.model('Staff', require('./models/Staff').schema);
      const staff = await StaffModel.findById(rdecoded.id).select('-password');
      if (!staff || !staff.isActive || !staff.hasLoginAccess) {
        logTenantRefreshFailure(req, {
          path: 'refresh_cookie',
          reason: 'refresh_staff_denied',
          statusCode: 403,
          userId: String(rdecoded.id),
          branchId: String(businessId),
          staffActive: staff ? staff.isActive : false,
          staffHasLoginAccess: staff ? staff.hasLoginAccess : false,
        });
        return res.status(403).json({ success: false, error: 'Invalid or expired token' });
      }
      const business = await BusinessModel.findById(businessId);
      const effectiveBranchId = staff.branchId || business?._id || businessId;
      const newToken = signTenantAccess({
        _id: staff._id,
        email: staff.email,
        role: staff.role,
        branchId: effectiveBranchId,
        firstName: staff.name?.split(' ')[0],
        lastName: staff.name?.split(' ').slice(1).join(' ') || '',
        mobile: staff.phone,
        hasLoginAccess: staff.hasLoginAccess,
        allowAppointmentScheduling: staff.allowAppointmentScheduling,
        isActive: staff.isActive,
      });
      setTenantAuthCookies(res, { accessToken: newToken, refreshToken: newRefreshToken });
      const csrfTokenStaff = setCsrfCookie(res);
      return res.json({ success: true, csrfToken: csrfTokenStaff });
    }

    /** Legacy: sliding refresh using access token (Bearer) within grace window */
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token || token.startsWith('mock-token-')) {
      logTenantRefreshFailure(req, {
        path: 'legacy_access',
        reason: 'legacy_no_access_token',
        statusCode: 401,
        hasMockToken: Boolean(token && token.startsWith('mock-token-')),
      });
      return res.status(401).json({ success: false, error: 'Access token required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name !== 'TokenExpiredError') {
        logTenantRefreshFailure(req, {
          path: 'legacy_access',
          reason: 'legacy_access_jwt_invalid',
          statusCode: 403,
          verifyErrorName: err.name,
        });
        return res.status(403).json({ success: false, error: 'Invalid or expired token' });
      }
      decoded = jwt.decode(token);
      const nowSec = Math.floor(Date.now() / 1000);
      if (!decoded || !decoded.exp || decoded.exp < nowSec - JWT_REFRESH_GRACE_SEC) {
        logTenantRefreshFailure(req, {
          path: 'legacy_access',
          reason: 'legacy_access_expired_beyond_grace',
          statusCode: 403,
          userId: decoded?.id != null ? String(decoded.id) : undefined,
          exp: decoded?.exp,
          nowSec,
          graceSec: JWT_REFRESH_GRACE_SEC,
        });
        return res.status(403).json({ success: false, error: 'Invalid or expired token' });
      }
    }

    if (decoded.tokenUse === TOKEN_USE.tenantRefresh) {
      logTenantRefreshFailure(req, {
        path: 'legacy_access',
        reason: 'legacy_refresh_token_in_authorization_header',
        statusCode: 403,
      });
      return res.status(403).json({ success: false, error: 'Use refresh token cookie or legacy access token' });
    }

    if (!decoded.id) {
      logTenantRefreshFailure(req, {
        path: 'legacy_access',
        reason: 'legacy_missing_subject_id',
        statusCode: 403,
      });
      return res.status(403).json({ success: false, error: 'Invalid or expired token' });
    }

    const userDoc = await UserModel.findById(decoded.id).select('-password');
    if (userDoc) {
      const userForToken = {
        _id: userDoc._id,
        email: userDoc.email,
        role: userDoc.role,
        branchId: decoded.isImpersonation && decoded.branchId ? decoded.branchId : userDoc.branchId,
      };
      if (decoded.isImpersonation) {
        userForToken.isImpersonation = true;
        userForToken.impersonatedBy = decoded.impersonatedBy;
      }
      const accessTtl = decoded.isImpersonation ? '1h' : undefined;
      const newToken = signTenantAccess(userForToken, accessTtl);
      const created = await createRefreshSession(mainConnection, {
        subjectType: 'user',
        userId: userDoc._id,
        branchId: userDoc.branchId,
      });
      setTenantAuthCookies(res, { accessToken: newToken, refreshToken: created.refreshToken });
      const csrfTokenLegacyUser = setCsrfCookie(res);
      return res.json({ success: true, csrfToken: csrfTokenLegacyUser });
    }

    const businessId = decoded.branchId;
    if (!businessId) {
      logTenantRefreshFailure(req, {
        path: 'legacy_access',
        reason: 'legacy_staff_path_missing_branch',
        statusCode: 403,
        userId: String(decoded.id),
      });
      return res.status(403).json({ success: false, error: 'Invalid or expired token' });
    }

    const businessDb = await databaseManager.getConnection(businessId, mainConnection);
    const StaffModel = businessDb.model('Staff', require('./models/Staff').schema);
    const staff = await StaffModel.findById(decoded.id).select('-password');
    if (!staff || !staff.isActive || !staff.hasLoginAccess) {
      logTenantRefreshFailure(req, {
        path: 'legacy_access',
        reason: 'legacy_staff_denied',
        statusCode: 403,
        userId: String(decoded.id),
        branchId: String(businessId),
        staffActive: staff ? staff.isActive : false,
        staffHasLoginAccess: staff ? staff.hasLoginAccess : false,
      });
      return res.status(403).json({ success: false, error: 'Invalid or expired token' });
    }

    const business = await BusinessModel.findById(businessId);
    const effectiveBranchId = staff.branchId || business?._id || businessId;
    const newToken = signTenantAccess({
      _id: staff._id,
      email: staff.email,
      role: staff.role,
      branchId: effectiveBranchId,
      firstName: staff.name?.split(' ')[0],
      lastName: staff.name?.split(' ').slice(1).join(' ') || '',
      mobile: staff.phone,
      hasLoginAccess: staff.hasLoginAccess,
      allowAppointmentScheduling: staff.allowAppointmentScheduling,
      isActive: staff.isActive,
    });
    const created = await createRefreshSession(mainConnection, {
      subjectType: 'staff',
      staffId: staff._id,
      branchId: effectiveBranchId,
    });
    setTenantAuthCookies(res, { accessToken: newToken, refreshToken: created.refreshToken });
    const csrfTokenLegacyStaff = setCsrfCookie(res);
    return res.json({ success: true, csrfToken: csrfTokenLegacyStaff });
  } catch (error) {
    logTenantRefreshFailure(req, {
      path: 'unknown',
      reason: 'refresh_internal_error',
      statusCode: 500,
      errorName: error && error.name ? String(error.name) : undefined,
    });
    logger.error('[auth/refresh]', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.get('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    // Check if user is staff (has branchId) or regular user
    if (req.user.branchId) {
      // Staff user - req.user is already populated by authenticateToken middleware
      // Just return the user data that was already validated
      const csrfTokenProfile = setCsrfCookie(res);
      res.json({
        success: true,
        data: {
          _id: req.user._id,
          id: req.user.id,
          firstName: req.user.firstName || '',
          lastName: req.user.lastName || '',
          name: req.user.firstName && req.user.lastName 
            ? `${req.user.firstName} ${req.user.lastName}`.trim()
            : req.user.email || 'User',
          email: req.user.email,
          mobile: req.user.mobile,
          role: req.user.role,
          branchId: req.user.branchId,
          isOwner: req.user.isOwner === true,
          hasLoginAccess: req.user.hasLoginAccess,
          allowAppointmentScheduling: req.user.allowAppointmentScheduling,
          isActive: req.user.isActive,
          permissions: req.user.permissions || [],
          specialties: req.user.specialties,
          commissionProfileIds: req.user.commissionProfileIds,
          notes: req.user.notes,
          createdAt: req.user.createdAt,
          updatedAt: req.user.updatedAt,
          ...(req.user.isImpersonation && { isImpersonation: true, impersonatedBy: req.user.impersonatedBy }),
          businessSuspended: !!req.businessSuspended,
          planRenewalWarningDaysLeft: req.planRenewalWarningDaysLeft ?? null,
          planRenewalExpiringToday: !!req.planRenewalExpiringToday,
          nextBillingDate: req.businessNextBillingDate ?? null,
          suspensionSupportEmail:
            process.env.SUSPENSION_SUPPORT_EMAIL || 'support@easemysalon.in',
          suspensionSupportPhone: process.env.SUSPENSION_SUPPORT_PHONE || undefined,
          billingOneDayExtensionAvailable: !!req.billingOneDayExtensionAvailable,
        },
        csrfToken: csrfTokenProfile,
      });
    } else {
      // Regular user - lookup from main database
      const mainConnection = await require('./config/database-manager').getMainConnection();
      const User = mainConnection.model('User', require('./models/User').schema);
      const user = await User.findById(req.user.id || req.user._id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const { password: _, ...userWithoutPassword } = user.toObject();
      const data = { ...userWithoutPassword };
      if (req.user.isImpersonation) {
        data.isImpersonation = true;
        data.impersonatedBy = req.user.impersonatedBy;
      }
      const csrfTokenOwner = setCsrfCookie(res);
      res.json({
        success: true,
        data,
        csrfToken: csrfTokenOwner,
      });
    }
  } catch (error) {
    logger.error('Profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.post('/api/auth/billing-one-day-extension', authenticateToken, async (req, res) => {
  try {
    if (!req.user?.branchId) {
      return res.status(400).json({
        success: false,
        error: 'NOT_TENANT_USER',
        message: 'Billing extension is only available for salon accounts.',
      });
    }

    if (req.user.isImpersonation) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Cannot extend billing while impersonating.',
      });
    }

    if (req.user.role !== 'admin' && req.user.isOwner !== true) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Only the business owner or an admin can extend billing.',
      });
    }

    const mainConnection = await require('./config/database-manager').getMainConnection();
    const Business = mainConnection.model('Business', require('./models/Business').schema);
    const { applyOneDayBillingExtension } = require('./lib/billing-one-day-extension');
    const { buildSuspensionMeta } = require('./lib/suspension-grace');

    const result = await applyOneDayBillingExtension(Business, req.user.branchId);
    if (!result.ok) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
      });
    }

    const business = await Business.findById(req.user.branchId).select('status plan suspendedAt').lean();
    const suspensionMeta = buildSuspensionMeta(business);
    const csrfToken = setCsrfCookie(res);

    return res.json({
      success: true,
      message: 'Subscription extended by 1 day. Your account is active again.',
      data: {
        renewalDate: result.renewalDate ? new Date(result.renewalDate).toISOString() : null,
        businessSuspended: suspensionMeta.businessSuspended,
        nextBillingDate: suspensionMeta.nextBillingDate,
        billingOneDayExtensionAvailable: false,
      },
      csrfToken,
    });
  } catch (error) {
    logger.error('[auth/billing-one-day-extension]', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get business plan information
app.get('/api/business/plan', authenticateToken, async (req, res) => {
  try {
    const businessId = req.user?.branchId;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID not found'
      });
    }

    const planResolver = require('./lib/plan-resolver');
    const { cacheGet, cacheSet, businessPlanCacheKey } = require('./lib/cache');
    const planCacheKey = businessPlanCacheKey(businessId);
    const cachedPlan = await cacheGet(planCacheKey);
    if (cachedPlan) {
      await planResolver.refreshPlanTemplates();
      const cachedPlanId = cachedPlan.data?.plan?.planId;
      if (cachedPlanId) {
        const freshConfig = planResolver.resolvePlanConfig(cachedPlanId);
        if (freshConfig) {
          cachedPlan.data.plan.monthlyPrice = freshConfig.monthlyPrice;
          cachedPlan.data.plan.yearlyPrice = freshConfig.yearlyPrice;
          cachedPlan.data.plan.name = freshConfig.name;
          cachedPlan.data.plan.planName = freshConfig.name;
          cachedPlan.data.plan.description = freshConfig.description;
        }
      }
      return res.json(cachedPlan);
    }

    const databaseManager = require('./config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('./models/Business').schema);

    const business = await Business.findById(businessId).select('plan status name code');

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Business not found'
      });
    }

    // Apply a scheduled downgrade if its effective date (= prior renewal
    // date) has now passed. This is the cheapest place to do it — reads
    // of the plan surface trigger the switch, no cron required.
    try {
      const plan = business.plan || {};
      const pendingAt = plan.pendingEffectiveAt ? new Date(plan.pendingEffectiveAt) : null;
      if (plan.pendingPlanId && pendingAt && pendingAt <= new Date()) {
        const { normalizePlanId } = require('./lib/plan-id');
        business.plan.planId = normalizePlanId(plan.pendingPlanId);
        if (plan.pendingBillingPeriod) {
          business.plan.billingPeriod = plan.pendingBillingPeriod;
        }
        business.plan.pendingPlanId = null;
        business.plan.pendingBillingPeriod = null;
        business.plan.pendingEffectiveAt = null;
        await business.save();
        require('./lib/entitlements-cache').invalidate(business._id);
      }
    } catch (applyErr) {
      logger.warn('Could not apply pending plan change:', applyErr?.message || applyErr);
    }

    await planResolver.refreshPlanTemplates();

    const { getPlanInfo } = require('./lib/entitlements');
    const planInfo = getPlanInfo(business);

    if (!planInfo) {
      return res.status(500).json({
        success: false,
        error: 'Failed to get plan information'
      });
    }

    const responseBody = {
      success: true,
      data: {
        plan: planInfo
      }
    };
    void cacheSet(planCacheKey, responseBody, parseInt(process.env.PLAN_REDIS_TTL_SEC, 10) || 1800);
    res.json(responseBody);
  } catch (error) {
    logger.error('Error fetching business plan:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get business information (for plan & billing page)
app.get('/api/business/info', authenticateToken, async (req, res) => {
  try {
    const businessId = req.user?.branchId;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID not found'
      });
    }

    const databaseManager = require('./config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('./models/Business').schema);

    const business = await Business.findById(businessId).select('_id code name address contact createdAt');

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Business not found'
      });
    }

    res.json({
      success: true,
      data: {
        _id: business._id,
        code: business.code,
        name: business.name,
        address: business.address,
        contact: business.contact,
        createdAt: business.createdAt,
      }
    });
  } catch (error) {
    logger.error('Error fetching business info:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// New endpoint for authenticated business users to get available plans
app.get('/api/business/plans', authenticateToken, async (req, res) => {
  try {
    const planResolver = require('./lib/plan-resolver');
    const { CANONICAL_PLAN_IDS } = require('./lib/plan-id');

    await planResolver.refreshPlanTemplates();

    const plans = CANONICAL_PLAN_IDS.map((id) => {
      const plan = planResolver.resolvePlanConfig(id);
      if (!plan || plan.isActive === false) return null;
      return {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
        yearlyPrice: plan.yearlyPrice,
        features: plan.features || [],
        limits: plan.limits || {},
      };
    }).filter(Boolean);

    res.json({
      success: true,
      data: plans,
    });
  } catch (error) {
    logger.error('Error fetching available plans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available plans',
      details: error.message,
    });
  }
});

// Password Reset Routes
app.post('/api/auth/forgot-password', validate(forgotPasswordSchema), async (req, res) => {
  try {
    const { email } = req.body;

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent'
      });
    }

    // Check if user has login access
    if (!user.hasLoginAccess) {
      return res.status(400).json({
        success: false,
        error: 'This account does not have login access. Please contact your administrator.'
      });
    }

    // Generate reset token
    const token = PasswordResetToken.generateToken();
    
    // Create reset token record
    const resetToken = new PasswordResetToken({
      userId: user._id,
      token: token,
      email: user.email,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
    });

    await resetToken.save();

    if (user.branchId) {
      scheduleActivityLog(
        {
          businessId: user.branchId,
          actorType: 'system',
          actorId: null,
          action: ACTIVITY_ACTIONS.PASSWORD_RESET_REQUESTED,
          entity: 'auth',
          summary: 'Password reset requested',
        },
        req
      );
    }

    // In a real application, you would send an email here
    // For now, we'll return the token in development
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    
    logger.debug('Password reset link generated for %s', user.email);

    res.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent',
      // Always include resetUrl in development mode
      resetUrl: resetUrl
    });
  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.post('/api/auth/reset-password', validate(resetPasswordSchema), async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Find the reset token
    const resetToken = await PasswordResetToken.findOne({ token });
    if (!resetToken || !resetToken.isValid()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token'
      });
    }

    // Find the user
    const user = await User.findById(resetToken.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Validate new password
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update user password
    await User.findByIdAndUpdate(
      user._id,
      { password: hashedPassword },
      { new: true, runValidators: true }
    );

    // Mark token as used
    resetToken.used = true;
    await resetToken.save();

    if (user.branchId) {
      scheduleActivityLog(
        {
          businessId: user.branchId,
          actorType: 'system',
          actorId: null,
          action: ACTIVITY_ACTIONS.PASSWORD_RESET_COMPLETED,
          entity: 'auth',
          summary: `Password reset completed for ${user.email}`,
        },
        req
      );
    }

    res.json({
      success: true,
      message: 'Password has been reset successfully'
    });
  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.get('/api/auth/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const resetToken = await PasswordResetToken.findOne({ token });
    if (!resetToken || !resetToken.isValid()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token'
      });
    }

    // Get user info (without password)
    const user = await User.findById(resetToken.userId).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    logger.error('Verify reset token error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// User Management routes (Admin only)
app.get('/api/users', authenticateToken, setupMainDatabase, requireAdmin, async (req, res) => {
  try {
    const { User } = req.mainModels;
    const { page = 1, limit = 10, search = '' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let query = {};
    if (search) {
      query = {
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { mobile: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.post(
  '/api/users',
  authenticateToken,
  setupMainDatabase,
  requireAdmin,
  validate(createUserBodySchema),
  async (req, res) => {
  try {
    const { User } = req.mainModels;
    const {
      firstName,
      lastName,
      email,
      password,
      mobile,
      hasLoginAccess = false,
      allowAppointmentScheduling = false,
      commissionProfileIds = [],
    } = req.body;

    // Validate required fields
    if (!firstName || firstName.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'First name is required'
      });
    }

    if (!mobile || mobile.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Mobile number is required'
      });
    }

    if (!email || email.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email already exists'
      });
    }

    // Check if trying to create admin user
    const isAdmin = email && email.toLowerCase() === 'admin@salon.com';
    if (isAdmin) {
      // Check if admin user already exists
      const existingAdmin = await User.findOne({ role: 'admin' });
      if (existingAdmin) {
        return res.status(400).json({
          success: false,
          error: 'Admin user already exists. Only one admin user is allowed in the system.'
        });
      }
    }

    // Validate password requirement (admin users always have login access)
    if (hasLoginAccess && !password && !isAdmin) {
      return res.status(400).json({
        success: false,
        error: 'Password is required when login access is enabled'
      });
    }

    const userData = {
      firstName: firstName.trim(),
      lastName: lastName || '',
      email: email.toLowerCase(),
      mobile: mobile.trim(),
      role: email && email.toLowerCase() === 'admin@salon.com' ? 'admin' : 'staff', // Admin role for admin@salon.com
      hasLoginAccess: email && email.toLowerCase() === 'admin@salon.com' ? true : hasLoginAccess, // Admin always has login access
      allowAppointmentScheduling: email && email.toLowerCase() === 'admin@salon.com' ? true : allowAppointmentScheduling, // Admin always has appointment access
      isActive: true, // Default to active
      permissions: email && email.toLowerCase() === 'admin@salon.com' ? [
        // Admin gets all permissions
        { module: 'dashboard', feature: 'view', enabled: true },
        { module: 'dashboard', feature: 'edit', enabled: true },
        { module: 'appointments', feature: 'view', enabled: true },
        { module: 'appointments', feature: 'create', enabled: true },
        { module: 'appointments', feature: 'edit', enabled: true },
        { module: 'appointments', feature: 'delete', enabled: true },
        { module: 'customers', feature: 'view', enabled: true },
        { module: 'customers', feature: 'create', enabled: true },
        { module: 'customers', feature: 'edit', enabled: true },
        { module: 'customers', feature: 'delete', enabled: true },
        { module: 'services', feature: 'view', enabled: true },
        { module: 'services', feature: 'create', enabled: true },
        { module: 'services', feature: 'edit', enabled: true },
        { module: 'services', feature: 'delete', enabled: true },
        { module: 'products', feature: 'view', enabled: true },
        { module: 'products', feature: 'create', enabled: true },
        { module: 'products', feature: 'edit', enabled: true },
        { module: 'products', feature: 'delete', enabled: true },
        { module: 'staff', feature: 'view', enabled: true },
        { module: 'staff', feature: 'create', enabled: true },
        { module: 'staff', feature: 'edit', enabled: true },
        { module: 'staff', feature: 'delete', enabled: true },
        { module: 'sales', feature: 'view', enabled: true },
        { module: 'sales', feature: 'create', enabled: true },
        { module: 'sales', feature: 'edit', enabled: true },
        { module: 'sales', feature: 'delete', enabled: true },
        { module: 'reports', feature: 'view', enabled: true },
        { module: 'settings', feature: 'view', enabled: true },
        { module: 'settings', feature: 'edit', enabled: true },
      ] : [], // Empty permissions for staff
      specialties: [], // Empty specialties
      hourlyRate: 0, // Default hourly rate
      commissionRate: 0, // Default commission rate
      notes: '', // Empty notes
      commissionProfileIds: commissionProfileIds, // Commission profile IDs
    };

    // Only add password if provided
    if (password) {
      const hashedPassword = await hashPassword(password);
      userData.password = hashedPassword;
    }

    const user = new User(userData);
    await user.save();

    const { password: _, ...userWithoutPassword } = user.toObject();

    res.status(201).json({
      success: true,
      data: userWithoutPassword
    });
  } catch (error) {
    logger.error('Create user error: %s', error.message, { stack: error.stack, name: error.name });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.get('/api/users/:id', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    const { User } = req.mainModels;
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.put(
  '/api/users/:id',
  authenticateToken,
  setupMainDatabase,
  validateAll(
    [
      { schema: mongoIdParamSchema, source: 'params' },
      { schema: updateUserBodySchema, source: 'body' },
    ]
  ),
  async (req, res) => {
  try {
    const { User } = req.mainModels;
    const {
      firstName,
      lastName,
      email,
      password,
      mobile,
      hasLoginAccess,
      allowAppointmentScheduling,
      commissionProfileIds,
      avatar,
    } = req.body;

    // Check if user is updating their own profile or is admin
    const isAdmin = req.user.role === 'admin';
    const isOwnProfile = req.user.id === req.params.id || req.user._id === req.params.id;
    
    if (!isAdmin && !isOwnProfile) {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own profile'
      });
    }

    // Validate required fields
    if (!firstName || firstName.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'First name is required'
      });
    }

    if (!mobile || mobile.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Mobile number is required'
      });
    }

    // Get the existing user to check current state
    const existingUser = await User.findById(req.params.id);
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if email already exists (only if email is provided and different from current)
    if (email && email.trim() !== '' && email.toLowerCase() !== existingUser.email) {
      const existingUserWithEmail = await User.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: req.params.id }
      });
      if (existingUserWithEmail) {
        return res.status(400).json({
          success: false,
          error: 'Email already exists'
        });
      }
    }

    // Validate password requirement only if enabling login access for the first time (except for admin users)
    if (hasLoginAccess && !existingUser.hasLoginAccess && !password && existingUser.role !== 'admin') {
      return res.status(400).json({
        success: false,
        error: 'Password is required when enabling login access for the first time'
      });
    }

    // For admin users, always ensure login access is enabled
    if (existingUser.role === 'admin') {
      req.body.hasLoginAccess = true;
    }

    // Check if trying to change role to admin
    if (req.body.role === 'admin' && existingUser.role !== 'admin') {
      // Check if admin user already exists
      const existingAdmin = await User.findOne({ role: 'admin' });
      if (existingAdmin) {
        return res.status(400).json({
          success: false,
          error: 'Admin user already exists. Only one admin user is allowed in the system.'
        });
      }
    }

    const updateData = {
      firstName: firstName.trim(),
      lastName: lastName || '',
      email: email ? email.toLowerCase() : '',
      mobile: mobile.trim(),
    };

    // Only allow admins to update these fields
    if (isAdmin) {
      updateData.hasLoginAccess = hasLoginAccess;
      updateData.allowAppointmentScheduling = allowAppointmentScheduling;
      updateData.role = req.body.role;
      updateData.commissionProfileIds = commissionProfileIds || [];
    }

    // Add avatar if provided
    if (avatar) {
      updateData.avatar = avatar;
    }

    // Hash password if provided
    if (password) {
      updateData.password = await hashPassword(password);
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (
      avatar &&
      user.branchId &&
      String(existingUser.avatar || '') !== String(user.avatar || '')
    ) {
      scheduleActivityLog(
        {
          businessId: user.branchId,
          actorType: tenantActorTypeFromRole(req.user.role),
          actorId: req.user._id,
          action: ACTIVITY_ACTIONS.USER_AVATAR_UPDATED,
          entity: 'user',
          entityId: user._id,
          summary: 'Profile photo updated',
        },
        req
      );
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Update user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.delete(
  '/api/users/:id',
  authenticateToken,
  setupMainDatabase,
  requireAdmin,
  validate(mongoIdParamSchema, 'params'),
  async (req, res) => {
  try {
    const { User } = req.mainModels;
    // First check if the user exists and is admin
    const userToDelete = await User.findById(req.params.id);
    
    if (!userToDelete) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Prevent deletion of admin users
    if (userToDelete.role === 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete admin user. Admin account is protected.'
      });
    }

    const user = await User.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    logger.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get user permissions
app.get('/api/users/:id/permissions', authenticateToken, setupMainDatabase, requireAdmin, async (req, res) => {
  try {
    const { User } = req.mainModels;
    const user = await User.findById(req.params.id).select('permissions');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user.permissions
    });
  } catch (error) {
    logger.error('Get user permissions error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update user permissions
app.put('/api/users/:id/permissions', authenticateToken, setupMainDatabase, requirePermission('staff', 'manage'), async (req, res) => {
  try {
    const { permissions } = req.body;
    const { User } = req.mainModels;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { permissions },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Update user permissions error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Change user password (no current password required; admin or self can reset)
app.post(
  '/api/users/:id/change-password',
  authenticateToken,
  setupMainDatabase,
  requireAdmin,
  validateAll(
    [
      { schema: mongoIdParamSchema, source: 'params' },
      { schema: userChangePasswordBodySchema, source: 'body' },
    ]
  ),
  async (req, res) => {
  try {
    const { newPassword } = req.body;
    const { User } = req.mainModels;

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        error: 'New password is required'
      });
    }

    // Find the user
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword);

    // Update password
    await User.findByIdAndUpdate(
      req.params.id,
      { password: hashedNewPassword },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Verify admin password for editing admin details
app.post(
  '/api/users/:id/verify-admin-password',
  authenticateToken,
  setupMainDatabase,
  requireAdmin,
  validateAll(
    [
      { schema: mongoIdParamSchema, source: 'params' },
      { schema: verifyAdminPasswordBodySchema, source: 'body' },
    ]
  ),
  async (req, res) => {
  try {
    const { password } = req.body;
    const { User } = req.mainModels;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Password is required'
      });
    }

    // Find the user
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Only allow verification for admin users
    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only for admin users'
      });
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Incorrect password'
      });
    }

    res.json({
      success: true,
      message: 'Password verified successfully'
    });
  } catch (error) {
    logger.error('Admin password verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Clients routes
app.get('/api/clients', authenticateToken, requireStaff, setupBusinessDatabase, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    // Use business-specific Client model
    const { Client } = req.businessModels;

    const databaseManager = require('./config/database-manager');
    const {
      resolveOwnerShareClientsContext,
      buildClientSearchQuery,
      mergeSharedClientSearchResults,
    } = require('./lib/share-clients-across-branches');
    const mainConnection = await databaseManager.getMainConnection();
    const shareCtx = await resolveOwnerShareClientsContext(mainConnection, req.user.branchId);
    const projection = 'name phone email lastVisit totalVisits totalSpent status createdAt isWalkIn';

    // Build query for business-specific database
    let query = { isWalkIn: { $ne: true } };
    if (search) {
      query = {
        isWalkIn: { $ne: true },
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ]
      };
    }

    if (search && shareCtx?.shareClientsAcrossBranches) {
      const searchQuery = buildClientSearchQuery(String(search));
      if (searchQuery) {
        const localMatches = await Client.find({ isWalkIn: { $ne: true }, ...searchQuery })
          .select(projection)
          .sort({ createdAt: -1 })
          .limit(Math.min(limitNum * pageNum, 500))
          .lean();
        const merged = await mergeSharedClientSearchResults({
          mainConnection,
          ownerId: shareCtx.ownerId,
          currentBranchId: req.user.branchId,
          localClients: localMatches,
          query: searchQuery,
          limit: Math.min(limitNum * pageNum, 500),
          projection,
        });
        const total = merged.length;
        const start = (pageNum - 1) * limitNum;
        const pageRows = merged.slice(start, start + limitNum);
        return res.json({
          success: true,
          data: pageRows,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum)
          }
        });
      }
    }

    const totalClients = await Client.countDocuments(query);
    const clients = await Client.find(query)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: clients,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalClients,
        totalPages: Math.ceil(totalClients / limitNum)
      }
    });
  } catch (error) {
    logger.error('Error fetching clients:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.get('/api/clients/search', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Client } = req.businessModels;
    const { q } = req.query;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const projection = 'name phone email lastVisit status isWalkIn';
    const databaseManager = require('./config/database-manager');
    const {
      resolveOwnerShareClientsContext,
      buildClientSearchQuery,
      mergeSharedClientSearchResults,
    } = require('./lib/share-clients-across-branches');

    const mainConnection = await databaseManager.getMainConnection();
    const shareCtx = await resolveOwnerShareClientsContext(mainConnection, req.user.branchId);

    if (!q) {
      const clients = await Client.find({ isWalkIn: { $ne: true } })
        .select(projection)
        .sort({ lastVisit: -1, createdAt: -1 })
        .limit(limit)
        .lean();
      let merged = clients;
      const walkIn = await Client.findOne({ isWalkIn: true }).select(projection).lean();
      if (walkIn && !merged.some((c) => String(c._id) === String(walkIn._id))) {
        merged = [walkIn, ...merged];
        if (merged.length > limit) merged = merged.slice(0, limit);
      }
      return res.json({ success: true, data: merged });
    }

    if (String(q).trim().length < 2) {
      return res.json({ success: true, data: [] });
    }

    const searchQuery = buildClientSearchQuery(String(q));
    const searchResults = await Client.find({ isWalkIn: { $ne: true }, ...searchQuery })
      .select(projection)
      .sort({ lastVisit: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    let merged = searchResults;
    if (shareCtx?.shareClientsAcrossBranches && searchQuery) {
      merged = await mergeSharedClientSearchResults({
        mainConnection,
        ownerId: shareCtx.ownerId,
        currentBranchId: req.user.branchId,
        localClients: searchResults,
        query: searchQuery,
        limit,
        projection,
      });
    }

    res.json({ success: true, data: merged });
  } catch (error) {
    logger.error('Error searching clients:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post('/api/clients/ensure-shared', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const phone = String(req.body?.phone || '').trim();
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone is required' });
    }

    const databaseManager = require('./config/database-manager');
    const {
      resolveOwnerShareClientsContext,
      ensureSharedClientAtCurrentBranch,
      findClientByPhone,
    } = require('./lib/share-clients-across-branches');
    const mainConnection = await databaseManager.getMainConnection();
    const shareCtx = await resolveOwnerShareClientsContext(mainConnection, req.user.branchId);
    const { Client } = req.businessModels;

    if (!shareCtx?.shareClientsAcrossBranches) {
      const local = await findClientByPhone(Client, phone);
      if (!local) {
        return res.status(404).json({ success: false, error: 'Client not found' });
      }
      return res.json({ success: true, data: local, created: false });
    }

    const result = await ensureSharedClientAtCurrentBranch({
      mainConnection,
      ownerId: shareCtx.ownerId,
      currentBranchId: req.user.branchId,
      currentModels: req.businessModels,
      phone,
    });

    if (!result?.client) {
      return res.status(404).json({ success: false, error: 'Client not found in any branch' });
    }

    res.json({ success: true, data: result.client, created: result.created });
  } catch (error) {
    logger.error('Error ensuring shared client profile:', error);
    res.status(500).json({ success: false, error: 'Failed to import client profile' });
  }
});

app.get('/api/clients/:id', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Client } = req.businessModels;
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    res.json({
      success: true,
      data: client
    });
  } catch (error) {
    logger.error('Error fetching client:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post(
  '/api/clients',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('clients', 'create'),
  validate(createClientBodySchema),
  async (req, res) => {
  try {
    const { name, email, phone, address, notes, gender, dob } = req.body;

    if (String(phone || '').trim() === WALK_IN_PHONE) {
      return res.status(400).json({
        success: false,
        error: 'This phone value is reserved for the system Walk-in profile.'
      });
    }

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Name and phone are required'
      });
    }

    // Use business-specific Client model
    const { Client } = req.businessModels;

    // Check for duplicate phone number within the business database
    const existingClient = await Client.findOne({ phone });
    if (existingClient) {
      return res.status(400).json({
        success: false,
        error: 'Phone number already exists. Please use a different number.'
      });
    }

    const { normaliseConsentUpdate, recordConsentEvent } = require('./lib/client-consent');
    const {
      resolveCommunicationConsentForCreate,
      syncWhatsappConsentFromPromotional,
    } = require('./lib/client-communication-consent');

    const communication = resolveCommunicationConsentForCreate(req.body);
    const consentResult = syncWhatsappConsentFromPromotional(
      null,
      communication.promotionalWhatsappEnabled,
      { actorType: 'staff', actorId: req.user._id }
    );

    const { parseClientDobInput } = require('./lib/parse-client-dob');
    const parsedDob = parseClientDobInput(dob);

    const newClient = new Client({
      name,
      email,
      phone,
      address,
      notes,
      gender: gender || undefined,
      dob: parsedDob,
      status: 'active',
      totalVisits: 0,
      totalSpent: 0,
      branchId: req.user.branchId,
      ...communication,
      whatsappConsent: consentResult.next || undefined,
    });

    const savedClient = await newClient.save();

    if (consentResult.changed && consentResult.event) {
      recordConsentEvent({
        tenantConnection: req.businessConnection,
        branchId: req.user.branchId,
        clientId: savedClient._id,
        channel: 'whatsapp',
        event: consentResult.event,
        source: consentResult.next?.source || 'staff',
        actorType: 'staff',
        actorId: req.user._id,
        reason:
          consentResult.event === 'opt_in'
            ? consentResult.next?.optInReason
            : consentResult.next?.optOutReason,
      }).catch((err) => logger.warn('Consent event log failed:', err?.message));
    }

    try {
      await assignUniversalMembershipToNewClient(req.businessModels, req.user.branchId, savedClient._id, savedClient);
    } catch (uniMemErr) {
      logger.error('[Membership] Universal assign on client create failed:', uniMemErr);
    }

    scheduleActivityLog(
      {
        businessId: req.user.branchId,
        actorType: tenantActorTypeFromRole(req.user.role),
        actorId: req.user._id,
        action: ACTIVITY_ACTIONS.CREATE_CUSTOMER,
        entity: 'customer',
        entityId: savedClient._id,
        summary: `Customer "${savedClient.name}" created`,
      },
      req
    );

    res.status(201).json({
      success: true,
      data: savedClient
    });
  } catch (error) {
    logger.error('Error creating client:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.put(
  '/api/clients/:id',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('clients', 'edit'),
  validateAll(
    [
      { schema: mongoIdParamSchema, source: 'params' },
      { schema: updateClientBodySchema, source: 'body' },
    ]
  ),
  async (req, res) => {
  try {
    const { Client } = req.businessModels;
    const { phone } = req.body;

    const existingDoc = await Client.findById(req.params.id)
      .select('isWalkIn phone whatsappConsent promotionalWhatsappEnabled transactionalWhatsappEnabled transactionalSmsEnabled')
      .lean();
    if (!existingDoc) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    if (existingDoc.isWalkIn) {
      return res.status(403).json({
        success: false,
        error: 'The Walk-in customer profile cannot be edited.'
      });
    }

    if (phone !== undefined && String(phone || '').trim() === WALK_IN_PHONE && !existingDoc.isWalkIn) {
      return res.status(400).json({
        success: false,
        error: 'This phone value is reserved for the system Walk-in profile.'
      });
    }
    // If phone number is being updated, check for duplicates
    if (phone) {
      const existingClient = await Client.findOne({ 
        phone, 
        _id: { $ne: req.params.id } // Exclude current client
      });
      if (existingClient) {
        return res.status(400).json({
          success: false,
          error: 'Phone number already exists. Please use a different number.'
        });
      }
    }

    const { normaliseConsentUpdate, recordConsentEvent } = require('./lib/client-consent');
    const {
      resolveCommunicationConsentForUpdate,
      syncWhatsappConsentFromPromotional,
    } = require('./lib/client-communication-consent');

    const communication = resolveCommunicationConsentForUpdate(req.body, existingDoc);
    const updatePayload = { ...req.body };
    delete updatePayload.whatsappConsent;

    updatePayload.promotionalWhatsappEnabled = communication.promotionalWhatsappEnabled;
    updatePayload.transactionalWhatsappEnabled = communication.transactionalWhatsappEnabled;
    updatePayload.transactionalSmsEnabled = communication.transactionalSmsEnabled;

    if (Object.prototype.hasOwnProperty.call(req.body, 'dob')) {
      const { parseClientDobInput } = require('./lib/parse-client-dob');
      updatePayload.dob = parseClientDobInput(req.body.dob) ?? null;
    }

    let consentResult = null;
    const previousPromo =
      existingDoc.promotionalWhatsappEnabled !== undefined
        ? existingDoc.promotionalWhatsappEnabled !== false
        : existingDoc.whatsappConsent?.waMarketingOptOut
          ? false
          : existingDoc.whatsappConsent?.optedIn !== false;

    if (
      communication.promotionalWhatsappEnabled !== previousPromo ||
      req.body.promotionalWhatsappEnabled !== undefined
    ) {
      consentResult = syncWhatsappConsentFromPromotional(
        existingDoc.whatsappConsent,
        communication.promotionalWhatsappEnabled,
        { actorType: 'staff', actorId: req.user._id }
      );
      updatePayload.whatsappConsent = consentResult.next;
    }

    const updatedClient = await Client.findByIdAndUpdate(
      req.params.id,
      updatePayload,
      { new: true, runValidators: true }
    );

    if (!updatedClient) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    if (consentResult && consentResult.changed && consentResult.event) {
      recordConsentEvent({
        tenantConnection: req.businessConnection,
        branchId: req.user.branchId,
        clientId: updatedClient._id,
        channel: 'whatsapp',
        event: consentResult.event,
        source: consentResult.next?.source || 'staff',
        actorType: 'staff',
        actorId: req.user._id,
        reason:
          consentResult.event === 'opt_in'
            ? consentResult.next?.optInReason
            : consentResult.next?.optOutReason,
      }).catch((err) => logger.warn('Consent event log failed:', err?.message));
    }

    scheduleActivityLog(
      {
        businessId: req.user.branchId,
        actorType: tenantActorTypeFromRole(req.user.role),
        actorId: req.user._id,
        action: ACTIVITY_ACTIONS.UPDATE_CUSTOMER,
        entity: 'customer',
        entityId: updatedClient._id,
        summary: `Customer "${updatedClient.name}" updated`,
      },
      req
    );

    res.json({
      success: true,
      data: updatedClient
    });
  } catch (error) {
    logger.error('Error updating client:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.delete(
  '/api/clients/:id',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('clients', 'delete'),
  validate(mongoIdParamSchema, 'params'),
  async (req, res) => {
  try {
    const { Client } = req.businessModels;
    const target = await Client.findById(req.params.id).select('isWalkIn name').lean();
    if (!target) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }
    if (target.isWalkIn) {
      return res.status(403).json({
        success: false,
        error: 'The Walk-in customer profile cannot be deleted.'
      });
    }
    const deletedClient = await Client.findByIdAndDelete(req.params.id);
    
    if (!deletedClient) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    scheduleActivityLog(
      {
        businessId: req.user.branchId,
        actorType: tenantActorTypeFromRole(req.user.role),
        actorId: req.user._id,
        action: ACTIVITY_ACTIONS.DELETE_CUSTOMER,
        entity: 'customer',
        entityId: deletedClient._id,
        summary: `Customer "${deletedClient.name}" deleted`,
      },
      req
    );

    res.json({
      success: true,
      message: 'Client deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting client:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get client statistics (O(1) database queries)
app.get('/api/clients/stats', authenticateToken, requireStaff, setupBusinessDatabase, async (req, res) => {
  try {
    logger.debug('Client stats endpoint called by user=%s branchId=%s', req.user?.email, req.user?.branchId);
    
    if (!req.businessModels) {
      logger.error('req.businessModels not found');
      return res.status(500).json({
        success: false,
        error: 'Business models not initialized'
      });
    }
    
    const { Client } = req.businessModels;
    
    if (!Client) {
      logger.error('Client model not found in req.businessModels. Available models: %s', Object.keys(req.businessModels || {}));
      return res.status(500).json({
        success: false,
        error: 'Client model not available'
      });
    }
    
    logger.debug('Client model found');
    
    // Calculate date 3 months ago from current date
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(now.getMonth() - 3);
    
    logger.debug('Date threshold (3 months ago): %s', threeMonthsAgo.toISOString());
    
    // Total Customers: Count all clients (simple O(1) query)
    logger.debug('Counting total customers...');
    let totalCustomers = 0;
    try {
      totalCustomers = await Client.countDocuments({}) || 0;
      logger.debug('Total customers: %d', totalCustomers);
    } catch (countError) {
      logger.error('Error counting customers:', countError);
      throw countError;
    }
    
    // Count active clients via aggregation instead of loading every document
    const [activeAgg] = await Client.aggregate([
      { $match: { lastVisit: { $gte: threeMonthsAgo } } },
      { $count: 'active' },
    ]);
    const activeCustomers = activeAgg ? activeAgg.active : 0;
    const inactiveCustomers = Math.max(0, totalCustomers - activeCustomers);
    
    const result = {
      totalCustomers: Number(totalCustomers) || 0,
      activeCustomers: Number(activeCustomers) || 0,
      inactiveCustomers: Number(inactiveCustomers) || 0
    };
    
    logger.debug('Final client stats: %o', result);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error fetching client stats: %s', error.message, { stack: error.stack, name: error.name });
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message || 'Unknown error'
    });
  }
});

// Import clients from Excel/CSV
app.post('/api/clients/import', authenticateToken, setupBusinessDatabase, requirePermission('clients', 'create'), async (req, res) => {
  try {
    const { Client } = req.businessModels;
    const { clients, mapping, updateExisting } = req.body;

    if (!clients || !Array.isArray(clients) || clients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No clients data provided'
      });
    }

    if (!mapping || typeof mapping !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Column mapping is required'
      });
    }

    logger.debug('Processing %d clients for import (updateExisting=%s)', clients.length, updateExisting ? 'YES' : 'NO');
    
    // Count existing clients in database for reference
    const existingCount = await Client.countDocuments({});
    logger.debug('Current clients in database: %d', existingCount);
    
    // Build a phone number lookup map for efficient duplicate detection
    // This avoids querying the database for every row
    const phoneLookupMap = new Map(); // last10 -> client _id
    if (existingCount > 0) {
      logger.debug('Building phone number lookup map...');
      const allClients = await Client.find({ 
        phone: { $exists: true, $ne: null, $ne: '' } 
      }).select('phone _id').lean();
      
      for (const client of allClients) {
        const clientPhone = String(client.phone || '').replace(/\D/g, ''); // Remove all non-digits
        const clientLast10 = clientPhone.slice(-10);
        if (clientLast10.length === 10) {
          // Store both the normalized phone and last10 for lookup
          phoneLookupMap.set(clientPhone, client._id);
          phoneLookupMap.set(clientLast10, client._id);
          // Also store with original phone format for exact match
          phoneLookupMap.set(String(client.phone), client._id);
        }
      }
      logger.debug('Built lookup map with %d phone number entries', phoneLookupMap.size);
    }

    // Robust Excel date parser: supports numbers (Excel serial), and common string formats
    const parseExcelDate = (input) => {
      if (!input && input !== 0) return undefined
      // If number: treat as Excel serial date (days since 1899-12-30)
      if (typeof input === 'number') {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30))
        const ms = input * 24 * 60 * 60 * 1000
        const d = new Date(excelEpoch.getTime() + ms)
        return isNaN(d.getTime()) ? undefined : d
      }
      // Trim string
      const str = String(input).trim()
      if (!str) return undefined
      // Handle dd/mm/yyyy or dd-mm-yyyy
      const dmY = str.match(/^([0-3]?\d)[\/-]([0-1]?\d)[\/-](\d{2,4})$/)
      if (dmY) {
        let [ , dd, mm, yyyy ] = dmY
        if (yyyy.length === 2) yyyy = String(2000 + parseInt(yyyy, 10))
        const iso = `${yyyy.padStart(4,'0')}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`
        const d = new Date(iso)
        return isNaN(d.getTime()) ? undefined : d
      }
      // Handle yyyy-mm-dd or yyyy/mm/dd
      const yMd = str.match(/^(\d{4})[\/-]([0-1]?\d)[\/-]([0-3]?\d)$/)
      if (yMd) {
        const iso = `${yMd[1]}-${String(yMd[2]).padStart(2,'0')}-${String(yMd[3]).padStart(2,'0')}`
        const d = new Date(iso)
        return isNaN(d.getTime()) ? undefined : d
      }
      // Fallback to Date.parse
      const parsed = new Date(str)
      return isNaN(parsed.getTime()) ? undefined : parsed
    }

    const results = {
      success: [],
      errors: [],
      skipped: [],
      created: 0,  // Track actual new clients created
      updated: 0   // Track existing clients updated
    };

    // Track phone numbers seen in this import batch to detect duplicates within the file
    const seenPhonesInBatch = new Map(); // phone -> first row number where it appeared

    // Process each client
    for (let i = 0; i < clients.length; i++) {
      const clientData = clients[i];
      const rowNumber = (clientData._rowIndex || i + 1) + 1; // Excel row number (accounting for header)

      try {
        // Map the data according to the mapping
        const mappedData = {};
        Object.keys(mapping).forEach(excelColumn => {
          const clientField = mapping[excelColumn];
          if (clientField && clientField !== 'none') {
            mappedData[clientField] = clientData[excelColumn];
          }
        });

        // Validate required fields (if updating existing, only phone is mandatory)
        if ((!mappedData.name && !updateExisting) || !mappedData.phone) {
          results.errors.push({
            row: rowNumber,
            error: 'Name and phone are required',
            data: mappedData
          });
          continue;
        }

        // Normalize name and phone for duplicate check
        const normalizedName = String(mappedData.name).trim();
        const normalizedPhone = String(mappedData.phone).trim().replace(/\D/g, ''); // Remove non-digits

        if (!normalizedPhone || normalizedPhone.length < 10) {
          results.errors.push({
            row: rowNumber,
            error: 'Phone number must be at least 10 digits',
            data: mappedData
          });
          continue;
        }

        // Check for duplicate phone number within this import batch
        const last10 = normalizedPhone.slice(-10);
        if (seenPhonesInBatch.has(last10)) {
          const firstRow = seenPhonesInBatch.get(last10);
          results.skipped.push({
            row: rowNumber,
            reason: `Duplicate phone number in import file (first seen at row ${firstRow})`,
            data: mappedData
          });
          continue;
        }
        seenPhonesInBatch.set(last10, rowNumber);

        // Check if client already exists using the pre-built lookup map
        // This is much more efficient than querying the database for each row
        let existingClientId = null;
        
        // Try multiple lookup strategies using the map
        if (phoneLookupMap.has(normalizedPhone)) {
          existingClientId = phoneLookupMap.get(normalizedPhone);
        } else if (last10 && phoneLookupMap.has(last10)) {
          existingClientId = phoneLookupMap.get(last10);
        }
        
        // If found in map, fetch the full client document
        let existingClient = null;
        if (existingClientId) {
          existingClient = await Client.findById(existingClientId);
        }
        
        // Fallback: If not found in map, try database queries (for edge cases)
        // This handles cases where phone format changed or wasn't in the initial fetch
        if (!existingClient && last10) {
          // Try regex match as fallback
          existingClient = await Client.findOne({ phone: { $regex: new RegExp(`${last10}$`) } })
        }
        
        // Log for debugging (only log first few to avoid spam)
        if (existingClient && (results.success.length + results.skipped.length) < 5) {
          logger.debug('Found existing client for phone %s (last10: %s): %s (ID: %s)', normalizedPhone, last10, existingClient.name, existingClient._id)
        }

        if (existingClient) {
          if (updateExisting) {
            // Prepare fields to update: only those provided and mapped
            const updateDoc = {};
            if (mappedData.lastVisit) {
            const lv = parseExcelDate(mappedData.lastVisit);
              if (lv) updateDoc.lastVisit = lv;
            }
            if (mappedData.totalSpent !== undefined && mappedData.totalSpent !== null && mappedData.totalSpent !== '') {
              const ts = parseFloat(mappedData.totalSpent);
              if (!isNaN(ts)) updateDoc.totalSpent = ts;
            }
            if (mappedData.visits !== undefined && mappedData.visits !== null && mappedData.visits !== '') {
              const vs = parseInt(mappedData.visits);
              if (!isNaN(vs)) updateDoc.totalVisits = vs;
            }
            if (mappedData.dob) {
            const d = parseExcelDate(mappedData.dob);
              if (d) updateDoc.dob = d;
            }
            if (mappedData.gender) {
              const g = String(mappedData.gender).toLowerCase().trim();
              if (['male','female','other'].includes(g)) updateDoc.gender = g;
            }
            if (mappedData.email) updateDoc.email = String(mappedData.email).trim().toLowerCase();

            if (Object.keys(updateDoc).length === 0) {
              results.skipped.push({ row: rowNumber, reason: 'No updatable fields provided', data: mappedData });
              continue;
            }

            const updated = await Client.findByIdAndUpdate(existingClient._id, updateDoc, { new: true });
            results.success.push({ row: rowNumber, data: { id: updated._id, name: updated.name, phone: updated.phone }, updated: true });
            results.updated++;
            continue;
          } else {
            results.skipped.push({
              row: rowNumber,
              reason: 'Client with this phone number already exists',
              data: mappedData
            });
            continue;
          }
        }

        // Prepare client data
        const clientToCreate = {
          name: normalizedName,
          phone: normalizedPhone,
          email: mappedData.email ? String(mappedData.email).trim().toLowerCase() : undefined,
          gender: mappedData.gender ? String(mappedData.gender).toLowerCase().trim() : undefined,
          totalVisits: mappedData.visits ? parseInt(mappedData.visits) || 0 : 0,
          totalSpent: mappedData.totalSpent ? parseFloat(mappedData.totalSpent) || 0 : 0,
          status: 'active',
          branchId: req.user.branchId,
          promotionalWhatsappEnabled: true,
          transactionalWhatsappEnabled: true,
          transactionalSmsEnabled: true,
          whatsappConsent: require('./lib/client-consent').defaultWhatsappConsentForNewClient('import'),
        };

        // Parse date of birth
        if (mappedData.dob) {
          const dobDate = parseExcelDate(mappedData.dob);
          if (dobDate) clientToCreate.dob = dobDate;
        }

        // Parse last visit date
        if (mappedData.lastVisit) {
          const lastVisitDate = parseExcelDate(mappedData.lastVisit);
          if (lastVisitDate) clientToCreate.lastVisit = lastVisitDate;
        }

        // Validate gender if provided
        if (clientToCreate.gender && !['male', 'female', 'other'].includes(clientToCreate.gender)) {
          clientToCreate.gender = undefined; // Invalid gender, skip it
        }

        // Create new client
        const newClient = new Client(clientToCreate);
        const savedClient = await newClient.save();

        results.success.push({
          row: rowNumber,
          data: {
            id: savedClient._id,
            name: savedClient.name,
            phone: savedClient.phone
          },
          updated: false
        });
        results.created++;

      } catch (error) {
        logger.error('Error processing client row %d:', rowNumber, error);
        results.errors.push({
          row: rowNumber,
          error: error.message || 'Failed to create client',
          data: clientData
        });
      }
    }

    if (results.created > 0) {
      try {
        const { MembershipPlan } = req.businessModels;
        const uni = await MembershipPlan.findOne({
          branchId: req.user.branchId,
          isActive: true,
          appliesToAllClients: true,
        }).lean();
        if (uni) {
          const backfill = await ensureAllClientsSubscribedToUniversalPlan(req.businessModels, req.user.branchId, uni);
          if (backfill.created > 0) {
            logger.info(`[Membership] After client import: created ${backfill.created} universal subscription(s)`);
          }
        }
      } catch (impUniErr) {
        logger.error('[Membership] Universal backfill after client import failed:', impUniErr);
      }
    }

    const finalCount = await Client.countDocuments({});
    logger.info('Import completed - Success: %d (%d created, %d updated), Errors: %d, Skipped: %d, Final DB count: %d',
      results.success.length, results.created, results.updated, results.errors.length, results.skipped.length, finalCount);

    res.json({
      success: true,
      data: {
        totalProcessed: clients.length,
        successful: results.success.length,
        created: results.created,
        updated: results.updated,
        errors: results.errors.length,
        skipped: results.skipped.length,
        results: {
          success: results.success,
          errors: results.errors,
          skipped: results.skipped
        }
      }
    });

  } catch (error) {
    logger.error('Error importing clients:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during import'
    });
  }
});

// ============================================
// LEAD MANAGEMENT ROUTES
// ============================================

// Get all leads with filters
app.get('/api/leads', authenticateToken, setupBusinessDatabase, checkPermission('lead_management', 'view'), LEAD_MANAGEMENT, async (req, res) => {
  try {
    const { Lead } = req.businessModels;
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      status, 
      assignedStaffId, 
      source,
      startDate,
      endDate
    } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let query = { branchId: req.user.branchId };

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status) {
      query.status = status;
    }

    // Assigned staff filter
    if (assignedStaffId) {
      query.assignedStaffId = assignedStaffId;
    }

    // Source filter
    if (source) {
      query.source = source;
    }

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const leads = await Lead.find(query)
      .populate('assignedStaffId', 'name')
      .populate('interestedServices.serviceId', 'name price')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Lead.countDocuments(query);

    res.json({
      success: true,
      data: leads,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    logger.error('Error fetching leads:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get single lead by ID
app.get('/api/leads/:id', authenticateToken, setupBusinessDatabase, checkPermission('lead_management', 'view'), LEAD_MANAGEMENT, async (req, res) => {
  try {
    const { Lead } = req.businessModels;
    const lead = await Lead.findOne({ 
      _id: req.params.id, 
      branchId: req.user.branchId 
    })
      .populate('assignedStaffId', 'name')
      .populate('interestedServices.serviceId', 'name price duration')
      .populate('convertedToAppointmentId', 'date time status')
      .populate('convertedToClientId', 'name phone');

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    res.json({
      success: true,
      data: lead
    });
  } catch (error) {
    logger.error('Error fetching lead:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get lead activities
app.get('/api/leads/:id/activities', authenticateToken, setupBusinessDatabase, checkPermission('lead_management', 'view'), LEAD_MANAGEMENT, async (req, res) => {
  try {
    const { Lead, LeadActivity } = req.businessModels;
    
    // Verify lead exists and belongs to user's branch
    const lead = await Lead.findOne({ 
      _id: req.params.id, 
      branchId: req.user.branchId 
    });

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    // Fetch all activities for this lead, sorted by creation date (newest first)
    // Convert string ID to ObjectId to ensure proper matching
    const leadObjectId = new mongoose.Types.ObjectId(req.params.id);
    
    // Note: We don't populate 'performedBy' because User model is in main DB, not business DB
    // We already have 'performedByName' stored in the activity document
    const activities = await LeadActivity.find({ 
      leadId: leadObjectId,
      branchId: req.user.branchId
    })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: activities
    });
  } catch (error) {
    logger.error('Error fetching lead activities:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Create new lead
app.post('/api/leads', authenticateToken, setupBusinessDatabase, checkPermission('lead_management', 'create'), LEAD_MANAGEMENT, async (req, res) => {
  try {
    const { Lead } = req.businessModels;
    const { 
      name, 
      phone, 
      email, 
      source = 'walk-in', 
      status = 'new',
      interestedServices,
      assignedStaffId,
      followUpDate,
      notes
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Name and phone are required'
      });
    }

    // Format interested services (allow custom services without serviceId)
    const formattedServices = interestedServices?.map(service => ({
      serviceId: service.serviceId && service.serviceId !== 'null' && service.serviceId !== 'none' 
        ? service.serviceId 
        : null,
      serviceName: service.serviceName || service.name
    })) || [];

    const newLead = new Lead({
      name,
      phone,
      email,
      source,
      status,
      interestedServices: formattedServices,
      assignedStaffId,
      followUpDate: followUpDate ? new Date(followUpDate) : undefined,
      notes,
      branchId: req.user.branchId
    });

    const savedLead = await newLead.save();
    const populatedLead = await Lead.findById(savedLead._id)
      .populate('assignedStaffId', 'name')
      .populate('interestedServices.serviceId', 'name price');

    // Log creation activity and any initial values
    try {
      const { LeadActivity } = req.businessModels;
      const activities = [];

      // Log creation
      activities.push({
        leadId: savedLead._id,
        activityType: 'created',
        performedBy: req.user.userId,
        performedByName: req.user.name || req.user.email || 'System',
        newValue: {
          name: savedLead.name,
          phone: savedLead.phone,
          source: savedLead.source,
          status: savedLead.status,
          notes: savedLead.notes || null // Include notes in created activity
        },
        description: `Lead created from ${source}`,
        branchId: req.user.branchId
      });

      // Log follow-up date if set during creation
      if (savedLead.followUpDate) {
        activities.push({
          leadId: savedLead._id,
          activityType: 'follow_up_scheduled',
          performedBy: req.user.id || req.user.userId || req.user._id,
          performedByName: req.user.name || req.user.email || 'System',
          newValue: savedLead.followUpDate,
          field: 'followUpDate',
          description: `Follow-up scheduled for ${new Date(savedLead.followUpDate).toLocaleDateString()}`,
          branchId: req.user.branchId
        });
      }

      // Log status if not 'new'
      if (savedLead.status && savedLead.status !== 'new') {
        activities.push({
          leadId: savedLead._id,
          activityType: 'status_changed',
          performedBy: req.user.id || req.user.userId || req.user._id,
          performedByName: req.user.name || req.user.email || 'System',
          previousValue: 'new',
          newValue: savedLead.status,
          field: 'status',
          description: `Status set to ${savedLead.status}`,
          branchId: req.user.branchId
        });
      }

      // Log staff assignment if set during creation
      if (savedLead.assignedStaffId) {
        activities.push({
          leadId: savedLead._id,
          activityType: 'staff_assigned',
          performedBy: req.user.id || req.user.userId || req.user._id,
          performedByName: req.user.name || req.user.email || 'System',
          newValue: savedLead.assignedStaffId,
          field: 'assignedStaffId',
          description: 'Staff assigned',
          branchId: req.user.branchId
        });
      }

      // Log notes if set during creation
      if (savedLead.notes && savedLead.notes.trim()) {
        activities.push({
          leadId: savedLead._id,
          activityType: 'notes_updated',
          performedBy: req.user.id || req.user.userId || req.user._id,
          performedByName: req.user.name || req.user.email || 'System',
          newValue: savedLead.notes,
          field: 'notes',
          description: 'Notes added',
          branchId: req.user.branchId
        });
      }

      // Insert all activities
      if (activities.length > 0) {
        await LeadActivity.insertMany(activities);
      }
    } catch (activityError) {
      logger.error('Error logging lead creation activities:', activityError);
      // Don't fail the request if activity logging fails
    }

    res.status(201).json({
      success: true,
      data: populatedLead
    });
  } catch (error) {
    logger.error('Error creating lead:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Update lead
app.put('/api/leads/:id', authenticateToken, setupBusinessDatabase, checkPermission('lead_management', 'edit'), LEAD_MANAGEMENT, async (req, res) => {
  try {
    const { Lead } = req.businessModels;
    const { 
      name, 
      phone, 
      email, 
      source, 
      status,
      interestedServices,
      assignedStaffId,
      followUpDate,
      notes
    } = req.body;

    const lead = await Lead.findOne({ 
      _id: req.params.id, 
      branchId: req.user.branchId 
    });

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    const { LeadActivity } = req.businessModels;
    const activities = [];

    // Track changes and log activities
    // Snapshot of notes sent with this request — timeline cards use this so each "Add Status" row
    // shows the note entered for that event (lead.notes alone only keeps the latest string).
    const statusActivityDetails =
      notes !== undefined
        ? { statusNoteSnapshot: String(notes) }
        : {};

    // Always create a status activity if status is provided (for "Add Status" functionality)
    // This ensures we preserve history even if status value doesn't change
    if (status !== undefined) {
      if (lead.status !== status) {
        // Status actually changed
        activities.push({
          leadId: lead._id,
          activityType: 'status_changed',
          performedBy: req.user.id || req.user.userId || req.user._id,
          performedByName: req.user.name || req.user.email || 'System',
          previousValue: lead.status,
          newValue: status,
          field: 'status',
          description: `Status changed from ${lead.status} to ${status}`,
          details: statusActivityDetails,
          branchId: req.user.branchId
        });
        lead.status = status;
      } else {
        // Status is the same, but we still want to record this as a status update activity
        // This happens when user clicks "Add Status" with the same status value
        activities.push({
          leadId: lead._id,
          activityType: 'status_changed',
          performedBy: req.user.id || req.user.userId || req.user._id,
          performedByName: req.user.name || req.user.email || 'System',
          previousValue: lead.status,
          newValue: status,
          field: 'status',
          description: `Status confirmed: ${status}`,
          details: statusActivityDetails,
          branchId: req.user.branchId
        });
        // Don't update lead.status since it's the same, but we still log the activity
      }
    }

    if (assignedStaffId !== undefined && String(lead.assignedStaffId) !== String(assignedStaffId)) {
      const activityType = lead.assignedStaffId ? 'staff_changed' : 'staff_assigned';
      activities.push({
        leadId: lead._id,
        activityType: activityType,
        performedBy: req.user.userId,
        performedByName: req.user.name || req.user.email || 'System',
        previousValue: lead.assignedStaffId,
        newValue: assignedStaffId,
        field: 'assignedStaffId',
        description: assignedStaffId 
          ? `Staff ${activityType === 'staff_changed' ? 'changed' : 'assigned'}`
          : 'Staff assignment removed',
        branchId: req.user.branchId
      });
      lead.assignedStaffId = assignedStaffId;
    }

    if (followUpDate !== undefined) {
      const oldDate = lead.followUpDate ? lead.followUpDate.toISOString() : null;
      const newDate = followUpDate ? new Date(followUpDate).toISOString() : null;
      if (oldDate !== newDate) {
        const activityType = lead.followUpDate ? 'follow_up_updated' : 'follow_up_scheduled';
        activities.push({
          leadId: lead._id,
          activityType: activityType,
          performedBy: req.user.id || req.user.userId || req.user._id,
          performedByName: req.user.name || req.user.email || 'System',
          previousValue: lead.followUpDate,
          newValue: followUpDate ? new Date(followUpDate) : null,
          field: 'followUpDate',
          description: followUpDate 
            ? `Follow-up ${activityType === 'follow_up_updated' ? 'updated' : 'scheduled'} for ${new Date(followUpDate).toLocaleDateString()}`
            : 'Follow-up date removed',
          branchId: req.user.branchId
        });
        lead.followUpDate = followUpDate ? new Date(followUpDate) : null;
      }
    }

    // Always create a notes activity if notes are provided (for "Add Status" functionality)
    // This ensures we preserve history even if notes value doesn't change
    if (notes !== undefined) {
      if (lead.notes !== notes) {
        // Notes actually changed
        activities.push({
          leadId: lead._id,
          activityType: 'notes_updated',
          performedBy: req.user.id || req.user.userId || req.user._id,
          performedByName: req.user.name || req.user.email || 'System',
          previousValue: lead.notes,
          newValue: notes,
          field: 'notes',
          description: notes ? 'Notes updated' : 'Notes cleared',
          details: { notesLength: notes?.length || 0 },
          branchId: req.user.branchId
        });
        lead.notes = notes;
      } else if (notes && notes.trim()) {
        // Notes are the same but not empty - still record as an activity
        // This happens when user clicks "Add Status" with the same notes
        activities.push({
          leadId: lead._id,
          activityType: 'notes_updated',
          performedBy: req.user.id || req.user.userId || req.user._id,
          performedByName: req.user.name || req.user.email || 'System',
          previousValue: lead.notes,
          newValue: notes,
          field: 'notes',
          description: 'Notes confirmed',
          details: { notesLength: notes?.length || 0 },
          branchId: req.user.branchId
        });
        // Don't update lead.notes since it's the same, but we still log the activity
      }
    }

    // Update other fields
    if (name) lead.name = name;
    if (phone) lead.phone = phone;
    if (email !== undefined) lead.email = email;
    if (source) lead.source = source;

    // Update interested services (allow custom services without serviceId)
    if (interestedServices !== undefined) {
      lead.interestedServices = interestedServices.map(service => ({
        serviceId: service.serviceId && service.serviceId !== 'null' && service.serviceId !== 'none'
          ? service.serviceId
          : null,
        serviceName: service.serviceName || service.name
      }));
    }

    const updatedLead = await lead.save();

    // Log all activities
    if (activities.length > 0) {
      try {
        await LeadActivity.insertMany(activities);
      } catch (activityError) {
        logger.error('Error logging lead activities:', activityError);
        // Don't fail the request if activity logging fails
      }
    }
    const populatedLead = await Lead.findById(updatedLead._id)
      .populate('assignedStaffId', 'name')
      .populate('interestedServices.serviceId', 'name price');

    res.json({
      success: true,
      data: populatedLead
    });
  } catch (error) {
    logger.error('Error updating lead:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Update lead status
app.patch('/api/leads/:id/status', authenticateToken, setupBusinessDatabase, checkPermission('lead_management', 'edit'), LEAD_MANAGEMENT, async (req, res) => {
  try {
    const { Lead } = req.businessModels;
    const { status } = req.body;

    if (!status || !['new', 'follow-up', 'converted', 'lost'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Valid status is required'
      });
    }

    const lead = await Lead.findOne({ 
      _id: req.params.id, 
      branchId: req.user.branchId 
    });

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    const oldStatus = lead.status;
    lead.status = status;
    const updatedLead = await lead.save();

    // Log status change activity
    try {
      const { LeadActivity } = req.businessModels;
      await LeadActivity.create({
        leadId: lead._id,
        activityType: 'status_changed',
        performedBy: req.user.userId,
        performedByName: req.user.name || req.user.email || 'System',
        previousValue: oldStatus,
        newValue: status,
        field: 'status',
        description: `Status changed from ${oldStatus} to ${status}`,
        branchId: req.user.branchId
      });
    } catch (activityError) {
      logger.error('Error logging lead status change activity:', activityError);
      // Don't fail the request if activity logging fails
    }

    res.json({
      success: true,
      data: updatedLead
    });
  } catch (error) {
    logger.error('Error updating lead status:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Convert lead to appointment
app.post('/api/leads/:id/convert-to-appointment', authenticateToken, setupBusinessDatabase, checkPermission('lead_management', 'edit'), LEAD_MANAGEMENT, async (req, res) => {
  try {
    const { Lead, Appointment, Client, Service } = req.businessModels;
    const { date, time, staffId, staffAssignments, notes: appointmentNotes } = req.body;

    if (!date || !time) {
      return res.status(400).json({
        success: false,
        error: 'Date and time are required'
      });
    }

    const lead = await Lead.findOne({ 
      _id: req.params.id, 
      branchId: req.user.branchId 
    }).populate('interestedServices.serviceId');

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    if (lead.status === 'converted') {
      return res.status(400).json({
        success: false,
        error: 'Lead has already been converted'
      });
    }

    // Check if client exists, create if not
    let client = await Client.findOne({ phone: lead.phone, branchId: req.user.branchId });
    
    if (!client) {
      client = new Client({
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        branchId: req.user.branchId,
        status: 'active',
        promotionalWhatsappEnabled: true,
        transactionalWhatsappEnabled: true,
        transactionalSmsEnabled: true,
        whatsappConsent: require('./lib/client-consent').defaultWhatsappConsentForNewClient('system'),
      });
      await client.save();
      try {
        await assignUniversalMembershipToNewClient(req.businessModels, req.user.branchId, client._id, client);
      } catch (uniMemErr) {
        logger.error('[Membership] Universal assign on lead convert failed:', uniMemErr);
      }
    }

    // Create appointments for interested services
    // Note: Custom services (without serviceId) will be skipped - they can be added manually later
    const createdAppointments = [];
    
    for (const interestedService of lead.interestedServices) {
      const serviceId = interestedService.serviceId?._id || interestedService.serviceId;
      
      // Skip custom services (those without a serviceId)
      if (!serviceId) {
        logger.debug('Skipping custom service "%s" - no serviceId available', interestedService.serviceName);
        continue;
      }
      
      const service = await Service.findById(serviceId);
      
      if (!service) {
        logger.debug('Service with ID %s not found, skipping', serviceId);
        continue;
      }

      const appointmentData = {
        clientId: client._id,
        serviceId: serviceId,
        date,
        time,
        duration: service.duration || 60,
        status: 'scheduled',
        notes: appointmentNotes || lead.notes || '',
        price: service.price || 0,
        branchId: req.user.branchId
      };

      // Handle staff assignments
      if (staffAssignments && Array.isArray(staffAssignments)) {
        appointmentData.staffAssignments = staffAssignments;
      } else if (staffId) {
        appointmentData.staffId = staffId;
        appointmentData.staffAssignments = [{
          staffId: staffId,
          percentage: 100,
          role: 'primary'
        }];
      } else if (lead.assignedStaffId) {
        appointmentData.staffId = lead.assignedStaffId;
        appointmentData.staffAssignments = [{
          staffId: lead.assignedStaffId,
          percentage: 100,
          role: 'primary'
        }];
      }

      const newAppointment = new Appointment(appointmentData);
      const savedAppointment = await newAppointment.save();
      const populatedAppointment = await Appointment.findById(savedAppointment._id)
        .populate('clientId', 'name phone email')
        .populate('serviceId', 'name price')
        .populate('staffId', 'name role')
        .populate('staffAssignments.staffId', 'name role');
      
      createdAppointments.push(populatedAppointment);
    }

    try {
      await sendAppointmentWhatsAppAfterCreate(req, createdAppointments);
    } catch (waErr) {
      logger.error('WhatsApp after lead convert', waErr);
    }

    // Update lead status
    lead.status = 'converted';
    lead.convertedToAppointmentId = createdAppointments[0]?._id;
    lead.convertedToClientId = client._id;
    lead.convertedAt = new Date();
    await lead.save();

    // Log conversion activity
    try {
      const { LeadActivity } = req.businessModels;
      await LeadActivity.create({
        leadId: lead._id,
        activityType: 'converted',
        performedBy: req.user.userId,
        performedByName: req.user.name || req.user.email || 'System',
        newValue: {
          appointmentIds: createdAppointments.map(a => a._id),
          clientId: client._id
        },
        description: `Lead converted to ${createdAppointments.length} appointment(s) and client`,
        details: {
          appointmentCount: createdAppointments.length,
          clientName: client.name
        },
        branchId: req.user.branchId
      });
    } catch (activityError) {
      logger.error('Error logging lead conversion activity:', activityError);
      // Don't fail the request if activity logging fails
    }

    res.json({
      success: true,
      data: {
        lead,
        appointments: createdAppointments,
        client
      },
      message: 'Lead converted to appointment successfully'
    });
  } catch (error) {
    logger.error('Error converting lead to appointment:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Delete lead
app.delete('/api/leads/:id', authenticateToken, setupBusinessDatabase, checkPermission('lead_management', 'delete'), LEAD_MANAGEMENT, async (req, res) => {
  try {
    const { Lead } = req.businessModels;
    const deletedLead = await Lead.findOneAndDelete({ 
      _id: req.params.id, 
      branchId: req.user.branchId 
    });

    if (!deletedLead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    res.json({
      success: true,
      message: 'Lead deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting lead:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Services routes
app.get('/api/services', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { Service } = req.businessModels;
    const { page = 1, limit = 10, search = '' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const { cacheGet, cacheSet, tenantListCacheKey } = require('./lib/cache');
    const listQueryKey = `p${pageNum}:l${limitNum}:q${String(search).slice(0, 64)}`;
    const listCacheKey = tenantListCacheKey('services', req.user.branchId, listQueryKey);
    const cachedList = await cacheGet(listCacheKey);
    if (cachedList) {
      return res.json(cachedList);
    }

    let query = {};
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { category: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const total = await Service.countDocuments(query);
    const services = await Service.find(query)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ category: 1, name: 1 }); // Sort by category alphabetically, then by name

    const {
      loadServiceOverridesForBranch,
      applyOverridesToServiceDocs,
    } = require('./lib/apply-service-overrides');
    const serviceOverrides = await loadServiceOverridesForBranch(req.user.branchId);
    const data = applyOverridesToServiceDocs(services, serviceOverrides);

    logger.debug('Services found: %d', services.length);
    const responseBody = {
      success: true,
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    };
    void cacheSet(listCacheKey, responseBody, parseInt(process.env.LIST_REDIS_TTL_SEC, 10) || 120);
    res.json(responseBody);
  } catch (error) {
    logger.error('Error fetching services:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.post('/api/services', authenticateToken, setupBusinessDatabase, requirePermission('services', 'create'), async (req, res) => {
  try {
    const { Service } = req.businessModels;
    const body = req.body || {};
    const serviceKind = body.serviceKind === 'bundle' ? 'bundle' : 'simple';

    if (serviceKind === 'bundle') {
      const { name, category, description, isAutoConsumptionEnabled, hsnSacCode } = body;
      if (!name || !category) {
        return res.status(400).json({
          success: false,
          error: 'Name and category are required'
        });
      }
      let resolved;
      try {
        resolved = await serviceBundle.resolveBundleForSave(Service, req.user.branchId, {
          bundleItemsRaw: body.bundleItems,
          bundleScheduleType: body.bundleScheduleType,
          bundlePricingType: body.bundlePricingType,
          bundlePercentOff: body.bundlePercentOff,
          bundleRetailPriceRaw: body.bundleRetailPrice != null ? body.bundleRetailPrice : body.retailPrice,
        });
      } catch (e) {
        const code = e.statusCode && e.statusCode !== 500 ? e.statusCode : 400;
        return res.status(code).json({ success: false, error: e.message || 'Invalid bundle' });
      }

      const doc = {
        name,
        category,
        description: description || '',
        hsnSacCode: hsnSacCode || '',
        isActive: true,
        isAutoConsumptionEnabled: !!isAutoConsumptionEnabled,
        branchId: req.user.branchId,
        serviceKind: 'bundle',
        bundleItems: resolved.bundleItems,
        bundleScheduleType: resolved.bundleScheduleType,
        bundlePricingType: resolved.bundlePricingType,
        duration: resolved.duration,
        price: resolved.price,
        fullPrice: resolved.fullPrice,
        offerPrice: resolved.offerPrice,
        taxApplicable: resolved.taxApplicable,
      };
      if (resolved.bundlePercentOff != null) doc.bundlePercentOff = resolved.bundlePercentOff;
      if (resolved.bundleRetailPrice != null) doc.bundleRetailPrice = resolved.bundleRetailPrice;
      const newService = new Service(doc);
      const savedService = await newService.save();
      void require('./lib/gmb-sync-hook')
        .syncServicesIfEnabled(req.user.branchId, req.businessModels)
        .catch((e) => logger.warn('[gmb] post-bundle-create sync:', e?.message || e));
      return res.status(201).json({ success: true, data: savedService });
    }

    const { name, category, duration, price, fullPrice, offerPrice, taxApplicable, hsnSacCode, description, isAutoConsumptionEnabled, showInOnlineBooking } = body;

    const full = fullPrice != null ? parseFloat(fullPrice) : (price != null ? parseFloat(price) : null);
    const offer = offerPrice != null ? parseFloat(offerPrice) : null;
    const effectivePrice = (offer != null && !isNaN(offer)) ? offer : (full != null && !isNaN(full) ? full : null);

    if (!name || !category || !duration || (effectivePrice == null || isNaN(effectivePrice))) {
      return res.status(400).json({
        success: false,
        error: 'Name, category, duration, and price (or full price) are required'
      });
    }

    const newService = new Service({
      name,
      category,
      duration: parseInt(duration),
      price: effectivePrice,
      fullPrice: full != null && !isNaN(full) ? full : undefined,
      offerPrice: offer != null && !isNaN(offer) ? offer : undefined,
      taxApplicable: !!taxApplicable,
      hsnSacCode: hsnSacCode || '',
      description: description || '',
      isActive: true,
      isAutoConsumptionEnabled: !!isAutoConsumptionEnabled,
      showInOnlineBooking: showInOnlineBooking !== false,
      branchId: req.user.branchId,
      serviceKind: 'simple'
    });

    const savedService = await newService.save();

    void require('./lib/gmb-sync-hook')
      .syncServicesIfEnabled(req.user.branchId, req.businessModels)
      .catch((e) => logger.warn('[gmb] post-service-create sync:', e?.message || e));

    res.status(201).json({
      success: true,
      data: savedService
    });
  } catch (error) {
    logger.error('Error creating service:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.put('/api/services/:id', authenticateToken, setupBusinessDatabase, requirePermission('services', 'edit'), async (req, res) => {
  try {
    const { Service } = req.businessModels;
    const body = req.body || {};
    const serviceKind = body.serviceKind === 'bundle' ? 'bundle' : 'simple';

    if (serviceKind === 'bundle') {
      const { name, category, description, isActive, isAutoConsumptionEnabled, hsnSacCode } = body;
      if (!name || !category) {
        return res.status(400).json({
          success: false,
          error: 'Name and category are required'
        });
      }
      let resolved;
      try {
        resolved = await serviceBundle.resolveBundleForSave(Service, req.user.branchId, {
          bundleItemsRaw: body.bundleItems,
          bundleScheduleType: body.bundleScheduleType,
          bundlePricingType: body.bundlePricingType,
          bundlePercentOff: body.bundlePercentOff,
          bundleRetailPriceRaw: body.bundleRetailPrice != null ? body.bundleRetailPrice : body.retailPrice,
        });
      } catch (e) {
        const code = e.statusCode && e.statusCode !== 500 ? e.statusCode : 400;
        return res.status(code).json({ success: false, error: e.message || 'Invalid bundle' });
      }

      const setPayload = {
        name,
        category,
        description: description || '',
        hsnSacCode: hsnSacCode || '',
        isActive: isActive !== undefined ? isActive : true,
        serviceKind: 'bundle',
        bundleItems: resolved.bundleItems,
        bundleScheduleType: resolved.bundleScheduleType,
        bundlePricingType: resolved.bundlePricingType,
        duration: resolved.duration,
        price: resolved.price,
        fullPrice: resolved.fullPrice,
        offerPrice: resolved.offerPrice,
        taxApplicable: resolved.taxApplicable,
      };
      if (resolved.bundlePercentOff != null) {
        setPayload.bundlePercentOff = resolved.bundlePercentOff;
      }
      if (resolved.bundleRetailPrice != null) {
        setPayload.bundleRetailPrice = resolved.bundleRetailPrice;
      }
      if (isAutoConsumptionEnabled !== undefined) {
        setPayload.isAutoConsumptionEnabled = !!isAutoConsumptionEnabled;
      }

      const unset = {};
      if (resolved.bundlePercentOff == null) unset.bundlePercentOff = '';
      if (resolved.bundleRetailPrice == null) unset.bundleRetailPrice = '';

      const updatedService = await Service.findByIdAndUpdate(
        req.params.id,
        {
          $set: setPayload,
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        },
        { new: true }
      );

      if (!updatedService) {
        return res.status(404).json({
          success: false,
          error: 'Service not found'
        });
      }

      return res.json({
        success: true,
        data: updatedService
      });
    }

    const { name, category, duration, price, fullPrice, offerPrice, taxApplicable, hsnSacCode, description, isActive, isAutoConsumptionEnabled, showInOnlineBooking } = body;

    const full = fullPrice != null ? parseFloat(fullPrice) : (price != null ? parseFloat(price) : null);
    const offer = offerPrice != null ? parseFloat(offerPrice) : null;
    const effectivePrice = (offer != null && !isNaN(offer)) ? offer : (full != null && !isNaN(full) ? full : null);

    if (!name || !category || !duration || (effectivePrice == null || isNaN(effectivePrice))) {
      return res.status(400).json({
        success: false,
        error: 'Name, category, duration, and price (or full price) are required'
      });
    }

    const updatePayload = {
      name,
      category,
      duration: parseInt(duration),
      price: effectivePrice,
      fullPrice: full != null && !isNaN(full) ? full : undefined,
      offerPrice: offer != null && !isNaN(offer) ? offer : undefined,
      taxApplicable: !!taxApplicable,
      hsnSacCode: hsnSacCode || '',
      description: description || '',
      isActive: isActive !== undefined ? isActive : true,
      serviceKind: 'simple',
    };
    if (isAutoConsumptionEnabled !== undefined) updatePayload.isAutoConsumptionEnabled = !!isAutoConsumptionEnabled;
    if (showInOnlineBooking !== undefined) updatePayload.showInOnlineBooking = showInOnlineBooking !== false;

    const updatedService = await Service.findByIdAndUpdate(
      req.params.id,
      {
        $set: updatePayload,
        $unset: {
          bundleItems: '',
          bundleScheduleType: '',
          bundlePricingType: '',
          bundlePercentOff: '',
          bundleRetailPrice: '',
        },
      },
      { new: true }
    );

    if (!updatedService) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    void require('./lib/gmb-sync-hook')
      .syncServicesIfEnabled(req.user.branchId, req.businessModels)
      .catch((e) => logger.warn('[gmb] post-service-update sync:', e?.message || e));

    res.json({
      success: true,
      data: updatedService
    });
  } catch (error) {
    logger.error('Error updating service:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.delete('/api/services/:id', authenticateToken, setupBusinessDatabase, requirePermission('services', 'delete'), async (req, res) => {
  try {
    const { Service } = req.businessModels;
    const refBundle = await serviceBundle.findBundleReferencingService(
      Service,
      req.user.branchId,
      req.params.id
    );
    if (refBundle) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete: service is part of bundle "${refBundle.name || 'Bundle'}". Remove it from the bundle first.`,
      });
    }
    const deletedService = await Service.findByIdAndDelete(req.params.id);
    
    if (!deletedService) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    res.json({
      success: true,
      message: 'Service deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting service:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Bulk update tax applicable for all services
app.patch('/api/services/tax-applicable', authenticateToken, setupBusinessDatabase, requirePermission('services', 'edit'), async (req, res) => {
  try {
    const { Service } = req.businessModels;
    const { taxApplicable } = req.body;

    if (typeof taxApplicable !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'taxApplicable must be a boolean'
      });
    }

    const query = req.user.branchId ? { branchId: req.user.branchId } : {};
    const result = await Service.updateMany(query, { $set: { taxApplicable } });

    res.json({
      success: true,
      message: `Tax Applicable ${taxApplicable ? 'enabled' : 'disabled'} for ${result.modifiedCount} services`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    logger.error('Error bulk updating service tax applicable:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Bulk delete services
app.delete('/api/services', authenticateToken, setupBusinessDatabase, requirePermission('services', 'delete'), async (req, res) => {
  try {
    const { Service } = req.businessModels;
    
    // Delete all services for this branch
    const result = await Service.deleteMany({ branchId: req.user.branchId });
    
    logger.info('Deleted %d services for branch %s', result.deletedCount, req.user.branchId);
    
    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} services`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    logger.error('Error deleting all services:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Import services from Excel/CSV
app.post('/api/services/import', authenticateToken, setupBusinessDatabase, requirePermission('services', 'create'), async (req, res) => {
  try {
    const { Service } = req.businessModels;
    const { services, mapping } = req.body;

    if (!services || !Array.isArray(services) || services.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No services data provided'
      });
    }

    if (!mapping || typeof mapping !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Column mapping is required'
      });
    }

    logger.debug('Processing %d services for import', services.length);

    const results = {
      success: [],
      errors: [],
      skipped: []
    };

    // Process each service
    for (let i = 0; i < services.length; i++) {
      const serviceData = services[i];
      const rowNumber = i + 1;

      try {
        // Map the data according to the mapping
        const mappedData = {};
        Object.keys(mapping).forEach(excelColumn => {
          const serviceField = mapping[excelColumn];
          if (serviceField && serviceField !== 'none') {
            mappedData[serviceField] = serviceData[excelColumn];
          }
        });

        // Validate required fields (fullPrice or price required)
        const effectivePriceVal = mappedData.fullPrice ?? mappedData.price;
        if (!mappedData.name || !mappedData.category || !mappedData.duration ||
            effectivePriceVal === undefined || effectivePriceVal === null || effectivePriceVal === '') {
          results.errors.push({
            row: rowNumber,
            error: 'Name, category, duration, and full price are required',
            data: mappedData
          });
          continue;
        }

        // Convert to string and normalize name and category for duplicate check
        const normalizedName = String(mappedData.name).trim().toLowerCase();
        const normalizedCategory = String(mappedData.category).trim().toLowerCase();

        // Check if service already exists (by normalized name and category)
        const existingService = await Service.findOne({
          name: { $regex: new RegExp(`^${normalizedName}$`, 'i') },
          category: { $regex: new RegExp(`^${normalizedCategory}$`, 'i') },
          branchId: req.user.branchId
        });

        if (existingService) {
          results.skipped.push({
            row: rowNumber,
            reason: 'Service already exists',
            data: mappedData
          });
          continue;
        }

        // Validate duration and price are numbers
        const duration = parseInt(mappedData.duration);
        const fullPrice = parseFloat(mappedData.fullPrice ?? mappedData.price);
        const offerPrice = mappedData.offerPrice != null && mappedData.offerPrice !== '' ? parseFloat(mappedData.offerPrice) : undefined;

        if (isNaN(duration) || duration < 1) {
          results.errors.push({
            row: rowNumber,
            error: 'Duration must be a positive number (in minutes)',
            data: mappedData
          });
          continue;
        }

        // Price can be 0 or greater
        if (isNaN(fullPrice) || fullPrice < 0) {
          results.errors.push({
            row: rowNumber,
            error: 'Full price must be a valid number (0 or greater)',
            data: mappedData
          });
          continue;
        }

        if (offerPrice !== undefined && (isNaN(offerPrice) || offerPrice < 0)) {
          results.errors.push({
            row: rowNumber,
            error: 'Offer price must be a valid number (0 or greater)',
            data: mappedData
          });
          continue;
        }

        // Effective price: offerPrice if provided, else fullPrice
        const price = offerPrice != null ? offerPrice : fullPrice;

        // Parse taxApplicable (yes/no, true/false, 1/0)
        const taxApplicableRaw = mappedData.taxApplicable;
        const taxApplicable = taxApplicableRaw === true || taxApplicableRaw === 1 || taxApplicableRaw === '1' ||
          (typeof taxApplicableRaw === 'string' && taxApplicableRaw.toLowerCase() === 'yes');

        // Parse isAutoConsumptionEnabled
        const autoConsumptionRaw = mappedData.isAutoConsumptionEnabled;
        const isAutoConsumptionEnabled = autoConsumptionRaw === true || autoConsumptionRaw === 1 || autoConsumptionRaw === '1' ||
          (typeof autoConsumptionRaw === 'string' && autoConsumptionRaw.toLowerCase() === 'yes');

        // Prepare service data (matches Add New Service form)
        const serviceToCreate = {
          name: String(mappedData.name).trim(),
          category: String(mappedData.category).trim(),
          duration: duration,
          price: price,
          fullPrice: fullPrice,
          offerPrice: offerPrice,
          description: mappedData.description ? String(mappedData.description).trim() : '',
          taxApplicable: taxApplicable,
          hsnSacCode: mappedData.hsnSacCode ? String(mappedData.hsnSacCode).trim() : '',
          isAutoConsumptionEnabled: isAutoConsumptionEnabled,
          showInOnlineBooking: true,
          branchId: req.user.branchId,
          isActive: true
        };

        // Create the service
        const newService = new Service(serviceToCreate);
        const savedService = await newService.save();

        results.success.push({
          row: rowNumber,
          service: savedService
        });

        logger.debug('Service imported successfully: %s', savedService.name);

      } catch (error) {
        logger.error('Error importing service at row %d:', rowNumber, error);
        results.errors.push({
          row: rowNumber,
          error: error.message || 'Unknown error occurred',
          data: serviceData
        });
      }
    }

    logger.info('Service import completed - Success: %d, Errors: %d, Skipped: %d', results.success.length, results.errors.length, results.skipped.length);

    res.json({
      success: true,
      data: {
        totalProcessed: services.length,
        successful: results.success.length,
        errors: results.errors.length,
        skipped: results.skipped.length,
        results: {
          success: results.success,
          errors: results.errors,
          skipped: results.skipped
        }
      }
    });

  } catch (error) {
    logger.error('Error importing services:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during import'
    });
  }
});

// ========== Membership routes ==========
// Plan APIs
app.get('/api/membership/plans', authenticateToken, setupBusinessDatabase, requireStaff, MEMBERSHIP, async (req, res) => {
  try {
    const { MembershipPlan } = req.businessModels;
    const { isActive } = req.query;
    const query = { branchId: req.user.branchId };
    if (isActive !== undefined) query.isActive = isActive === 'true';
    const plans = await MembershipPlan.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: plans });
  } catch (error) {
    logger.error('Error fetching membership plans:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// List active subscriptions (for membership report filter)
app.get('/api/membership/subscriptions', authenticateToken, setupBusinessDatabase, requireStaff, MEMBERSHIP, async (req, res) => {
  try {
    const { MembershipSubscription, Client, MembershipPlan } = req.businessModels;
    const { planId, search, status = 'ACTIVE', dateFrom, dateTo, page: pageQ, limit: limitQ } = req.query;
    const branchId = req.user.branchId;

    const page = Math.max(parseInt(String(pageQ ?? ''), 10) || 1, 1);
    const limitRaw = parseInt(String(limitQ ?? ''), 10);
    const limit = Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.min(limitRaw, 500) : 25;
    const skip = (page - 1) * limit;

    const parts = [{ branchId }];
    if (planId && mongoose.Types.ObjectId.isValid(planId)) {
      parts.push({ planId: new mongoose.Types.ObjectId(planId) });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Status: ALL | ACTIVE (valid) | EXPIRED (incl. ACTIVE but past expiry) | CANCELLED
    const statusUpper = String(status || 'ACTIVE').toUpperCase();
    if (statusUpper === 'ACTIVE') {
      parts.push(activeMembershipMongoMatch(today));
    } else if (statusUpper === 'EXPIRED') {
      parts.push(membershipExpiredMongoMatch(today));
    } else if (statusUpper === 'CANCELLED') {
      parts.push({ status: 'CANCELLED' });
    } else if (statusUpper !== 'ALL') {
      parts.push({ status: statusUpper });
    }

    if (dateFrom && dateTo) {
      const from = new Date(String(dateFrom));
      const to = new Date(String(dateTo));
      if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
        parts.push({ startDate: { $gte: from, $lte: to } });
      }
    }

    const searchTerm = search && String(search).trim() ? String(search).trim() : '';
    if (searchTerm) {
      const re = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const [clients, plans] = await Promise.all([
        Client.find({ branchId, $or: [{ name: re }, { phone: re }, { email: re }] }).select('_id').lean(),
        MembershipPlan.find({ branchId, planName: re }).select('_id').lean(),
      ]);
      const customerIds = clients.map((c) => c._id);
      const planIds = plans.map((p) => p._id);
      if (customerIds.length === 0 && planIds.length === 0) {
        return res.json({
          success: true,
          data: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
          totalRevenue: 0,
        });
      }
      const searchOr = [];
      if (customerIds.length > 0) searchOr.push({ customerId: { $in: customerIds } });
      if (planIds.length > 0) searchOr.push({ planId: { $in: planIds } });
      parts.push({ $or: searchOr });
    }

    const matchQuery = parts.length === 1 ? parts[0] : { $and: parts };

    const [total, subs, revenueRows] = await Promise.all([
      MembershipSubscription.countDocuments(matchQuery),
      MembershipSubscription.find(matchQuery)
        .populate('customerId', 'name phone email')
        .populate('planId', 'planName price durationInDays')
        .sort({ expiryDate: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      MembershipSubscription.aggregate([
        { $match: matchQuery },
        {
          $lookup: {
            from: MembershipPlan.collection.name,
            localField: 'planId',
            foreignField: '_id',
            as: 'plan',
          },
        },
        { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
        { $group: { _id: null, totalRevenue: { $sum: { $ifNull: ['$plan.price', 0] } } } },
      ]),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const totalRevenue = revenueRows[0]?.totalRevenue ?? 0;

    res.json({
      success: true,
      data: subs,
      total,
      page,
      limit,
      totalPages,
      totalRevenue,
    });
  } catch (error) {
    logger.error('Error fetching membership subscriptions:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post('/api/membership/plans', authenticateToken, setupBusinessDatabase, requirePermission('membership', 'create'), MEMBERSHIP, async (req, res) => {
  try {
    const { MembershipPlan, Service } = req.businessModels;
    const {
      planName,
      price,
      durationInDays,
      discountPercentage = 0,
      includedServices = [],
      excludedServiceIds = [],
      isActive = true,
      appliesToAllClients = false,
      unlimitedDuration = false,
    } = req.body;

    if (!planName || price == null || !durationInDays) {
      return res.status(400).json({
        success: false,
        error: 'planName, price, and durationInDays are required'
      });
    }

    const priceNum = parseFloat(price);
    const durationNum = parseInt(durationInDays);
    const discountNum = parseFloat(discountPercentage) || 0;
    const appliesAll = !!appliesToAllClients;
    const unlimited = !!unlimitedDuration;

    if (isNaN(priceNum) || priceNum < 0) {
      return res.status(400).json({ success: false, error: 'price must be a non-negative number' });
    }
    if (isNaN(durationNum) || durationNum < 1) {
      return res.status(400).json({ success: false, error: 'durationInDays must be at least 1' });
    }

    const branchId = req.user.branchId;

    if (appliesAll) {
      await resetAppliesToAllClientsExcept(MembershipPlan, branchId, null);
    }
    const validIncludedServices = [];
    if (Array.isArray(includedServices) && includedServices.length > 0) {
      for (const inc of includedServices) {
        const serviceId = inc.serviceId || inc.service;
        const usageLimit = inc.usageLimit ?? 0;
        if (!serviceId || !mongoose.Types.ObjectId.isValid(serviceId)) continue;
        const service = await Service.findById(serviceId);
        if (!service || service.branchId?.toString() !== branchId.toString()) {
          return res.status(400).json({
            success: false,
            error: `Service ${serviceId} not found or does not belong to this business`
          });
        }
        validIncludedServices.push({
          serviceId: new mongoose.Types.ObjectId(serviceId),
          usageLimit: Math.max(0, parseInt(usageLimit) || 0)
        });
      }
    }

    const validExcludedIds = [];
    const excludedSeen = new Set();
    if (Array.isArray(excludedServiceIds) && excludedServiceIds.length > 0) {
      for (const raw of excludedServiceIds) {
        const serviceId = raw?._id || raw;
        if (!serviceId || !mongoose.Types.ObjectId.isValid(serviceId)) continue;
        const service = await Service.findById(serviceId);
        if (!service || service.branchId?.toString() !== branchId.toString()) {
          return res.status(400).json({
            success: false,
            error: `Service ${serviceId} not found or does not belong to this business`
          });
        }
        const k = String(serviceId);
        if (excludedSeen.has(k)) continue;
        excludedSeen.add(k);
        validExcludedIds.push(new mongoose.Types.ObjectId(serviceId));
      }
    }

    const plan = new MembershipPlan({
      branchId,
      planName: String(planName).trim(),
      price: priceNum,
      durationInDays: durationNum,
      discountPercentage: Math.min(100, Math.max(0, discountNum)),
      includedServices: validIncludedServices,
      excludedServiceIds: validExcludedIds,
      isActive: !!isActive,
      appliesToAllClients: appliesAll,
      unlimitedDuration: unlimited,
    });

    const savedPlan = await plan.save();
    if (savedPlan.isActive && savedPlan.appliesToAllClients) {
      const backfill = await ensureAllClientsSubscribedToUniversalPlan(req.businessModels, branchId, savedPlan.toObject());
      if (backfill.created > 0) {
        logger.info(`[Membership] Universal plan ${savedPlan._id}: created ${backfill.created} subscription(s)`);
      }
    }
    res.status(201).json({ success: true, data: savedPlan });
  } catch (error) {
    logger.error('Error creating membership plan:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.put('/api/membership/plans/:id', authenticateToken, setupBusinessDatabase, requirePermission('membership', 'edit'), MEMBERSHIP, async (req, res) => {
  try {
    const { MembershipPlan, Service } = req.businessModels;
    const planId = req.params.id;
    const branchId = req.user.branchId;

    if (!mongoose.Types.ObjectId.isValid(planId)) {
      return res.status(400).json({ success: false, error: 'Invalid plan ID' });
    }

    const plan = await MembershipPlan.findOne({ _id: planId, branchId });
    if (!plan) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    const { planName, price, durationInDays, discountPercentage, includedServices, excludedServiceIds, isActive, appliesToAllClients, unlimitedDuration } = req.body;

    const updatePayload = {};
    if (planName !== undefined) updatePayload.planName = String(planName).trim();
    if (price !== undefined) {
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({ success: false, error: 'price must be a non-negative number' });
      }
      updatePayload.price = priceNum;
    }
    if (durationInDays !== undefined) {
      const durationNum = parseInt(durationInDays);
      if (isNaN(durationNum) || durationNum < 1) {
        return res.status(400).json({ success: false, error: 'durationInDays must be at least 1' });
      }
      updatePayload.durationInDays = durationNum;
    }
    if (discountPercentage !== undefined) updatePayload.discountPercentage = Math.min(100, Math.max(0, parseFloat(discountPercentage) || 0));
    if (isActive !== undefined) updatePayload.isActive = !!isActive;
    if (appliesToAllClients !== undefined) updatePayload.appliesToAllClients = !!appliesToAllClients;
    if (unlimitedDuration !== undefined) updatePayload.unlimitedDuration = !!unlimitedDuration;

    if (updatePayload.appliesToAllClients === true) {
      await resetAppliesToAllClientsExcept(MembershipPlan, branchId, planId);
    }

    if (Array.isArray(includedServices)) {
      const validIncludedServices = [];
      for (const inc of includedServices) {
        const serviceId = inc.serviceId || inc.service;
        const usageLimit = inc.usageLimit ?? 0;
        if (!serviceId || !mongoose.Types.ObjectId.isValid(serviceId)) continue;
        const service = await Service.findById(serviceId);
        if (!service || service.branchId?.toString() !== branchId.toString()) {
          return res.status(400).json({
            success: false,
            error: `Service ${serviceId} not found or does not belong to this business`
          });
        }
        validIncludedServices.push({
          serviceId: new mongoose.Types.ObjectId(serviceId),
          usageLimit: Math.max(0, parseInt(usageLimit) || 0)
        });
      }
      updatePayload.includedServices = validIncludedServices;
    }

    if (Array.isArray(excludedServiceIds)) {
      const validExcludedIds = [];
      const excludedSeen = new Set();
      for (const raw of excludedServiceIds) {
        const serviceId = raw?._id || raw;
        if (!serviceId || !mongoose.Types.ObjectId.isValid(serviceId)) continue;
        const service = await Service.findById(serviceId);
        if (!service || service.branchId?.toString() !== branchId.toString()) {
          return res.status(400).json({
            success: false,
            error: `Service ${serviceId} not found or does not belong to this business`
          });
        }
        const k = String(serviceId);
        if (excludedSeen.has(k)) continue;
        excludedSeen.add(k);
        validExcludedIds.push(new mongoose.Types.ObjectId(serviceId));
      }
      updatePayload.excludedServiceIds = validExcludedIds;
    }

    const updatedPlan = await MembershipPlan.findByIdAndUpdate(planId, updatePayload, { new: true });
    if (updatedPlan?.isActive && updatedPlan.appliesToAllClients) {
      const backfill = await ensureAllClientsSubscribedToUniversalPlan(req.businessModels, branchId, updatedPlan.toObject());
      if (backfill.created > 0) {
        logger.info(`[Membership] Universal plan ${updatedPlan._id} (update): created ${backfill.created} subscription(s)`);
      }
    }
    res.json({ success: true, data: updatedPlan });
  } catch (error) {
    logger.error('Error updating membership plan:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.patch('/api/membership/plans/:id/toggle', authenticateToken, setupBusinessDatabase, requirePermission('membership', 'edit'), MEMBERSHIP, async (req, res) => {
  try {
    const { MembershipPlan } = req.businessModels;
    const planId = req.params.id;
    const branchId = req.user.branchId;

    if (!mongoose.Types.ObjectId.isValid(planId)) {
      return res.status(400).json({ success: false, error: 'Invalid plan ID' });
    }

    const plan = await MembershipPlan.findOne({ _id: planId, branchId });
    if (!plan) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    plan.isActive = !plan.isActive;
    await plan.save();
    if (plan.isActive && plan.appliesToAllClients) {
      const backfill = await ensureAllClientsSubscribedToUniversalPlan(req.businessModels, branchId, plan.toObject());
      if (backfill.created > 0) {
        logger.info(`[Membership] Universal plan ${plan._id} (toggle on): created ${backfill.created} subscription(s)`);
      }
    }
    res.json({ success: true, data: plan });
  } catch (error) {
    logger.error('Error toggling membership plan:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Subscription APIs
app.post('/api/membership/subscribe', authenticateToken, setupBusinessDatabase, requirePermission('membership', 'create'), MEMBERSHIP, async (req, res) => {
  try {
    const { MembershipPlan, MembershipSubscription, Client } = req.businessModels;
    const { customerId, planId } = req.body;
    const branchId = req.user.branchId;

    if (!customerId || !planId) {
      return res.status(400).json({
        success: false,
        error: 'customerId and planId are required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(customerId) || !mongoose.Types.ObjectId.isValid(planId)) {
      return res.status(400).json({ success: false, error: 'Invalid customerId or planId' });
    }

    const plan = await MembershipPlan.findOne({ _id: planId, branchId });
    if (!plan) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }
    if (!plan.isActive) {
      return res.status(400).json({ success: false, error: 'Plan is not active' });
    }

    const client = await Client.findById(customerId);
    if (!client || client.branchId?.toString() !== branchId.toString()) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const todaySubscribe = new Date();
    todaySubscribe.setHours(0, 0, 0, 0);
    const existingActive = await MembershipSubscription.findOne({
      branchId,
      customerId: new mongoose.Types.ObjectId(customerId),
      ...activeMembershipMongoMatch(todaySubscribe),
    });
    if (existingActive) {
      return res.status(400).json({
        success: false,
        error: 'Customer already has an active membership. Only one active membership per customer is allowed.'
      });
    }

    const startDate = new Date();
    const expiryDate = subscriptionExpiryDateForPlan(plan, startDate);

    const subscription = new MembershipSubscription({
      branchId,
      customerId: new mongoose.Types.ObjectId(customerId),
      planId: plan._id,
      startDate,
      expiryDate,
      status: 'ACTIVE'
    });

    const saved = await subscription.save();
    const populated = await MembershipSubscription.findById(saved._id)
      .populate('planId', 'planName price durationInDays discountPercentage includedServices')
      .lean();
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    logger.error('Error subscribing customer:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.get('/api/membership/customer/:customerId', authenticateToken, setupBusinessDatabase, requireStaff, MEMBERSHIP, async (req, res) => {
  try {
    const { MembershipPlan, MembershipSubscription, MembershipUsage, Service, Sale } = req.businessModels;
    const { customerId } = req.params;
    const { asOfDate } = req.query;
    const branchId = req.user.branchId;

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ success: false, error: 'Invalid customer ID' });
    }

    const ref = asOfDate ? new Date(String(asOfDate)) : new Date();
    if (Number.isNaN(ref.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid asOfDate' });
    }
    const startOfRef = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());

    const subscription = await MembershipSubscription.findOne({
      branchId,
      customerId: new mongoose.Types.ObjectId(customerId),
      ...activeMembershipMongoMatch(startOfRef),
    })
      .populate('planId')
      .lean();

    if (!subscription) {
      return res.json({
        success: true,
        data: {
          subscription: null,
          usageSummary: [],
          plan: null,
          freeServicesRemaining: 0,
          totalSavedViaMembership: 0
        }
      });
    }

    const usageRows = await MembershipUsage.find({
      branchId,
      subscriptionId: subscription._id
    }).lean();

    const usageCountByBillService = new Map();
    for (const u of usageRows) {
      const key = `${u.billingId}:${u.serviceId}`;
      usageCountByBillService.set(key, (usageCountByBillService.get(key) || 0) + 1);
    }

    // Batch-fetch all referenced sales in one query instead of N+1
    const uniqueBillingIds = [...new Set(usageRows.map(u => u.billingId).filter(Boolean))];
    const salesByBillingId = new Map();
    if (uniqueBillingIds.length > 0) {
      const salesDocs = await Sale.find({ _id: { $in: uniqueBillingIds } }).select('items').lean();
      for (const s of salesDocs) salesByBillingId.set(String(s._id), s);
    }

    let totalSavedViaMembership = 0;
    for (const u of usageRows) {
      const sale = salesByBillingId.get(String(u.billingId));
      if (!sale?.items?.length) continue;
      const item = sale.items.find(
        (it) => it.type === 'service' &&
          String(it.serviceId) === String(u.serviceId) &&
          it.isMembershipFree
      );
      if (item) {
        const qty = Number(item.quantity) || 1;
        const price = Number(item.price) || 0;
        const key = `${u.billingId}:${u.serviceId}`;
        const nRowsForLine = usageCountByBillService.get(key) || 1;
        totalSavedViaMembership += (price * qty) / nRowsForLine;
      }
    }

    const plan = subscription.planId;
    if (!plan || !plan.includedServices || plan.includedServices.length === 0) {
      return res.json({
        success: true,
        data: {
          subscription,
          plan,
          usageSummary: [],
          freeServicesRemaining: 0,
          totalSavedViaMembership
        }
      });
    }

    // Batch: count usage per service via aggregation + batch-fetch service names
    const serviceIds = plan.includedServices.map(inc => inc.serviceId?._id || inc.serviceId);
    const [usageCounts, servicesDocs] = await Promise.all([
      MembershipUsage.aggregate([
        { $match: { branchId, subscriptionId: subscription._id, serviceId: { $in: serviceIds } } },
        { $group: { _id: '$serviceId', count: { $sum: 1 } } }
      ]),
      Service.find({ _id: { $in: serviceIds } }).select('name').lean()
    ]);
    const usageCountMap = new Map(usageCounts.map(r => [String(r._id), r.count]));
    const serviceNameMap = new Map(servicesDocs.map(s => [String(s._id), s.name]));

    const usageSummary = plan.includedServices.map(inc => {
      const serviceId = inc.serviceId?._id || inc.serviceId;
      const usageLimit = inc.usageLimit ?? 0;
      const used = usageCountMap.get(String(serviceId)) || 0;
      return {
        serviceId,
        serviceName: serviceNameMap.get(String(serviceId)) || 'Unknown',
        used,
        limit: usageLimit,
        remaining: Math.max(0, usageLimit - used)
      };
    });

    const freeServicesRemaining = usageSummary.reduce(
      (sum, row) => sum + (Number(row.remaining) || 0),
      0
    );

    res.json({
      success: true,
      data: {
        subscription,
        plan,
        usageSummary,
        freeServicesRemaining,
        totalSavedViaMembership
      }
    });
  } catch (error) {
    logger.error('Error fetching customer membership:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Redeem API (called during billing or by frontend)
app.post('/api/membership/redeem', authenticateToken, setupBusinessDatabase, requireStaff, MEMBERSHIP, async (req, res) => {
  try {
    const { MembershipPlan, MembershipSubscription, MembershipUsage } = req.businessModels;
    const { customerId, serviceId, staffId, billingId } = req.body;
    const branchId = req.user.branchId;

    if (!customerId || !serviceId || !staffId || !billingId) {
      return res.status(400).json({
        success: false,
        error: 'customerId, serviceId, staffId, and billingId are required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(customerId) || !mongoose.Types.ObjectId.isValid(serviceId) ||
        !mongoose.Types.ObjectId.isValid(staffId) || !mongoose.Types.ObjectId.isValid(billingId)) {
      return res.status(400).json({ success: false, error: 'Invalid ObjectId in request' });
    }

    const subscription = await MembershipSubscription.findOne({
      branchId,
      customerId: new mongoose.Types.ObjectId(customerId),
      status: 'ACTIVE'
    }).populate('planId');

    if (!subscription) {
      return res.status(400).json({
        success: false,
        error: 'No active membership found for this customer'
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (subscription.expiryDate != null && new Date(subscription.expiryDate) < today) {
      return res.status(400).json({
        success: false,
        error: 'Membership has expired'
      });
    }

    const plan = subscription.planId;
    if (!plan) {
      return res.status(400).json({ success: false, error: 'Plan not found' });
    }

    const included = (plan.includedServices || []).find(
      s => (s.serviceId?._id || s.serviceId)?.toString() === serviceId.toString()
    );
    if (!included) {
      return res.status(400).json({
        success: false,
        error: 'Service is not included in this membership plan'
      });
    }

    const usageLimit = included.usageLimit ?? 0;
    const used = await MembershipUsage.countDocuments({
      branchId,
      subscriptionId: subscription._id,
      serviceId: new mongoose.Types.ObjectId(serviceId)
    });

    if (used >= usageLimit) {
      return res.status(400).json({
        success: false,
        error: 'Usage limit reached for this service'
      });
    }

    const usage = new MembershipUsage({
      branchId,
      subscriptionId: subscription._id,
      serviceId: new mongoose.Types.ObjectId(serviceId),
      usedOn: new Date(),
      staffId: new mongoose.Types.ObjectId(staffId),
      billingId: new mongoose.Types.ObjectId(billingId)
    });

    await usage.save();
    res.json({ success: true, data: usage });
  } catch (error) {
    logger.error('Error redeeming membership:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Products routes
app.get('/api/products', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    
    const { Product } = req.businessModels;
    const { page = 1, limit = 10, search = '' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    let query = {};
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { category: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ category: 1, name: 1 }) // Sort by category alphabetically, then by name
      .lean();

    logger.debug('Products found: %d', products.length);
    res.json({
      success: true,
      data: products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    logger.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.post('/api/products', authenticateToken, setupBusinessDatabase, requirePermission('products', 'create'), async (req, res) => {
  try {
    const { Product, InventoryTransaction } = req.businessModels;
    const { name, category, price, stock, minimumStock, sku, barcode, hsnSacCode, supplier, description, taxCategory, productType, transactionType, cost, offerPrice, volume, volumeUnit, imageUrl } = req.body;

    // For service products, price is not required
    const isServiceProduct = productType === 'service';
    const priceRequired = !isServiceProduct;
    
    if (!name || !category || !stock || (priceRequired && (price === undefined || price === null || price === ''))) {
      return res.status(400).json({
        success: false,
        error: isServiceProduct 
          ? 'Name, category, and stock are required for service products' 
          : 'Name, category, price, and stock are required'
      });
    }

    const imageUrlTrimmed = typeof imageUrl === 'string' ? imageUrl.trim() : '';

    const costVal = cost !== undefined && cost !== null && cost !== '' ? parseFloat(cost) : undefined;
    const newProduct = new Product({
      name,
      category,
      price: isServiceProduct ? (costVal ?? parseFloat(price) ?? 0) : parseFloat(price), // Service products: selling price = cost price
      cost: costVal,
      offerPrice: offerPrice !== undefined && offerPrice !== null && offerPrice !== '' ? parseFloat(offerPrice) : undefined,
      stock: parseInt(stock),
      minimumStock: minimumStock !== undefined ? parseInt(minimumStock) : undefined,
      sku: sku || `SKU-${Date.now()}`,
      barcode: barcode || '',
      hsnSacCode: hsnSacCode || '',
      volume: volume !== undefined && volume !== null && volume !== '' ? parseFloat(volume) : undefined,
      volumeUnit: volumeUnit && ['mg', 'g', 'kg', 'ml', 'l', 'oz', 'pcs', 'pkt'].includes(volumeUnit) ? volumeUnit : undefined,
      supplier,
      description,
      taxCategory: taxCategory || 'standard',
      productType: productType || 'retail',
      isActive: true,
      branchId: req.user.branchId,
      ...(imageUrlTrimmed ? { imageUrl: imageUrlTrimmed } : {})
    });

    const savedProduct = await newProduct.save();

    // Create inventory transaction for stock addition
    const unitCostForTxn = isServiceProduct ? (costVal ?? 0) : (parseFloat(price) || 0);
    const inventoryTransaction = new InventoryTransaction({
      productId: savedProduct._id,
      productName: savedProduct.name,
      transactionType: transactionType || 'purchase',
      quantity: parseInt(stock),
      previousStock: 0,
      newStock: parseInt(stock),
      unitCost: unitCostForTxn,
      totalValue: unitCostForTxn * parseInt(stock),
      referenceType: 'purchase',
      referenceId: savedProduct._id.toString(),
      referenceNumber: `PROD-${savedProduct._id.toString().slice(-6)}`,
      processedBy: req.user.email,
      location: 'main',
      reason: `Product added to inventory`,
      notes: `Initial stock addition via ${transactionType || 'purchase'}`,
      transactionDate: new Date()
    });

    await inventoryTransaction.save();

    res.status(201).json({
      success: true,
      data: savedProduct
    });
  } catch (error) {
    logger.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.put('/api/products/:id', authenticateToken, setupBusinessDatabase, requirePermission('products', 'edit'), async (req, res) => {
  try {
    
    const { Product, InventoryTransaction } = req.businessModels;
    const { name, category, price, stock, minimumStock, sku, barcode, hsnSacCode, supplier, description, isActive, taxCategory, productType, transactionType, cost, offerPrice, volume, volumeUnit, imageUrl } = req.body;

    // For service products, price is not required
    const isServiceProduct = productType === 'service';
    const priceRequired = !isServiceProduct;
    
    if (!name || !category || !stock || (priceRequired && (price === undefined || price === null || price === ''))) {
      return res.status(400).json({
        success: false,
        error: isServiceProduct 
          ? 'Name, category, and stock are required for service products' 
          : 'Name, category, price, and stock are required'
      });
    }

    const imageUrlTrimmed = typeof imageUrl === 'string' ? imageUrl.trim() : undefined;

    // Get current product to compare stock levels
    const currentProduct = await Product.findById(req.params.id);
    if (!currentProduct) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    const previousStock = currentProduct.stock || 0;
    const newStock = parseInt(stock);
    const stockDifference = newStock - previousStock;

    const costVal = cost !== undefined && cost !== null && cost !== '' ? parseFloat(cost) : undefined;
    // Update the product
    const updateData = {
      name,
      category,
      price: isServiceProduct ? (costVal ?? parseFloat(price) ?? 0) : parseFloat(price), // Service products: selling price = cost price
      cost: costVal,
      offerPrice: offerPrice !== undefined && offerPrice !== null && offerPrice !== '' ? parseFloat(offerPrice) : undefined,
      stock: newStock,
      sku: sku || `SKU-${Date.now()}`,
      barcode: barcode || '',
      hsnSacCode: hsnSacCode || '',
      volume: volume !== undefined && volume !== null && volume !== '' ? parseFloat(volume) : undefined,
      volumeUnit: volumeUnit && ['mg', 'g', 'kg', 'ml', 'l', 'oz', 'pcs', 'pkt'].includes(volumeUnit) ? volumeUnit : undefined,
      supplier,
      description,
      taxCategory: taxCategory || 'standard',
      productType: productType || 'retail',
      isActive: isActive !== undefined ? isActive : true,
    };

    if (imageUrlTrimmed !== undefined) {
      updateData.imageUrl = imageUrlTrimmed;
    }
    
    // Add minimumStock if provided (handle empty string, null, and undefined)
    if (minimumStock !== undefined && minimumStock !== null && minimumStock !== '') {
      updateData.minimumStock = parseInt(minimumStock);
    } else if (minimumStock === '' || minimumStock === null) {
      // Allow clearing minimumStock by setting it to null
      updateData.minimumStock = null;
    }
    
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    // Create inventory transaction if stock changed
    if (stockDifference !== 0) {
      try {
        const inventoryTransaction = new InventoryTransaction({
          productId: req.params.id,
          productName: updatedProduct.name,
          transactionType: transactionType || (stockDifference > 0 ? 'purchase' : 'adjustment'),
          quantity: stockDifference,
          previousStock: previousStock,
          newStock: newStock,
          unitCost: parseFloat(price) || 0,
          totalValue: Math.abs(stockDifference * (parseFloat(price) || 0)),
          referenceType: 'product_edit',
          referenceId: req.params.id,
          referenceNumber: `EDIT-${Date.now()}`,
          processedBy: req.user.firstName + ' ' + req.user.lastName || 'System',
          reason: stockDifference > 0 ? 'Stock restocked via product edit' : 'Stock adjusted via product edit',
          notes: `Stock updated from ${previousStock} to ${newStock} units`,
          transactionDate: new Date()
        });
        
        await inventoryTransaction.save();
      } catch (inventoryError) {
        logger.error('Error creating inventory transaction:', inventoryError);
      }
    }

    // Check for low inventory after stock update
    if (stockDifference !== 0) {
      try {
        const { checkAndSendLowInventoryAlerts } = require('./utils/low-inventory-checker');
        // Check only the updated product if stock decreased
        if (stockDifference < 0) {
          await checkAndSendLowInventoryAlerts(req.user.branchId, req.params.id);
        }
      } catch (inventoryCheckError) {
        logger.error('Error checking low inventory:', inventoryCheckError);
      }
    }

    res.json({
      success: true,
      data: updatedProduct
    });
  } catch (error) {
    logger.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Bulk delete all products
app.delete('/api/products', authenticateToken, setupBusinessDatabase, requirePermission('products', 'delete'), async (req, res) => {
  try {
    const { Product } = req.businessModels;
    
    // Delete all products for this branch
    const result = await Product.deleteMany({ branchId: req.user.branchId });
    
    logger.info('Deleted %d products for branch %s', result.deletedCount, req.user.branchId);
    
    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} products`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    logger.error('Error deleting all products:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.delete('/api/products/:id', authenticateToken, setupBusinessDatabase, requirePermission('products', 'delete'), async (req, res) => {
  try {
    const { Product } = req.businessModels;
    const deletedProduct = await Product.findByIdAndDelete(req.params.id);
    
    if (!deletedProduct) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Import products from Excel/CSV data
app.post('/api/products/import', authenticateToken, setupBusinessDatabase, requirePermission('products', 'create'), async (req, res) => {
  try {
    const { Product, InventoryTransaction } = req.businessModels;
    const { products, mapping } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No products data provided'
      });
    }

    if (!mapping || typeof mapping !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Column mapping is required'
      });
    }

    logger.debug('Processing %d products for import', products.length);

    const results = {
      success: [],
      errors: [],
      skipped: []
    };

    // Process each product
    for (let i = 0; i < products.length; i++) {
      const productData = products[i];
      const rowNumber = i + 1;

      try {
        // Map the data according to the mapping
        const mappedData = {};
        Object.keys(mapping).forEach(excelColumn => {
          const productField = mapping[excelColumn];
          if (productField && productField !== 'none') {
            mappedData[productField] = productData[excelColumn];
          }
        });

        // Validate required fields
        if (!mappedData.name || !mappedData.category) {
          results.errors.push({
            row: rowNumber,
            error: 'Name and category are required',
            data: mappedData
          });
          continue;
        }

        // Convert to string and normalize name and category for duplicate check
        const normalizedName = String(mappedData.name).trim().toLowerCase();
        const normalizedCategory = String(mappedData.category).trim().toLowerCase();
        
        // Normalize productType (handle case variations: Retail, RETAIL, retail, etc.)
        let normalizedProductType = 'retail'; // default
        if (mappedData.productType) {
          const productTypeStr = String(mappedData.productType).trim().toLowerCase();
          if (['retail', 'service', 'both'].includes(productTypeStr)) {
            normalizedProductType = productTypeStr;
          } else {
            // Handle variations like "Retail", "RETAIL", "Retail Product", etc.
            if (productTypeStr.includes('retail') && !productTypeStr.includes('service') && !productTypeStr.includes('both')) {
              normalizedProductType = 'retail';
            } else if (productTypeStr.includes('service') && !productTypeStr.includes('retail') && !productTypeStr.includes('both')) {
              normalizedProductType = 'service';
            } else if (productTypeStr.includes('both')) {
              normalizedProductType = 'both';
            }
          }
          logger.debug('Product "%s": productType "%s" normalized to "%s"', mappedData.name, mappedData.productType, normalizedProductType);
        } else {
          logger.debug('Product "%s": No productType specified, defaulting to "retail"', mappedData.name);
        }

        // Check if product already exists (by normalized name, category, AND productType)
        // Products with same name/category but different type are NOT duplicates
        const existingProduct = await Product.findOne({
          name: { $regex: new RegExp(`^${normalizedName}$`, 'i') },
          category: { $regex: new RegExp(`^${normalizedCategory}$`, 'i') },
          productType: normalizedProductType,
          branchId: req.user.branchId
        });

        if (existingProduct) {
          results.skipped.push({
            row: rowNumber,
            reason: 'Product already exists',
            data: mappedData
          });
          continue;
        }

        // Prepare product data (align with Add Product form fields)
        const priceVal = mappedData.price != null && mappedData.price !== '' ? parseFloat(mappedData.price) : (normalizedProductType === 'service' ? 0 : 0);
        const productToCreate = {
          name: mappedData.name,
          category: mappedData.category,
          price: priceVal,
          cost: (mappedData.cost != null && mappedData.cost !== '') || (mappedData.costPrice != null && mappedData.costPrice !== '') ? parseFloat(mappedData.cost ?? mappedData.costPrice) : undefined,
          offerPrice: mappedData.offerPrice != null && mappedData.offerPrice !== '' ? parseFloat(mappedData.offerPrice) : undefined,
          stock: mappedData.stock != null && mappedData.stock !== '' ? parseInt(mappedData.stock) : 0,
          minimumStock: mappedData.minimumStock != null && mappedData.minimumStock !== '' ? parseInt(mappedData.minimumStock) : 5,
          sku: mappedData.sku && String(mappedData.sku).trim() !== '' ? String(mappedData.sku).trim() : undefined,
          barcode: mappedData.barcode && String(mappedData.barcode).trim() !== '' ? String(mappedData.barcode).trim() : '',
          hsnSacCode: mappedData.hsnSacCode && String(mappedData.hsnSacCode).trim() !== '' ? String(mappedData.hsnSacCode).trim() : '',
          volume: mappedData.volume != null && mappedData.volume !== '' ? parseFloat(mappedData.volume) : undefined,
          volumeUnit: mappedData.volumeUnit && ['mg', 'g', 'kg', 'ml', 'l', 'oz', 'pcs', 'pkt'].includes(String(mappedData.volumeUnit).toLowerCase()) ? String(mappedData.volumeUnit).toLowerCase() : undefined,
          supplier: mappedData.supplier || '',
          description: mappedData.description || '',
          taxCategory: mappedData.taxCategory || 'standard',
          productType: normalizedProductType,
          branchId: req.user.branchId,
          isActive: true
        };

        // Validate product type (already normalized above, but double-check)
        if (!['retail', 'service', 'both'].includes(productToCreate.productType)) {
          logger.warn('Invalid productType "%s", defaulting to "retail"', mappedData.productType);
          productToCreate.productType = 'retail';
        }

        // Validate tax category
        if (!['essential', 'intermediate', 'standard', 'luxury', 'exempt'].includes(productToCreate.taxCategory)) {
          productToCreate.taxCategory = 'standard';
        }

        // Create the product
        const newProduct = new Product(productToCreate);
        const savedProduct = await newProduct.save();

        // Create inventory transaction if stock > 0
        if (savedProduct.stock > 0) {
          const inventoryTransaction = new InventoryTransaction({
            productId: savedProduct._id,
            productName: savedProduct.name,
            transactionType: 'restock', // Changed from 'in' to 'restock'
            quantity: savedProduct.stock,
            previousStock: 0,
            newStock: savedProduct.stock,
            unitCost: savedProduct.price || 0,
            totalValue: (savedProduct.price || 0) * savedProduct.stock,
            referenceType: 'product_edit', // Changed from 'product_import' to 'product_edit'
            referenceId: savedProduct._id.toString(),
            referenceNumber: `IMPORT-${savedProduct._id.toString().slice(-6)}`,
            reason: 'Product imported via Excel/CSV',
            processedBy: req.user.name || req.user.email || 'System',
            branchId: req.user.branchId
          });

          await inventoryTransaction.save();
          logger.debug('Inventory transaction created for imported product %s: +%d units', savedProduct.name, savedProduct.stock);
        }

        results.success.push({
          row: rowNumber,
          product: savedProduct
        });

        logger.debug('Product imported successfully: %s', savedProduct.name);

      } catch (error) {
        logger.error('Error importing product at row %d:', rowNumber, error);
        results.errors.push({
          row: rowNumber,
          error: error.message || 'Unknown error occurred',
          data: productData
        });
      }
    }

    logger.info('Product import completed - Success: %d, Errors: %d, Skipped: %d', results.success.length, results.errors.length, results.skipped.length);

    res.json({
      success: true,
      data: {
        totalProcessed: products.length,
        successful: results.success.length,
        errors: results.errors.length,
        skipped: results.skipped.length,
        results: {
          success: results.success,
          errors: results.errors,
          skipped: results.skipped
        }
      }
    });

  } catch (error) {
    logger.error('Error importing products:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during import'
    });
  }
});

// ==================== SUPPLIER ROUTES ====================

// Get all suppliers
app.get('/api/suppliers', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { Supplier } = req.businessModels;
    const { search, activeOnly } = req.query;

    let query = { branchId: req.user.branchId };

    // Filter by active status if requested
    if (activeOnly === 'true') {
      query.isActive = true;
    }

    // Search by name if provided
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const suppliers = await Supplier.find(query).sort({ name: 1 }).lean();

    if (req.query.withSummary === 'true') {
      const { PurchaseOrder, SupplierPayable } = req.businessModels;
      const supplierIds = suppliers.map((s) => s._id);
      const lastOrders = await PurchaseOrder.aggregate([
        { $match: { supplierId: { $in: supplierIds }, branchId: req.user.branchId, status: { $ne: 'cancelled' } } },
        { $sort: { orderDate: -1 } },
        { $group: { _id: '$supplierId', lastOrderDate: { $first: '$orderDate' }, lastPoNumber: { $first: '$poNumber' } } }
      ]);
      const outstandingAgg = await SupplierPayable.aggregate([
        { $match: { supplierId: { $in: supplierIds }, branchId: req.user.branchId, status: { $in: ['pending', 'partial'] } } },
        { $group: { _id: '$supplierId', outstanding: { $sum: { $subtract: ['$totalAmount', { $ifNull: ['$amountPaid', 0] }] } } } }
      ]);
      const lastOrderMap = Object.fromEntries(lastOrders.map((o) => [o._id.toString(), { lastOrderDate: o.lastOrderDate, lastPoNumber: o.lastPoNumber }]));
      const outstandingMap = Object.fromEntries(outstandingAgg.map((o) => [o._id.toString(), o.outstanding]));
      const withSummary = suppliers.map((s) => ({
        ...s,
        outstandingAmount: outstandingMap[s._id.toString()] || 0,
        lastOrderDate: lastOrderMap[s._id.toString()]?.lastOrderDate || null,
        lastPoNumber: lastOrderMap[s._id.toString()]?.lastPoNumber || null
      }));
      return res.json({ success: true, data: withSummary });
    }

    res.json({
      success: true,
      data: suppliers
    });
  } catch (error) {
    logger.error('Error fetching suppliers:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Suppliers & Orders summary (Total Suppliers, Total Outstanding, Purchases This Month, Overdue Amount)
app.get('/api/suppliers/summary', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    if (!req.businessModels) {
      return res.status(500).json({ success: false, error: 'Business database not initialized' });
    }
    const { Supplier, SupplierPayable, PurchaseOrder } = req.businessModels;
    const branchId = req.user?.branchId;
    if (!branchId) {
      return res.status(400).json({ success: false, error: 'Business context required' });
    }

    const totalSuppliers = await Supplier.countDocuments({ branchId, isActive: true }).catch(() => 0);

    const payables = await SupplierPayable.find({ branchId, status: { $in: ['pending', 'partial'] } }).lean().catch(() => []);
    const totalOutstanding = payables.reduce((sum, p) => sum + Math.max(0, (p.totalAmount || 0) - (p.amountPaid || 0)), 0);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const posThisMonth = await PurchaseOrder.find({
      branchId,
      status: { $in: ['ordered', 'partially_received', 'received', 'fully_received'] },
      orderDate: { $gte: monthStart, $lte: monthEnd }
    }).lean().catch(() => []);
    const purchasesThisMonth = posThisMonth.reduce((sum, po) => sum + (po.grandTotal || 0), 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overduePayables = payables.filter((p) => p.dueDate && new Date(p.dueDate) < today);
    const overdueAmount = overduePayables.reduce((sum, p) => sum + Math.max(0, (p.totalAmount || 0) - (p.amountPaid || 0)), 0);

    res.json({
      success: true,
      data: {
        totalSuppliers,
        totalOutstanding,
        purchasesThisMonth,
        overdueAmount
      }
    });
  } catch (error) {
    logger.error('Error fetching suppliers summary:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get a single supplier by ID
app.get('/api/suppliers/:id', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { Supplier } = req.businessModels;
    const supplier = await Supplier.findOne({ _id: req.params.id, branchId: req.user.branchId });

    if (!supplier) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      });
    }

    res.json({
      success: true,
      data: supplier
    });
  } catch (error) {
    logger.error('Error fetching supplier:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get supplier purchase order + purchase invoice history (newest first)
app.get('/api/suppliers/:id/orders', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { PurchaseOrder, PurchaseInvoice } = req.businessModels;
    const supplierId = req.params.id;
    const branchId = req.user.branchId;

    const [orders, invoices] = await Promise.all([
      PurchaseOrder.find({ supplierId, branchId }).sort({ orderDate: -1, createdAt: -1, _id: -1 }).lean(),
      PurchaseInvoice.find({ supplierId, branchId }).sort({ invoiceDate: -1, createdAt: -1, _id: -1 }).lean()
    ]);

    const rows = [
      ...orders.map((o) => ({
        kind: 'purchase_order',
        _id: o._id,
        reference: o.poNumber || '',
        date: o.orderDate,
        status: o.status,
        total: o.grandTotal || 0
      })),
      ...invoices.map((inv) => ({
        kind: 'purchase_invoice',
        _id: inv._id,
        reference: String(inv.supplierInvoiceNumber || '').trim() || inv.invoiceNumber || '',
        date: inv.invoiceDate,
        status: inv.status,
        total: inv.grandTotal || 0
      }))
    ];

    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('Error fetching supplier orders:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get supplier's outstanding balance
app.get('/api/suppliers/:id/outstanding', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { SupplierPayable } = req.businessModels;
    const supplierId = req.params.id;
    const branchId = req.user.branchId;

    const payables = await SupplierPayable.find({ supplierId, branchId, status: { $in: ['pending', 'partial'] } })
      .populate('purchaseOrderId', 'poNumber orderDate')
      .populate('purchaseInvoiceId', 'invoiceNumber supplierInvoiceNumber invoiceDate')
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    const outstanding = payables.reduce((sum, p) => sum + (p.totalAmount - (p.amountPaid || 0)), 0);

    res.json({ success: true, data: { outstanding, payables } });
  } catch (error) {
    logger.error('Error fetching supplier outstanding:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/** All supplier payments recorded against any payable for this supplier (newest first). */
app.get('/api/suppliers/:id/payments', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { Supplier, SupplierPayable, SupplierPayment } = req.businessModels;
    const supplierId = req.params.id;
    const branchId = req.user.branchId;

    const supplier = await Supplier.findOne({ _id: supplierId, branchId });
    if (!supplier) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }

    const payableIds = await SupplierPayable.find({ supplierId, branchId }).distinct('_id');
    if (!payableIds.length) {
      return res.json({ success: true, data: [] });
    }

    const payments = await SupplierPayment.find({
      supplierPayableId: { $in: payableIds },
      branchId
    })
      .populate({
        path: 'supplierPayableId',
        select: 'purchaseOrderId purchaseInvoiceId',
        populate: [
          { path: 'purchaseOrderId', select: 'poNumber' },
          { path: 'purchaseInvoiceId', select: 'invoiceNumber supplierInvoiceNumber' }
        ]
      })
      .sort({ paymentDate: -1, createdAt: -1, _id: -1 })
      .lean();

    const data = payments.map((pay) => {
      const payable = pay.supplierPayableId;
      const payableRef =
        payable && typeof payable === 'object'
          ? formatSupplierPayableBillRef(payable)
          : '—';
      return {
        _id: pay._id,
        paymentDate: pay.paymentDate,
        amount: pay.amount,
        paymentMethod: pay.paymentMethod,
        payableReferenceNumber: payableRef
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error fetching supplier payments:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * One payment allocated across payables FIFO by due date (oldest due first), then _id tie-break.
 * Mirrors paying the earliest bill in full before applying remainder to the next.
 */
app.post(
  '/api/suppliers/:id/payments/auto-allocate',
  authenticateToken,
  setupBusinessDatabase,
  requireStaff,
  async (req, res) => {
    try {
      const { Supplier, SupplierPayable, SupplierPayment } = req.businessModels;
      const supplierId = req.params.id;
      const branchId = req.user.branchId;

      const supplier = await Supplier.findOne({ _id: supplierId, branchId });
      if (!supplier) {
        return res.status(404).json({ success: false, error: 'Supplier not found' });
      }

      const { amount, paymentMethod, paymentDate, reference, notes } = req.body;
      const payAmountRaw = parseFloat(amount);
      if (!payAmountRaw || payAmountRaw <= 0) {
        return res.status(400).json({ success: false, error: 'Valid amount is required' });
      }
      const payAmountRound = Math.round(payAmountRaw * 100) / 100;

      const payableDocs = await SupplierPayable.find({
        supplierId,
        branchId,
        status: { $in: ['pending', 'partial'] },
      }).sort({ dueDate: 1, _id: 1 });

      const queue = [];
      let totalDue = 0;
      for (const p of payableDocs) {
        const bal = Math.round((p.totalAmount - (p.amountPaid || 0)) * 100) / 100;
        if (bal > 0.005) {
          queue.push({ doc: p, balance: bal });
          totalDue = Math.round((totalDue + bal) * 100) / 100;
        }
      }

      if (totalDue <= 0.005) {
        return res.status(400).json({ success: false, error: 'No outstanding dues for this supplier' });
      }

      if (payAmountRound > totalDue + 0.01) {
        return res.status(400).json({
          success: false,
          error: `Amount cannot exceed total outstanding (₹${totalDue.toFixed(2)})`,
        });
      }

      const meth = paymentMethod || 'Cash';
      const pd =
        paymentDate !== undefined &&
        paymentDate !== null &&
        String(paymentDate).trim()
          ? parseSupplierPaymentDateInput(paymentDate)
          : new Date();
      const ref = reference != null ? String(reference).trim() : '';
      const noteTxt = notes != null ? String(notes).trim() : '';

      let remaining = payAmountRound;
      const allocations = [];
      const createdPayments = [];

      for (const { doc: payable, balance } of queue) {
        if (remaining <= 0.005) break;
        const apply = Math.round(Math.min(remaining, balance) * 100) / 100;
        if (apply <= 0) continue;

        const payment = new SupplierPayment({
          supplierPayableId: payable._id,
          amount: apply,
          paymentMethod: meth,
          paymentDate: pd,
          reference: ref,
          notes: noteTxt,
          branchId,
          createdBy: req.user._id,
        });
        await payment.save();
        createdPayments.push(payment);

        payable.amountPaid = Math.round(((payable.amountPaid || 0) + apply) * 100) / 100;
        payable.status = payable.amountPaid >= payable.totalAmount - 0.005 ? 'paid' : 'partial';
        if (payable.status === 'paid') {
          payable.paidOn = pd;
        }
        await payable.save();

        await syncPurchaseInvoiceFromPayablePayment(req, payable, meth);

        const balAfter = Math.max(
          0,
          Math.round((payable.totalAmount - payable.amountPaid) * 100) / 100
        );
        allocations.push({
          payableId: payable._id,
          amountApplied: apply,
          balanceAfter: balAfter,
        });

        remaining = Math.round((remaining - apply) * 100) / 100;
      }

      if (remaining > 0.02) {
        logger.warn('supplier auto-allocate remaining unexpected', { supplierId, remaining });
      }

      res.json({
        success: true,
        data: {
          totalApplied: Math.round((payAmountRound - Math.max(0, remaining)) * 100) / 100,
          allocations,
        },
      });
    } catch (error) {
      logger.error('Error auto-allocating supplier payment:', error);
      res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  }
);

// Create a new supplier
app.post('/api/suppliers', authenticateToken, setupBusinessDatabase, requirePermission('products', 'create'), async (req, res) => {
  try {
    const { Supplier } = req.businessModels;
    const { name, contactPerson, phone, whatsapp, email, address, gstNumber, paymentTerms, bankDetails, categories, notes } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Supplier name is required'
      });
    }

    // Check if supplier with same name already exists for this branch
    const existingSupplier = await Supplier.findOne({
      branchId: req.user.branchId,
      name: { $regex: new RegExp(`^${name}$`, 'i') }
    });

    if (existingSupplier) {
      return res.status(400).json({
        success: false,
        error: 'A supplier with this name already exists'
      });
    }

    // Create new supplier
    const supplier = new Supplier({
      name: name.trim(),
      contactPerson: contactPerson || '',
      phone: phone || '',
      whatsapp: whatsapp || '',
      email: email || '',
      address: address || '',
      gstNumber: gstNumber || '',
      paymentTerms: paymentTerms || '30',
      bankDetails: bankDetails || '',
      categories: Array.isArray(categories) ? categories.filter(Boolean) : [],
      notes: notes || '',
      branchId: req.user.branchId,
      isActive: true
    });

    await supplier.save();

    res.status(201).json({
      success: true,
      data: supplier
    });
  } catch (error) {
    logger.error('Error creating supplier:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update a supplier
app.put('/api/suppliers/:id', authenticateToken, setupBusinessDatabase, requirePermission('products', 'edit'), async (req, res) => {
  try {
    const { Supplier } = req.businessModels;
    const { name, contactPerson, phone, whatsapp, email, address, gstNumber, paymentTerms, bankDetails, categories, notes, isActive } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Supplier name is required'
      });
    }

    // Check if another supplier with same name exists
    const existingSupplier = await Supplier.findOne({
      _id: { $ne: req.params.id },
      branchId: req.user.branchId,
      name: { $regex: new RegExp(`^${name}$`, 'i') }
    });

    if (existingSupplier) {
      return res.status(400).json({
        success: false,
        error: 'A supplier with this name already exists'
      });
    }

    const updateFields = {
      name: name.trim(),
      contactPerson: contactPerson || '',
      phone: phone || '',
      whatsapp: whatsapp !== undefined ? whatsapp : undefined,
      email: email || '',
      address: address || '',
      gstNumber: gstNumber !== undefined ? gstNumber : undefined,
      paymentTerms: paymentTerms !== undefined ? paymentTerms : undefined,
      bankDetails: bankDetails !== undefined ? bankDetails : undefined,
      categories: categories !== undefined ? (Array.isArray(categories) ? categories.filter(Boolean) : []) : undefined,
      notes: notes || '',
      isActive: isActive !== undefined ? isActive : true
    };
    Object.keys(updateFields).forEach(k => updateFields[k] === undefined && delete updateFields[k]);

    const updatedSupplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    );

    if (!updatedSupplier) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      });
    }

    res.json({
      success: true,
      data: updatedSupplier
    });
  } catch (error) {
    logger.error('Error updating supplier:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Delete a supplier
app.delete('/api/suppliers/:id', authenticateToken, setupBusinessDatabase, requirePermission('products', 'delete'), async (req, res) => {
  try {
    const { Supplier } = req.businessModels;
    const deletedSupplier = await Supplier.findByIdAndDelete(req.params.id);

    if (!deletedSupplier) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      });
    }

    res.json({
      success: true,
      message: 'Supplier deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting supplier:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ==================== PURCHASE ORDER ROUTES ====================

// Increment PO number (atomic)
app.post('/api/settings/business/increment-purchase-order', authenticateToken, async (req, res) => {
  try {
    const businessId = req.user?.branchId;
    if (!businessId) {
      return res.status(400).json({ success: false, error: 'Business ID not found' });
    }
    const mainConnection = await databaseManager.getMainConnection();
    const businessConnection = await databaseManager.getConnection(businessId, mainConnection);
    const businessModels = modelFactory.createBusinessModels(businessConnection);
    const { BusinessSettings, PurchaseOrder } = businessModels;

    let settings = await BusinessSettings.findOne({ branchId: businessId });
    if (!settings) {
      settings = new BusinessSettings({ branchId: businessId, purchaseOrderNumber: 0 });
      await settings.save();
    }

    const updated = await BusinessSettings.findOneAndUpdate(
      { _id: settings._id },
      { $inc: { purchaseOrderNumber: 1 } },
      { new: true }
    );
    const newNumber = updated.purchaseOrderNumber;
    const poNumber = `PO-${newNumber.toString().padStart(6, '0')}`;

    const existing = await PurchaseOrder.findOne({ branchId: businessId, poNumber });
    if (existing) {
      let nextNum = newNumber + 1;
      let attempts = 0;
      while (attempts < 500) {
        const nextPo = `PO-${nextNum.toString().padStart(6, '0')}`;
        if (!(await PurchaseOrder.findOne({ branchId: businessId, poNumber: nextPo }))) {
          await BusinessSettings.findByIdAndUpdate(settings._id, { purchaseOrderNumber: nextNum });
          return res.json({ success: true, data: { poNumber: nextPo, purchaseOrderNumber: nextNum } });
        }
        nextNum++;
        attempts++;
      }
    }

    res.json({ success: true, data: { poNumber, purchaseOrderNumber: newNumber } });
  } catch (error) {
    logger.error('Error incrementing PO number:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get all purchase orders
app.get('/api/purchase-orders', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { PurchaseOrder, Supplier } = req.businessModels;
    const { supplier, status, dateFrom, dateTo, search } = req.query;
    const branchId = req.user.branchId;

    let query = { branchId };
    if (supplier) query.supplierId = supplier;
    if (status) query.status = status;
    if (dateFrom || dateTo) {
      query.orderDate = {};
      if (dateFrom) query.orderDate.$gte = new Date(dateFrom);
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        query.orderDate.$lte = d;
      }
    }
    if (search && String(search).trim()) {
      const s = String(search).trim();
      const rx = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const supIds = await Supplier.find({ branchId, name: rx }).select('_id').lean();
      const sidList = supIds.map((x) => x._id);
      query.$or = [
        { poNumber: rx },
        ...(sidList.length ? [{ supplierId: { $in: sidList } }] : [])
      ];
    }

    const orders = await PurchaseOrder.find(query)
      .populate('supplierId', 'name contactPerson phone')
      .sort({ orderDate: -1, createdAt: -1, _id: -1 })
      .lean();

    const normalized = orders.map((o) => {
      if (o.status === 'received') return { ...o, status: 'fully_received' };
      return o;
    });

    res.json({ success: true, data: normalized });
  } catch (error) {
    logger.error('Error fetching purchase orders:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get single purchase order
app.get('/api/purchase-orders/:id', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { PurchaseOrder, SupplierPayable } = req.businessModels;
    const order = await PurchaseOrder.findById(req.params.id)
      .populate('supplierId')
      .lean();
    if (!order || order.branchId.toString() !== req.user.branchId.toString()) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }
    if (order.status === 'received') {
      order.status = 'fully_received';
    }
    const payable = await SupplierPayable.findOne({ purchaseOrderId: order._id }).lean();
    const receivedMap = {};
    for (const ri of order.receivedItems || []) {
      const pid = (ri.productId?._id || ri.productId)?.toString();
      if (pid) receivedMap[pid] = parseFloat(ri.receivedQty) || 0;
    }
    const lineProgress = (order.items || []).map((item) => {
      const pid = (item.productId?._id || item.productId)?.toString();
      const ordered = parseFloat(item.quantity) || 0;
      const received = receivedMap[pid] || 0;
      return {
        productId: item.productId,
        productName: item.productName,
        orderedQty: ordered,
        receivedQty: received,
        pendingQty: Math.max(0, ordered - received)
      };
    });
    res.json({ success: true, data: { ...order, payable, lineProgress } });
  } catch (error) {
    logger.error('Error fetching purchase order:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Create purchase order
app.post('/api/purchase-orders', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { PurchaseOrder, Supplier } = req.businessModels;
    const { supplierId, orderDate, expectedDeliveryDate, items, notes, status } = req.body;

    const allowedCreateStatus = ['draft', 'sent', 'ordered'];
    const initialStatus = status || 'draft';
    if (!allowedCreateStatus.includes(initialStatus)) {
      return res.status(400).json({ success: false, error: 'Invalid purchase order status' });
    }

    if (!supplierId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Supplier and items are required' });
    }

    for (const it of items) {
      const nameRaw = typeof it.productName === 'string' ? it.productName.trim() : '';
      if (!nameRaw) {
        return res.status(400).json({ success: false, error: 'Each line item needs a product name' });
      }
      const qty = parseFloat(it.quantity);
      if (!(qty >= 1)) {
        return res.status(400).json({ success: false, error: 'Each item needs quantity at least 1' });
      }
      if (!it.productId) {
        return res.status(400).json({ success: false, error: 'Each item needs a product selected' });
      }
    }

    const supplier = await Supplier.findById(supplierId);
    if (!supplier || supplier.branchId.toString() !== req.user.branchId.toString()) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }

    let poNumber = req.body.poNumber;
    if (!poNumber) {
      const { BusinessSettings } = req.businessModels;
      let settings = await BusinessSettings.findOne({ branchId: req.user.branchId });
      if (!settings) {
        settings = new BusinessSettings({ branchId: req.user.branchId, purchaseOrderNumber: 0 });
        await settings.save();
      }
      const updated = await BusinessSettings.findOneAndUpdate(
        { _id: settings._id },
        { $inc: { purchaseOrderNumber: 1 } },
        { new: true }
      );
      const num = updated.purchaseOrderNumber;
      poNumber = `PO-${num.toString().padStart(6, '0')}`;
      const existing = await PurchaseOrder.findOne({ branchId: req.user.branchId, poNumber });
      if (existing) {
        let nextNum = num + 1;
        for (let i = 0; i < 500; i++) {
          poNumber = `PO-${nextNum.toString().padStart(6, '0')}`;
          if (!(await PurchaseOrder.findOne({ branchId: req.user.branchId, poNumber }))) {
            await BusinessSettings.findByIdAndUpdate(settings._id, { purchaseOrderNumber: nextNum });
            break;
          }
          nextNum++;
        }
      }
    }

    /** PO lines are qty-only; pricing is captured on the purchase invoice after receipt. */
    const validItems = items.map((it) => {
      const qty = parseFloat(it.quantity) || 0;
      return {
        productId: it.productId,
        productName: it.productName || 'Product',
        quantity: qty,
        unitCost: 0,
        gstPercent: 0,
        total: 0,
      };
    });
    const subtotal = 0;
    const gstAmount = 0;
    const grandTotal = 0;

    const po = new PurchaseOrder({
      poNumber,
      supplierId,
      orderDate: orderDate ? new Date(orderDate) : new Date(),
      expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
      status: initialStatus,
      items: validItems,
      subtotal,
      gstAmount,
      grandTotal,
      notes: notes || '',
      branchId: req.user.branchId,
      createdBy: req.user._id
    });
    await po.save();

    res.status(201).json({ success: true, data: po });
  } catch (error) {
    logger.error('Error creating purchase order:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

// Update purchase order (draft only)
app.put('/api/purchase-orders/:id', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { PurchaseOrder, Supplier } = req.businessModels;
    const po = await PurchaseOrder.findById(req.params.id);
    if (!po || po.branchId.toString() !== req.user.branchId.toString()) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }
    if (po.status !== 'draft') {
      return res.status(400).json({ success: false, error: 'Only draft orders can be updated' });
    }

    const { supplierId, orderDate, expectedDeliveryDate, items, notes } = req.body;
    if (supplierId) {
      const supplier = await Supplier.findById(supplierId);
      if (!supplier) return res.status(404).json({ success: false, error: 'Supplier not found' });
      po.supplierId = supplierId;
    }
    if (orderDate) po.orderDate = new Date(orderDate);
    if (expectedDeliveryDate !== undefined) po.expectedDeliveryDate = expectedDeliveryDate ? new Date(expectedDeliveryDate) : null;
    if (notes !== undefined) po.notes = notes;

    if (items && Array.isArray(items) && items.length > 0) {
      for (const it of items) {
        const nameRaw = typeof it.productName === 'string' ? it.productName.trim() : '';
        if (!nameRaw) {
          return res.status(400).json({ success: false, error: 'Each line item needs a product name' });
        }
        const qty = parseFloat(it.quantity);
        if (!(qty >= 1)) {
          return res.status(400).json({ success: false, error: 'Each item needs quantity at least 1' });
        }
        if (!it.productId) {
          return res.status(400).json({ success: false, error: 'Each item needs a product selected' });
        }
      }
      po.items = items.map((it) => {
        const qty = parseFloat(it.quantity) || 0;
        return {
          productId: it.productId,
          productName: it.productName || 'Product',
          quantity: qty,
          unitCost: 0,
          gstPercent: 0,
          total: 0,
        };
      });
      po.subtotal = 0;
      po.gstAmount = 0;
      po.grandTotal = 0;
    }
    await po.save();
    res.json({ success: true, data: po });
  } catch (error) {
    logger.error('Error updating purchase order:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Mark PO as received (GRN)
app.post('/api/purchase-orders/:id/receive', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { PurchaseOrder, Product, InventoryTransaction, SupplierPayable, Supplier } = req.businessModels;
    const po = await PurchaseOrder.findById(req.params.id).populate('supplierId');
    if (!po || po.branchId.toString() !== req.user.branchId.toString()) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }
    if (po.status === 'cancelled') {
      return res.status(400).json({ success: false, error: 'Cannot receive a cancelled order' });
    }
    if (po.status === 'draft') {
      return res.status(400).json({ success: false, error: 'Send or confirm the order before receiving stock' });
    }
    if (po.status === 'fully_received' || po.status === 'received') {
      return res.status(400).json({ success: false, error: 'Order is already fully received' });
    }

    /** recordInventory: when true, bumps stock at GRN (legacy / explicit opt-in). */
    const {
      receivedItems,
      invoiceUrl,
      grnNotes,
      supplierInvoiceNumber,
      recordInventory,
    } = req.body;
    const bumpInventory = recordInventory === true;
    const trimmedSupplierInvoice = typeof supplierInvoiceNumber === 'string' ? supplierInvoiceNumber.trim() : '';
    if (!receivedItems || !Array.isArray(receivedItems) || receivedItems.length === 0) {
      return res.status(400).json({ success: false, error: 'receivedItems array is required' });
    }

    const receivedMap = {};
    for (const ri of receivedItems) {
      const pid = (ri.productId || ri._id || ri).toString();
      receivedMap[pid] = { receivedQty: parseFloat(ri.receivedQty) || 0, unitCost: parseFloat(ri.unitCost) || 0 };
    }

    for (const item of po.items) {
      const pid = item.productId.toString();
      const rec = receivedMap[pid];
      const thisDeliveryQty = rec ? rec.receivedQty : 0;
      if (thisDeliveryQty > 0 && bumpInventory) {
        const uc = rec.unitCost;
        if (!(uc > 0)) {
          return res.status(400).json({
            success: false,
            error: 'Enter a unit cost (landing cost ₹) greater than zero for each line you receive. Supplier billing stays on the purchase invoice.',
          });
        }
      }
    }

    // For partially_received POs, accumulate with previous deliveries
    const existingReceivedMap = {};
    if (
      (po.status === 'partially_received' || po.status === 'fully_received' || po.status === 'received') &&
      Array.isArray(po.receivedItems)
    ) {
      for (const ri of po.receivedItems) {
        const pid = (ri.productId || ri._id || ri).toString();
        existingReceivedMap[pid] = parseFloat(ri.receivedQty) || 0;
      }
    }

    /** Book-only GRN: refuse duplicate booking when totals already match the PO */
    if (!bumpInventory) {
      const fullyBookedAlready = po.items.every((item) => {
        const pid = item.productId.toString();
        const prev = existingReceivedMap[pid] || 0;
        const qty = parseFloat(item.quantity) || 0;
        return prev >= qty - 1e-9;
      });
      if (fullyBookedAlready) {
        return res.status(400).json({
          success: false,
          error:
            'All ordered quantities are already booked on this purchase order. Post the linked purchase invoice to complete it.',
        });
      }
    }

    let allReceived = true;
    let anyReceived = false;
    const processedItems = [];

    for (const item of po.items) {
      const pid = item.productId.toString();
      const rec = receivedMap[pid];
      const thisDeliveryQty = rec ? rec.receivedQty : 0;
      const unitCost = rec ? rec.unitCost : item.unitCost;
      const previouslyReceived = existingReceivedMap[pid] || 0;
      const cumulativeReceived = previouslyReceived + thisDeliveryQty;

      if (thisDeliveryQty > 0) {
        anyReceived = true;
        if (bumpInventory) {
          const product = await Product.findById(pid);
          if (product) {
            const prevStock = product.stock || 0;
            const newStock = prevStock + thisDeliveryQty;
            await Product.findByIdAndUpdate(pid, { stock: newStock, cost: unitCost });

            await new InventoryTransaction({
              productId: product._id,
              productName: product.name,
              transactionType: 'purchase_order_receipt',
              quantity: thisDeliveryQty,
              previousStock: prevStock,
              newStock,
              unitCost,
              totalValue: thisDeliveryQty * unitCost,
              referenceType: 'purchase_order',
              referenceId: po._id.toString(),
              referenceNumber: po.poNumber,
              purchaseOrderId: po._id,
              processedBy: req.user.email || 'System',
              location: 'main',
              reason: po.status === 'partially_received' ? 'Partial delivery - remaining goods received' : 'Goods received from PO',
              notes: grnNotes || '',
              transactionDate: new Date()
            }).save();
          }
        }
        processedItems.push({ productId: item.productId, orderedQty: item.quantity, receivedQty: cumulativeReceived, unitCost });
      } else {
        processedItems.push({ productId: item.productId, orderedQty: item.quantity, receivedQty: previouslyReceived, unitCost });
      }
      if (cumulativeReceived < item.quantity) allReceived = false;
    }

    if (!anyReceived) {
      return res.status(400).json({ success: false, error: 'At least one item must have received quantity > 0' });
    }

    const receivedAt = new Date();
    po.receivedAt = receivedAt;
    po.receivedItems = processedItems;
    po.invoiceUrl = invoiceUrl || '';
    po.grnNotes = grnNotes || '';
    po.supplierInvoiceNumber = trimmedSupplierInvoice;

    // Build delivery event for this receive (what was received in THIS delivery)
    const thisDeliveryItems = [];
    for (const item of po.items) {
      const pid = item.productId.toString();
      const rec = receivedMap[pid];
      const thisDeliveryQty = rec ? rec.receivedQty : 0;
      const unitCost = rec ? rec.unitCost : item.unitCost;
      if (thisDeliveryQty > 0) {
        thisDeliveryItems.push({
          productId: item.productId,
          productName: item.productName,
          receivedQty: thisDeliveryQty,
          unitCost
        });
      }
    }
    const deliveryEvent = {
      receivedAt,
      receivedItems: thisDeliveryItems,
      grnNotes: grnNotes || '',
      supplierInvoiceNumber: trimmedSupplierInvoice,
      recordedInventory: bumpInventory,
    };
    if (!po.deliveryHistory) po.deliveryHistory = [];
    po.deliveryHistory.push(deliveryEvent);

    if (bumpInventory) {
      po.status = allReceived ? 'fully_received' : 'partially_received';
    } else {
      po.status = 'partially_received';
    }
    await po.save();

    const grandTotal = po.grandTotal || 0;
    const paymentTerms = parseInt(po.supplierId?.paymentTerms || '30', 10) || 30;
    const dueDate = new Date(po.orderDate);
    dueDate.setDate(dueDate.getDate() + paymentTerms);

    let payable = await SupplierPayable.findOne({ purchaseOrderId: po._id });
    /** Qty-only POs bill on purchase invoice — no ₹0 payable at GRN. */
    if (!payable && grandTotal > 0.005) {
      payable = new SupplierPayable({
        purchaseOrderId: po._id,
        supplierId: po.supplierId._id || po.supplierId,
        totalAmount: grandTotal,
        amountPaid: 0,
        dueDate,
        status: 'pending',
        branchId: req.user.branchId
      });
      await payable.save();
    }

    res.json({ success: true, data: { purchaseOrder: po, payable } });
  } catch (error) {
    logger.error('Error receiving purchase order:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

// Update purchase order workflow status (draft → sent → ordered)
app.post('/api/purchase-orders/:id/status', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { PurchaseOrder } = req.businessModels;
    const { status } = req.body;
    const allowed = ['draft', 'sent', 'ordered'];
    if (!status || !allowed.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status. Use draft, sent, or ordered.' });
    }
    const po = await PurchaseOrder.findById(req.params.id);
    if (!po || po.branchId.toString() !== req.user.branchId.toString()) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }
    const rank = { draft: 0, sent: 1, ordered: 2 };
    let current = po.status === 'received' ? 'fully_received' : po.status;
    if (['partially_received', 'fully_received', 'cancelled'].includes(current)) {
      return res.status(400).json({ success: false, error: 'Cannot change workflow status for this order' });
    }
    if (!(current in rank) || !(status in rank)) {
      return res.status(400).json({ success: false, error: 'Invalid workflow transition' });
    }
    if (rank[status] < rank[current]) {
      return res.status(400).json({ success: false, error: 'Cannot revert to an earlier workflow status' });
    }
    po.status = status;
    await po.save();
    res.json({ success: true, data: po });
  } catch (error) {
    logger.error('Error updating PO status:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

// Cancel purchase order
app.post('/api/purchase-orders/:id/cancel', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { PurchaseOrder } = req.businessModels;
    const po = await PurchaseOrder.findById(req.params.id);
    if (!po || po.branchId.toString() !== req.user.branchId.toString()) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }
    if (po.status === 'fully_received' || po.status === 'received' || po.status === 'partially_received') {
      return res.status(400).json({ success: false, error: 'Cannot cancel received order' });
    }
    po.status = 'cancelled';
    await po.save();
    res.json({ success: true, data: po });
  } catch (error) {
    logger.error('Error cancelling purchase order:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Permanently delete a cancelled purchase order (no linked purchase invoices).
app.delete('/api/purchase-orders/:id', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { PurchaseOrder, PurchaseInvoice } = req.businessModels;
    const branchId = req.user.branchId;
    const po = await PurchaseOrder.findById(req.params.id);
    if (!po || po.branchId.toString() !== branchId.toString()) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }
    if (po.status !== 'cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Only cancelled purchase orders can be permanently deleted',
      });
    }
    const linkedCount = await PurchaseInvoice.countDocuments({
      branchId,
      purchaseOrderId: po._id,
    });
    if (linkedCount > 0) {
      return res.status(400).json({
        success: false,
        error:
          'This order still has linked purchase invoices. Delete those records first if they are already cancelled.',
      });
    }
    await PurchaseOrder.deleteOne({ _id: po._id });
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting purchase order:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ==================== SUPPLIER PAYABLE ROUTES ====================

/** Keep PurchaseInvoice paid/due in sync when payments are recorded against a payable tied to a PI. */
async function syncPurchaseInvoiceFromPayablePayment(req, payable, lastPaymentMethod) {
  try {
    const { PurchaseInvoice } = req.businessModels;
    const piId = payable.purchaseInvoiceId;
    if (!piId) return;
    const inv = await PurchaseInvoice.findById(piId);
    if (!inv || inv.branchId.toString() !== req.user.branchId.toString()) return;
    const grand = inv.grandTotal || 0;
    const paidRaw = payable.amountPaid || 0;
    const paid = Math.round(Math.min(paidRaw, grand) * 100) / 100;
    inv.paidAmount = paid;
    inv.dueAmount = Math.round((grand - paid) * 100) / 100;
    if (paid <= 0.005) inv.paymentStatus = 'unpaid';
    else if (paid >= grand - 0.005) inv.paymentStatus = 'paid';
    else inv.paymentStatus = 'partially_paid';
    if (lastPaymentMethod && String(lastPaymentMethod).trim()) {
      inv.paymentMethod = String(lastPaymentMethod).trim();
    }
    await inv.save();
  } catch (e) {
    logger.error('syncPurchaseInvoiceFromPayablePayment', e);
  }
}

app.get('/api/supplier-payables', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { SupplierPayable, SupplierPayment, PurchaseInvoice, PurchaseOrder } = req.businessModels;
    const { supplier, status, search, dateFrom, dateTo } = req.query;
    const branchId = req.user.branchId;

    let query = { branchId };
    if (supplier) query.supplierId = supplier;
    if (status) query.status = status;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        query.createdAt.$lte = d;
      }
    }

    const searchTrim = search != null ? String(search).trim() : '';
    if (searchTrim) {
      const rx = new RegExp(searchTrim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const [piIds, poIds] = await Promise.all([
        PurchaseInvoice.find({
          branchId,
          $or: [{ supplierInvoiceNumber: rx }, { invoiceNumber: rx }]
        })
          .select('_id')
          .lean(),
        PurchaseOrder.find({ branchId, poNumber: rx }).select('_id').lean()
      ]);
      const piIdList = piIds.map((x) => x._id);
      const poIdList = poIds.map((x) => x._id);
      if (piIdList.length === 0 && poIdList.length === 0) {
        return res.json({ success: true, data: [] });
      }
      query.$or = [
        ...(piIdList.length ? [{ purchaseInvoiceId: { $in: piIdList } }] : []),
        ...(poIdList.length ? [{ purchaseOrderId: { $in: poIdList } }] : [])
      ];
    }

    const payables = await SupplierPayable.find(query)
      .populate('supplierId', 'name contactPerson phone')
      .populate('purchaseOrderId', 'poNumber orderDate status')
      .populate('purchaseInvoiceId', 'invoiceNumber supplierInvoiceNumber invoiceDate status grandTotal')
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    const paidIdsWithoutPaidOn = payables.filter((p) => p.status === 'paid' && !p.paidOn).map((p) => p._id);
    let lastPaymentMap = {};
    if (paidIdsWithoutPaidOn.length > 0) {
      const lastPayments = await SupplierPayment.aggregate([
        { $match: { supplierPayableId: { $in: paidIdsWithoutPaidOn } } },
        { $sort: { paymentDate: -1 } },
        { $group: { _id: '$supplierPayableId', paymentDate: { $first: '$paymentDate' } } }
      ]);
      lastPaymentMap = lastPayments.reduce((acc, lp) => {
        acc[lp._id.toString()] = lp.paymentDate;
        return acc;
      }, {});
    }

    const withBalance = payables.map((p) => {
      const paidOn = p.paidOn || (p.status === 'paid' ? lastPaymentMap[p._id.toString()] : null);
      return {
        ...p,
        balanceDue: Math.max(0, p.totalAmount - (p.amountPaid || 0)),
        paidOn: paidOn || p.paidOn
      };
    });

    res.json({ success: true, data: withBalance });
  } catch (error) {
    logger.error('Error fetching supplier payables:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.get('/api/supplier-payables/:id', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { SupplierPayable, SupplierPayment } = req.businessModels;
    const payable = await SupplierPayable.findById(req.params.id)
      .populate('supplierId')
      .populate('purchaseOrderId')
      .populate('purchaseInvoiceId', 'invoiceNumber supplierInvoiceNumber invoiceDate status grandTotal paymentStatus')
      .lean();
    if (!payable || payable.branchId.toString() !== req.user.branchId.toString()) {
      return res.status(404).json({ success: false, error: 'Payable not found' });
    }
    const payments = await SupplierPayment.find({ supplierPayableId: payable._id }).sort({ paymentDate: -1 }).lean();
    res.json({
      success: true,
      data: {
        ...payable,
        balanceDue: Math.max(0, payable.totalAmount - (payable.amountPaid || 0)),
        payments
      }
    });
  } catch (error) {
    logger.error('Error fetching payable:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post('/api/supplier-payables/:id/payments', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { SupplierPayable, SupplierPayment } = req.businessModels;
    const payable = await SupplierPayable.findById(req.params.id);
    if (!payable || payable.branchId.toString() !== req.user.branchId.toString()) {
      return res.status(404).json({ success: false, error: 'Payable not found' });
    }

    const { amount, paymentMethod, paymentDate, reference, notes } = req.body;
    const payAmount = parseFloat(amount);
    if (!payAmount || payAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Valid amount is required' });
    }
    const balance = payable.totalAmount - (payable.amountPaid || 0);
    if (payAmount > balance) {
      return res.status(400).json({ success: false, error: `Amount cannot exceed balance due (₹${balance.toFixed(2)})` });
    }

    const paymentInstant =
      paymentDate !== undefined &&
      paymentDate !== null &&
      String(paymentDate).trim()
        ? parseSupplierPaymentDateInput(paymentDate)
        : new Date();

    const payment = new SupplierPayment({
      supplierPayableId: payable._id,
      amount: payAmount,
      paymentMethod: paymentMethod || 'Cash',
      paymentDate: paymentInstant,
      reference: reference || '',
      notes: notes || '',
      branchId: req.user.branchId,
      createdBy: req.user._id
    });
    await payment.save();

    payable.amountPaid = (payable.amountPaid || 0) + payAmount;
    payable.status = payable.amountPaid >= payable.totalAmount ? 'paid' : 'partial';
    if (payable.status === 'paid') {
      payable.paidOn = payment.paymentDate || new Date();
    }
    await payable.save();

    await syncPurchaseInvoiceFromPayablePayment(req, payable, payment.paymentMethod);

    const updated = await SupplierPayable.findById(req.params.id)
      .populate('supplierId')
      .populate('purchaseOrderId')
      .populate('purchaseInvoiceId', 'invoiceNumber supplierInvoiceNumber invoiceDate status grandTotal paymentStatus paidAmount dueAmount')
      .lean();

    res.json({
      success: true,
      data: {
        payable: { ...updated, balanceDue: Math.max(0, updated.totalAmount - (updated.amountPaid || 0)) },
        payment
      }
    });
  } catch (error) {
    logger.error('Error recording payment:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ==================== SUPPLIER & PURCHASE REPORTS ====================

app.get('/api/reports/supplier', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.ADVANCED_REPORTS), reportCacheMiddleware, async (req, res) => {
  try {
    const { PurchaseOrder, SupplierPayable, Supplier } = req.businessModels;
    const branchId = req.user.branchId;
    const { dateFrom, dateTo } = req.query;

    let dateFilter = {};
    if (dateFrom || dateTo) {
      dateFilter.orderDate = {};
      if (dateFrom) dateFilter.orderDate.$gte = new Date(dateFrom);
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        dateFilter.orderDate.$lte = d;
      }
    }

    const pos = await PurchaseOrder.find({ branchId, status: { $in: ['ordered', 'partially_received', 'received', 'fully_received'] }, ...dateFilter })
      .populate('supplierId', 'name')
      .lean();

    const supplierTotals = {};
    const productCounts = {};
    for (const po of pos) {
      const sid = (po.supplierId?._id || po.supplierId)?.toString();
      if (sid) {
        supplierTotals[sid] = (supplierTotals[sid] || 0) + (po.grandTotal || 0);
        for (const item of po.items || []) {
          const pid = (item.productId?._id || item.productId)?.toString();
          const key = `${sid}::${pid}`;
          const prev = productCounts[key] || { quantity: 0, productName: item.productName || 'Product' };
          productCounts[key] = { quantity: prev.quantity + (item.quantity || 0), productName: prev.productName };
        }
      }
    }

    const payables = await SupplierPayable.find({ branchId, status: { $in: ['pending', 'partial'] } }).lean();
    const outstandingBySupplier = {};
    for (const p of payables) {
      const sid = p.supplierId?.toString();
      if (sid) {
        outstandingBySupplier[sid] = (outstandingBySupplier[sid] || 0) + Math.max(0, (p.totalAmount || 0) - (p.amountPaid || 0));
      }
    }

    const suppliers = await Supplier.find({ branchId }).lean();
    const report = suppliers.map((s) => {
      const sid = s._id.toString();
      const totalPurchased = supplierTotals[sid] || 0;
      const outstanding = outstandingBySupplier[sid] || 0;
      const topProducts = Object.entries(productCounts)
        .filter(([k]) => k.startsWith(sid + '::'))
        .sort((a, b) => (b[1]?.quantity || 0) - (a[1]?.quantity || 0))
        .slice(0, 5)
        .map(([k, v]) => ({ productId: k.split('::')[1], productName: v?.productName || 'Product', quantity: v?.quantity || 0 }));
      return { supplier: s, totalPurchased, outstanding, topProducts };
    });

    res.json({ success: true, data: report });
  } catch (error) {
    logger.error('Error fetching supplier report:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.get('/api/reports/purchase', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.ADVANCED_REPORTS), reportCacheMiddleware, async (req, res) => {
  try {
    const { PurchaseOrder, Supplier } = req.businessModels;
    const branchId = req.user.branchId;
    const { dateFrom, dateTo } = req.query;

    let dateFilter = {};
    if (dateFrom || dateTo) {
      dateFilter.orderDate = {};
      if (dateFrom) dateFilter.orderDate.$gte = new Date(dateFrom);
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        dateFilter.orderDate.$lte = d;
      }
    }

    const pos = await PurchaseOrder.find({ branchId, status: { $in: ['ordered', 'partially_received', 'received', 'fully_received'] }, ...dateFilter })
      .populate('supplierId', 'name categories')
      .lean();

    let monthlyTotal = 0;
    let gstTotal = 0;
    const categorySpend = {};
    for (const po of pos) {
      monthlyTotal += po.grandTotal || 0;
      gstTotal += po.gstAmount || 0;
      const cats = Array.isArray(po.supplierId?.categories) && po.supplierId.categories.length > 0
        ? po.supplierId.categories
        : (po.supplierId?.category ? [po.supplierId.category] : ['other']);
      for (const cat of cats) {
        if (cat) categorySpend[cat] = (categorySpend[cat] || 0) + (po.grandTotal || 0);
      }
    }

    res.json({
      success: true,
      data: {
        monthlyTotal,
        gstTotal,
        categorySpend: Object.entries(categorySpend).map(([cat, amt]) => ({ category: cat, amount: amt })),
        orderCount: pos.length,
      },
    });
  } catch (error) {
    logger.error('Error fetching purchase report:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ==================== INVENTORY MANAGEMENT ROUTES ====================
// Product Out - Deduct products from inventory
app.post('/api/inventory/out', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { Product, InventoryTransaction } = req.businessModels;
    const { productId, quantity, transactionType, reason, notes } = req.body;

    if (!productId || !quantity || !transactionType) {
      return res.status(400).json({
        success: false,
        error: 'Product ID, quantity, and transaction type are required'
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    const deductionQuantity = Math.abs(parseInt(quantity));
    if (product.stock < deductionQuantity) {
      return res.status(400).json({
        success: false,
        error: `Insufficient stock. Available: ${product.stock}, Requested: ${deductionQuantity}`
      });
    }

    // Update product stock
    const previousStock = product.stock;
    const newStock = previousStock - deductionQuantity;
    
    await Product.findByIdAndUpdate(productId, { stock: newStock });

    // Create inventory transaction
    const inventoryTransaction = new InventoryTransaction({
      productId: product._id,
      productName: product.name,
      transactionType: transactionType,
      quantity: -deductionQuantity, // Negative for deduction
      previousStock: previousStock,
      newStock: newStock,
      unitCost: product.price || 0,
      totalValue: (product.price || 0) * deductionQuantity,
      referenceType: 'adjustment',
      referenceId: product._id.toString(),
      referenceNumber: `OUT-${Date.now()}`,
      processedBy: req.user.email,
      location: 'main',
      reason: reason || `Stock deduction - ${transactionType}`,
      notes: notes || '',
      transactionDate: new Date()
    });

    await inventoryTransaction.save();

    // Check for low inventory after stock deduction
    try {
      const { checkAndSendLowInventoryAlerts } = require('./utils/low-inventory-checker');
      await checkAndSendLowInventoryAlerts(req.user.branchId, productId);
    } catch (inventoryCheckError) {
      logger.error('Error checking low inventory:', inventoryCheckError);
      // Don't fail the deduction if inventory check fails
    }

    res.json({
      success: true,
      data: {
        product: await Product.findById(productId),
        transaction: inventoryTransaction
      },
      message: `Successfully deducted ${deductionQuantity} units of ${product.name}`
    });
  } catch (error) {
    logger.error('Error deducting product:', error);
    
    // Return more detailed error message for validation errors
    let errorMessage = 'Internal server error';
    if (error.name === 'ValidationError') {
      errorMessage = error.message || 'Validation error';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get inventory transactions
app.get('/api/inventory/transactions', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { InventoryTransaction } = req.businessModels;
    const { page = 1, limit = 50, productId, transactionType, dateFrom, dateTo } = req.query;

    let query = {};
    
    if (productId) {
      query.productId = productId;
    }
    
    if (transactionType) {
      query.transactionType = transactionType;
    }
    
    if (dateFrom || dateTo) {
      query.transactionDate = {};
      if (dateFrom) {
        query.transactionDate.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        query.transactionDate.$lte = new Date(dateTo);
      }
    }
    
    const transactions = await InventoryTransaction.find(query)
      .sort({ transactionDate: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await InventoryTransaction.countDocuments(query);

    res.json({
      success: true,
      data: transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error fetching inventory transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Delete all inventory transactions (Reset transaction log)
app.delete('/api/inventory/transactions', authenticateToken, setupBusinessDatabase, requireAdmin, async (req, res) => {
  try {
    const { InventoryTransaction } = req.businessModels;
    
    // Delete all inventory transactions for this business
    const result = await InventoryTransaction.deleteMany({});
    
    logger.info('Deleted %d inventory transactions for branch %s', result.deletedCount, req.user.branchId);
    
    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} inventory transactions`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    logger.error('Error deleting inventory transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ==================== CATEGORY ROUTES ====================

// Get all categories
app.get('/api/categories', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { Category } = req.businessModels;
    const { search, activeOnly, type } = req.query;

    let query = { branchId: req.user.branchId };

    // Filter by type: product = product + both, service = service + both (keeps them separate)
    if (type === 'product') {
      query.$or = [{ type: 'product' }, { type: 'both' }];
    } else if (type === 'service') {
      query.$or = [{ type: 'service' }, { type: 'both' }];
    }

    // Filter by active status if requested
    if (activeOnly === 'true') {
      query.isActive = true;
    }

    // Search by name if provided
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const categories = await Category.find(query).sort({ name: 1 });

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    logger.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get a single category by ID
app.get('/api/categories/:id', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { Category } = req.businessModels;
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    res.json({
      success: true,
      data: category
    });
  } catch (error) {
    logger.error('Error fetching category:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Create a new category
app.post('/api/categories', authenticateToken, setupBusinessDatabase, requirePermission('services', 'create'), async (req, res) => {
  try {
    const { Category } = req.businessModels;
    const { name, description, type: typeParam } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Category name is required'
      });
    }

    // Check if category with same name already exists for this branch (case-insensitive, regex-safe)
    const escapedName = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existingCategory = await Category.findOne({
      branchId: req.user.branchId,
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') }
    });

    if (existingCategory) {
      // Get-or-create: return the existing category so user can proceed (no 400)
      if (!existingCategory.isActive) {
        existingCategory.isActive = true;
        if (description != null) existingCategory.description = description;
        await existingCategory.save();
      } else if (description != null) {
        existingCategory.description = description;
        await existingCategory.save();
      }
      return res.status(201).json({ success: true, data: existingCategory });
    }

    // Create new category (type: product | service | both - keeps product/service categories separate)
    const categoryType = ['product', 'service', 'both'].includes(typeParam) ? typeParam : 'both';
    const category = new Category({
      name: name.trim(),
      type: categoryType,
      description: description || '',
      branchId: req.user.branchId,
      isActive: true
    });

    await category.save();

    res.status(201).json({
      success: true,
      data: category
    });
  } catch (error) {
    logger.error('Error creating category:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update a category
app.put('/api/categories/:id', authenticateToken, setupBusinessDatabase, requirePermission('services', 'edit'), async (req, res) => {
  try {
    const { Category } = req.businessModels;
    const { name, description, isActive } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Category name is required'
      });
    }

    // Check if another category with same name exists (case-insensitive, regex-safe)
    const escapedName = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existingCategory = await Category.findOne({
      _id: { $ne: req.params.id },
      branchId: req.user.branchId,
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') }
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        error: 'A category with this name already exists'
      });
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id,
      {
        name: name.trim(),
        description: description || '',
        isActive: isActive !== undefined ? isActive : true
      },
      { new: true, runValidators: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    res.json({
      success: true,
      data: updatedCategory
    });
  } catch (error) {
    logger.error('Error updating category:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Delete a category
app.delete('/api/categories/:id', authenticateToken, setupBusinessDatabase, requirePermission('services', 'delete'), async (req, res) => {
  try {
    const { Category } = req.businessModels;
    const deletedCategory = await Category.findByIdAndDelete(req.params.id);

    if (!deletedCategory) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting category:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update product stock
app.patch('/api/products/:id/stock', authenticateToken, setupBusinessDatabase, requirePermission('products', 'edit'), async (req, res) => {
  try {
    const { Product } = req.businessModels;
    const { id } = req.params;
    const { quantity, operation = 'decrease' } = req.body; // operation can be 'decrease' or 'increase'
    
    if (quantity === undefined || quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid quantity is required'
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    let newStock;
    if (operation === 'decrease') {
      // Check if we have enough stock
      if (product.stock < quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock. Available: ${product.stock}, Requested: ${quantity}`
        });
      }
      newStock = product.stock - quantity;
    } else if (operation === 'increase') {
      newStock = product.stock + quantity;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid operation. Use "decrease" or "increase"'
      });
    }

    // Update the product stock
    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { stock: newStock },
      { new: true }
    );

    res.json({
      success: true,
      data: updatedProduct,
      message: `Stock ${operation}d successfully. New stock: ${newStock}`
    });
  } catch (error) {
    logger.error('Error updating product stock:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Staff routes
app.get('/api/staff', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { Staff } = req.businessModels;
    const { page = 1, limit = 10, search = '' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const { cacheGet, cacheSet, tenantListCacheKey } = require('./lib/cache');
    const listQueryKey = `p${pageNum}:l${limitNum}:q${String(search).slice(0, 64)}`;
    const listCacheKey = tenantListCacheKey('staff', req.user.branchId, listQueryKey);
    const cachedList = await cacheGet(listCacheKey);
    if (cachedList) {
      return res.json(cachedList);
    }

    let query = {};
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { role: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const total = await Staff.countDocuments(query);
    const staff = await Staff.find(query)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ createdAt: -1 });

    const responseBody = {
      success: true,
      data: staff,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    };
    void cacheSet(listCacheKey, responseBody, parseInt(process.env.LIST_REDIS_TTL_SEC, 10) || 120);
    res.json(responseBody);
  } catch (error) {
    logger.error('Error fetching staff:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get single staff member by ID
app.get('/api/staff/:id', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Staff } = req.businessModels;
    const staff = await Staff.findById(req.params.id).select('-password');
    
    if (!staff) {
      return res.status(404).json({
        success: false,
        error: 'Staff member not found'
      });
    }

    res.json({
      success: true,
      data: staff
    });
  } catch (error) {
    logger.error('Error fetching staff member:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Staff Directory (includes business owner + staff members)
app.get('/api/staff-directory', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Staff } = req.businessModels;
    const { search = '' } = req.query;

    // Get business owner from main database (only person created at business creation)
    const mainConnection = await databaseManager.getMainConnection();
    const User = mainConnection.model('User', require('./models/User').schema);
    const Business = mainConnection.model('Business', require('./models/Business').schema);
    const business = await Business.findById(req.user.branchId).select('owner').lean();
    const businessOwner = business?.owner
      ? await User.findById(business.owner).select('-password')
      : await User.findOne({ branchId: req.user.branchId, role: 'admin' }); // fallback for legacy

    // Get staff members from business database
    let staffQuery = {};
    if (search) {
      staffQuery = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { role: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const staffMembers = await Staff.find(staffQuery).sort({ createdAt: -1 });

    // Combine business owner and staff members
    const allStaff = [];

    // Add business owner first (if exists and matches search)
    if (businessOwner) {
      const ownerMatchesSearch = !search || 
        businessOwner.name.toLowerCase().includes(search.toLowerCase()) ||
        businessOwner.email.toLowerCase().includes(search.toLowerCase()) ||
        businessOwner.role.toLowerCase().includes(search.toLowerCase());

      if (ownerMatchesSearch) {
        allStaff.push({
          _id: businessOwner._id,
          name: businessOwner.name,
          email: businessOwner.email,
          phone: businessOwner.mobile,
          avatar: businessOwner.avatar || '',
          role: 'admin',
          specialties: businessOwner.specialties || [],
          salary: businessOwner.salary || 0,
          commissionProfileIds: businessOwner.commissionProfileIds || [],
          notes: businessOwner.notes || 'Business Owner',
          isActive: businessOwner.isActive,
          hasLoginAccess: businessOwner.hasLoginAccess || true, // Business owner always has login access
          allowAppointmentScheduling: businessOwner.allowAppointmentScheduling !== false, // Respect owner's choice; default true for legacy
          permissions: businessOwner.permissions || [],
          createdAt: businessOwner.createdAt,
          updatedAt: businessOwner.updatedAt,
          isOwner: true,
          source: 'user' // User owner from main DB - edit via profile, not Staff API
        });
      }
    }

    // Add staff members (Staff are never owner - only User from business creation is owner)
    allStaff.push(...staffMembers.map(staff => ({
      ...staff.toObject(),
      salary: staff.salary || 0,
      commissionProfileIds: staff.commissionProfileIds || [],
      hasLoginAccess: staff.hasLoginAccess || false,
      allowAppointmentScheduling: staff.allowAppointmentScheduling || false,
      permissions: staff.permissions || [],
      isOwner: false, // Staff are never owner
      source: 'staff' // Staff from business DB - edit via Staff API
    })));

    res.json({
      success: true,
      data: allStaff,
      pagination: {
        page: 1,
        limit: allStaff.length,
        total: allStaff.length,
        totalPages: 1
      }
    });
  } catch (error) {
    logger.error('Error fetching staff directory:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.post(
  '/api/staff',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('staff', 'create'),
  validate(createStaffBodySchema),
  async (req, res) => {
  try {
    const { Staff } = req.businessModels;
    const { name, email, phone, role, specialties, salary, commissionProfileIds, notes, hasLoginAccess, allowAppointmentScheduling, password, isActive, workSchedule, avatar, payrollOverrides, shiftId } = req.body;

    if (!name || !email || !phone || !role) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, phone, and role are required'
      });
    }

    // Validate password requirement when login access is enabled
    if (hasLoginAccess && (!password || password.trim() === '')) {
      return res.status(400).json({
        success: false,
        error: 'Password is required when login access is enabled'
      });
    }

    // Use default permissions for role when not provided
    const { roleDefinitions } = require('./models/Permission');
    const defaultPermissions = roleDefinitions[role]?.permissions || [];

    const staffData = {
      name,
      email,
      phone,
      role,
      permissions: defaultPermissions,
      permissionsTemplate: role,
      specialties: specialties || [],
      salary: parseFloat(salary) || 0,
      commissionProfileIds: commissionProfileIds || [],
      notes: notes || '',
      hasLoginAccess: hasLoginAccess || false,
      allowAppointmentScheduling: allowAppointmentScheduling || false,
      isActive: isActive !== undefined ? isActive : true,
      branchId: req.user.branchId
    };
    if (typeof avatar === 'string' && avatar.trim() !== '') {
      staffData.avatar = avatar.trim();
    }
    const shiftSync = await applyStaffShiftFromSettings(req.businessModels, { shiftId, workSchedule });
    if (shiftSync) {
      staffData.shiftId = shiftSync.shiftId;
      if (Array.isArray(shiftSync.workSchedule) && shiftSync.workSchedule.length > 0) {
        staffData.workSchedule = shiftSync.workSchedule.map(ws => ({
          day: typeof ws.day === 'number' ? ws.day : parseInt(ws.day, 10),
          enabled: ws.enabled !== false,
          startTime: typeof ws.startTime === 'string' ? ws.startTime : '09:00',
          endTime: typeof ws.endTime === 'string' ? ws.endTime : '21:00'
        }));
      }
    } else if (Array.isArray(workSchedule) && workSchedule.length > 0) {
      staffData.workSchedule = workSchedule.map(ws => ({
        day: typeof ws.day === 'number' ? ws.day : parseInt(ws.day, 10),
        enabled: ws.enabled !== false,
        startTime: typeof ws.startTime === 'string' ? ws.startTime : '09:00',
        endTime: typeof ws.endTime === 'string' ? ws.endTime : '21:00'
      }));
    }
    await applyPayrollOverridesIfAllowed(req, staffData, payrollOverrides);

    // Add password if provided
    if (password && password.trim() !== '') {
      const bcrypt = require('bcryptjs');
      staffData.password = await bcrypt.hash(password, 10);
    }

    const newStaff = new Staff(staffData);
    const savedStaff = await newStaff.save();

    scheduleActivityLog(
      {
        businessId: req.user.branchId,
        actorType: tenantActorTypeFromRole(req.user.role),
        actorId: req.user._id,
        action: ACTIVITY_ACTIONS.CREATE_STAFF,
        entity: 'staff',
        entityId: savedStaff._id,
        summary: `Staff member "${savedStaff.name}" created (${savedStaff.email})`,
      },
      req
    );

    res.status(201).json({
      success: true,
      data: savedStaff
    });
  } catch (error) {
    logger.error('Error creating staff:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.put(
  '/api/staff/:id',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('staff', 'edit'),
  validateAll(
    [
      { schema: mongoIdParamSchema, source: 'params' },
      { schema: staffUpdateBodySchema, source: 'body' },
    ]
  ),
  async (req, res) => {
  try {
    const { Staff } = req.businessModels;
    const { name, email, phone, role, specialties, salary, commissionProfileIds, notes, hasLoginAccess, allowAppointmentScheduling, password, isActive, avatar, payrollOverrides } = req.body;

    // Get existing staff to check current state
    const existingStaff = await Staff.findById(req.params.id);
    if (!existingStaff) {
      return res.status(404).json({
        success: false,
        error: 'Staff member not found'
      });
    }

    // Check authorization: staff can only update their own profile; only owner can edit other admins
    const isSelfUpdate = req.user._id?.toString() === req.params.id || req.user.id === req.params.id
    const isAdmin = req.user.role === 'admin'
    const isOwner = req.user.isOwner === true
    const targetIsAdmin = existingStaff.role === 'admin'

    if (!isSelfUpdate && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: You can only update your own profile'
      });
    }

    // Only owner can edit other admins (non-owner admins cannot edit other admins)
    if (!isSelfUpdate && targetIsAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        error: 'Only the business owner can edit other admins'
      });
    }

    // Admin work-schedule-only update (e.g. from Working Hours page)
    if (isAdmin && Array.isArray(req.body.workSchedule) && req.body.workSchedule.length > 0 && req.body.name === undefined) {
      const workSchedule = req.body.workSchedule.map(ws => ({
        day: typeof ws.day === 'number' ? ws.day : parseInt(ws.day, 10),
        enabled: ws.enabled !== false,
        startTime: typeof ws.startTime === 'string' ? ws.startTime : '09:00',
        endTime: typeof ws.endTime === 'string' ? ws.endTime : '21:00'
      }));
      const updatedStaff = await Staff.findByIdAndUpdate(
        req.params.id,
        { workSchedule },
        { new: true }
      );
      if (!updatedStaff) {
        return res.status(404).json({ success: false, error: 'Staff member not found' });
      }
      scheduleActivityLog(
        {
          businessId: req.user.branchId,
          actorType: tenantActorTypeFromRole(req.user.role),
          actorId: req.user._id,
          action: ACTIVITY_ACTIONS.UPDATE_STAFF,
          entity: 'staff',
          entityId: updatedStaff._id,
          summary: `Work schedule updated for ${updatedStaff.name}`,
        },
        req
      );
      return res.json({ success: true, data: updatedStaff });
    }

    // Admin permissions-only update (e.g. from Staff Permissions modal)
    if (isAdmin && Array.isArray(req.body.permissions) && req.body.name === undefined) {
      const updateData = { permissions: req.body.permissions };
      if (req.body.permissionsTemplate != null) {
        updateData.permissionsTemplate = req.body.permissionsTemplate;
      }
      const updatedStaff = await Staff.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
      ).select('-password');
      if (!updatedStaff) {
        return res.status(404).json({ success: false, error: 'Staff member not found' });
      }
      scheduleActivityLog(
        {
          businessId: req.user.branchId,
          actorType: tenantActorTypeFromRole(req.user.role),
          actorId: req.user._id,
          action: ACTIVITY_ACTIONS.UPDATE_STAFF,
          entity: 'staff',
          entityId: updatedStaff._id,
          summary: `Permissions updated for ${updatedStaff.name}`,
        },
        req
      );
      return res.json({ success: true, data: updatedStaff });
    }

    // For self-updates, only allow updating name, email, phone (not role, salary, etc.)
    if (isSelfUpdate && !isAdmin) {
      if (!name || !email || !phone) {
        return res.status(400).json({
          success: false,
          error: 'Name, email, and phone are required'
        });
      }
      
      // Only update allowed fields for self-updates
      const updateData = {
        name,
        email,
        phone
      };
      if (typeof avatar === 'string') {
        updateData.avatar = avatar.trim();
      }
      
      // Add password if provided
      if (password && password.trim() !== '') {
        const bcrypt = require('bcryptjs');
        updateData.password = await bcrypt.hash(password, 10);
      }

      const updatedStaff = await Staff.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
      ).select('-password');

      scheduleActivityLog(
        {
          businessId: req.user.branchId,
          actorType: tenantActorTypeFromRole(req.user.role),
          actorId: req.user._id,
          action: ACTIVITY_ACTIONS.UPDATE_STAFF,
          entity: 'staff',
          entityId: updatedStaff._id,
          summary: `Staff profile updated (self): ${updatedStaff.name}`,
        },
        req
      );

      return res.json({
        success: true,
        data: updatedStaff
      });
    }

    // Admin updates - require all fields
    if (!name || !email || !phone || !role) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, phone, and role are required'
      });
    }

    // Validate password requirement when enabling login access for the first time
    if (hasLoginAccess && !existingStaff.hasLoginAccess && (!password || password.trim() === '')) {
      return res.status(400).json({
        success: false,
        error: 'Password is required when enabling login access for the first time'
      });
    }

    const updateData = {
      name,
      email,
      phone,
      role,
      specialties: specialties || [],
      salary: parseFloat(salary) || 0,
      commissionProfileIds: commissionProfileIds || [],
      notes: notes || '',
      hasLoginAccess: hasLoginAccess !== undefined ? hasLoginAccess : false,
      allowAppointmentScheduling: allowAppointmentScheduling !== undefined ? allowAppointmentScheduling : false,
      isActive: isActive !== undefined ? isActive : true,
    };
    if (typeof avatar === 'string') {
      updateData.avatar = avatar.trim();
    }
    const { workSchedule, permissions, shiftId } = req.body;
    const shiftSync = await applyStaffShiftFromSettings(req.businessModels, { shiftId, workSchedule });
    if (shiftSync) {
      updateData.shiftId = shiftSync.shiftId;
      if (Array.isArray(shiftSync.workSchedule)) {
        updateData.workSchedule = shiftSync.workSchedule.map(ws => ({
          day: typeof ws.day === 'number' ? ws.day : parseInt(ws.day, 10),
          enabled: ws.enabled !== false,
          startTime: typeof ws.startTime === 'string' ? ws.startTime : '09:00',
          endTime: typeof ws.endTime === 'string' ? ws.endTime : '21:00'
        }));
      }
    } else if (Array.isArray(workSchedule)) {
      updateData.workSchedule = workSchedule.map(ws => ({
        day: typeof ws.day === 'number' ? ws.day : parseInt(ws.day, 10),
        enabled: ws.enabled !== false,
        startTime: typeof ws.startTime === 'string' ? ws.startTime : '09:00',
        endTime: typeof ws.endTime === 'string' ? ws.endTime : '21:00'
      }));
    }
    if (Array.isArray(permissions)) {
      updateData.permissions = permissions;
    }
    if (payrollOverrides !== undefined) {
      await applyPayrollOverridesIfAllowed(req, updateData, payrollOverrides);
    }

    // Add password if provided
    if (password && password.trim() !== '') {
      const bcrypt = require('bcryptjs');
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedStaff = await Staff.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updatedStaff) {
      return res.status(404).json({
        success: false,
        error: 'Staff member not found'
      });
    }

    if (String(existingStaff.role) !== String(updatedStaff.role)) {
      scheduleActivityLog(
        {
          businessId: req.user.branchId,
          actorType: tenantActorTypeFromRole(req.user.role),
          actorId: req.user._id,
          action: ACTIVITY_ACTIONS.STAFF_ROLE_CHANGED,
          entity: 'staff',
          entityId: updatedStaff._id,
          summary: `Role changed for ${updatedStaff.name}: ${existingStaff.role} → ${updatedStaff.role}`,
        },
        req
      );
    }
    scheduleActivityLog(
      {
        businessId: req.user.branchId,
        actorType: tenantActorTypeFromRole(req.user.role),
        actorId: req.user._id,
        action: ACTIVITY_ACTIONS.UPDATE_STAFF,
        entity: 'staff',
        entityId: updatedStaff._id,
        summary: `Staff member "${updatedStaff.name}" updated`,
      },
      req
    );

    res.json({
      success: true,
      data: updatedStaff
    });
  } catch (error) {
    logger.error('Error updating staff:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.delete(
  '/api/staff/:id',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('staff', 'delete'),
  validate(mongoIdParamSchema, 'params'),
  async (req, res) => {
  try {
    const { Staff } = req.businessModels;
    const staffToDelete = await Staff.findById(req.params.id);

    if (!staffToDelete) {
      return res.status(404).json({
        success: false,
        error: 'Staff member not found'
      });
    }

    const isOwner = req.user.isOwner === true;
    const targetIsAdmin = staffToDelete.role === 'admin';

    // Only owner (created at business creation) can delete other admins
    if (targetIsAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        error: 'Only the business owner can delete other admins'
      });
    }

    await Staff.findByIdAndDelete(req.params.id);

    scheduleActivityLog(
      {
        businessId: req.user.branchId,
        actorType: tenantActorTypeFromRole(req.user.role),
        actorId: req.user._id,
        action: ACTIVITY_ACTIONS.DELETE_STAFF,
        entity: 'staff',
        entityId: staffToDelete._id,
        summary: `Staff member "${staffToDelete.name}" deleted`,
      },
      req
    );

    res.json({
      success: true,
      message: 'Staff member deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting staff:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Change staff password (admin or manager can reset)
app.post(
  '/api/staff/:id/change-password',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('staff', 'edit'),
  validateAll(
    [
      { schema: mongoIdParamSchema, source: 'params' },
      { schema: staffChangePasswordBodySchema, source: 'body' },
    ]
  ),
  async (req, res) => {
  try {
    const { newPassword } = req.body;
    const { Staff } = req.businessModels;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters'
      });
    }

    const staff = await Staff.findById(req.params.id);
    if (!staff) {
      return res.status(404).json({
        success: false,
        error: 'Staff member not found'
      });
    }

    const hashedPassword = await hashPassword(newPassword);
    await Staff.findByIdAndUpdate(
      req.params.id,
      { password: hashedPassword },
      { new: true, runValidators: true }
    );

    scheduleActivityLog(
      {
        businessId: req.user.branchId,
        actorType: tenantActorTypeFromRole(req.user.role),
        actorId: req.user._id,
        action: ACTIVITY_ACTIONS.STAFF_PASSWORD_CHANGED,
        entity: 'staff',
        entityId: staff._id,
        summary: `Password changed for staff ${staff.name}`,
      },
      req
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    logger.error('Change staff password error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Block Time (staff unavailability / blocked slots)
/** Get dates a block applies to (for conflict check). Returns YYYY-MM-DD strings. */
function getBlockDates(startDate, endDate, recurringFrequency) {
  const dates = [];
  const rec = recurringFrequency || 'none';
  const start = String(startDate).slice(0, 10);
  const end = endDate ? String(endDate).slice(0, 10) : start;
  if (rec === 'none') {
    dates.push(start);
    return dates;
  }
  if (start > end) return dates;

  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const startD = new Date(sy, sm - 1, sd);
  const endD = new Date(ey, em - 1, ed);

  if (rec === 'daily') {
    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${day}`);
    }
  } else if (rec === 'weekly') {
    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 7)) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${day}`);
    }
  } else if (rec === 'monthly') {
    for (let y = sy, m = sm; y < ey || (y === ey && m <= em); m++) {
      if (m > 12) { m = 1; y++; }
      const lastDay = new Date(y, m, 0).getDate();
      const day = Math.min(sd, lastDay);
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (dateStr > end) break;
      if (dateStr >= start) dates.push(dateStr);
    }
  }
  return dates;
}

/** Check if staff has overlapping scheduled appointments for the block. Returns array of conflict info. */
async function getBlockTimeAppointmentConflicts(AppointmentModel, staffId, startDate, endDate, startTime, endTime, recurringFrequency) {
  if (!AppointmentModel || !staffId) return [];
  const blockStartM = parseTimeToMinutes(startTime || '0:00');
  const blockEndM = parseTimeToMinutes(endTime || '23:59');
  if (blockEndM <= blockStartM) return [];

  const dates = getBlockDates(startDate, endDate, recurringFrequency);
  const conflicts = [];

  for (const dateStr of dates) {
    const apts = await AppointmentModel.find({
      date: dateStr,
      status: { $nin: ['cancelled'] },
      $or: [
        { staffId: staffId },
        { 'staffAssignments.staffId': staffId }
      ]
    }).populate('clientId', 'name').populate('serviceId', 'name').lean();

    for (const apt of apts) {
      const aptStartM = parseTimeToMinutes(apt.time || '0:00');
      const aptDuration = apt.duration ?? 60;
      const aptEndM = aptStartM + aptDuration;
      if (aptEndM <= blockStartM || aptStartM >= blockEndM) continue;
      const clientName = (apt.clientId && apt.clientId.name) || 'Client';
      const serviceName = (apt.serviceId && apt.serviceId.name) || 'Service';
      conflicts.push({
        date: dateStr,
        time: apt.time,
        duration: apt.duration,
        clientName,
        serviceName,
        status: apt.status
      });
    }
  }
  return conflicts;
}

app.get('/api/block-time', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { BlockTime } = req.businessModels;
    const { staffId, startDate, endDate } = req.query;
    const query = { branchId: req.user.branchId };
    if (staffId) query.staffId = staffId;
    if (startDate && endDate) {
      query.$or = [
        { recurringFrequency: 'none', startDate: { $gte: startDate, $lte: endDate } },
        {
          recurringFrequency: { $in: ['daily', 'weekly', 'monthly'] },
          startDate: { $lte: endDate },
          endDate: { $gte: startDate, $ne: null }
        }
      ];
    } else if (startDate) {
      query.$or = [
        { recurringFrequency: 'none', startDate: { $gte: startDate } },
        { recurringFrequency: { $in: ['daily', 'weekly', 'monthly'] }, endDate: { $gte: startDate, $ne: null } }
      ];
    } else if (endDate) {
      query.$or = [
        { recurringFrequency: 'none', startDate: { $lte: endDate } },
        { recurringFrequency: { $in: ['daily', 'weekly', 'monthly'] }, startDate: { $lte: endDate } }
      ];
    }
    const blocks = await BlockTime.find(query).sort({ startDate: 1, startTime: 1 }).lean();
    const populated = await Promise.all(blocks.map(async (b) => {
      const staff = await req.businessModels.Staff.findById(b.staffId).select('name').lean();
      return { ...b, staffId: { _id: b.staffId, name: staff?.name || 'Staff' } };
    }));
    res.json({ success: true, data: populated });
  } catch (error) {
    logger.error('Error fetching block time:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post('/api/block-time', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { BlockTime, Appointment } = req.businessModels;
    const { staffId, title, startDate, startTime, endTime, recurringFrequency, endDate, description } = req.body;
    if (!staffId || !title || !startDate || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: 'Staff, title, start date, start time, and end time are required'
      });
    }
    const rec = ['none', 'daily', 'weekly', 'monthly'].includes(recurringFrequency) ? recurringFrequency : 'none';
    const blockEndDate = endDate && ['daily', 'weekly', 'monthly'].includes(rec) ? String(endDate) : null;
    const overlappingAppointments = await getBlockTimeAppointmentConflicts(
      Appointment,
      staffId,
      String(startDate),
      blockEndDate || String(startDate),
      String(startTime),
      String(endTime),
      rec
    );
    const doc = {
      staffId,
      title: String(title).trim(),
      startDate: String(startDate),
      startTime: String(startTime),
      endTime: String(endTime),
      recurringFrequency: rec,
      endDate: blockEndDate,
      description: description ? String(description).slice(0, 200) : '',
      branchId: req.user.branchId
    };
    const created = await BlockTime.create(doc);
    const populated = await BlockTime.findById(created._id).lean();
    const staff = await req.businessModels.Staff.findById(created.staffId).select('name').lean();
    const data = { ...populated, staffId: { _id: created.staffId, name: staff?.name || 'Staff' } };
    const payload = { success: true, data };
    if (overlappingAppointments.length > 0) {
      payload.overlappingAppointments = overlappingAppointments;
      payload.warning =
        'This block overlaps existing appointments; those appointments were not changed. The block appears on the calendar; bookings during this period are still allowed.';
    }
    res.status(201).json(payload);
  } catch (error) {
    logger.error('Error creating block time:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.put('/api/block-time/:id', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { BlockTime, Appointment } = req.businessModels;
    const existing = await BlockTime.findOne({ _id: req.params.id, branchId: req.user.branchId });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Block time not found' });
    }
    const { title, startDate, startTime, endTime, recurringFrequency, endDate, description } = req.body;
    const updateData = {};
    if (title !== undefined) updateData.title = String(title).trim();
    if (startDate !== undefined) updateData.startDate = String(startDate);
    if (startTime !== undefined) updateData.startTime = String(startTime);
    if (endTime !== undefined) updateData.endTime = String(endTime);
    if (recurringFrequency !== undefined) updateData.recurringFrequency = ['none', 'daily', 'weekly', 'monthly'].includes(recurringFrequency) ? recurringFrequency : 'none';
    if (endDate !== undefined) {
      const rec = updateData.recurringFrequency !== undefined ? updateData.recurringFrequency : existing.recurringFrequency;
      updateData.endDate = (rec === 'daily' || rec === 'weekly' || rec === 'monthly') ? String(endDate) : null;
    }
    if (description !== undefined) updateData.description = String(description).slice(0, 200) || '';
    const finalStartDate = updateData.startDate ?? existing.startDate;
    const finalStartTime = updateData.startTime ?? existing.startTime;
    const finalEndTime = updateData.endTime ?? existing.endTime;
    const finalRec = updateData.recurringFrequency ?? existing.recurringFrequency;
    const finalEndDate = updateData.endDate !== undefined ? updateData.endDate : existing.endDate;
    const overlappingAppointments = await getBlockTimeAppointmentConflicts(
      Appointment,
      existing.staffId,
      finalStartDate,
      finalEndDate || finalStartDate,
      finalStartTime,
      finalEndTime,
      finalRec
    );
    const updated = await BlockTime.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true }).lean();
    const staff = await req.businessModels.Staff.findById(updated.staffId).select('name').lean();
    const data = { ...updated, staffId: { _id: updated.staffId, name: staff?.name || 'Staff' } };
    const payload = { success: true, data };
    if (overlappingAppointments.length > 0) {
      payload.overlappingAppointments = overlappingAppointments;
      payload.warning =
        'This block overlaps existing appointments; those appointments were not changed. The block appears on the calendar; bookings during this period are still allowed.';
    }
    res.json(payload);
  } catch (error) {
    logger.error('Error updating block time:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.delete('/api/block-time/:id', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { BlockTime } = req.businessModels;
    const deleted = await BlockTime.findOneAndDelete({ _id: req.params.id, branchId: req.user.branchId });
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Block time not found' });
    }
    res.json({ success: true, message: 'Block time deleted' });
  } catch (error) {
    logger.error('Error deleting block time:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/** Normalize POS staff references (ObjectId instance, {_id}, or hex string). */
function normalizeSaleStaffReferenceToIdString(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'object' && raw !== null && raw._id != null) {
    return String(raw._id).trim();
  }
  return String(raw).trim();
}

/** Client / Mongoose hybrids: never pass objects into ObjectId.isValid (String(obj) → "[object Object]"). */
function normalizeClientAppointmentIdString(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'object' && raw !== null && raw._id != null) {
    return String(raw._id).trim();
  }
  return String(raw).trim();
}

/** IST wall time HH:mm (24h) for “now” — aligns with checkout add-on rows at payment time. */
function getNowWallTimeHHmmIST() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function pickBillingWalkInDisplayTime(sale) {
  const t = sale && sale.time != null ? String(sale.time).trim() : '';
  if (t) return t;
  return getNowWallTimeHHmmIST();
}

/** Minutes from midnight (IST-consistent via parseTimeToMinutes) — wall moment when checkout/payment completes. */
function pickBillingWalkInCheckoutEndMinutes(sale) {
  return parseTimeToMinutes(pickBillingWalkInDisplayTime(sale));
}

/**
 * Canonical performing staff on a sale service line — prefer legacy `staffId` (what Quick Sale persists on each row)
 * so we never attribute billing to stale `staffContributions[0]` after the stylist is changed at checkout.
 */
function resolvePrimarySaleLineStaffIdString(item) {
  if (!item) return '';
  const lineSid = normalizeSaleStaffReferenceToIdString(item.staffId);
  const c0 = (item.staffContributions || [])[0];
  const contribSid = normalizeSaleStaffReferenceToIdString(c0?.staffId);
  if (lineSid && mongoose.Types.ObjectId.isValid(lineSid)) return lineSid;
  if (contribSid && mongoose.Types.ObjectId.isValid(contribSid)) return contribSid;
  return '';
}

/** Resolve catalog service ObjectId from a sale line (handles ObjectId, hex string, populated { _id }). */
function extractSaleLineServiceId(item) {
  if (!item || item.type !== 'service') return null;
  const raw = item.serviceId;
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object' && raw !== null && raw._id != null) {
    const id = raw._id;
    if (mongoose.Types.ObjectId.isValid(String(id))) {
      return new mongoose.Types.ObjectId(String(id));
    }
    return null;
  }
  if (mongoose.Types.ObjectId.isValid(String(raw))) {
    return new mongoose.Types.ObjectId(String(raw));
  }
  return null;
}

/** Primary + additional service ids from the booked appointment (fallback when sale lines lack resolvable IDs). */
function serviceIdsFromBookedAppointment(appointment) {
  const ids = [];
  const seen = new Set();
  const pushId = (v) => {
    if (v == null || v === '') return;
    const s = String(v);
    if (!mongoose.Types.ObjectId.isValid(s)) return;
    if (seen.has(s)) return;
    seen.add(s);
    ids.push(new mongoose.Types.ObjectId(s));
  };
  const primary = appointment.serviceId?._id != null ? appointment.serviceId._id : appointment.serviceId;
  pushId(primary);
  const addl = appointment.additionalServiceIds;
  if (Array.isArray(addl)) {
    for (const a of addl) {
      const id = a?._id != null ? a._id : a;
      pushId(id);
    }
  }
  const addOns = appointment.addOnLineItems;
  if (Array.isArray(addOns)) {
    for (const row of addOns) {
      const id = row?.serviceId?._id != null ? row.serviceId._id : row?.serviceId;
      pushId(id);
    }
  }
  return ids;
}

/** Primary staff id string from a plain appointment doc (lean or hydrated). */
function getPrimaryStaffIdStringFromAppointmentShape(a) {
  if (!a) return null;
  const sid = a.staffId;
  if (sid) {
    const v = typeof sid === 'object' && sid !== null && sid._id != null ? sid._id : sid;
    return v != null ? String(v) : null;
  }
  const p = (a.staffAssignments || [])[0];
  if (p?.staffId) {
    const v = typeof p.staffId === 'object' && p.staffId !== null && p.staffId._id != null ? p.staffId._id : p.staffId;
    return v != null ? String(v) : null;
  }
  return null;
}

/**
 * Set `lineSource` on each service row for appointment-linked bills: catalog services that were part of the
 * original booking snapshot are `appointment`; checkout-only add-ons are `walk_in`.
 * Drops any client-sent `lineSource` (trusted server derivation only).
 */
async function annotateAppointmentLinkedSaleItemsLineSource(AppointmentModel, appointmentId, items) {
  const mongooseSales = require('mongoose');
  if (!AppointmentModel || !appointmentId || !Array.isArray(items)) return items;
  const aidStr = normalizeClientAppointmentIdString(appointmentId);
  if (!aidStr || !mongooseSales.Types.ObjectId.isValid(aidStr)) return items;

  const anchor = await AppointmentModel.findById(aidStr).select('bookingGroupId').lean();
  if (!anchor) {
    return items.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const { lineSource: _d, ...rest } = row;
      return rest;
    });
  }

  let snapshot = [];
  if (anchor.bookingGroupId) {
    snapshot = await AppointmentModel.find({ bookingGroupId: anchor.bookingGroupId }).lean();
  } else {
    const full = await AppointmentModel.findById(aidStr).lean();
    if (full) snapshot = [full];
  }

  const bookedCatalogIds = new Set();
  for (const a of snapshot) {
    for (const oid of serviceIdsFromBookedAppointment(a)) {
      bookedCatalogIds.add(String(oid));
    }
  }

  return items.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const { lineSource: _discard, ...rest } = row;
    if (rest.type !== 'service') return rest;
    const sid = extractSaleLineServiceId(rest);
    const key = sid ? String(sid) : '';
    if (!key) return rest;
    const source = bookedCatalogIds.has(key) ? 'appointment' : 'walk_in';
    return { ...rest, lineSource: source };
  });
}

const markAppointmentCompleted = async (AppointmentModel, appointmentId, sale = null, businessModels = null) => {
  if (!AppointmentModel || !appointmentId) return;
  try {
    const appointment = await AppointmentModel.findById(appointmentId);
    if (!appointment) {
      logger.warn('⚠️ Appointment not found for completion update:', appointmentId);
      return;
    }

    if (appointment.status === 'cancelled' || appointment.status === 'cancelled_at_billing') {
      return;
    }

    /** When the anchor card is already `completed`, still replay misassign cleanup + billing walk-ins (e.g. bill edited in POS after checkout). */
    const onlyReplayBillingArtifacts = appointment.status === 'completed';

    const aptStaffId = appointment.staffId ? String(appointment.staffId) : null;
    const aptStaffFromAssignments = (appointment.staffAssignments || [])[0]?.staffId;
    const linkedStaffId = aptStaffId || (aptStaffFromAssignments ? String(aptStaffFromAssignments) : null);

    // Sync appointment services with actual services performed (added during checkout)
    // Same staff: update this card with primary + additional. Different staff: create new card(s).
    if (sale && sale.items && Array.isArray(sale.items) && businessModels?.Service) {
      // sale.items entries are Mongoose subdocuments — spreading them with `...` skips real data
      // and copies internal getters instead, so we explicitly toObject() before any mutation.
      const serviceItems = sale.items
        .map((i) => (i && typeof i.toObject === 'function' ? i.toObject() : i))
        .filter((i) => {
          if (i.type !== 'service') return false;
          if (extractSaleLineServiceId(i)) return true;
          const c0 = (i.staffContributions || [])[0];
          if (c0?.staffId != null) return true;
          if (i.staffId != null && String(i.staffId).trim() !== '') return true;
          return false;
        })
        .map((i) => {
          const staffId = resolvePrimarySaleLineStaffIdString(i) || null;
          return { ...i, _primaryStaffId: staffId };
        });

      if (serviceItems.length > 0) {
        const { Service } = businessModels;

        let initialGroupSnapshot = [];
        if (appointment.bookingGroupId) {
          initialGroupSnapshot = await AppointmentModel.find({ bookingGroupId: appointment.bookingGroupId }).lean();
        } else {
          initialGroupSnapshot = [appointment.toObject ? appointment.toObject() : appointment];
        }
        if (!initialGroupSnapshot.length) {
          initialGroupSnapshot = [appointment.toObject ? appointment.toObject() : appointment];
        }

        const bookedServiceIdsGlobal = new Set();
        const scheduledStaffByServiceId = new Map();
        for (const a of initialGroupSnapshot) {
          const st = getPrimaryStaffIdStringFromAppointmentShape(a);
          if (!st) continue;
          for (const oid of serviceIdsFromBookedAppointment(a)) {
            const key = String(oid);
            bookedServiceIdsGlobal.add(key);
            scheduledStaffByServiceId.set(key, st);
          }
        }

        const bookedIdsOnThisCard = new Set(serviceIdsFromBookedAppointment(appointment).map((x) => String(x)));

        const servicesByStaff = new Map();
        serviceItems.forEach((item, idx) => {
          const sid = item._primaryStaffId || 'unknown';
          if (!servicesByStaff.has(sid)) servicesByStaff.set(sid, []);
          servicesByStaff.get(sid).push({ ...item, _order: idx });
        });

        // Only merge sale lines onto THIS card when the booked service belongs on this card and the billed staff matches whom it was scheduled with.
        const servicesMatchingScheduledStaffForThisCard = serviceItems.filter((i) => {
          const id = extractSaleLineServiceId(i)?.toString();
          if (!id || !bookedIdsOnThisCard.has(id)) return false;
          if (!i._primaryStaffId) return false;
          const sched = scheduledStaffByServiceId.get(id);
          if (!sched) return true;
          return String(i._primaryStaffId) === String(sched);
        });

        // Booked staff A but invoice attributes work on this card's services to staff B: try first sale line staff for lines that belong on THIS card only.
        let servicesToApplyToMain = [...servicesMatchingScheduledStaffForThisCard].sort(
          (a, b) => (a._order ?? 0) - (b._order ?? 0)
        );
        if (servicesToApplyToMain.length === 0) {
          const primaryFromSale = getPrimaryStaffFromSaleServiceItems(sale.items);
          const psid =
            primaryFromSale?.staffId && mongoose.Types.ObjectId.isValid(primaryFromSale.staffId)
              ? String(primaryFromSale.staffId)
              : null;
          if (psid && (!linkedStaffId || psid !== linkedStaffId)) {
            const primaryGroup = servicesByStaff.get(psid) || [];
            const filteredPrimary = primaryGroup
              .filter((i) => {
                const id = extractSaleLineServiceId(i)?.toString();
                return id && bookedIdsOnThisCard.has(id);
              })
              .sort((a, b) => (a._order ?? 0) - (b._order ?? 0));
            if (filteredPrimary.length > 0) {
              servicesToApplyToMain = filteredPrimary;
              appointment.staffId = new mongoose.Types.ObjectId(psid);
              appointment.staffAssignments = [
                {
                  staffId: new mongoose.Types.ObjectId(psid),
                  percentage: 100,
                  role: 'primary',
                },
              ];
              appointment.markModified('staffAssignments');
            }
          }
        }

        const misassignedDocIds = [];
        for (const a of initialGroupSnapshot) {
          const aid = a._id;
          const svcKey = String(a.serviceId?._id != null ? a.serviceId._id : a.serviceId);
          if (!mongoose.Types.ObjectId.isValid(svcKey)) continue;
          const sched = getPrimaryStaffIdStringFromAppointmentShape(a);
          const line = serviceItems.find((it) => {
            if (String(it.lineSource || '').toLowerCase() === 'walk_in') return false;
            return extractSaleLineServiceId(it)?.toString() === svcKey;
          });
          if (!line || !line._primaryStaffId || !sched) continue;
          if (String(line._primaryStaffId) === String(sched)) continue;
          misassignedDocIds.push(aid);
        }

        if (misassignedDocIds.length > 0) {
          await AppointmentModel.updateMany(
            { _id: { $in: misassignedDocIds } },
            { $set: { status: 'cancelled_at_billing' } }
          );
        }

        const anchorMisassigned = misassignedDocIds.some((id) => String(id) === String(appointmentId));

        const bookingGroupId = appointment.bookingGroupId || uuidv4();
        if (!appointment.bookingGroupId) appointment.bookingGroupId = bookingGroupId;
        const billingWalkInEndM = pickBillingWalkInCheckoutEndMinutes(sale);

        /** Cross-staff (booked service, different performer) and add-ons (service not on original booking): completed cards with Walk-in attribution. */
        const createBillingWalkInCards = async () => {
          const supplementalKeys = new Set();
          // Parallel add-ons: each line ends at checkout; start = checkout − that line's duration (no sequential chaining).
          const walkInLines = serviceItems.filter((i) => String(i.lineSource || '').toLowerCase() === 'walk_in');
          const walkInStaffSet = new Set(
            walkInLines.map((i) => String(i._primaryStaffId || '').trim()).filter((x) => x && mongoose.Types.ObjectId.isValid(x)),
          );
          if (walkInLines.length > 0 && walkInStaffSet.size === 1) {
            for (const item of walkInLines) {
              const rawStaffId = item._primaryStaffId;
              const lineServiceId = extractSaleLineServiceId(item);
              const lineKey = lineServiceId ? String(lineServiceId) : '';
              if (!rawStaffId || !mongoose.Types.ObjectId.isValid(String(rawStaffId)) || !lineKey) continue;
              if (bookedServiceIdsGlobal.has(lineKey)) continue;
              const dedupeKey = `wi:${lineKey}:${String(rawStaffId)}`;
              if (supplementalKeys.has(dedupeKey)) continue;
              supplementalKeys.add(dedupeKey);
              const staffObjId = new mongoose.Types.ObjectId(String(rawStaffId));
              const serviceDoc = lineServiceId ? await Service.findById(lineServiceId).lean() : null;
              if (!serviceDoc) continue;
              const dupWalkIn = await AppointmentModel.findOne({
                branchId: appointment.branchId,
                clientId: appointment.clientId,
                date: appointment.date,
                bookingGroupId,
                staffId: staffObjId,
                serviceId: lineServiceId,
                status: 'completed',
                leadSource: new RegExp('^walk-in$', 'i'),
              }).lean();
              if (dupWalkIn) continue;
              const dur = serviceDoc.duration ?? 60;
              const startMinutes = Math.max(0, billingWalkInEndM - dur);
              const newApt = new AppointmentModel({
                clientId: appointment.clientId,
                serviceId: lineServiceId,
                date: appointment.date,
                time: minutesToTimeString(startMinutes),
                duration: dur,
                status: 'completed',
                price: item.price ?? item.total ?? serviceDoc.price ?? 0,
                branchId: appointment.branchId,
                bookingGroupId,
                staffId: staffObjId,
                staffAssignments: [{ staffId: staffObjId, percentage: 100, role: 'primary' }],
                leadSource: 'Walk-in',
              });
              await newApt.save();
              logger.debug(`✅ Billing walk-in card (checkout add-on, single staff): ${serviceDoc.name}`);
            }
          }

          for (const item of serviceItems) {
            if (String(item.lineSource || '').toLowerCase() === 'walk_in') continue;
            const rawStaffId = item._primaryStaffId;
            const lineOid = extractSaleLineServiceId(item);
            const lineKey = lineOid ? String(lineOid) : '';
            if (!rawStaffId || !mongoose.Types.ObjectId.isValid(String(rawStaffId)) || !lineKey) continue;

            let isBillingWalkIn = false;
            if (!bookedServiceIdsGlobal.has(lineKey)) {
              isBillingWalkIn = true;
            } else {
              const sched = scheduledStaffByServiceId.get(lineKey);
              if (sched && String(rawStaffId) !== String(sched)) {
                isBillingWalkIn = true;
              }
            }
            if (!isBillingWalkIn) continue;

            const dedupeKey = `${lineKey}:${String(rawStaffId)}:${item._order ?? 0}`;
            if (supplementalKeys.has(dedupeKey)) continue;
            supplementalKeys.add(dedupeKey);

            const staffIdToStore = item._primaryStaffId;
            const staffObjId =
              mongoose.Types.ObjectId.isValid(String(staffIdToStore))
                ? new mongoose.Types.ObjectId(String(staffIdToStore))
                : null;
            if (!staffObjId) continue;

            const lineServiceId = extractSaleLineServiceId(item);
            const serviceDoc = lineServiceId ? await Service.findById(lineServiceId).lean() : null;
            if (!serviceDoc) continue;
            const dur = serviceDoc.duration ?? 60;
            const serviceTime = minutesToTimeString(Math.max(0, billingWalkInEndM - dur));

            const dupWalkIn = await AppointmentModel.findOne({
              branchId: appointment.branchId,
              clientId: appointment.clientId,
              date: appointment.date,
              bookingGroupId,
              staffId: staffObjId,
              serviceId: lineServiceId,
              status: 'completed',
              leadSource: new RegExp('^walk-in$', 'i'),
            }).lean();
            if (dupWalkIn) continue;

            const newApt = new AppointmentModel({
              clientId: appointment.clientId,
              serviceId: lineServiceId,
              date: appointment.date,
              time: serviceTime,
              duration: serviceDoc.duration ?? 60,
              status: 'completed',
              price: item.price ?? item.total ?? serviceDoc.price ?? 0,
              branchId: appointment.branchId,
              bookingGroupId,
              staffId: staffObjId,
              staffAssignments: [{ staffId: staffObjId, percentage: 100, role: 'primary' }],
              leadSource: 'Walk-in',
            });
            await newApt.save();
            logger.debug(
              `✅ Billing walk-in card (${bookedServiceIdsGlobal.has(lineKey) ? 'cross-staff' : 'add-on'}): ${serviceDoc.name}`
            );
          }
        };

        await createBillingWalkInCards();
        await createStandaloneStyleWalkInsForLinkedSaleAddons(
          sale,
          businessModels,
          appointment.branchId || sale.branchId,
        );

        if (onlyReplayBillingArtifacts) {
          logger.debug(
            `✅ Billing calendar replay for already-completed appointment ${appointmentId} (walk-ins / mismatched-slot cleanup)`
          );
          return;
        }

        if (anchorMisassigned) {
          appointment.status = 'cancelled_at_billing';
          logger.debug(
            `✅ Appointment ${appointmentId} cancelled_at_billing (invoice staff ≠ booked staff); supplemental walk-in rows created where applicable.`
          );
        } else {
          appointment.status = 'completed';

          if (servicesToApplyToMain.length > 0) {
            let serviceIds = servicesToApplyToMain.map((i) => extractSaleLineServiceId(i)).filter(Boolean);
            if (serviceIds.length === 0) {
              const fromBooking = serviceIdsFromBookedAppointment(appointment);
              if (fromBooking.length > 0) {
                serviceIds = fromBooking;
                logger.debug(
                  `Appointment ${appointmentId}: sale lines had no resolvable serviceIds; using booked service ids (${serviceIds.length})`
                );
              } else {
                logger.warn(`⚠️ Appointment ${appointmentId}: linked services have no valid serviceIds, skipping update`);
              }
            }
            const firstServiceId = serviceIds[0];
            const firstItem = servicesToApplyToMain[0];
            const firstService = firstServiceId ? await Service.findById(firstServiceId).lean() : null;
            if (firstService) {
              appointment.serviceId = firstServiceId;
              appointment.price = firstItem.price ?? firstItem.total ?? firstService.price ?? appointment.price;
              appointment.additionalServiceIds = serviceIds.length > 1 ? serviceIds.slice(1) : [];
              let totalDuration = firstService.duration ?? appointment.duration ?? 60;
              if (serviceIds.length > 1) {
                const additionalServices = await Service.find({ _id: { $in: serviceIds.slice(1) } }).select('duration').lean();
                totalDuration += additionalServices.reduce((sum, s) => sum + (s.duration || 0), 0);
              }
              appointment.duration = totalDuration;
              logger.debug(`✅ Appointment ${appointmentId} updated with ${serviceIds.length} service(s) for same staff`);
            }
          }
        }

      } else if (onlyReplayBillingArtifacts) {
        return;
      } else if (!onlyReplayBillingArtifacts) {
        appointment.status = 'completed';
      }
    } else if (!onlyReplayBillingArtifacts) {
      appointment.status = 'completed';
    }

    if (!onlyReplayBillingArtifacts) {
      await appointment.save();
      logger.debug(`✅ Appointment ${appointmentId} saved after sale completion flow.`);
    }

    // Do not mark other appointments in bookingGroupId completed here. Multi-day (and separate cards for
    // same client) share a group but are billed independently; each sale completes only its linked appointment.
  } catch (error) {
    logger.error('❌ Failed to mark appointment as completed:', error);
  }
};

/** Primary staff on the first service row (canonical `staffId` wins over `staffContributions[0]`). */
const getPrimaryStaffFromSaleServiceItems = (items) => {
  if (!items || !Array.isArray(items)) return null;
  for (const item of items) {
    if (item.type !== 'service') continue;
    if (String(item.lineSource || '').toLowerCase() === 'walk_in') continue;
    const sid = resolvePrimarySaleLineStaffIdString(item);
    if (sid && mongoose.Types.ObjectId.isValid(sid)) {
      const c0 = (item.staffContributions || [])[0];
      const name =
        (item.staffName && String(item.staffName).trim()) ||
        (c0?.staffName && String(c0.staffName).trim()) ||
        '';
      return { staffId: sid, staffName: name };
    }
  }
  return null;
};

/**
 * When a completed sale linked to an appointment is edited, move the completed card to the
 * staff shown on the invoice (first service line). markAppointmentCompleted no-ops if already completed.
 */
const syncCompletedLinkedAppointmentStaffFromSale = async (AppointmentModel, sale) => {
  if (!AppointmentModel || !sale || !sale.appointmentId) return;
  if (String(sale.status || '').toLowerCase() !== 'completed') return;
  try {
    const appointment = await AppointmentModel.findById(sale.appointmentId);
    if (!appointment) return;
    if (String(appointment.status || '').toLowerCase() !== 'completed') return;

    // Multi-staff booking group: each card keeps its own assigned staff; don't reassign based on first sale line
    if (appointment.bookingGroupId) return;

    const primary = getPrimaryStaffFromSaleServiceItems(sale.items);
    if (!primary || !mongoose.Types.ObjectId.isValid(primary.staffId)) {
      return;
    }
    const newStaffIdStr = String(primary.staffId);
    const currentStr = appointment.staffId
      ? String(appointment.staffId)
      : (appointment.staffAssignments &&
          appointment.staffAssignments[0] &&
          appointment.staffAssignments[0].staffId
        ? String(appointment.staffAssignments[0].staffId)
        : null);
    if (currentStr === newStaffIdStr) {
      return;
    }

    appointment.staffId = new mongoose.Types.ObjectId(newStaffIdStr);
    appointment.staffAssignments = [
      {
        staffId: new mongoose.Types.ObjectId(newStaffIdStr),
        percentage: 100,
        role: 'primary',
      },
    ];
    appointment.markModified('staffAssignments');
    await appointment.save();
    logger.debug(
      `✅ Linked completed appointment ${appointment._id} staff moved to ${newStaffIdStr} (bill ${sale.billNo})`,
    );
  } catch (err) {
    logger.error('❌ syncCompletedLinkedAppointmentStaffFromSale failed:', err);
  }
};

/**
 * Checkout-only service lines (`line_source: walk_in`) on an appointment-linked bill: mimic **standalone Quick Sale**
 * calendar behaviour — attach to a synthetic bookingGroupId derived from this sale only; only create calendar rows
 * when the addon subset has ≥2 performing staff. Each add-on is **parallel**: ends at checkout time (start = checkout − duration).
 * Does not reuse the appointment group's id.
 */
const createStandaloneStyleWalkInsForLinkedSaleAddons = async (sale, businessModels, branchId) => {
  if (!sale || !businessModels?.Appointment || !businessModels?.Service) return;
  if (!sale.appointmentId || String(sale.status || '').toLowerCase() !== 'completed') return;

  try {
    const { Appointment, Service } = businessModels;

    let clientOid = sale.customerId;
    if (!clientOid) return;
    if (typeof clientOid !== 'object' && mongoose.Types.ObjectId.isValid(String(clientOid))) {
      clientOid = new mongoose.Types.ObjectId(String(clientOid));
    } else if (typeof clientOid === 'object' && clientOid?._id) {
      clientOid = clientOid._id;
    }
    if (!mongoose.Types.ObjectId.isValid(String(clientOid))) return;

    const serviceItems = (sale.items || [])
      .map((i) => (i && typeof i.toObject === 'function' ? i.toObject() : i))
      .filter(
        (i) =>
          i &&
          i.type === 'service' &&
          String(i.lineSource || '').toLowerCase() === 'walk_in' &&
          i.serviceId &&
          mongoose.Types.ObjectId.isValid(String(extractSaleLineServiceId(i) || ''))
      )
      .map((i, idx) => {
        const sid = resolvePrimarySaleLineStaffIdString(i);
        return { ...i, _primaryStaffId: sid, _order: idx };
      })
      .filter((i) => i._primaryStaffId && mongoose.Types.ObjectId.isValid(String(i._primaryStaffId)));

    if (serviceItems.length === 0) return;
    const uniqueStaffIds = [...new Set(serviceItems.map((i) => String(i._primaryStaffId)))];
    if (uniqueStaffIds.length < 2) return;

    const saleDate =
      sale.date != null && sale.date !== ''
        ? typeof sale.date === 'string'
          ? String(sale.date).slice(0, 10)
          : new Date(sale.date).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

    const checkoutEndM = pickBillingWalkInCheckoutEndMinutes(sale);
    const branchOid =
      branchId && mongoose.Types.ObjectId.isValid(String(branchId))
        ? new mongoose.Types.ObjectId(String(branchId))
        : sale.branchId;
    const bookingGroupId = sale._id ? `sale-addon-${String(sale._id)}` : uuidv4();

    for (const item of serviceItems) {
      const staffIdStr = String(item._primaryStaffId);
      const svcOid = extractSaleLineServiceId(item);
      const service = await Service.findById(svcOid).lean();
      if (!service) continue;
      const dur = service.duration ?? 60;
      const serviceTime = minutesToTimeString(Math.max(0, checkoutEndM - dur));

      const staffObjId = new mongoose.Types.ObjectId(staffIdStr);
      const dup = await Appointment.findOne({
        branchId: branchOid,
        clientId: clientOid,
        date: saleDate,
        bookingGroupId,
        staffId: staffObjId,
        serviceId: svcOid,
        status: 'completed',
        leadSource: new RegExp('^walk-in$', 'i'),
      }).lean();
      if (dup) continue;

      const newApt = new Appointment({
        clientId: clientOid,
        serviceId: svcOid,
        date: saleDate,
        time: serviceTime,
        duration: dur,
        status: 'completed',
        price: item.price ?? item.total ?? service.price ?? 0,
        branchId: branchOid,
        bookingGroupId,
        staffId: staffObjId,
        staffAssignments: [{ staffId: staffObjId, percentage: 100, role: 'primary' }],
        leadSource: 'Walk-in',
      });
      await newApt.save();
      logger.debug(
        `✅ Addon walk-in (standalone-style, linked bill): sale ${sale.billNo || sale._id} staff ${staffIdStr} · ${service.name}`,
      );
    }
  } catch (err) {
    logger.error('❌ createStandaloneStyleWalkInsForLinkedSaleAddons failed:', err);
  }
};

/** Create walk-in appointment cards for a completed sale with multiple staff when NOT linked to an appointment. */
const createWalkInCardsForStandaloneSale = async (sale, businessModels, branchId) => {
  if (!sale || !businessModels?.Appointment || !businessModels?.Service || !businessModels?.Client) return;
  if (sale.appointmentId) return; // Already handled by markAppointmentCompleted
  if (String(sale.status).toLowerCase() !== 'completed') return;

  try {
    const { Appointment, Service, Client } = businessModels;
    // Mongoose subdocs lose their data fields when spread with `...`, so flatten first.
    const serviceItems = (sale.items || [])
      .map((i) => (i && typeof i.toObject === 'function' ? i.toObject() : i))
      .filter((i) => i.type === 'service' && i.serviceId)
      .map((i, idx) => {
        const contrib = (i.staffContributions || [])[0];
        const raw = contrib?.staffId ?? i.staffId;
        const staffId = raw ? String(typeof raw === 'object' && raw._id ? raw._id : raw) : null;
        return { ...i, _primaryStaffId: staffId, _order: idx };
      })
      .filter((i) => i._primaryStaffId);

    if (serviceItems.length === 0) return;
    const uniqueStaffIds = [...new Set(serviceItems.map((i) => i._primaryStaffId))];
    if (uniqueStaffIds.length < 2) return; // Only create when multiple staff

    const orConditions = [];
    if (sale.customerName) orConditions.push({ name: new RegExp(`^${String(sale.customerName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (sale.customerPhone) orConditions.push({ phone: sale.customerPhone });
    if (orConditions.length === 0) {
      logger.warn('[createWalkInCardsForStandaloneSale] No customer name/phone to find client');
      return;
    }
    const client = await Client.findOne({ $or: orConditions }).lean();
    if (!client) {
      logger.warn('[createWalkInCardsForStandaloneSale] Client not found for:', sale.customerName, sale.customerPhone);
      return;
    }

    const saleDate = sale.date ? (typeof sale.date === 'string' ? sale.date.slice(0, 10) : new Date(sale.date).toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10);
    const baseTimeM = parseTimeToMinutes(sale.time || '09:00');
    const allOrdered = [...serviceItems].sort((a, b) => (a._order ?? 0) - (b._order ?? 0));
    const bookingGroupId = uuidv4();

    for (const item of serviceItems) {
      const staffIdStr = item._primaryStaffId;
      if (!staffIdStr) continue;
      const svcId = item.serviceId?._id || item.serviceId;
      const idx = allOrdered.findIndex((o) => String(o.serviceId?._id || o.serviceId) === String(svcId));
      let cumulativeM = 0;
      for (let i = 0; i < idx; i++) {
        const s = await Service.findById(allOrdered[i].serviceId?._id || allOrdered[i].serviceId).select('duration').lean();
        cumulativeM += s?.duration ?? 60;
      }
      const serviceTime = minutesToTimeString(baseTimeM + cumulativeM);
      const service = await Service.findById(svcId).lean();
      if (!service) continue;

      const staffIdObj = mongoose.Types.ObjectId.isValid(staffIdStr) ? new mongoose.Types.ObjectId(staffIdStr) : staffIdStr;
      const newApt = new Appointment({
        clientId: client._id,
        serviceId: svcId,
        date: saleDate,
        time: serviceTime,
        duration: service.duration ?? 60,
        status: 'completed',
        price: item.price ?? item.total ?? service.price ?? 0,
        branchId: branchId || sale.branchId,
        bookingGroupId,
        staffId: staffIdObj,
        staffAssignments: [{ staffId: staffIdObj, percentage: 100, role: 'primary' }],
        leadSource: 'Walk-in',
      });
      await newApt.save();
      logger.debug(`✅ Created walk-in card (standalone sale) for staff ${staffIdStr}: ${service.name}`);
    }
  } catch (err) {
    logger.error('❌ createWalkInCardsForStandaloneSale failed:', err);
  }
};

// Appointments routes
app.get('/api/appointments/by-phone/:phone', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone || '').trim();
    if (!phone) {
      return res.json({ success: true, data: [], shared: false });
    }

    const limit = Math.min(Number(req.query.limit) || 200, 300);
    const databaseManager = require('./config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const { resolveOwnerShareClientsContext } = require('./lib/share-clients-across-branches');
    const { fetchSharedAppointmentsByPhone } = require('./lib/client-shared-history');

    const shareCtx = await resolveOwnerShareClientsContext(mainConnection, req.user.branchId);
    if (shareCtx?.shareClientsAcrossBranches) {
      const appointments = await fetchSharedAppointmentsByPhone({
        mainConnection,
        ownerId: shareCtx.ownerId,
        currentBranchId: req.user.branchId,
        phone,
        limit,
      });
      return res.json({ success: true, data: appointments, shared: true });
    }

    const { Client, Appointment } = req.businessModels;
    const { findClientByPhone } = require('./lib/share-clients-across-branches');
    const client = await findClientByPhone(Client, phone);
    if (!client) {
      return res.json({ success: true, data: [], shared: false });
    }

    const apts = await Appointment.find({ clientId: client._id, branchId: req.user.branchId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      success: true,
      data: apts.map((a) => ({
        ...a,
        branchId: String(req.user.branchId),
        isCurrentBranch: true,
      })),
      shared: false,
    });
  } catch (error) {
    logger.error('Error fetching appointments by phone:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch appointments' });
  }
});

app.get('/api/appointments', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Appointment } = req.businessModels;
    const {
      page = 1,
      limit = 10,
      date,
      dateFrom,
      dateTo,
      status,
      clientId,
      view,
      fields,
    } = req.query;
    const hasBoundedWindow = Boolean(date) || Boolean(dateFrom && dateTo);
    const canCacheList = hasBoundedWindow && !clientId;
    if (canCacheList && req.user?.branchId) {
      const {
        cacheGet,
        cacheSet,
        appointmentsListCacheKey,
        buildAppointmentsListQueryKey,
      } = require('./lib/cache');
      const listCacheKey = appointmentsListCacheKey(
        req.user.branchId,
        buildAppointmentsListQueryKey(req.query)
      );
      const cachedList = await cacheGet(listCacheKey);
      if (cachedList) {
        return res.json(cachedList);
      }
    }
    const pageNum = parseInt(page);
    /**
     * Calendar/list views frequently need a whole month at once; allow a generous cap when a
     * bounded date window is supplied. Without a window we still cap tightly to prevent
     * accidental "download world" requests from buggy callers.
     */
    const requestedLimit = parseInt(limit);
    const limitNum = Math.max(
      1,
      Math.min(hasBoundedWindow ? 1000 : 200, Number.isFinite(requestedLimit) ? requestedLimit : 10),
    );

    let query = { branchId: req.user.branchId };

    if (date) {
      query.date = date;
    } else if (dateFrom || dateTo) {
      // `date` is stored as `YYYY-MM-DD` strings — lexicographic range matches IST calendar days.
      query.date = {};
      if (dateFrom) query.date.$gte = String(dateFrom).slice(0, 10);
      if (dateTo) query.date.$lte = String(dateTo).slice(0, 10);
    }

    if (status) {
      query.status = status;
    }

    if (clientId) {
      query.clientId = clientId;
    }

    /**
     * `view=calendar` and `fields=minimal` drop heavy embedded client analytics and inflate
     * compression less. Default ("full") preserves the legacy shape for existing callers.
     */
    const isMinimal = String(view).toLowerCase() === 'calendar' || String(fields).toLowerCase() === 'minimal';
    /** Sort by `date` for calendar windows; preserve legacy createdAt order otherwise. */
    const sortSpec = hasBoundedWindow ? { date: 1, time: 1 } : { createdAt: -1 };

    const totalAppointments = await Appointment.countDocuments(query);
    const rawAppointments = await Appointment.find(query)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort(sortSpec)
      .lean();

    // Resolve staff names: Staff from business DB, Owner from main DB (User)
    const { Staff } = req.businessModels;
    const mainConnection = await databaseManager.getMainConnection();
    const UserModel = mainConnection.model('User', require('./models/User').schema);
    const businessOwner = await UserModel.findOne({ branchId: req.user.branchId, role: 'admin' })
      .select('_id firstName lastName')
      .lean();
    const ownerId = businessOwner?._id?.toString();
    const ownerName = businessOwner ? `${businessOwner.firstName || ''} ${businessOwner.lastName || ''}`.trim() || 'Owner' : null;

    const staffIdsToResolve = new Set();
    rawAppointments.forEach((apt) => {
      if (apt.staffId) staffIdsToResolve.add(apt.staffId.toString());
      (apt.staffAssignments || []).forEach((as) => {
        if (as.staffId) staffIdsToResolve.add(as.staffId.toString());
      });
    });
    const staffIds = [...staffIdsToResolve];
    const staffFromDb = staffIds.length ? await Staff.find({ _id: { $in: staffIds } }).select('_id name role').lean() : [];
    const staffMap = new Map(staffFromDb.map((s) => [s._id.toString(), { _id: s._id, name: s.name, role: s.role }]));

    const resolveStaff = (id) => {
      if (!id) return null;
      const idStr = id.toString?.() || String(id);
      const fromStaff = staffMap.get(idStr);
      if (fromStaff) return fromStaff;
      if (idStr === ownerId && ownerName) return { _id: id, name: ownerName, role: 'admin' };
      return { _id: id, name: 'Unassigned Staff', role: null };
    };

    const appointments = rawAppointments.map((apt) => {
      const a = { ...apt };
      a.clientId = apt.clientId;
      a.serviceId = apt.serviceId;
      a.staffId = apt.staffId ? resolveStaff(apt.staffId) : null;
      a.staffAssignments = (apt.staffAssignments || []).map((as) => ({
        ...as,
        staffId: as.staffId ? resolveStaff(as.staffId) : null,
      }));
      return a;
    });

    // Populate clientId, serviceId, and additionalServiceIds (they're in business DB)
    const clientIds = [...new Set(appointments.map((a) => a.clientId).filter(Boolean))];
    const primaryServiceIds = [...new Set(appointments.map((a) => a.serviceId).filter(Boolean))];
    const additionalIds = appointments.flatMap((a) => a.additionalServiceIds || []).filter(Boolean);
    const allServiceIds = [...new Set([...primaryServiceIds.map((id) => id.toString()), ...additionalIds.map((id) => id.toString())])];
    const { Client, Service } = req.businessModels;
    /**
     * Calendar/list cards only need name + phone for the client and name/price/duration for
     * services. The legacy "full" view keeps email + visit history for the appointment drawer.
     */
    const clientProjection = isMinimal ? 'name phone' : 'name phone email totalVisits totalSpent lastVisit';
    const [clients, services] = await Promise.all([
      clientIds.length
        ? Client.find({ _id: { $in: clientIds } })
            .select(clientProjection)
            .lean()
        : [],
      allServiceIds.length ? Service.find({ _id: { $in: allServiceIds } }).select('name price duration').lean() : [],
    ]);
    const clientMap = new Map(clients.map((c) => [c._id.toString(), c]));
    const serviceMap = new Map(services.map((s) => [s._id.toString(), s]));
    appointments.forEach((a) => {
      if (a.clientId) a.clientId = clientMap.get(a.clientId.toString()) || a.clientId;
      if (a.serviceId) a.serviceId = serviceMap.get(a.serviceId.toString()) || a.serviceId;
      if (a.additionalServiceIds && a.additionalServiceIds.length) {
        a.additionalServices = a.additionalServiceIds
          .map((id) => serviceMap.get(id.toString()))
          .filter(Boolean);
      } else {
        a.additionalServices = [];
      }
    });

    const responseBody = {
      success: true,
      data: appointments,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalAppointments,
        totalPages: Math.ceil(totalAppointments / limitNum)
      }
    };
    if (canCacheList && req.user?.branchId) {
      const { cacheSet, appointmentsListCacheKey, buildAppointmentsListQueryKey } = require('./lib/cache');
      const listCacheKey = appointmentsListCacheKey(
        req.user.branchId,
        buildAppointmentsListQueryKey(req.query)
      );
      void cacheSet(
        listCacheKey,
        responseBody,
        parseInt(process.env.APPOINTMENTS_REDIS_TTL_SEC, 10) || 45
      );
    }
    res.json(responseBody);
  } catch (error) {
    logger.error('Error fetching appointments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch appointments'
    });
  }
});

app.post('/api/appointments', authenticateToken, setupBusinessDatabase, requirePermission('appointments', 'create'), async (req, res) => {
  try {
    const { Appointment, Service: BusinessService, BookingHold } = req.businessModels;
    const { clientId, clientName, date, time, services, totalDuration, totalAmount, notes, leadSource, status = 'scheduled', bookingGroupId: existingBookingGroupId, schedulingMode: rawSchedulingMode, allowParallelBooking: rawAllowParallel, utmSource, utmMedium, utmCampaign, estimatedRevenue } = req.body;
    const schedulingMode = rawSchedulingMode === 'custom' ? 'custom' : 'sequential';
    const gmbUtmFields = {
      ...(utmSource ? { utmSource: String(utmSource) } : {}),
      ...(utmMedium ? { utmMedium: String(utmMedium) } : {}),
      ...(utmCampaign ? { utmCampaign: String(utmCampaign) } : {}),
      ...(estimatedRevenue != null ? { estimatedRevenue: Number(estimatedRevenue) } : {}),
    };
    const allowParallelBooking = rawAllowParallel === true;

    if (!clientId || !date || !time || !services || services.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Client, date, time, and at least one service are required'
      });
    }

    const invalidService = services.find(s => !s.serviceId || !s.staffId);
    if (invalidService) {
      return res.status(400).json({
        success: false,
        error: 'Each service must have a valid serviceId and staffId'
      });
    }

    const createdBy = req.user?.name || (req.user?.firstName && req.user?.lastName ? `${req.user.firstName} ${req.user.lastName}`.trim() : null) || req.user?.email || '';

    /** One bookingGroupId per calendar day when services span multiple dates (status stays per visit). */
    const createBookingGroupIdResolver = (servicesList, defaultDate, existingGroupId) => {
      const normalizedDefault = String(defaultDate || '').slice(0, 10);
      const visitDates = servicesList.map((s) => String(s.date || defaultDate || normalizedDefault).slice(0, 10));
      const uniqueDates = new Set(visitDates.filter(Boolean));
      if (uniqueDates.size <= 1) {
        const single = existingGroupId || uuidv4();
        return () => single;
      }
      const byDate = new Map();
      for (const d of uniqueDates) {
        byDate.set(d, uuidv4());
      }
      return (serviceDate) => {
        const key = String(serviceDate || defaultDate || normalizedDefault).slice(0, 10);
        return byDate.get(key) || uuidv4();
      };
    };
    const bookingGroupIdFor = createBookingGroupIdResolver(services, date, existingBookingGroupId);

    // Helper: get primary staff ID from a service for comparison
    const getPrimaryStaffId = (s) => {
      const id = s.staffId || (s.staffAssignments && s.staffAssignments[0] && s.staffAssignments[0].staffId);
      return id ? String(id) : null;
    };

    // Multi-service bookings always create one Appointment document per service so the
    // calendar shows separate cards (visually linked via shared bookingGroupId).
    // Legacy `additionalServiceIds` is no longer written from this path; existing rows
    // that still use it are read by the GET handlers (backward compatible).
    const createdAppointments = [];

    if (schedulingMode === 'custom') {
      // Per-service custom start times: one Appointment doc per service even when staff is shared.
      // Duration always comes from the Service catalog; endTime = startTime + duration (computed server-side).
      const { detectStaffConflict } = require('./services/scheduling/conflict-detector');

      // Pre-validate each service: startTime present + Service catalog duration exists.
      const serviceCatalogIds = services.map(s => s.serviceId).filter(Boolean);
      const catalogDocs = await BusinessService.find({ _id: { $in: serviceCatalogIds } })
        .select('_id name duration')
        .lean();
      const catalogById = new Map(catalogDocs.map(d => [String(d._id), d]));

      const resolved = [];
      for (let i = 0; i < services.length; i++) {
        const s = services[i];
        const catalog = catalogById.get(String(s.serviceId));
        const fallbackName = s.name || `Service ${i + 1}`;
        const displayName = catalog?.name || fallbackName;
        const startTimeRaw = s.startTime || s.time || null;
        if (!startTimeRaw || typeof startTimeRaw !== 'string' || !/^\d{1,2}:\d{2}/.test(startTimeRaw)) {
          return res.status(400).json({
            success: false,
            error: `Please select start time for ${displayName}`
          });
        }
        if (!catalog || !catalog.duration || catalog.duration < 1) {
          return res.status(400).json({
            success: false,
            error: `Service duration is missing in service settings for ${displayName}`
          });
        }
        const duration = catalog.duration;
        const serviceDate = s.date || date;
        const startMinutes = parseTimeToMinutes(startTimeRaw);
        const dayStart = parseDateIST(serviceDate);
        const startAt = new Date(dayStart.getTime() + startMinutes * 60 * 1000);
        const endAt = new Date(startAt.getTime() + duration * 60 * 1000);
        resolved.push({
          raw: s,
          name: displayName,
          serviceId: s.serviceId,
          serviceDate,
          time: minutesToTimeString(startMinutes),
          duration,
          price: typeof s.price === 'number' ? s.price : 0,
          startAt,
          endAt
        });
      }

      // Conflict pre-check across submitted services + existing bookings.
      const formatTimeForError = (timeStr) => {
        const m = parseTimeToMinutes(timeStr);
        const h24 = Math.floor(m / 60);
        const mins = m % 60;
        const period = h24 >= 12 ? 'PM' : 'AM';
        const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
        return `${h12}:${String(mins).padStart(2, '0')} ${period}`;
      };

      // Within-batch overlap (same staff in this submission) — skip when parallel booking is allowed.
      if (!allowParallelBooking) {
        for (let i = 0; i < resolved.length; i++) {
          const a = resolved[i];
          const aStaffId = getPrimaryStaffId(a.raw);
          for (let j = i + 1; j < resolved.length; j++) {
            const b = resolved[j];
            const bStaffId = getPrimaryStaffId(b.raw);
            if (!aStaffId || !bStaffId) continue;
            if (aStaffId !== bStaffId) continue;
            if (a.startAt < b.endAt && a.endAt > b.startAt) {
              return res.status(409).json({
                success: false,
                error: `Staff is already booked from ${formatTimeForError(a.time)} to ${formatTimeForError(minutesToTimeString(parseTimeToMinutes(a.time) + a.duration))}`
              });
            }
          }
        }
      }

      // External conflict check against existing appointments per staff.
      if (!allowParallelBooking) {
        for (const r of resolved) {
          const staffId = getPrimaryStaffId(r.raw);
          if (!staffId) {
            return res.status(400).json({ success: false, error: 'Either staffId or staffAssignments is required' });
          }
          const result = await detectStaffConflict(
            { Appointment, BookingHold },
            {
              branchId: req.user.branchId,
              staffId,
              start: r.startAt,
              end: r.endAt,
              skipHoldCheck: true
            }
          );
          if (result.conflict) {
            return res.status(409).json({
              success: false,
              error: `Staff is already booked from ${formatTimeForError(r.time)} to ${formatTimeForError(minutesToTimeString(parseTimeToMinutes(r.time) + r.duration))}`
            });
          }
        }
      }

      for (const r of resolved) {
        const appointmentData = {
          clientId,
          serviceId: r.serviceId,
          date: r.serviceDate,
          time: r.time,
          duration: r.duration,
          startAt: r.startAt,
          endAt: r.endAt,
          status,
          notes,
          leadSource: leadSource || '',
          createdBy,
          price: r.price,
          branchId: req.user.branchId,
          bookingGroupId: bookingGroupIdFor(r.serviceDate),
          schedulingMode: 'custom',
          ...(allowParallelBooking ? { allowStaffOverlap: true } : {}),
          ...gmbUtmFields,
        };

        if (r.raw.staffAssignments && Array.isArray(r.raw.staffAssignments)) {
          appointmentData.staffAssignments = r.raw.staffAssignments;
          const totalPercentage = r.raw.staffAssignments.reduce((sum, assignment) => sum + assignment.percentage, 0);
          if (Math.abs(totalPercentage - 100) > 0.01) {
            return res.status(400).json({
              success: false,
              error: 'Staff assignment percentages must add up to 100%'
            });
          }
        } else if (r.raw.staffId) {
          appointmentData.staffId = r.raw.staffId;
          appointmentData.staffAssignments = [{
            staffId: r.raw.staffId,
            percentage: 100,
            role: 'primary'
          }];
        }

        const newAppointment = new Appointment(appointmentData);
        const savedAppointment = await newAppointment.save();

        const populatedAppointment = await Appointment.findById(savedAppointment._id)
          .populate('clientId', 'name phone email')
          .populate('serviceId', 'name price duration')
          .populate('staffId', 'name role')
          .populate('staffAssignments.staffId', 'name role');

        createdAppointments.push(populatedAppointment);
      }
    } else {
      // Sequential mode: create one appointment per service so each service is its own card.
      // Each service starts after the previous ends (Service A 9:00–9:30, Service B 9:30–10:00)
      // and all cards share a bookingGroupId so the calendar links them visually.
      // Single-service bookings get a unique group id too, but the UI only shows the link
      // styling when more than one document shares the id.
      const formatTimeForError = (timeStr) => {
        const m = parseTimeToMinutes(timeStr);
        const h24 = Math.floor(m / 60);
        const mins = m % 60;
        const period = h24 >= 12 ? 'PM' : 'AM';
        const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
        return `${h12}:${String(mins).padStart(2, '0')} ${period}`;
      };

      const { detectStaffConflict } = require('./services/scheduling/conflict-detector');

      const serviceCatalogIds = [...new Set(services.map((s) => String(s.serviceId)).filter(Boolean))];
      const catalogDocs = await BusinessService.find({ _id: { $in: serviceCatalogIds } })
        .select('_id name duration')
        .lean();
      const catalogById = new Map(catalogDocs.map((d) => [String(d._id), d]));

      const baseTimeMinutes = parseTimeToMinutes(time);
      let cumulativeMinutes = 0;
      let chainDate = date;
      for (let i = 0; i < services.length; i++) {
        const service = services[i];
        const catalog = catalogById.get(String(service.serviceId));
        const displayName = catalog?.name || service.name || 'Service';
        let effectiveDuration = catalog && catalog.duration >= 1 ? catalog.duration : (typeof service.duration === 'number' ? service.duration : 0);
        if (!Number.isFinite(effectiveDuration)) effectiveDuration = 0;
        if (effectiveDuration < 1) {
          return res.status(400).json({
            success: false,
            error: `Service duration is missing in service settings for ${displayName}`,
          });
        }

        const serviceDate = service.date || date;
        if (serviceDate !== chainDate) {
          cumulativeMinutes = 0;
          chainDate = serviceDate;
        }
        const serviceStartMinutes = baseTimeMinutes + cumulativeMinutes;
        const serviceTime = minutesToTimeString(serviceStartMinutes);
        cumulativeMinutes += effectiveDuration;

        const dayStart = parseDateIST(serviceDate);
        const startAt = new Date(dayStart.getTime() + serviceStartMinutes * 60 * 1000);
        const endAt = new Date(startAt.getTime() + effectiveDuration * 60 * 1000);

        const seqStaffId = getPrimaryStaffId(service);
        if (!seqStaffId) {
          return res.status(400).json({
            success: false,
            error: 'Either staffId or staffAssignments is required',
          });
        }
        const overlapResult = allowParallelBooking
          ? { conflict: false }
          : await detectStaffConflict(
          { Appointment, BookingHold },
          {
            branchId: req.user.branchId,
            staffId: seqStaffId,
            start: startAt,
            end: endAt,
            skipHoldCheck: true,
          }
        );
        if (overlapResult.conflict) {
          const endMinuteStr = minutesToTimeString(serviceStartMinutes + effectiveDuration);
          return res.status(409).json({
            success: false,
            error: `Staff is already booked from ${formatTimeForError(serviceTime)} to ${formatTimeForError(endMinuteStr)}`,
          });
        }

        const appointmentData = {
          clientId,
          serviceId: service.serviceId,
          date: serviceDate,
          time: serviceTime,
          duration: effectiveDuration,
          status,
          notes,
          leadSource: leadSource || '',
          createdBy,
          price: service.price,
          branchId: req.user.branchId,
          bookingGroupId: bookingGroupIdFor(serviceDate),
          staffLocked: !!service.staffLocked,
          ...(allowParallelBooking ? { allowStaffOverlap: true } : {}),
          ...gmbUtmFields,
        };

        if (service.staffAssignments && Array.isArray(service.staffAssignments)) {
          appointmentData.staffAssignments = service.staffAssignments;
          const totalPercentage = service.staffAssignments.reduce((sum, assignment) => sum + assignment.percentage, 0);
          if (Math.abs(totalPercentage - 100) > 0.01) {
            return res.status(400).json({
              success: false,
              error: 'Staff assignment percentages must add up to 100%',
            });
          }
        } else if (service.staffId) {
          appointmentData.staffId = service.staffId;
          appointmentData.staffAssignments = [{
            staffId: service.staffId,
            percentage: 100,
            role: 'primary',
          }];
        } else {
          return res.status(400).json({
            success: false,
            error: 'Either staffId or staffAssignments is required',
          });
        }

        const newAppointment = new Appointment(appointmentData);
        const savedAppointment = await newAppointment.save();

        const populatedAppointment = await Appointment.findById(savedAppointment._id)
          .populate('clientId', 'name phone email')
          .populate('serviceId', 'name price duration')
          .populate('staffId', 'name role')
          .populate('staffAssignments.staffId', 'name role');

        createdAppointments.push(populatedAppointment);
      }
    }

    // Respond immediately — notifications are sent in the background
    res.status(201).json({
      success: true,
      data: createdAppointments,
      message: 'Appointments created successfully'
    });

    // Fire-and-forget: send all notifications after the response has been flushed.
    // Errors here must never propagate to the request handler.
    setImmediate(async () => {

    // Send email notifications if enabled
    try {
      const emailService = require('./services/email-service');
      
      // Ensure email service is initialized
      if (!emailService.initialized) {
        logger.debug('📧 Initializing email service...');
        await emailService.initialize();
      }
      
      // Debug: Log email service status
      logger.debug('📧 Email Service Status:', {
        initialized: emailService.initialized,
        enabled: emailService.enabled,
        provider: emailService.provider,
        hasConfig: !!emailService.config
      });
      
      // Check if email service is enabled (from AdminSettings)
      if (!emailService.enabled) {
        logger.debug('❌ Email service is disabled, skipping appointment email');
        logger.debug('💡 To enable: Check Admin Settings → Notifications → Email and ensure it\'s enabled with valid API key');
      } else {
        // Get Business from main database (not business database)
        const databaseManager = require('./config/database-manager');
        const mainConnection = await databaseManager.getMainConnection();
        const Business = mainConnection.model('Business', require('./models/Business').schema);
        const business = await Business.findById(req.user.branchId);
        
        if (!business) {
          logger.error('❌ Business not found for branchId:', req.user.branchId);
        } else if (isPlatformEmailDisabled(business)) {
          logger.info('📧 Skipping appointment emails — platform policy (tenant email disabled)');
        } else {
          logger.debug('✅ Business found:', business.name);

        const rawEmailSettings = business.settings?.emailNotificationSettings;
        
        // Apply defaults to email settings (similar to WhatsApp)
        const emailSettings = getEmailSettingsWithDefaults(rawEmailSettings);
        
        // Debug: Log email settings
        logger.debug('📧 Email Settings:', {
          emailSettingsExists: !!rawEmailSettings,
          appointmentNotificationsEnabled: emailSettings?.appointmentNotifications?.enabled,
          newAppointmentsEnabled: emailSettings?.appointmentNotifications?.newAppointments
        });
        
        const { Staff, Client } = req.businessModels;

        // Check if business has enabled appointment notifications
        // Use merged settings with defaults - defaults to true if not explicitly set to false
        const appointmentNotificationsEnabled = emailSettings.appointmentNotifications?.enabled === true;
        
        logger.debug(`📧 Appointment notifications enabled: ${appointmentNotificationsEnabled}`, {
          enabled: emailSettings?.appointmentNotifications?.enabled,
          newAppointments: emailSettings?.appointmentNotifications?.newAppointments
        });
        
        if (appointmentNotificationsEnabled) {
        // Send confirmation to client if email exists
        // Check if new appointments are enabled
        const sendNewAppointments =
          emailSettings?.appointmentNotifications?.newAppointments === true ||
          emailSettings?.appointmentNotifications?.newAppointment === true;
        logger.debug(`📧 Send new appointments to clients: ${sendNewAppointments}`);
        
        if (sendNewAppointments) {
          logger.debug(`📧 Processing ${createdAppointments.length} appointment(s) for client emails`);
          
          for (const appointment of createdAppointments) {
            // Debug: Log appointment structure
            logger.debug('📧 Appointment Structure:', {
              appointmentId: appointment._id,
              clientIdType: typeof appointment.clientId,
              clientIdIsObject: typeof appointment.clientId === 'object',
              clientIdValue: appointment.clientId?._id || appointment.clientId,
              clientIdEmail: appointment.clientId?.email,
              clientIdName: appointment.clientId?.name
            });
            
            // Check if clientId is already populated (from the populate call above)
            let client = null;
            let clientEmail = null;
            let clientName = null;
            
            if (appointment.clientId && typeof appointment.clientId === 'object') {
              // Client is populated
              client = appointment.clientId;
              clientEmail = client.email ? client.email.trim() : null;
              clientName = client.name || 'Client';
              
              logger.debug('📧 Using populated client data:', {
                name: clientName,
                email: clientEmail,
                hasEmail: !!clientEmail
              });
            } else {
              // Client is not populated, fetch it
              const clientId = appointment.clientId?._id || appointment.clientId;
              logger.debug('📧 Client not populated, fetching from database. ClientId:', clientId);
              
              if (clientId) {
                client = await Client.findById(clientId);
                if (client) {
                  clientEmail = client.email ? client.email.trim() : null;
                  clientName = client.name || 'Client';
                  logger.debug('📧 Fetched client from database:', {
                    name: clientName,
                    email: clientEmail,
                    hasEmail: !!clientEmail
                  });
                } else {
                  logger.error('❌ Client not found in database with ID:', clientId);
                }
              } else {
                logger.error('❌ No clientId found in appointment');
              }
            }
            
            // Debug: Log client email check
            logger.debug('📧 Client Email Check Summary:', {
              appointmentId: appointment._id,
              clientId: appointment.clientId?._id || appointment.clientId,
              clientEmail: clientEmail,
              clientName: clientName,
              hasEmail: !!clientEmail,
              emailLength: clientEmail?.length || 0
            });
            
            if (clientEmail && clientEmail.length > 0) {
              logger.debug(`📧 Attempting to send appointment confirmation to: ${clientEmail}`);
              try {
                // Get service name - check if populated or fetch
                let serviceName = 'Service';
                if (appointment.serviceId) {
                  if (typeof appointment.serviceId === 'object' && appointment.serviceId.name) {
                    serviceName = appointment.serviceId.name;
                  } else {
                    const Service = req.businessModels.Service;
                    const service = await Service.findById(appointment.serviceId);
                    serviceName = service?.name || 'Service';
                  }
                }
                
                // Get staff name - check if populated or fetch
                let staffName = 'Not assigned';
                if (appointment.staffId) {
                  if (typeof appointment.staffId === 'object' && appointment.staffId.name) {
                    staffName = appointment.staffId.name;
                  } else {
                    const staff = await Staff.findById(appointment.staffId);
                    staffName = staff?.name || 'Not assigned';
                  }
                } else if (appointment.staffAssignments && appointment.staffAssignments.length > 0) {
                  const firstAssignment = appointment.staffAssignments[0];
                  if (firstAssignment.staffId && typeof firstAssignment.staffId === 'object' && firstAssignment.staffId.name) {
                    staffName = firstAssignment.staffId.name;
                  } else if (firstAssignment.staffId) {
                    const staff = await Staff.findById(firstAssignment.staffId);
                    staffName = staff?.name || 'Not assigned';
                  }
                }
                
                logger.debug(`📧 Preparing to send email to: ${clientEmail}`, {
                  to: clientEmail,
                  clientName: clientName,
                  serviceName: serviceName,
                  date: appointment.date,
                  time: appointment.time,
                  staffName: staffName,
                  businessName: business.name
                });
                
                const emailResult = await emailService.sendAppointmentConfirmation({
                  to: clientEmail,
                  clientName: clientName,
                  appointmentData: {
                    serviceName: serviceName,
                    date: appointment.date,
                    time: appointment.time,
                    staffName: staffName,
                    businessName: business.name,
                    businessPhone: business.contact?.phone,
                    notes: appointment.notes || ''
                  }
                });
                
                logger.debug(`📧 Email result:`, {
                  success: emailResult?.success,
                  error: emailResult?.error,
                  data: emailResult?.data
                });
                
                if (emailResult && emailResult.success !== false) {
                  logger.debug(`✅ Appointment confirmation sent to client: ${clientEmail}`);
                } else {
                  logger.error(`❌ Failed to send appointment email to ${clientEmail}:`, emailResult?.error || 'Unknown error');
                  logger.error(`❌ Full email result:`, JSON.stringify(emailResult, null, 2));
                }
                logEmailMessage({
                  businessId: business?._id,
                  recipientEmail: clientEmail,
                  messageType: 'appointment',
                  result: {
                    success: emailResult && emailResult.success !== false,
                    error: emailResult?.error,
                    data: emailResult?.data,
                  },
                  subject: 'Appointment Confirmation',
                  provider: emailService?.provider,
                  relatedEntityId: appointment?._id,
                  relatedEntityType: 'Appointment',
                });
              } catch (clientEmailError) {
                logger.error('❌ Error sending appointment confirmation to client:', clientEmailError);
                logger.error('❌ Error details:', {
                  message: clientEmailError.message,
                  stack: clientEmailError.stack
                });
              }
            } else {
              logger.debug('⚠️ Skipping email for appointment - client has no email address.', {
                appointmentId: appointment._id,
                clientId: appointment.clientId?._id || appointment.clientId,
                clientName: clientName || 'Unknown',
                tip: 'To fix: Add email address to client profile in Clients section'
              });
            }
          }
        }
        
        // Send notification to staff if enabled
        // Use same logic as client notifications - default to enabled unless explicitly disabled AND configured
        const staffHasRecipientList = emailSettings?.appointmentNotifications?.recipientStaffIds?.length > 0;
        const staffExplicitlyDisabled = emailSettings?.appointmentNotifications?.enabled === false;
        const staffNotificationsEnabled = !emailSettings || 
          !emailSettings?.appointmentNotifications ||
          (!staffExplicitlyDisabled || !staffHasRecipientList);
        
        const recipientStaffIds = emailSettings?.appointmentNotifications?.recipientStaffIds || [];
        
        logger.debug('📧 Staff Notification Check:', {
          staffNotificationsEnabled,
          staffExplicitlyDisabled,
          staffHasRecipientList,
          recipientStaffIdsCount: recipientStaffIds.length,
          recipientStaffIds: recipientStaffIds.map(id => id.toString())
        });
        
        if (staffNotificationsEnabled) {
          const recipients = await resolveReportRecipients({
            business,
            businessModels: req.businessModels,
            mainConnection,
            prefKey: 'appointmentAlerts',
            recipientStaffIds,
          });
          
          logger.debug(`📧 Found ${recipients.length} total recipients for appointment notifications`);
          
          if (recipients.length === 0) {
            logger.debug('⚠️ No recipients found. Check: staff email notifications enabled, appointment alerts preference enabled, valid email addresses, recipient list in business settings, admin user email addresses');
          }
          
          const emailDelayMs = 600; // Resend limit: 2 req/sec
          for (let i = 0; i < recipients.length; i++) {
            if (i > 0) await new Promise(r => setTimeout(r, emailDelayMs));
            const recipient = recipients[i];
            try {
              logger.debug(`📧 Sending appointment notification to: ${recipient.email} (${recipient.name || recipient.role})`);
              
              // Get appointment details for the first appointment (if available)
              const firstAppointment = createdAppointments[0];
              let appointmentDetails = {
                date: firstAppointment?.date,
                time: firstAppointment?.time,
                clientName: null,
                serviceName: null
              };
              
              // Try to get client and service names
              if (firstAppointment) {
                if (firstAppointment.clientId && typeof firstAppointment.clientId === 'object') {
                  appointmentDetails.clientName = firstAppointment.clientId.name;
                }
                if (firstAppointment.serviceId && typeof firstAppointment.serviceId === 'object') {
                  appointmentDetails.serviceName = firstAppointment.serviceId.name;
                }
              }
              
              const staffApptEmailResult = await emailService.sendAppointmentNotification({
                to: recipient.email,
                appointmentCount: createdAppointments.length,
                businessName: business.name,
                appointmentDetails: appointmentDetails
              });
              logger.debug(`✅ Appointment notification sent to: ${recipient.email}`);
              logEmailMessage({
                businessId: business?._id,
                recipientEmail: recipient.email,
                messageType: 'appointment',
                result: {
                  success: staffApptEmailResult ? staffApptEmailResult.success !== false : true,
                  error: staffApptEmailResult?.error,
                  data: staffApptEmailResult?.data,
                },
                subject: 'New Appointment Notification',
                provider: emailService?.provider,
                relatedEntityId: firstAppointment?._id,
                relatedEntityType: 'Appointment',
              });
            } catch (emailError) {
              logEmailMessage({
                businessId: business?._id,
                recipientEmail: recipient.email,
                messageType: 'appointment',
                result: { success: false, error: emailError?.message || String(emailError) },
                subject: 'New Appointment Notification',
                provider: emailService?.provider,
                relatedEntityId: createdAppointments?.[0]?._id,
                relatedEntityType: 'Appointment',
              });
              logger.error(`❌ Error sending appointment notification to ${recipient.email}:`, emailError);
              logger.error('❌ Error details:', {
                message: emailError.message,
                stack: emailError.stack
              });
            }
          }
        } else {
          logger.debug('⚠️ Staff appointment notifications are disabled in business settings');
        }
        }
      }
      }
    } catch (emailError) {
      logger.error('❌ Error sending appointment email:', emailError);
      logger.error('❌ Error stack:', emailError.stack);
      // Don't fail appointment creation if email fails
    }

    // Send WhatsApp appointment confirmation if enabled (same path as receipt on checkout)
    try {
      await sendAppointmentWhatsAppAfterCreate(req, createdAppointments);
    } catch (whatsappError) {
      logger.error('Error sending appointment WhatsApp:', whatsappError);
      // Don't fail appointment creation if WhatsApp fails
    }

    // Send SMS appointment confirmation if enabled
    try {
      const smsService = require('./services/sms-service');
      const { canUseAddon } = require('./lib/entitlements');
      await smsService.initialize();
      if (smsService.enabled) {
        const databaseManager = require('./config/database-manager');
        const mainConnection = await databaseManager.getMainConnection();
        const AdminSettings = mainConnection.model('AdminSettings', require('./models/AdminSettings').schema);
        const Business = mainConnection.model('Business', require('./models/Business').schema);
        const adminSettings = await AdminSettings.getSettings();
        const smsEnabled = adminSettings?.notifications?.sms?.enabled === true && (adminSettings?.notifications?.sms?.provider === 'msg91' || !!(adminSettings?.notifications?.sms?.msg91AuthKey && String(adminSettings.notifications.sms.msg91AuthKey).trim()));
        if (smsEnabled) {
          let business = await Business.findById(req.user.branchId).lean();
          if (canUseAddon(business, 'sms') || canDeductSms(business)) {
            const { Client, Staff } = req.businessModels;
            for (const appointment of createdAppointments) {
              let client = null;
              if (appointment.clientId && typeof appointment.clientId === 'object') {
                client = appointment.clientId;
              } else {
                const clientId = appointment.clientId?._id || appointment.clientId;
                if (clientId) client = await Client.findById(clientId);
              }
              if (!client?.phone) continue;
              let serviceName = 'Service';
              if (appointment.serviceId) {
                if (typeof appointment.serviceId === 'object' && appointment.serviceId.name) serviceName = appointment.serviceId.name;
                else {
                  const { Service } = req.businessModels;
                  const service = await Service.findById(appointment.serviceId);
                  serviceName = service?.name || 'Service';
                }
              }
              let staffName = 'Not assigned';
              if (appointment.staffId && typeof appointment.staffId === 'object' && appointment.staffId.name) staffName = appointment.staffId.name;
              else if (appointment.staffId) {
                const staff = await Staff.findById(appointment.staffId);
                staffName = staff?.name || 'Not assigned';
              }
              const useAddon = canUseAddon(business, 'sms');
              if (!useAddon && !canDeductSms(business)) {
                break;
              }
              const result = await smsService.sendAppointmentConfirmation({
                to: client.phone,
                clientName: client.name || 'Client',
                appointmentData: {
                  serviceName,
                  date: appointment.date,
                  time: appointment.time,
                  staffName,
                  businessName: business.name,
                  businessPhone: business.contact?.phone
                }
              });
              if (result.success) {
                if (useAddon) {
                  await Business.updateOne(
                    { _id: business._id },
                    { $inc: { 'plan.addons.sms.used': 1 } }
                  );
                } else {
                  await deductSms(business._id, {
                    description: 'SMS appointment confirmation',
                    relatedEntity: { id: appointment?._id, type: 'Appointment' },
                  });
                  business = await Business.findById(business._id).lean();
                }
              }
              logSmsMessage({
                businessId: business._id,
                recipientPhone: client.phone,
                messageType: 'appointment',
                result,
                relatedEntityId: appointment?._id,
                relatedEntityType: 'Appointment',
              });
            }
          }
        }
      }
    } catch (smsErr) {
      logger.error('Error sending appointment confirmation SMS:', smsErr);
    }

    }); // end setImmediate (background notifications)

  } catch (error) {
    if (error.code === 11000 || error.codeName === 'DuplicateKey' || /duplicate key/i.test(String(error.message || ''))) {
      logger.warn('Appointment slot conflict (duplicate slotKey):', error.message);
      return res.status(409).json({
        success: false,
        error: 'This time slot is already booked for the selected staff member. Please choose a different time.'
      });
    }
    if (error.name === 'ValidationError') {
      logger.warn('Appointment validation failed:', error.message);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    logger.error('Error creating appointment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create appointment'
    });
  }
});

// Receipts routes
app.get('/api/receipts', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Receipt } = req.businessModels;
    const { page = 1, limit = 10, clientId, date } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    let query = {};
    
    if (clientId) {
      query.clientId = clientId;
    }
    
    if (date) {
      query.date = date;
    }

    const totalReceipts = await Receipt.countDocuments(query);
    const receipts = await Receipt.find(query)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: receipts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalReceipts,
        totalPages: Math.ceil(totalReceipts / limitNum)
      }
    });
  } catch (error) {
    logger.error('Error fetching receipts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch receipts'
    });
  }
});

app.post('/api/receipts', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Receipt } = req.businessModels;
    const { clientId, staffId, items, subtotal, tip, discount, tax, total, payments, notes } = req.body;

    if (!clientId || !staffId || !items || !total) {
      return res.status(400).json({
        success: false,
        error: 'Client, staff, items, and total are required'
      });
    }

    const { getItemPreTaxTotal } = require('./lib/sale-item-pretax');
    // Process items to handle staff contributions (amounts are tax-exclusive)
    const processedItems = items.map(item => {
      const linePreTax = getItemPreTaxTotal(item);
      if (item.staffContributions && Array.isArray(item.staffContributions)) {
        item.staffContributions = item.staffContributions.map(contribution => ({
          ...contribution,
          amount: (linePreTax * contribution.percentage) / 100
        }));
      }

      if ((!item.staffContributions || item.staffContributions.length === 0)) {
        const trimmedStaffId = item.staffId != null ? String(item.staffId).trim() : '';
        if (trimmedStaffId) {
          const nm = item.staffName != null ? String(item.staffName).trim() : '';
          item.staffContributions = [{
            staffId: trimmedStaffId,
            staffName: nm || 'Staff',
            percentage: 100,
            amount: linePreTax
          }];
        }
      }
      
      return item;
    });

    const newReceipt = new Receipt({
      receiptNumber: `RCP-${Date.now()}`,
      clientId,
      staffId,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().split(' ')[0],
      items: processedItems,
      subtotal: parseFloat(subtotal) || 0,
      tip: parseFloat(tip) || 0,
      discount: parseFloat(discount) || 0,
      tax: parseFloat(tax) || 0,
      total: parseFloat(total),
      payments: payments || [],
      notes,
      branchId: req.user.branchId
    });

    const savedReceipt = await newReceipt.save();

    // Send email notifications if enabled
    try {
      const emailService = require('./services/email-service');
      
      // Ensure email service is initialized
      if (!emailService.initialized) {
        await emailService.initialize();
      }
      
      // Check if email service is enabled (from AdminSettings)
      if (!emailService.enabled) {
        logger.debug('📧 Email service is disabled, skipping receipt email');
      } else {
        // Get Business from main database (not business database)
        const databaseManager = require('./config/database-manager');
        const mainConnection = await databaseManager.getMainConnection();
        const Business = mainConnection.model('Business', require('./models/Business').schema);
        
        const { Staff, Client } = req.businessModels;
        const business = await Business.findById(req.user.branchId);
        if (!business) {
          logger.error('📧 Business not found for receipt email, branchId:', req.user.branchId);
        } else if (isPlatformEmailDisabled(business)) {
          logger.info('📧 Skipping receipt emails — platform policy');
        } else {
        const rawEmailSettings = business.settings?.emailNotificationSettings;
        
        // Apply defaults to email settings (similar to WhatsApp)
        const emailSettings = getEmailSettingsWithDefaults(rawEmailSettings);
        
        // Check if business has enabled receipt notifications
        // Use merged settings with defaults - defaults to true if not explicitly set to false
        const receiptNotificationsEnabled = emailSettings.receiptNotifications?.enabled === true;
        
        logger.debug(`📧 Receipt notifications enabled: ${receiptNotificationsEnabled}`, {
          enabled: emailSettings?.receiptNotifications?.enabled,
          sendToClients: emailSettings?.receiptNotifications?.sendToClients
        });
        
        if (receiptNotificationsEnabled) {
          // Send receipt to client if enabled
          const sendToClients = emailSettings?.receiptNotifications?.sendToClients === true;
          if (sendToClients) {
            const client = await Client.findById(clientId);
            if (client?.email) {
            try {
              logger.debug(`📧 Attempting to send receipt email to: ${client.email}`);
              
              // Try to find related sale by receiptNumber (which might match billNo)
              let receiptLink = null;
              try {
                const { Sale } = req.businessModels;
                const relatedSale = await Sale.findOne({ billNo: savedReceipt.receiptNumber });
                if (relatedSale?.shareToken) {
                  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
                  receiptLink = `${frontendUrl}/receipt/public/${relatedSale.billNo}/${relatedSale.shareToken}`;
                  logger.debug(`✅ Receipt link generated from related sale: ${receiptLink}`);
                } else {
                  logger.debug('⚠️ No related sale found or sale does not have shareToken');
                }
              } catch (saleLookupError) {
                logger.warn('⚠️ Error looking up related sale:', saleLookupError.message);
              }
              
              const emailResult = await emailService.sendReceipt({
                to: client.email,
                clientName: client.name,
                receiptNumber: savedReceipt.receiptNumber,
                receiptData: {
                  businessName: business.name,
                  date: savedReceipt.date,
                  items: savedReceipt.items,
                  subtotal: savedReceipt.subtotal,
                  tax: savedReceipt.tax,
                  discount: savedReceipt.discount,
                  total: savedReceipt.total,
                  paymentMethod: savedReceipt.payments?.[0]?.type || 'N/A'
                },
                receiptLink: receiptLink
              });
              if (emailResult && emailResult.success !== false) {
                logger.debug(`✅ Receipt email sent to client: ${client.email}`);
              } else {
                logger.error(`❌ Failed to send receipt email to ${client.email}:`, emailResult?.error || 'Unknown error');
              }
              logEmailMessage({
                businessId: business?._id,
                recipientEmail: client.email,
                messageType: 'receipt',
                result: {
                  success: emailResult && emailResult.success !== false,
                  error: emailResult?.error,
                  data: emailResult?.data,
                },
                subject: `Receipt ${savedReceipt?.receiptNumber || ''}`.trim(),
                provider: emailService?.provider,
                relatedEntityId: savedReceipt?._id,
                relatedEntityType: 'Receipt',
              });
            } catch (clientEmailError) {
              logger.error('❌ Error sending receipt email to client:', clientEmailError);
              logger.error('❌ Error details:', {
                message: clientEmailError.message,
                stack: clientEmailError.stack
              });
            }
          }
          
          // Send notification to staff if enabled
          const sendToStaff = emailSettings?.receiptNotifications?.sendToStaff === true;
          if (sendToStaff) {
            const recipientStaffIds = emailSettings.receiptNotifications.recipientStaffIds || [];
            const recipients = await resolveReportRecipients({
              business,
              businessModels: req.businessModels,
              mainConnection,
              prefKey: 'receiptAlerts',
              recipientStaffIds,
            });
            
            for (const staff of recipients) {
              try {
                const staffReceiptEmailResult = await emailService.sendSystemAlert({
                  to: staff.email,
                  alertType: 'Receipt Generated',
                  message: `A new receipt ${savedReceipt.receiptNumber} has been generated for ₹${savedReceipt.total}`,
                  businessName: business.name
                });
                logger.debug(`✅ Receipt notification sent to staff: ${staff.email}`);
                logEmailMessage({
                  businessId: business?._id,
                  recipientEmail: staff.email,
                  messageType: 'receipt',
                  result: {
                    success: staffReceiptEmailResult ? staffReceiptEmailResult.success !== false : true,
                    error: staffReceiptEmailResult?.error,
                    data: staffReceiptEmailResult?.data,
                  },
                  subject: `Receipt Generated: ${savedReceipt?.receiptNumber || ''}`.trim(),
                  provider: emailService?.provider,
                  relatedEntityId: savedReceipt?._id,
                  relatedEntityType: 'Receipt',
                });
              } catch (staffEmailError) {
                logEmailMessage({
                  businessId: business?._id,
                  recipientEmail: staff.email,
                  messageType: 'receipt',
                  result: { success: false, error: staffEmailError?.message || String(staffEmailError) },
                  subject: `Receipt Generated: ${savedReceipt?.receiptNumber || ''}`.trim(),
                  provider: emailService?.provider,
                  relatedEntityId: savedReceipt?._id,
                  relatedEntityType: 'Receipt',
                });
                logger.error('Error sending receipt notification to staff:', staffEmailError);
              }
            }
          }
        }
        }
      }
      }
    } catch (emailError) {
      logger.error('Error sending receipt email:', emailError);
      // Don't fail receipt creation if email fails
    }

    // Send WhatsApp receipt if enabled
    try {
      const whatsappService = require('./services/whatsapp-service');
      await whatsappService.initialize();
      
      if (whatsappService.enabled) {
        const databaseManager = require('./config/database-manager');
        const mainConnection = await databaseManager.getMainConnection();
        const AdminSettings = mainConnection.model('AdminSettings', require('./models/AdminSettings').schema);
        const Business = mainConnection.model('Business', require('./models/Business').schema);
        const WhatsAppMessageLog = mainConnection.model('WhatsAppMessageLog', require('./models/WhatsAppMessageLog').schema);
        
        const adminSettings = await AdminSettings.getSettings();
        const whatsappEnabled = adminSettings?.notifications?.whatsapp?.enabled === true;
        const adminReceiptNotificationsEnabled = isAdminReceiptNotificationsEnabled(
          adminSettings?.notifications?.whatsapp
        );
        
        if (whatsappEnabled && adminReceiptNotificationsEnabled) {
          // Use lean() to get plain object so nested objects are accessible
          const business = await Business.findById(req.user.branchId).lean();
          const rawWhatsappSettings = business?.settings?.whatsappNotificationSettings;
          const whatsappSettings = getWhatsAppSettingsWithDefaults(rawWhatsappSettings);
          const businessWhatsappEnabled = whatsappSettings.enabled === true;
          const receiptNotificationsEnabled = whatsappSettings.receiptNotifications?.enabled === true;
          const autoSendEnabled = whatsappSettings.receiptNotifications?.autoSendToClients === true;
          
          if (businessWhatsappEnabled && receiptNotificationsEnabled && autoSendEnabled) {
            // Check quiet hours
            const quietHours = adminSettings?.notifications?.whatsapp?.quietHours;
            const inQuietHours = whatsappService.isQuietHours(quietHours);
            
            if (!inQuietHours) {
              const { Client } = req.businessModels;
              const client = await Client.findById(clientId);
              
              if (client?.phone) {
                try {
                  const { canUseAddon } = require('./lib/entitlements');
                  const mainConnectionForQuota = await databaseManager.getMainConnection();
                  const BusinessMain = mainConnectionForQuota.model('Business', require('./models/Business').schema);
                  const freshBusiness = await BusinessMain.findById(business._id).lean();
                  const useAddon = canUseAddon(freshBusiness, 'whatsapp');
                  const useWallet = !useAddon && canDeductWhatsApp(freshBusiness, 'receipt');
                  if (!useAddon && !useWallet) {
                    logger.info('📱 WhatsApp receipt skipped: quota exhausted, wallet insufficient');
                  } else {
                  let receiptLink = null;
                  let feedbackLink = null;
                  try {
                    const { Sale } = req.businessModels;
                    const {
                      buildSaleNotificationLinks,
                      resolveReceiptFeedbackLinkForSend,
                    } = require('./lib/feedback-link-helpers');
                    const relatedSale = await Sale.findOne({ billNo: savedReceipt.receiptNumber });
                    const links = await buildSaleNotificationLinks(
                      Sale,
                      business._id,
                      relatedSale,
                      'whatsapp'
                    );
                    receiptLink = links.receiptLink;
                    feedbackLink = resolveReceiptFeedbackLinkForSend(
                      freshBusiness,
                      whatsappSettings,
                      links.feedbackLink
                    );
                  } catch (saleLookupError) {
                    logger.warn('⚠️ Error looking up related sale for WhatsApp:', saleLookupError.message);
                  }
                  
                  const result = await whatsappService.sendReceipt({
                    to: client.phone,
                    businessId: business._id,
                    clientName: client.name,
                    receiptNumber: savedReceipt.receiptNumber,
                    receiptData: {
                      businessName: business.name,
                      total: savedReceipt.total
                    },
                    receiptLink,
                    feedbackLink,
                  });
                  
                  // Log to WhatsAppMessageLog
                  await WhatsAppMessageLog.create({
                    businessId: business._id,
                    recipientPhone: client.phone,
                    messageType: 'receipt',
                    status: result.success ? 'sent' : 'failed',
                    msg91Response: result.data || null,
                    relatedEntityId: savedReceipt._id,
                    relatedEntityType: 'Receipt',
                    error: result.error || null,
                    timestamp: new Date()
                  });
                  
                  if (result.success) {
                    // Increment WhatsApp quota usage (or deduct from wallet)
                    try {
                      if (useWallet) {
                        await deductWhatsApp(business._id, 'receipt', {
                          description: 'WhatsApp receipt',
                          relatedEntity: { id: savedReceipt._id, type: 'Receipt' },
                        });
                      } else {
                        await BusinessMain.updateOne(
                          { _id: business._id },
                          { $inc: { 'plan.addons.whatsapp.used': 1 } }
                        );
                      }
                      logger.debug(`📊 WhatsApp quota incremented for business: ${business._id}`);
                    } catch (quotaError) {
                      logger.error('❌ Error incrementing WhatsApp quota:', quotaError);
                      // Don't fail the receipt if quota increment fails
                    }
                    
                    logger.debug(`✅ Receipt WhatsApp sent to client: ${client.phone}`);
                  } else {
                    logger.error(`❌ Failed to send receipt WhatsApp to ${client.phone}:`, result.error);
                  }
                  }
                } catch (whatsappError) {
                  logger.error('❌ Error sending receipt WhatsApp to client:', whatsappError);
                }
              }
            } else {
              logger.debug('📱 WhatsApp quiet hours active, skipping receipt message');
            }
          }
        }
      }
    } catch (whatsappError) {
      logger.error('Error sending receipt WhatsApp:', whatsappError);
      // Don't fail receipt creation if WhatsApp fails
    }

    // Send SMS receipt if enabled
    try {
      const smsService = require('./services/sms-service');
      const { canUseAddon, getEffectiveLimit } = require('./lib/entitlements');
      await smsService.initialize();
      if (smsService.enabled) {
        const databaseManager = require('./config/database-manager');
        const mainConnection = await databaseManager.getMainConnection();
        const AdminSettings = mainConnection.model('AdminSettings', require('./models/AdminSettings').schema);
        const Business = mainConnection.model('Business', require('./models/Business').schema);
        const adminSettings = await AdminSettings.getSettings();
        const smsEnabled = adminSettings?.notifications?.sms?.enabled === true && (adminSettings?.notifications?.sms?.provider === 'msg91' || !!(adminSettings?.notifications?.sms?.msg91AuthKey && String(adminSettings.notifications.sms.msg91AuthKey).trim()));
        if (smsEnabled) {
          let business = await Business.findById(req.user.branchId).lean();
          let canSendSms = canUseAddon(business, 'sms');
          if (!canSendSms) {
            const smsLimit = getEffectiveLimit(business, 'smsMessages');
            if (smsLimit > 0) {
              await Business.updateOne(
                { _id: business._id },
                { $set: { 'plan.addons.sms': { enabled: true, quota: smsLimit, used: business.plan?.addons?.sms?.used ?? 0 } } }
              );
              business = await Business.findById(req.user.branchId).lean();
              canSendSms = true;
            }
          }
          let useWalletForSms = false;
          if (!canSendSms && canDeductSms(business)) {
            canSendSms = true;
            useWalletForSms = true;
          }
          if (canSendSms) {
            const { Client } = req.businessModels;
            const client = await Client.findById(clientId);
            if (client?.phone) {
              let receiptLink = null;
              let feedbackLink = null;
              try {
                const { Sale } = req.businessModels;
                const { buildSaleNotificationLinks } = require('./lib/feedback-link-helpers');
                const relatedSale = await Sale.findOne({ billNo: savedReceipt.receiptNumber });
                const links = await buildSaleNotificationLinks(
                  Sale,
                  business._id,
                  relatedSale,
                  'sms'
                );
                receiptLink = links.receiptLink;
                feedbackLink = links.feedbackLink;
              } catch (e) {}
              const result = await smsService.sendReceipt({
                to: client.phone,
                clientName: client.name,
                receiptNumber: savedReceipt.receiptNumber,
                receiptData: { businessName: business.name, total: savedReceipt.total },
                receiptLink,
                feedbackLink,
              });
              if (result.success) {
                if (useWalletForSms) {
                  await deductSms(business._id, {
                    description: 'SMS receipt',
                    relatedEntity: { id: savedReceipt?._id, type: 'Receipt' },
                  });
                } else {
                  await Business.updateOne(
                    { _id: business._id },
                    { $inc: { 'plan.addons.sms.used': 1 } }
                  );
                }
              }
              logSmsMessage({
                businessId: business._id,
                recipientPhone: client.phone,
                messageType: 'receipt',
                result,
                relatedEntityId: savedReceipt?._id,
                relatedEntityType: 'Receipt',
              });
            }
          }
        }
      }
    } catch (smsErr) {
      logger.error('Error sending receipt SMS:', smsErr);
    }

    res.status(201).json({
      success: true,
      data: savedReceipt
    });
  } catch (error) {
    logger.error('Error creating receipt:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create receipt'
    });
  }
});

app.get('/api/appointments/:id', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { id } = req.params;
    const { Appointment } = req.businessModels;
    const raw = await Appointment.findOne({ _id: id, branchId: req.user.branchId }).lean();
    if (!raw) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
    }
    const { Staff, Client, Service } = req.businessModels;
    const mainConnection = await databaseManager.getMainConnection();
    const UserModel = mainConnection.model('User', require('./models/User').schema);
    const businessOwner = await UserModel.findOne({ branchId: req.user.branchId, role: 'admin' })
      .select('_id firstName lastName')
      .lean();
    const ownerId = businessOwner?._id?.toString();
    const ownerName = businessOwner ? `${businessOwner.firstName || ''} ${businessOwner.lastName || ''}`.trim() || 'Owner' : null;

    // Fetch related appointments first (for multi-staff booking) so we can resolve all staff
    // Exclude cancelled appointments - they should not appear when editing
    let relatedRaw = [];
    if (raw.bookingGroupId) {
      relatedRaw = await Appointment.find({
        bookingGroupId: raw.bookingGroupId,
        branchId: req.user.branchId,
        _id: { $ne: id },
        status: { $ne: 'cancelled' }
      }).lean();
    }
    const allAppointmentsForStaff = [raw, ...relatedRaw];
    const staffIds = [];
    allAppointmentsForStaff.forEach((apt) => {
      if (apt.staffId) staffIds.push(apt.staffId);
      (apt.staffAssignments || []).forEach((as) => { if (as.staffId) staffIds.push(as.staffId); });
    });
    const staffFromDb = staffIds.length ? await Staff.find({ _id: { $in: staffIds } }).select('_id name role').lean() : [];
    const staffMap = new Map(staffFromDb.map((s) => [s._id.toString(), { _id: s._id, name: s.name, role: s.role }]));
    const resolveStaff = (sid) => {
      if (!sid) return null;
      const idStr = sid.toString?.() || String(sid);
      const fromStaff = staffMap.get(idStr);
      if (fromStaff) return fromStaff;
      if (idStr === ownerId && ownerName) return { _id: sid, name: ownerName, role: 'admin' };
      return { _id: sid, name: 'Unassigned Staff', role: null };
    };

    const appointment = { ...raw };
    appointment.staffId = raw.staffId ? resolveStaff(raw.staffId) : null;
    appointment.staffAssignments = (raw.staffAssignments || []).map((as) => ({
      ...as,
      staffId: as.staffId ? resolveStaff(as.staffId) : null,
    }));

    if (raw.clientId) {
      const client = await Client.findById(raw.clientId).select('name phone email').lean();
      appointment.clientId = client || raw.clientId;
    }
    if (raw.serviceId) {
      const service = await Service.findById(raw.serviceId).select('name price duration').lean();
      appointment.serviceId = service || raw.serviceId;
    }
    if (raw.additionalServiceIds && raw.additionalServiceIds.length) {
      const additionalServices = await Service.find({ _id: { $in: raw.additionalServiceIds } }).select('name price duration').lean();
      appointment.additionalServices = additionalServices;
    } else {
      appointment.additionalServices = [];
    }

    // When editing multi-staff booking: return all appointments in the same group
    let relatedAppointments = [];
    if (raw.bookingGroupId && relatedRaw.length) {
      const relatedServiceIds = relatedRaw.map((r) => r.serviceId).filter(Boolean);
      const relatedServices = relatedServiceIds.length
        ? await Service.find({ _id: { $in: relatedServiceIds } }).select('name price duration').lean()
        : [];
      const serviceMap = new Map(relatedServices.map((s) => [s._id.toString(), s]));
      relatedAppointments = relatedRaw
        .sort((a, b) => {
          const am = parseTimeToMinutes(a.time || '');
          const bm = parseTimeToMinutes(b.time || '');
          return am - bm;
        })
        .map((r) => {
          const rApp = { ...r };
          rApp.staffId = r.staffId ? resolveStaff(r.staffId) : null;
          rApp.staffAssignments = (r.staffAssignments || []).map((as) => ({
            ...as,
            staffId: as.staffId ? resolveStaff(as.staffId) : null,
          }));
          const svc = r.serviceId ? serviceMap.get(r.serviceId.toString()) : null;
          rApp.serviceId = svc || r.serviceId;
          return rApp;
        });
    }

    res.json({
      success: true,
      data: appointment,
      relatedAppointments: relatedAppointments.length ? relatedAppointments : undefined,
    });
  } catch (error) {
    logger.error('Error fetching appointment:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch appointment' });
  }
});

/**
 * Finalize a multi-service booking for billing.
 *
 * Per-service confirmation step before Raise Sale:
 *   - 'cancel' decisions set status='cancelled_at_billing' (audit fields written).
 *   - 'perform' decisions optionally carry a `shift` (new time/startAt/endAt) when
 *     compression freed an earlier slot — those rows are validated against
 *     detectStaffConflict before persisting.
 *
 * dryRun mode runs all conflict checks WITHOUT persisting and returns a per-row
 * conflict list so the modal can warn the user before they confirm.
 */
app.post('/api/appointments/finalize-for-billing', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Appointment, BookingHold } = req.businessModels;
    const { decisions, dryRun: bodyDryRun } = req.body || {};
    const dryRun = bodyDryRun === true || String(req.query.dryRun || '') === '1';

    if (!Array.isArray(decisions) || decisions.length === 0) {
      return res.status(400).json({ success: false, error: 'decisions[] is required' });
    }

    const ids = decisions.map((d) => String(d.appointmentId || ''));
    if (ids.some((id) => !id)) {
      return res.status(400).json({ success: false, error: 'Each decision needs an appointmentId' });
    }

    // Load all referenced appointments in one shot, scoped to the user's branch.
    const docs = await Appointment.find({
      _id: { $in: ids },
      branchId: req.user.branchId,
    });
    if (docs.length !== ids.length) {
      return res.status(404).json({ success: false, error: 'One or more appointments not found' });
    }
    const docById = new Map(docs.map((d) => [String(d._id), d]));

    const { detectStaffConflict } = require('./services/scheduling/conflict-detector');

    const getPrimaryStaffId = (apt) => {
      if (apt.staffId) return String(apt.staffId._id || apt.staffId);
      const a = Array.isArray(apt.staffAssignments) ? apt.staffAssignments[0] : null;
      return a?.staffId ? String(a.staffId._id || a.staffId) : null;
    };

    // Pre-flight: validate every shift before doing any writes.
    // The frontend sends only the new wall-clock `time` (12h or 24h string); the
    // backend derives startAt/endAt using parseDateIST so timezone logic stays
    // centralized.
    const cancelIdsInBatch = decisions.filter((d) => d.action === 'cancel').map((d) => String(d.appointmentId));
    // Rows being cancelled haven't been persisted yet during dry-run, but they're still ACTIVE
    // in Mongo — they'd overlap the sibling we're sliding earlier and cause a false conflict.
    // Also exclude every perform row that carries a shift: their old UTC windows are still on
    // disk until saves run, yet we're validating the booked state *after* the batch lands.
    const shiftedPerformIds = decisions
      .filter((d) => d.action === 'perform' && d.shift && d.shift.time)
      .map((d) => String(d.appointmentId));
    const finalizeBatchExcludeOverlapIds = [...new Set([...cancelIdsInBatch, ...shiftedPerformIds])];

    const shiftPlan = new Map(); // appointmentId -> { time, startAt, endAt }
    const conflicts = [];
    for (const dec of decisions) {
      if (dec.action !== 'perform' || !dec.shift) continue;
      const apt = docById.get(String(dec.appointmentId));
      if (!apt) continue;
      const time = dec.shift.time;
      if (!time || !/^\d{1,2}:\d{2}/.test(String(time))) {
        return res.status(400).json({
          success: false,
          error: 'shift.time is required and must be HH:MM',
        });
      }
      const dayStart = parseDateIST(apt.date);
      const startMinutes = parseTimeToMinutes(time);
      const startDate = new Date(dayStart.getTime() + startMinutes * 60 * 1000);
      const duration = apt.duration || 0;
      if (duration < 1) {
        return res.status(400).json({
          success: false,
          error: `Service duration is missing for appointment ${apt._id}`,
        });
      }
      const endDate = new Date(startDate.getTime() + duration * 60 * 1000);

      shiftPlan.set(String(apt._id), { time, startAt: startDate, endAt: endDate });

      const staffId = getPrimaryStaffId(apt);
      if (!staffId) {
        conflicts.push({ appointmentId: String(apt._id), reason: 'missing_staff' });
        continue;
      }

      const result = await detectStaffConflict(
        { Appointment, BookingHold },
        {
          branchId: req.user.branchId,
          staffId,
          start: startDate,
          end: endDate,
          excludeAppointmentIds: finalizeBatchExcludeOverlapIds,
          skipHoldCheck: true,
        }
      );
      if (result.conflict) {
        conflicts.push({
          appointmentId: String(apt._id),
          reason: result.reason || 'appointment_overlap',
        });
      }
    }

    if (conflicts.length > 0 && !dryRun) {
      return res.status(409).json({ success: false, conflicts });
    }
    if (dryRun) {
      return res.json({ success: true, conflicts, dryRun: true });
    }

    const cancelledBy = req.user?.name
      || (req.user?.firstName && req.user?.lastName ? `${req.user.firstName} ${req.user.lastName}`.trim() : null)
      || req.user?.email
      || '';

    const updated = [];
    for (const dec of decisions) {
      const apt = docById.get(String(dec.appointmentId));
      if (!apt) continue;

      if (dec.action === 'cancel') {
        // Edge Case 4: never re-cancel a service that already happened.
        if (apt.status === 'completed') {
          updated.push(apt);
          continue;
        }
        apt.status = 'cancelled_at_billing';
        apt.cancelledAtBillingAt = new Date();
        apt.cancelledAtBillingBy = cancelledBy;
        await apt.save();
        updated.push(apt);
        continue;
      }

      // perform
      const plan = shiftPlan.get(String(apt._id));
      if (plan) {
        apt.time = plan.time;
        apt.startAt = plan.startAt;
        apt.endAt = plan.endAt;
        await apt.save();
      }
      updated.push(apt);
    }

    return res.json({ success: true, data: updated });
  } catch (error) {
    const dupMsg = String(error?.message || error?.errmsg || '');
    const isDup =
      Number(error?.code) === 11000 ||
      error?.codeName === 'DuplicateKey' ||
      /duplicate key|E11000|slotKey_/i.test(dupMsg);
    if (isDup) {
      logger.warn(
        'Finalize for billing duplicate slotKey (same staff + window already exists)',
        dupMsg.slice(0, 500),
      );
      return res.status(409).json({
        success: false,
        error:
          'This time slot is already booked for the selected staff member. Compression or reschedule caused a clash — use "Keep original timing" or pick another slot.',
      });
    }
    logger.error('Error finalizing appointments for billing:', error);
    return res.status(500).json({ success: false, error: 'Failed to finalize appointments' });
  }
});

// Update appointment
app.put('/api/appointments/:id', authenticateToken, setupBusinessDatabase, requirePermission('appointments', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    const allowParallelBooking = updateData.allowParallelBooking === true;
    delete updateData.allowParallelBooking;
    const { Appointment, Service: BusinessService, BookingHold } = req.businessModels;

    // Find the appointment
    const appointment = await Appointment.findById(id)
      .populate('clientId', 'name phone email')
      .populate('serviceId', 'name price duration')
      .populate('staffId', 'name role');
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    // Check if status is being changed to cancelled
    const previousStatus = appointment.status;
    const isBeingCancelled = updateData.status === 'cancelled' && previousStatus !== 'cancelled';


    const isBeingRescheduled =
      previousStatus !== 'cancelled' &&
      updateData.status !== 'cancelled' &&
      ((updateData.date && updateData.date !== appointment.date) ||
       (updateData.time && updateData.time !== appointment.time));

    // Detect primary-staff reassignment (e.g. calendar drag-drop to another column). When this
    // happens — even at the same wall-clock time — we still need to recompute startAt/endAt for
    // the new staff, re-run conflict detection on the destination, and refresh slotKey (the
    // pre('save') hook does not run on findOneAndUpdate, so a stale key would block future writes
    // for the source staff and let the destination double-book).
    const currentPrimaryStaffId = (() => {
      const sid = appointment.staffId;
      if (sid) {
        const raw = typeof sid === 'object' && sid?._id ? sid._id : sid;
        return String(raw);
      }
      if (Array.isArray(appointment.staffAssignments) && appointment.staffAssignments[0]?.staffId) {
        const asid = appointment.staffAssignments[0].staffId;
        const raw = typeof asid === 'object' && asid?._id ? asid._id : asid;
        return String(raw);
      }
      return null;
    })();
    const incomingPrimaryStaffId = (() => {
      if (updateData.staffId) return String(updateData.staffId);
      if (Array.isArray(updateData.staffAssignments) && updateData.staffAssignments[0]?.staffId) {
        return String(updateData.staffAssignments[0].staffId);
      }
      return null;
    })();
    const staffIsChanging = !!(
      incomingPrimaryStaffId &&
      (!currentPrimaryStaffId || incomingPrimaryStaffId !== currentPrimaryStaffId)
    );

    // When the time changes for a single appointment doc (per-service edit), refetch duration
    // from the Service catalog as source of truth, recompute startAt/endAt, and pre-check staff conflict.
    const timeIsChanging = updateData.time && updateData.time !== appointment.time;
    const dateIsChanging = updateData.date && updateData.date !== appointment.date;
    let scheduleStartAt = null;
    let scheduleEndAt = null;
    let scheduleDurationMinutes = appointment.duration || 60;
    let scheduleStartMinutes = null;
    let scheduleTimeString = null;
    if ((timeIsChanging || dateIsChanging || staffIsChanging) && updateData.status !== 'cancelled') {
      const newTime = updateData.time || appointment.time;
      const newDate = updateData.date || appointment.date;
      if (!/^\d{1,2}:\d{2}/.test(String(newTime || ''))) {
        return res.status(400).json({ success: false, error: 'Please select a valid start time' });
      }

      const serviceCatalog = appointment.serviceId && typeof appointment.serviceId === 'object' && appointment.serviceId.duration
        ? appointment.serviceId
        : await BusinessService.findById(appointment.serviceId).select('_id name duration').lean();
      const serviceName = serviceCatalog?.name || 'this service';
      const catalogDuration = serviceCatalog?.duration;
      // For sequential same-staff multi-service docs, appointment.duration is the sum across services and the
      // catalog row only covers the primary service — keep the existing total in that case.
      const hasAdditional = Array.isArray(appointment.additionalServiceIds) && appointment.additionalServiceIds.length > 0;
      let durationForWindow = appointment.duration || 60;
      if (!hasAdditional) {
        if (!catalogDuration || catalogDuration < 1) {
          return res.status(400).json({
            success: false,
            error: `Service duration is missing in service settings for ${serviceName}`
          });
        }
        durationForWindow = catalogDuration;
        // Only force-write duration when the schedule actually changes; staff-only moves keep
        // the existing sequential total for multi-service rows.
        if (timeIsChanging || dateIsChanging) {
          updateData.duration = catalogDuration;
        }
      }

      const dayStart = parseDateIST(newDate);
      const startMinutes = parseTimeToMinutes(newTime);
      const startAt = new Date(dayStart.getTime() + startMinutes * 60 * 1000);
      const endAt = new Date(startAt.getTime() + durationForWindow * 60 * 1000);
      updateData.startAt = startAt;
      updateData.endAt = endAt;
      scheduleStartAt = startAt;
      scheduleEndAt = endAt;
      scheduleDurationMinutes = durationForWindow;
      scheduleStartMinutes = startMinutes;
      scheduleTimeString = newTime;

      // Conflict detection runs against the destination staff (drag-drop to a different stylist
      // must verify that stylist is free at this window, even if the wall-clock time is unchanged).
      const primaryStaffId = incomingPrimaryStaffId || currentPrimaryStaffId;
      if (primaryStaffId && !allowParallelBooking) {
        const { detectStaffConflict } = require('./services/scheduling/conflict-detector');
        const result = await detectStaffConflict(
          { Appointment, BookingHold },
          {
            branchId: req.user.branchId,
            staffId: primaryStaffId,
            start: startAt,
            end: endAt,
            excludeAppointmentId: id,
            skipHoldCheck: true
          }
        );
        if (result.conflict) {
          const formatTimeForError = (timeStr) => {
            const m = parseTimeToMinutes(timeStr);
            const h24 = Math.floor(m / 60);
            const mins = m % 60;
            const period = h24 >= 12 ? 'PM' : 'AM';
            const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
            return `${h12}:${String(mins).padStart(2, '0')} ${period}`;
          };
          const endStr = minutesToTimeString(startMinutes + durationForWindow);
          return res.status(409).json({
            success: false,
            error: `Staff is already booked from ${formatTimeForError(newTime)} to ${formatTimeForError(endStr)}`
          });
        }
      }

      // Refresh slotKey for the new (staff, window) combination. findByIdAndUpdate does not
      // trigger pre('save'), so without this the unique-slot index would still point at the
      // old staff and silently allow double-booking on the destination column.
      const activeForSlot = ['scheduled', 'confirmed', 'arrived', 'service_started'];
      const finalStatus = updateData.status || appointment.status;
      if (primaryStaffId && activeForSlot.includes(finalStatus)) {
        const base = `${String(req.user.branchId)}:${String(primaryStaffId)}:${startAt.toISOString()}:${endAt.toISOString()}`;
        updateData.slotKey = allowParallelBooking ? `${base}:${require('crypto').randomUUID()}` : base;
      }
    }

    // Checkout often bulk PATCHes `{ status: 'completed' }` on siblings; never revive slots suppressed at billing.
    if (previousStatus === 'cancelled_at_billing' && updateData.status === 'completed') {
      delete updateData.status;
    }

    // Update the appointment
    const updatedAppointment = await Appointment.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('clientId', 'name phone email')
    .populate('serviceId', 'name price duration')
    .populate('staffId', 'name role');

    // Propagate "arrived" to same-day siblings in the booking group (customer arrived for that visit).
    // Other status transitions (service_started, completed) remain per-card since each staff starts independently.
    if (updateData.status === 'arrived' && appointment.bookingGroupId) {
      const visitDate = appointment.date ? String(appointment.date).slice(0, 10) : null;
      await Appointment.updateMany(
        {
          bookingGroupId: appointment.bookingGroupId,
          _id: { $ne: appointment._id },
          status: { $in: ['scheduled', 'confirmed'] },
          ...(visitDate ? { date: visitDate } : {}),
        },
        { $set: { status: 'arrived' } }
      );
    }

    // No-show: mark same-day pre-service siblings in the group so the day view stays in sync after refresh.
    if (updateData.status === 'missed' && appointment.bookingGroupId) {
      const visitDate = appointment.date ? String(appointment.date).slice(0, 10) : null;
      await Appointment.updateMany(
        {
          bookingGroupId: appointment.bookingGroupId,
          _id: { $ne: appointment._id },
          status: { $in: ['scheduled', 'confirmed', 'arrived'] },
          ...(visitDate ? { date: visitDate } : {}),
        },
        { $set: { status: 'missed' } }
      );
    }

    // Send cancellation emails if appointment was cancelled (errors only — no per-update debug)
    if (isBeingCancelled) {
      try {
        const emailService = require('./services/email-service');
        
        if (!emailService.initialized) {
          await emailService.initialize();
        }
        
        if (emailService.enabled) {
          // Get business info
          const databaseManager = require('./config/database-manager');
          const mainConnection = await databaseManager.getMainConnection();
          const Business = mainConnection.model('Business', require('./models/Business').schema);
          const business = await Business.findById(req.user.branchId);
          
          if (!business) {
            logger.error('❌ Business not found for branchId:', req.user.branchId);
          } else if (isPlatformEmailDisabled(business)) {
            logger.info('📧 Skipping cancellation emails — platform policy');
          } else {
          const emailSettings = business.settings?.emailNotificationSettings;
          // Default to enabled unless explicitly disabled AND recipient list exists (meaning it was configured)
          const hasRecipientList = emailSettings?.appointmentNotifications?.recipientStaffIds?.length > 0;
          const explicitlyDisabledCancellations = emailSettings?.appointmentNotifications?.cancellations === false;
          const cancellationEnabled = !emailSettings || 
            !emailSettings?.appointmentNotifications ||
            (!explicitlyDisabledCancellations || !hasRecipientList);
          
          if (cancellationEnabled && updatedAppointment.clientId) {
            const client = updatedAppointment.clientId;
            
            const clientEmail = client?.email ? client.email.trim() : null;
            
            if (clientEmail) {
              // Get service name
              let serviceName = 'Service';
              if (updatedAppointment.serviceId) {
                if (typeof updatedAppointment.serviceId === 'object' && updatedAppointment.serviceId.name) {
                  serviceName = updatedAppointment.serviceId.name;
                } else {
                  const Service = req.businessModels.Service;
                  const service = await Service.findById(updatedAppointment.serviceId);
                  serviceName = service?.name || 'Service';
                }
              }
              
              const emailResult = await emailService.sendAppointmentCancellation({
                to: clientEmail,
                clientName: client.name || 'Client',
                appointmentData: {
                  serviceName: serviceName,
                  date: updatedAppointment.date,
                  time: updatedAppointment.time,
                  businessName: business?.name || 'Business',
                  businessPhone: business?.contact?.phone || ''
                }
              });
              
              if (emailResult && emailResult.success === false) {
                logger.error('Failed to send cancellation email:', emailResult?.error || emailResult);
              }
              logEmailMessage({
                businessId: business?._id,
                recipientEmail: clientEmail,
                messageType: 'appointment',
                result: {
                  success: emailResult && emailResult.success !== false,
                  error: emailResult?.error,
                  data: emailResult?.data,
                },
                subject: 'Appointment Cancellation',
                provider: emailService?.provider,
                relatedEntityId: updatedAppointment?._id,
                relatedEntityType: 'Appointment',
              });

              // Send SMS appointment cancellation if enabled
              if (client?.phone) {
                try {
                  const smsService = require('./services/sms-service');
                  const { canUseAddon } = require('./lib/entitlements');
                  await smsService.initialize();
                  if (smsService.enabled) {
                    const AdminSettings = mainConnection.model('AdminSettings', require('./models/AdminSettings').schema);
                    const Business = mainConnection.model('Business', require('./models/Business').schema);
                    const adminSettings = await AdminSettings.getSettings();
                    const smsEnabled = adminSettings?.notifications?.sms?.enabled === true && (adminSettings?.notifications?.sms?.provider === 'msg91' || !!(adminSettings?.notifications?.sms?.msg91AuthKey && String(adminSettings.notifications.sms.msg91AuthKey).trim()));
                    if (smsEnabled) {
                      const businessForSms = await Business.findById(req.user.branchId).lean();
                      const useAddon = canUseAddon(businessForSms, 'sms');
                      const useWallet = !useAddon && canDeductSms(businessForSms);
                      if (useAddon || useWallet) {
                        const result = await smsService.sendAppointmentCancellation({
                          to: client.phone,
                          clientName: client.name || 'Client',
                          appointmentData: {
                            serviceName: serviceName,
                            date: updatedAppointment.date,
                            time: updatedAppointment.time,
                            businessName: business?.name || 'Business'
                          },
                          cancellationReason: 'Cancelled'
                        });
                        if (result.success) {
                          if (useWallet) {
                            await deductSms(businessForSms._id, {
                              description: 'SMS appointment cancellation',
                              relatedEntity: { id: updatedAppointment?._id, type: 'Appointment' },
                            });
                          } else {
                            await Business.updateOne(
                              { _id: businessForSms._id },
                              { $inc: { 'plan.addons.sms.used': 1 } }
                            );
                          }
                        }
                        logSmsMessage({
                          businessId: businessForSms._id,
                          recipientPhone: client.phone,
                          messageType: 'appointment',
                          result,
                          relatedEntityId: updatedAppointment?._id,
                          relatedEntityType: 'Appointment',
                        });
                      }
                    }
                  }
                } catch (smsErr) {
                  logger.error('Error sending appointment cancellation SMS:', smsErr);
                }
              }
            }
          }
          
          // Send notification to staff/admin about cancellation (use same logic - default to enabled)
          const staffCancellationEnabled = !emailSettings || 
            !emailSettings?.appointmentNotifications ||
            (!explicitlyDisabledCancellations || !hasRecipientList);
          
          if (staffCancellationEnabled) {
            const recipientStaffIds = emailSettings?.appointmentNotifications?.recipientStaffIds || [];
            const recipients = await resolveReportRecipients({
              business,
              businessModels: req.businessModels,
              mainConnection,
              prefKey: 'appointmentAlerts',
              recipientStaffIds,
            });
            
            // Send cancellation notification to staff/admin
            // Get service name for staff notifications
            let serviceNameForStaff = 'Service';
            if (updatedAppointment.serviceId) {
              if (typeof updatedAppointment.serviceId === 'object' && updatedAppointment.serviceId.name) {
                serviceNameForStaff = updatedAppointment.serviceId.name;
              } else {
                const Service = req.businessModels.Service;
                const service = await Service.findById(updatedAppointment.serviceId);
                serviceNameForStaff = service?.name || 'Service';
              }
            }
            
            const cancelDelayMs = 600; // Resend limit: 2 req/sec
            for (let i = 0; i < recipients.length; i++) {
              if (i > 0) await new Promise(r => setTimeout(r, cancelDelayMs));
              const recipient = recipients[i];
              try {
                const cancellationStaffResult = await emailService.sendAppointmentCancellationNotification({
                  to: recipient.email,
                  appointmentCount: 1,
                  businessName: business?.name || 'Business',
                  appointmentDetails: {
                    date: updatedAppointment.date,
                    time: updatedAppointment.time,
                    clientName: updatedAppointment.clientId?.name,
                    serviceName: serviceNameForStaff
                  }
                });
                logEmailMessage({
                  businessId: business?._id,
                  recipientEmail: recipient.email,
                  messageType: 'appointment',
                  result: {
                    success: cancellationStaffResult ? cancellationStaffResult.success !== false : true,
                    error: cancellationStaffResult?.error,
                    data: cancellationStaffResult?.data,
                  },
                  subject: 'Appointment Cancellation Notification',
                  provider: emailService?.provider,
                  relatedEntityId: updatedAppointment?._id,
                  relatedEntityType: 'Appointment',
                });
              } catch (error) {
                logEmailMessage({
                  businessId: business?._id,
                  recipientEmail: recipient.email,
                  messageType: 'appointment',
                  result: { success: false, error: error?.message || String(error) },
                  subject: 'Appointment Cancellation Notification',
                  provider: emailService?.provider,
                  relatedEntityId: updatedAppointment?._id,
                  relatedEntityType: 'Appointment',
                });
                logger.error(`Error sending cancellation notification to ${recipient.email}:`, error);
              }
            }
          }
        }
        }
      } catch (emailError) {
        logger.error('Error sending cancellation emails:', emailError);
        // Don't fail the update if email fails
      }

      try {
        await sendAppointmentCancellationWhatsApp(req, updatedAppointment);
      } catch (whatsappErr) {
        logger.error('Error sending appointment cancellation WhatsApp:', whatsappErr);
      }
    }

    if (isBeingRescheduled) {
      try {
        await sendAppointmentRescheduleWhatsApp(req, updatedAppointment);
      } catch (whatsappErr) {
        logger.error('Error sending appointment reschedule WhatsApp:', whatsappErr);
      }
    }

    res.json({
      success: true,
      data: updatedAppointment
    });
  } catch (error) {
    if (error.code === 11000 || error.codeName === 'DuplicateKey' || /duplicate key/i.test(String(error.message || ''))) {
      logger.warn('Appointment slot conflict on update (duplicate slotKey):', error.message);
      return res.status(409).json({
        success: false,
        error: 'This time slot is already booked for the selected staff member. Please choose a different time.'
      });
    }
    logger.error('Error updating appointment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update appointment'
    });
  }
});

// Delete appointment
app.delete('/api/appointments/:id', authenticateToken, setupBusinessDatabase, requirePermission('appointments', 'delete'), async (req, res) => {
  try {
    const { id } = req.params;
    const { Appointment } = req.businessModels;

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    await Appointment.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Appointment deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting appointment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete appointment'
    });
  }
});

// Get receipts by client ID
app.get('/api/receipts/client/:clientId', authenticateToken, setupBusinessDatabase, async (req, res) => {
  const { clientId } = req.params;
  const { Receipt } = req.businessModels;
  
  try {
    const clientReceipts = await Receipt.find({ clientId }).sort({ createdAt: -1 }).limit(200).lean();
    
    res.json({
      success: true,
      data: clientReceipts
    });
  } catch (error) {
    logger.error('Error fetching receipts by client:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch client receipts'
    });
  }
});

// Reports routes
app.get('/api/reports/dashboard', authenticateToken, setupBusinessDatabase, requireStaff, reportCacheMiddleware, async (req, res) => {
  try {
    
    const { Service, Product, Staff, Client, Appointment, Receipt, Sale, MembershipSubscription, MembershipPlan } = req.businessModels;
    
    // Get counts from business-specific database
    const totalServices = await Service.countDocuments();
    logger.debug('Total services:', totalServices);
    
    const totalProducts = await Product.countDocuments();
    logger.debug('Total products:', totalProducts);
    
    const totalStaff = await Staff.countDocuments();
    logger.debug('Total staff:', totalStaff);
    
    const totalClients = await Client.countDocuments();
    logger.debug('Total clients:', totalClients);
    
    const totalAppointments = await Appointment.countDocuments();
    logger.debug('Total appointments:', totalAppointments);
    
    const totalReceipts = await Receipt.countDocuments();
    logger.debug('Total receipts:', totalReceipts);

    // Calculate total revenue from receipts via aggregation
    const [revenueAgg] = await Receipt.aggregate([
      { $group: { _id: null, total: { $sum: { $ifNull: ['$total', 0] } } } },
    ]);
    const totalRevenue = revenueAgg ? revenueAgg.total : 0;
    logger.debug('Total revenue:', totalRevenue);

    // Membership metrics — active = ACTIVE and (no expiry or expiry on/after today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const membershipActiveFilter = activeMembershipMongoMatch(today);
    const totalActiveMembers = await MembershipSubscription.countDocuments(membershipActiveFilter);
    const [memRevenueAgg] = await MembershipSubscription.aggregate([
      { $match: membershipActiveFilter },
      { $lookup: { from: 'membershipplans', localField: 'planId', foreignField: '_id', as: 'plan' } },
      { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$plan.price', 0] } } } },
    ]);
    const membershipRevenue = memRevenueAgg ? memRevenueAgg.total : 0;
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);
    const membersExpiringIn30Days = await MembershipSubscription.countDocuments(
      expiringMembershipMongoMatch(today, in30Days),
    );

    logger.debug('✅ Dashboard stats calculated for business:', req.user?.branchId);
    res.json({
      success: true,
      data: {
        totalServices,
        totalProducts,
        totalStaff,
        totalClients,
        totalAppointments,
        totalReceipts,
        totalRevenue,
        totalActiveMembers,
        membershipRevenue,
        membersExpiringIn30Days
      }
    });
  } catch (error) {
    logger.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Single aggregated payload for tenant dashboard (reduces N+1 client fetches).
// Short TTL cache absorbs duplicate hits from dashboard cards/navigation; mutation routes
// call `invalidateDashboardCache(branchId)` so sales/appointments/inventory edits are
// reflected immediately.
app.get('/api/dashboard/init', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { cacheGet, cacheSet, dashboardInitCacheKey } = require('./lib/cache');
    const chartRangeRaw = typeof req.query.chartRange === 'string' ? req.query.chartRange.trim() : '';
    const chartRange =
      chartRangeRaw === 'last7days' || chartRangeRaw === 'last30days' ? chartRangeRaw : 'year';
    const metricsRangeRaw = typeof req.query.metricsRange === 'string' ? req.query.metricsRange.trim() : '';
    const metricsRange = metricsRangeRaw === 'last7days' ? 'last7days' : 'today';
    const appointmentsRangeRaw = typeof req.query.appointmentsRange === 'string' ? req.query.appointmentsRange.trim() : '';
    const appointmentsRange = appointmentsRangeRaw === 'next7days' ? 'next7days' : 'today';
    const cacheVariant = `chart:${chartRange}|metrics:${metricsRange}|appts:${appointmentsRange}`;
    const redisKey = dashboardInitCacheKey(req.user.branchId, cacheVariant);
    const redisTtlSec = parseInt(process.env.DASHBOARD_REDIS_TTL_SEC, 10) || 60;

    const buildAndPersist = async () => {
      const fresh = await buildDashboardInitPayload({
        branchId: req.user.branchId,
        businessModels: req.businessModels,
        user: req.user,
        chartRange,
        metricsRange,
        appointmentsRange,
      });
      setDashboardCache(req.user.branchId, fresh, undefined, cacheVariant);
      void cacheSet(redisKey, fresh, redisTtlSec);
      return fresh;
    };

    const redisCached = await cacheGet(redisKey);
    if (redisCached) {
      markCache(res, 'HIT-REDIS');
      return res.json(redisCached);
    }

    const cached = getDashboardCacheEntry(req.user.branchId, cacheVariant);
    if (cached && cached.state === 'fresh') {
      markCache(res, 'HIT');
      return res.json(cached.payload);
    }

    if (cached && cached.state === 'stale') {
      // Stale-while-revalidate: respond immediately with the last-known payload and
      // refresh in the background. The `refreshing` flag is a single-flight latch so
      // concurrent stale hits do not stampede `buildDashboardInitPayload`.
      markCache(res, 'HIT-STALE');
      res.json(cached.payload);
      if (!cached.entry.refreshing) {
        cached.entry.refreshing = true;
        setImmediate(async () => {
          try {
            await buildAndPersist();
          } catch (err) {
            cached.entry.refreshing = false;
            logger.error('Background dashboard refresh failed:', err);
          }
        });
      }
      return;
    }

    const payload = await buildAndPersist();
    markCache(res, 'MISS');
    res.json(payload);
  } catch (error) {
    logger.error('Error building dashboard init:', error);
    res.status(500).json({ success: false, error: 'Failed to load dashboard' });
  }
});

/** Staff alerts derived from inventory and subscription/package dates (same sources as dashboard cards). */
app.get('/api/notifications/feed', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const payload = await buildNotificationsFeed({
      branchId: req.user.branchId,
      businessModels: req.businessModels,
    });
    res.json(payload);
  } catch (error) {
    logger.error('Error building notifications feed:', error);
    res.status(500).json({ success: false, error: 'Failed to load notifications' });
  }
});

/** New mini-website enquiries for the notification center Web Enquiries tab. */
app.get('/api/notifications/website-enquiries', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 15, 1), 50);
    const items = await listNewWebsiteEnquiriesForNotifications({
      branchId: req.user.branchId,
      businessModels: req.businessModels,
      limit,
    });
    res.json({ success: true, data: { items } });
  } catch (error) {
    logger.error('Error loading website enquiry notifications:', error);
    res.status(500).json({ success: false, error: 'Failed to load website enquiries' });
  }
});

function handleAnalyticsTabError(res, error, label) {
  if (error && error.code === 'INVALID_RANGE') {
    return res.status(400).json({ success: false, error: error.message || 'Invalid date range' });
  }
  logger.error(`Error building ${label}:`, error);
  return res.status(500).json({ success: false, error: `Failed to load ${label}` });
}

const analyticsTabOpts = (req) => ({
  branchId: req.user.branchId,
  businessModels: req.businessModels,
  query: req.query,
});

/**
 * Analytics tab payloads are heavy server-side aggregations and the user typically clicks
 * back and forth between tabs. Cache 3 minutes per (tenant, tab, filter) — mutation routes
 * invalidate the whole tenant slice so figures stay accurate after writes.
 */
app.get('/api/analytics/revenue', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.ANALYTICS), async (req, res) => {
  try {
    const payload = await withReportCache(req, res, {
      reportType: 'analytics:revenue',
      filters: req.query,
      compute: () => buildAnalyticsRevenueTab(analyticsTabOpts(req)),
    });
    res.json(payload);
  } catch (error) {
    return handleAnalyticsTabError(res, error, 'revenue analytics');
  }
});

app.get('/api/analytics/services', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.ANALYTICS), async (req, res) => {
  try {
    const payload = await withReportCache(req, res, {
      reportType: 'analytics:services',
      filters: req.query,
      compute: () => buildAnalyticsServicesTab(analyticsTabOpts(req)),
    });
    res.json(payload);
  } catch (error) {
    return handleAnalyticsTabError(res, error, 'services analytics');
  }
});

app.get('/api/analytics/clients', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.ANALYTICS), async (req, res) => {
  try {
    const payload = await withReportCache(req, res, {
      reportType: 'analytics:clients',
      filters: req.query,
      compute: () => buildAnalyticsClientsTab(analyticsTabOpts(req)),
    });
    res.json(payload);
  } catch (error) {
    return handleAnalyticsTabError(res, error, 'clients analytics');
  }
});

app.get('/api/analytics/products', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.ANALYTICS), async (req, res) => {
  try {
    const payload = await withReportCache(req, res, {
      reportType: 'analytics:products',
      filters: req.query,
      compute: () => buildAnalyticsProductsTab(analyticsTabOpts(req)),
    });
    res.json(payload);
  } catch (error) {
    return handleAnalyticsTabError(res, error, 'products analytics');
  }
});

app.get('/api/analytics/staff', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.ANALYTICS), async (req, res) => {
  try {
    const payload = await withReportCache(req, res, {
      reportType: 'analytics:staff',
      filters: req.query,
      compute: () => buildAnalyticsStaffTab(analyticsTabOpts(req)),
    });
    res.json(payload);
  } catch (error) {
    return handleAnalyticsTabError(res, error, 'staff analytics');
  }
});

app.get('/api/analytics/staff/:staffId/trends', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.ANALYTICS), async (req, res) => {
  try {
    const payload = await withReportCache(req, res, {
      reportType: 'analytics:staff-trends',
      filters: { ...req.query, staffId: req.params.staffId },
      compute: () => buildAnalyticsStaffDrillDown({
        ...analyticsTabOpts(req),
        staffId: req.params.staffId,
      }),
    });
    res.json(payload);
  } catch (error) {
    if (error && error.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'Staff not found' });
    }
    if (error && error.code === 'INVALID_STAFF') {
      return res.status(400).json({ success: false, error: 'Invalid staff id' });
    }
    return handleAnalyticsTabError(res, error, 'staff analytics drill-down');
  }
});

app.get('/api/dashboard/appointments-summary', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const payload = await buildAppointmentsSummary({
      branchId: req.user.branchId,
      businessModels: req.businessModels,
    });
    res.json(payload);
  } catch (error) {
    logger.error('Error building appointments summary:', error);
    res.status(500).json({ success: false, error: 'Failed to load appointments summary' });
  }
});

// Summary report (same metrics as daily summary email)
app.get('/api/reports/summary', authenticateToken, setupBusinessDatabase, requireStaff, reportCacheMiddleware, async (req, res) => {
  try {
    const { Sale, Receipt, CashRegistry, Expense } = req.businessModels;
    const branchId = req.user.branchId;
    let dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : null;
    let dateTo = req.query.dateTo ? new Date(req.query.dateTo) : null;
    if (!dateFrom || !dateTo) {
      // Default to today in IST
      const todayStr = getTodayIST();
      dateFrom = getStartOfDayIST(todayStr);
      dateTo = getEndOfDayIST(todayStr);
    } else {
      dateFrom = new Date(dateFrom);
      dateTo = new Date(dateTo);
    }
    const todayDateString = toDateStringIST(dateFrom);
    const tomorrowDate = new Date(dateTo.getTime() + 1);
    const tomorrowDateString = toDateStringIST(tomorrowDate);

    // Include (a) bills whose invoice date is in range, and (b) older bills with a due/partial
    // payment in range — otherwise "Dues Collected" is ₹0 when only paymentHistory matches "Today".
    const invoiceDateRange = { $gte: dateFrom, $lte: dateTo };
    const sales = await Sale.find({
      branchId,
      status: { $nin: ['cancelled', 'Cancelled'] },
      $or: [
        { date: invoiceDateRange },
        { paymentHistory: { $elemMatch: { date: invoiceDateRange } } }
      ]
    }).lean();
    const salesInInvoiceRange = sales.filter((s) => {
      const d = s.date ? new Date(s.date) : null;
      return d && d >= dateFrom && d <= dateTo;
    });

    const receipts = await Receipt.find({
      branchId,
      date: { $gte: todayDateString, $lte: tomorrowDateString }
    }).lean();

    const openingRegistry = await CashRegistry.findOne({
      branchId,
      date: { $gte: dateFrom, $lte: dateTo },
      shiftType: 'opening'
    }).sort({ date: 1 }).lean();

    const closingRegistry = await CashRegistry.findOne({
      branchId,
      date: { $gte: dateFrom, $lte: dateTo },
      shiftType: 'closing'
    }).sort({ date: -1 }).lean();

    const cashExpenses = await Expense.find({
      branchId,
      date: { $gte: dateFrom, $lte: dateTo },
      paymentMode: 'Cash',
      status: { $in: ['approved', 'pending'] }
    }).lean();

    const pettyCashExpenses = await Expense.find({
      branchId,
      date: { $gte: dateFrom, $lte: dateTo },
      paymentMode: 'Petty Cash Wallet',
      status: { $in: ['approved', 'pending'] }
    }).lean();

    const totalBillCount = salesInInvoiceRange.length;
    const uniqueCustomers = new Set(salesInInvoiceRange.map(s => (s.customerName || '').trim()).filter(Boolean));
    const totalCustomerCount = uniqueCustomers.size || totalBillCount;
    const totalSales = salesInInvoiceRange.reduce((sum, s) => sum + (s.grossTotal || s.totalAmount || s.netTotal || 0), 0);
    let totalSalesCash = 0, totalSalesOnline = 0, totalSalesCard = 0, totalSalesWallet = 0, totalSalesRewardPoint = 0;
    let cashAddedToWallet = 0;
    salesInInvoiceRange.forEach(s => {
      let cashAmt = 0;
      let isAllCash = false;
      if (s.payments && s.payments.length) {
        s.payments.forEach(p => {
          const amt = p.amount || 0;
          const mode = String(p.mode || '').toLowerCase();
          if (mode === 'cash') { totalSalesCash += amt; cashAmt += amt; }
          else if (mode === 'online') totalSalesOnline += amt;
          else if (mode === 'card') totalSalesCard += amt;
          else if (mode === 'wallet') totalSalesWallet += amt;
          else if (mode === 'reward point' || mode === 'reward') totalSalesRewardPoint += amt;
        });
        const hasNonCash = (s.payments || []).some(p => {
          const m = String(p.mode || '').toLowerCase();
          return m === 'card' || m === 'online' || m === 'wallet' || m === 'reward point' || m === 'reward';
        });
        isAllCash = cashAmt > 0 && !hasNonCash;
      } else {
        const amt = s.grossTotal || s.netTotal || 0;
        const pm = String(s.paymentMode || '').toLowerCase();
        if (pm === 'cash') { totalSalesCash += amt; cashAmt = amt; isAllCash = true; }
        else if (pm === 'online') totalSalesOnline += amt;
        else if (pm === 'card') totalSalesCard += amt;
        else if (pm === 'wallet') totalSalesWallet += amt;
        else if (pm === 'reward point' || pm === 'reward') totalSalesRewardPoint += amt;
      }
      const hasRewardPayment = (s.payments || []).some((p) => {
        const m = String(p.mode || '').toLowerCase();
        return m === 'reward point' || m === 'reward';
      });
      const loyaltyDisc = Number(s.loyaltyDiscountAmount) || 0;
      const loyaltyPts = Math.floor(Number(s.loyaltyPointsRedeemed) || 0);
      if (!hasRewardPayment && loyaltyPts > 0 && loyaltyDisc > 0.005) {
        totalSalesRewardPoint += loyaltyDisc;
      }
      const walletCashAdd = billChangeCreditedToWalletCashAddition(s);
      cashAddedToWallet += walletCashAdd;
      totalSalesCash += walletCashAdd;
      cashAmt += walletCashAdd;
      if (isAllCash && (s.tip || 0) > 0) totalSalesCash -= (s.tip || 0);
    });
    let duesCollected = 0;
    let cashDuesCollected = 0;
    sales.forEach(s => {
      (s.paymentHistory || []).forEach(ph => {
        const d = ph.date ? new Date(ph.date) : null;
        if (d && d >= dateFrom && d <= dateTo) {
          duesCollected += ph.amount || 0;
          if ((ph.method || '').toLowerCase() === 'cash') cashDuesCollected += ph.amount || 0;
        }
      });
    });
    // Use Expense collection as source of truth for cash expenses; closingRegistry.expenseValue is 0 when not yet closed
    const cashExpense = cashExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const pettyCashExpense = pettyCashExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    // Tip collected: sum from Sales (Quick Sale flow) + Receipts (manual receipt flow), for selected date range, all staff
    const tipFromSales = salesInInvoiceRange.reduce((sum, s) => sum + (s.tip || 0), 0);
    const tipFromReceipts = receipts.reduce((sum, r) => sum + (r.tip || 0), 0);
    const tipCollected = tipFromSales + tipFromReceipts;
    const cashBalance = closingRegistry?.cashBalance ?? 0;
    const openingBalance = openingRegistry?.openingBalance ?? 0;
    const closingBalance = closingRegistry?.closingBalance ?? cashBalance;

    // Outstanding: invoices in date range with due_amount > 0
    let totalDue = 0;
    const customersWithDueSet = new Set();
    salesInInvoiceRange.forEach(s => {
      const totalBillAmount = s.paymentStatus?.totalAmount ?? s.grossTotal ?? s.netTotal ?? 0;
      const amountPaid = s.paymentStatus?.paidAmount ?? (s.payments?.reduce((sum, p) => sum + (p.amount || 0), 0) ?? 0);
      const dueAmount = totalBillAmount - amountPaid;
      if (dueAmount > 0) {
        totalDue += dueAmount;
        const customerKey = (s.customerName || '').trim() || s._id.toString();
        if (customerKey) customersWithDueSet.add(customerKey);
      }
    });
    const customersWithDue = customersWithDueSet.size;

    res.json({
      success: true,
      data: {
        totalBillCount,
        totalCustomerCount,
        totalSales,
        totalSalesCash,
        totalSalesOnline,
        totalSalesCard,
        totalSalesWallet,
        totalSalesRewardPoint,
        duesCollected,
        cashDuesCollected,
        cashExpense,
        pettyCashExpense,
        tipCollected,
        cashAddedToWallet,
        cashBalance,
        openingBalance,
        closingBalance,
        totalDue,
        customersWithDue
      }
    });
  } catch (error) {
    logger.error('Error fetching summary report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch summary'
    });
  }
});

// --- SALES API ---
// Aggregate totals for filters (no row payload). Register before /api/sales/:id.
app.get('/api/sales/summary', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  const started = Date.now();
  try {
    const { Sale } = req.businessModels;
    const branchId = req.user.branchId;
    const split = buildSalesListDuePaymentSplitMatches(branchId, req.query);
    const totals = split
      ? await computeSalesSummaryTotalsSplit(Sale, split.matchInvoice, split.matchPaymentOnly)
      : await computeSalesSummaryTotals(Sale, buildSalesListMatch(branchId, req.query));
    const durationMs = Date.now() - started;
    if (durationMs > 500) {
      logger.warn('Slow GET /api/sales/summary', { durationMs });
    }
    res.json({
      success: true,
      data: {
        totalRevenue: totals.totalRevenue,
        cashCollected: totals.cashCollected,
        serviceCashCollected: totals.serviceCashCollected,
        walletCashCollected: totals.walletCashCollected,
        onlineCash: totals.onlineCash,
        cardCollected: totals.cardCollected,
        onlinePayCollected: totals.onlinePayCollected,
        unpaidValue: totals.unpaidValue,
        tips: totals.tips,
        completedSales: totals.completedSales,
        partialSales: totals.partialSales || 0,
        unpaidSales: totals.unpaidSales || 0,
      },
    });
  } catch (err) {
    logger.error('Error fetching sales summary:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/sales', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  const started = Date.now();
  try {
    const { Sale, BillEditHistory } = req.businessModels;
    const branchId = req.user.branchId;
    const { limit, page, skip } = parseSalesListPagination(req.query);
    const split = buildSalesListDuePaymentSplitMatches(branchId, req.query);
    const match = split ? null : buildSalesListMatch(branchId, req.query);

    const [total, sales] = split
      ? await Promise.all([
          Promise.all([
            Sale.countDocuments(split.matchInvoice),
            Sale.countDocuments(split.matchPaymentOnly),
          ]).then(([a, b]) => a + b),
          fetchSalesListPageMerged(Sale, split.matchInvoice, split.matchPaymentOnly, skip, limit),
        ])
      : await Promise.all([
          Sale.countDocuments(match),
          // Newest bills first: `date` is often the calendar day only (same instant for many rows) while
          // `time` is a separate string — composite date+time sort is unreliable. `createdAt` reflects
          // actual save order and aligns with sequential invoice numbers (INV-…).
          Sale.find(match)
            .sort({ createdAt: -1, billNo: -1, _id: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        ]);

    await mergeEditedFlagsFromHistory(sales, BillEditHistory);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const durationMs = Date.now() - started;
    if (durationMs > 500) {
      logger.warn('Slow GET /api/sales', { durationMs, page, limit, total });
    }

    res.json({
      success: true,
      data: sales,
      total,
      page,
      limit,
      totalPages,
    });
  } catch (err) {
    logger.error('Error fetching sales:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sales', authenticateToken, setupBusinessDatabase, requirePermission('sales', 'create'), async (req, res) => {
  try {
    if (process.env.DEBUG_SALES) {
      logger.debug('🔍 Sales POST request received');
      logger.debug('📋 Request body:', JSON.stringify(req.body, null, 2));
      logger.debug('👤 User:', req.user?.email);
    }
    
    const { Sale, Product, InventoryTransaction, Appointment, BusinessSettings } = req.businessModels;
    const saleData = req.body;
    
    // Process items to handle staff contributions and preserve productId/serviceId
    const mongoose = require('mongoose');
    /** Quick Sale drift (booking → direct bill): suppress synthetic walk-in calendar rows & cancel originals. Stripped before Sale ctor. */
    const suppressStandaloneWalkInCalendarCards =
      saleData.suppressStandaloneWalkInCalendarCards === true;
    const rawVoidBookingAppointmentIds = Array.isArray(saleData.voidBookingAppointmentIds)
      ? saleData.voidBookingAppointmentIds
      : [];
    delete saleData.suppressStandaloneWalkInCalendarCards;
    delete saleData.voidBookingAppointmentIds;
    const voidBookingAppointmentObjectIds = [
      ...new Set(
        rawVoidBookingAppointmentIds
          .map((id) => (id != null ? String(id).trim() : ''))
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
      ),
    ].map((id) => new mongoose.Types.ObjectId(id));
    const skipStandaloneWalkInCalendarCards =
      suppressStandaloneWalkInCalendarCards === true || voidBookingAppointmentObjectIds.length > 0;

    if (saleData.appointmentId != null && saleData.appointmentId !== '') {
      const aptNorm = normalizeClientAppointmentIdString(saleData.appointmentId);
      if (mongoose.Types.ObjectId.isValid(aptNorm)) {
        saleData.appointmentId = new mongoose.Types.ObjectId(aptNorm);
      } else {
        delete saleData.appointmentId;
      }
    }

    const { getItemPreTaxTotal } = require('./lib/sale-item-pretax');
    if (saleData.items && Array.isArray(saleData.items)) {
      saleData.items = saleData.items.map(item => {
        // Ensure productId is preserved and converted to ObjectId if it's a string
        if (item.type === 'product' && item.productId) {
          if (typeof item.productId === 'string' && mongoose.Types.ObjectId.isValid(item.productId)) {
            item.productId = new mongoose.Types.ObjectId(item.productId);
          }
        }
        // Preserve serviceId for auto consumption (type === 'service')
        if (item.type === 'service' && item.serviceId) {
          if (typeof item.serviceId === 'string' && mongoose.Types.ObjectId.isValid(item.serviceId)) {
            item.serviceId = new mongoose.Types.ObjectId(item.serviceId);
          }
        }
        if (item.type === 'prepaid_wallet' && item.prepaidPlanId) {
          if (typeof item.prepaidPlanId === 'string' && mongoose.Types.ObjectId.isValid(item.prepaidPlanId)) {
            item.prepaidPlanId = new mongoose.Types.ObjectId(item.prepaidPlanId);
          }
        }
        if (item.variantKey !== undefined) item.variantKey = item.variantKey || '';
        
        const linePreTax = getItemPreTaxTotal(item);
        if (item.staffContributions && Array.isArray(item.staffContributions)) {
          item.staffContributions = item.staffContributions.map(contribution => ({
            ...contribution,
            amount: (linePreTax * contribution.percentage) / 100
          }));
        }

        if ((!item.staffContributions || item.staffContributions.length === 0)) {
          const trimmedStaffId = item.staffId != null ? String(item.staffId).trim() : '';
          if (trimmedStaffId) {
            const nm = item.staffName != null ? String(item.staffName).trim() : '';
            item.staffContributions = [{
              staffId: trimmedStaffId,
              staffName: nm || 'Staff',
              percentage: 100,
              amount: linePreTax
            }];
          }
        }

        // Single-assign lines: if the checkout row `staffId` was changed but contributions stayed on the old stylist, fix before persist.
        if (item.type === 'service') {
          const lineSid = item.staffId != null ? String(item.staffId).trim() : '';
          const contribs = item.staffContributions;
          if (
            lineSid &&
            mongoose.Types.ObjectId.isValid(lineSid) &&
            Array.isArray(contribs) &&
            contribs.length === 1
          ) {
            const c0 = contribs[0];
            const cSid = c0?.staffId != null ? String(c0.staffId).trim() : '';
            const pct = Number(c0?.percentage) || 100;
            if (pct === 100 && cSid && cSid !== lineSid) {
              const nm =
                (item.staffName != null && String(item.staffName).trim()) ||
                String(c0?.staffName || 'Staff').trim() ||
                'Staff';
              item.staffContributions = [
                { staffId: lineSid, staffName: nm, percentage: 100, amount: linePreTax },
              ];
            }
          }
        }

        return item;
      });
      if (saleData.appointmentId && mongoose.Types.ObjectId.isValid(String(saleData.appointmentId))) {
        saleData.items = await annotateAppointmentLinkedSaleItemsLineSource(
          Appointment,
          saleData.appointmentId,
          saleData.items,
        );
      } else if (Array.isArray(saleData.items)) {
        saleData.items = saleData.items.map((row) => {
          if (!row || typeof row !== 'object') return row;
          const { lineSource, ...rest } = row;
          return rest;
        });
      }
    }
    
    // Add branchId to sale data
    saleData.branchId = req.user.branchId;

    const {
      mergePaymentConfiguration,
      eligibleRedemptionSubtotal,
      sumWalletPayments,
    } = require('./lib/payment-redemption-eligibility');
    let eligibleRewardSubCreate = null;
    let eligibleWalletSubCreate = null;
    if (BusinessSettings) {
      const payDoc = await BusinessSettings.findOne().select('paymentConfiguration').lean();
      const payCfg = mergePaymentConfiguration(payDoc?.paymentConfiguration);
      const itemsForRedeem = Array.isArray(saleData.items) ? saleData.items : [];
      const redeemOptsCreate = { cartDiscountAmount: Number(saleData.discount) || 0 };
      eligibleWalletSubCreate = eligibleRedemptionSubtotal(itemsForRedeem, payCfg, 'wallet', redeemOptsCreate);
      eligibleRewardSubCreate = eligibleRedemptionSubtotal(itemsForRedeem, payCfg, 'reward', redeemOptsCreate);
      const walletPaid = sumWalletPayments(saleData.payments);
      if (walletPaid > eligibleWalletSubCreate + 0.02) {
        return res.status(400).json({
          success: false,
          error:
            'Wallet payment exceeds amount allowed for eligible bill lines (payment configuration).',
        });
      }
      if (payCfg.billingRedemption?.allowWalletAndPointsTogether === false) {
        const ptsCreate = Math.floor(Number(saleData.loyaltyPointsRedeemed) || 0);
        if (walletPaid > 0.02 && ptsCreate > 0) {
          return res.status(400).json({
            success: false,
            error:
              'Use only one of wallet or reward points on this bill (payment configuration).',
          });
        }
      }
    }

    const rewardPointsSvcCreate = require('./services/reward-points-service');
    const rpSettingsCreate = await rewardPointsSvcCreate.getMergedSettings(req.user.branchId);
    try {
      rewardPointsSvcCreate.validateSaleLoyaltyBeforeSave(
        saleData,
        rpSettingsCreate,
        eligibleRewardSubCreate
      );
    } catch (loyErr) {
      return res.status(loyErr.status || 400).json({ success: false, error: loyErr.message });
    }
    const redeemedPre = Math.floor(Number(saleData.loyaltyPointsRedeemed) || 0);
    if (rpSettingsCreate.enabled && redeemedPre > 0 && saleData.customerId) {
      const { Client: ClientForRp } = req.businessModels;
      const cliRp = await ClientForRp.findById(saleData.customerId).select('rewardPointsBalance').lean();
      if (!cliRp || Number(cliRp.rewardPointsBalance) < redeemedPre) {
        return res.status(400).json({ success: false, error: 'Insufficient reward points balance' });
      }
    }

    // Validate customerId is a valid ObjectId if present
    if (saleData.customerId && !mongoose.Types.ObjectId.isValid(saleData.customerId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid customer ID format'
      });
    }

    // Assign membership on checkout: convert planToAssignId to ObjectId if present
    if (saleData.planToAssignId && mongoose.Types.ObjectId.isValid(saleData.planToAssignId)) {
      saleData.planToAssignId = new mongoose.Types.ObjectId(saleData.planToAssignId);
    } else if (saleData.planToAssignId) {
      delete saleData.planToAssignId;
      delete saleData.membershipPlanPrice;
    }

    const { normalizeSaleTipPayload } = require('./lib/sale-tip-normalize');
    const { Staff: StaffForTipCreate } = req.businessModels;
    await normalizeSaleTipPayload(saleData, StaffForTipCreate || null);

    const sale = new Sale(saleData);
    await sale.save();
    
    // Reload sale to ensure shareToken is included (generated by pre-save middleware)
    const savedSale = await Sale.findById(sale._id);
    if (!savedSale.shareToken) {
      logger.warn('⚠️ Sale saved but shareToken is missing, generating now...');
      const crypto = require('crypto');
      savedSale.shareToken = crypto.randomBytes(32).toString('hex');
      await savedSale.save();
    }

    try {
      if (
        voidBookingAppointmentObjectIds.length > 0 &&
        savedSale.customerId &&
        mongoose.Types.ObjectId.isValid(String(savedSale.customerId))
      ) {
        const custId =
          typeof savedSale.customerId === 'object' &&
          savedSale.customerId &&
          savedSale.customerId._id != null
            ? savedSale.customerId._id
            : savedSale.customerId;
        await Appointment.updateMany(
          {
            _id: { $in: voidBookingAppointmentObjectIds },
            branchId: req.user.branchId,
            clientId: custId,
          },
          { $set: { status: 'cancelled_at_billing' } }
        );
        logger.debug('[Sale create] Cancelled bookings (cancelled_at_billing) from voidBookingAppointmentIds:', {
          count: voidBookingAppointmentObjectIds.length,
        });
      }
    } catch (voidAptErr) {
      logger.error('❌ voidBookingAppointmentIds update failed:', voidAptErr);
    }

    if (savedSale.appointmentId && String(savedSale.status).toLowerCase() === 'completed') {
      await markAppointmentCompleted(Appointment, savedSale.appointmentId, savedSale, req.businessModels);
      await syncCompletedLinkedAppointmentStaffFromSale(Appointment, savedSale);
    } else if (String(savedSale.status).toLowerCase() === 'completed' && !skipStandaloneWalkInCalendarCards) {
      // Standalone sale with multiple staff: create walk-in cards for calendar
      await createWalkInCardsForStandaloneSale(savedSale, req.businessModels, req.user.branchId);
    }

    // Auto consumption: deduct inventory for completed service lines (only when bill status is completed)
    if (String(savedSale.status).toLowerCase() === 'completed') {
      try {
        const autoConsumption = require('./services/auto-consumption');
        const { runAutoConsumptionForSale } = autoConsumption;
        const { processedCount, warnings } = await runAutoConsumptionForSale(savedSale, req.businessModels, { user: req.user });
        logger.debug('[AutoConsumption] Sale create result:', { billNo: savedSale.billNo, processedCount, warnings: warnings.length });
        if (warnings.length) logger.warn('[AutoConsumption] Warnings:', warnings);
      } catch (autoConsumptionErr) {
        logger.error('Auto consumption on sale create failed:', autoConsumptionErr);
        // Don't fail the sale; consumption can be reviewed
      }
    }

    // Membership redeem: create MembershipUsage for service items marked as isMembershipFree
    const customerId = saleData.customerId || savedSale.customerId;
    if (customerId && mongoose.Types.ObjectId.isValid(customerId) && savedSale.items && Array.isArray(savedSale.items)) {
      const { MembershipUsage, MembershipSubscription } = req.businessModels;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const subscription = await MembershipSubscription.findOne({
        branchId: req.user.branchId,
        customerId: new mongoose.Types.ObjectId(customerId),
        ...activeMembershipMongoMatch(today),
      }).populate('planId');

      if (subscription && subscription.planId) {
        for (const item of savedSale.items) {
            if (item.type === 'service' && item.serviceId && item.isMembershipFree) {
              const staffId = (item.staffContributions && item.staffContributions[0]?.staffId)
                ? item.staffContributions[0].staffId
                : item.staffId || req.user._id;
              const staffIdObj = staffId && mongoose.Types.ObjectId.isValid(staffId)
                ? new mongoose.Types.ObjectId(staffId)
                : req.user._id;

              const included = (subscription.planId.includedServices || []).find(
                s => (s.serviceId?._id || s.serviceId)?.toString() === item.serviceId.toString()
              );
              if (included) {
                const qtyRaw = Number(item.quantity);
                const lineQty =
                  Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : 1;
                const used = await MembershipUsage.countDocuments({
                  branchId: req.user.branchId,
                  subscriptionId: subscription._id,
                  serviceId: item.serviceId
                });
                const usageLimit = included.usageLimit ?? 0;
                const remaining = Math.max(0, usageLimit - used);
                const toRedeem = Math.min(lineQty, remaining);
                for (let i = 0; i < toRedeem; i++) {
                  try {
                    const usage = new MembershipUsage({
                      branchId: req.user.branchId,
                      subscriptionId: subscription._id,
                      serviceId: item.serviceId,
                      usedOn: new Date(),
                      staffId: staffIdObj,
                      billingId: savedSale._id
                    });
                    await usage.save();
                    logger.debug('[Membership] Redeemed service unit for bill:', savedSale.billNo);
                  } catch (membershipErr) {
                    logger.error('[Membership] Redeem failed for item:', item.name, membershipErr);
                  }
              }
            }
          }
        }
      }
    }

    // Assign membership on checkout: when sale is completed and planToAssignId is present
    const planIdToAssign = savedSale.planToAssignId || saleData.planToAssignId;
    if (String(savedSale.status).toLowerCase() === 'completed' && planIdToAssign && customerId && mongoose.Types.ObjectId.isValid(customerId) && mongoose.Types.ObjectId.isValid(planIdToAssign)) {
      try {
        const { MembershipPlan, MembershipSubscription } = req.businessModels;
        const plan = await MembershipPlan.findOne({ _id: planIdToAssign, branchId: req.user.branchId });
        if (plan && plan.isActive) {
          const todayAssign = new Date();
          todayAssign.setHours(0, 0, 0, 0);
          const existingActive = await MembershipSubscription.findOne({
            branchId: req.user.branchId,
            customerId: new mongoose.Types.ObjectId(customerId),
            ...activeMembershipMongoMatch(todayAssign),
          });
          if (!existingActive) {
            const startDate = new Date();
            const expiryDate = subscriptionExpiryDateForPlan(plan, startDate);
            const subscription = new MembershipSubscription({
              branchId: req.user.branchId,
              customerId: new mongoose.Types.ObjectId(customerId),
              planId: plan._id,
              startDate,
              expiryDate,
              status: 'ACTIVE',
              saleId: savedSale._id
            });
            await subscription.save();
            logger.debug('[Membership] Assigned plan on checkout for bill:', savedSale.billNo);
          } else {
            logger.warn('[Membership] Customer already has active membership, skipping assign on checkout for bill:', savedSale.billNo);
          }
        } else {
          logger.warn('[Membership] Plan not found or inactive, skipping assign on checkout for bill:', savedSale.billNo);
        }
      } catch (membershipAssignErr) {
        logger.error('[Membership] Assign on checkout failed:', membershipAssignErr);
        // Don't fail the sale; membership can be assigned manually
      }
    }

    // Track products that had stock updated for low inventory check
    const updatedProductIds = new Set();
    
    // Create inventory transactions for product items
    if (saleData.items && Array.isArray(saleData.items)) {
      for (const item of saleData.items) {
        if (item.type === 'product' && item.productId) {
          try {
            const product = await Product.findById(item.productId);
            if (product) {
              // Update product stock
              const previousStock = product.stock;
              const newStock = previousStock - item.quantity;
              
              await Product.findByIdAndUpdate(item.productId, { stock: newStock });
              
              // Create inventory transaction
              const inventoryTransaction = new InventoryTransaction({
                productId: item.productId,
                productName: item.name,
                transactionType: 'sale',
                quantity: -item.quantity, // Negative for deduction
                previousStock: previousStock,
                newStock: newStock,
                unitCost: item.price,
                totalValue: item.total,
                referenceType: 'sale',
                referenceId: sale._id.toString(),
                referenceNumber: sale.billNo,
                processedBy: saleData.staffName || 'System',
                reason: 'Product sold',
                notes: `Sold to ${saleData.customerName}`,
                transactionDate: new Date()
              });
              
              await inventoryTransaction.save();
              
              // Track product for low inventory check
              updatedProductIds.add(item.productId.toString());
              
              logger.debug(`✅ Inventory transaction created for product ${item.name}: ${item.quantity} units sold`);
            }
          } catch (inventoryError) {
            logger.error('Error creating inventory transaction:', inventoryError);
            // Don't fail the sale if inventory tracking fails
          }
        }
      }
    }
    
    // Check for low inventory after sales (for all products that had stock updated)
    if (updatedProductIds.size > 0) {
      try {
        const { checkAndSendLowInventoryAlerts } = require('./utils/low-inventory-checker');
        // Check all products that had stock updated
        for (const productId of updatedProductIds) {
          await checkAndSendLowInventoryAlerts(req.user.branchId, productId);
        }
      } catch (inventoryCheckError) {
        logger.error('❌ Error checking low inventory:', inventoryCheckError);
        // Don't fail the sale if inventory check fails
      }
    }

    logger.debug('✅ Sale created successfully:', sale._id);

    const createdSale = savedSale || sale;
    try {
      await rewardPointsSvcCreate.processSaleCompletionLoyalty({
        savedSale: createdSale,
        branchId: req.user.branchId,
        businessModels: req.businessModels,
        userId: req.user._id,
      });
    } catch (rpErr) {
      logger.error('[reward-points] process sale completion failed', rpErr);
    }

    scheduleActivityLog(
      {
        businessId: req.user.branchId,
        actorType: tenantActorTypeFromRole(req.user.role),
        actorId: req.user._id,
        action: ACTIVITY_ACTIONS.CREATE_INVOICE,
        entity: 'sale',
        entityId: createdSale._id,
        summary: `Invoice ${createdSale.billNo || createdSale._id} created`,
      },
      req
    );

    // Respond immediately after save — notifications run in background
    res.status(201).json({
      success: true,
      data: savedSale || sale,
    });

    // Fire-and-forget: send email/WhatsApp/SMS notifications without blocking the response
    setImmediate(async () => {
    const isWalkInSale =
      String(sale?.customerPhone || sale?.customerMobile || '').trim() === WALK_IN_PHONE ||
      /^walk-?in$/i.test(String(sale?.customerName || '').trim());

    logger.debug('📧 Sale customer email check:', {
      customerEmail: sale.customerEmail,
      hasEmail: !!sale.customerEmail,
      customerName: sale.customerName,
      billNo: sale.billNo
    });

    // Track email sending status for background logging
    let emailStatus = {
      attempted: false,
      sent: false,
      error: null,
      debug: {
        emailServiceEnabled: null,
        receiptNotificationsEnabled: null,
        sendToClients: null,
        hasCustomerEmail: null,
        customerEmail: null
      }
    };

    // Send email notifications if enabled
    try {
      const emailService = require('./services/email-service');
      
      // Ensure email service is initialized
      if (!emailService.initialized) {
        logger.debug('📧 Email service not initialized, initializing now...');
        await emailService.initialize();
      }
      
      logger.debug('📧 Email service status:', {
        initialized: emailService.initialized,
        enabled: emailService.enabled,
        provider: emailService.provider
      });
      
      emailStatus.debug.emailServiceEnabled = emailService.enabled;
      
      // Check if email service is enabled (from AdminSettings)
      if (!emailService.enabled) {
        logger.debug('📧 Email service is disabled, skipping receipt email');
        emailStatus.error = 'Email service is disabled';
      } else {
        // Get Business from main database (not business database)
        const databaseManager = require('./config/database-manager');
        const mainConnection = await databaseManager.getMainConnection();
        const Business = mainConnection.model('Business', require('./models/Business').schema);
        
        const business = await Business.findById(req.user.branchId);
        if (!business) {
          emailStatus.error = 'Business not found';
        } else if (isPlatformEmailDisabled(business)) {
          logger.info('📧 Skipping sale receipt email — platform policy');
          emailStatus.error = 'Email disabled by platform for this business';
        } else {
        const rawEmailSettings = business.settings?.emailNotificationSettings;
        
        // Apply defaults to email settings (similar to WhatsApp)
        const emailSettings = getEmailSettingsWithDefaults(rawEmailSettings);
        
        // Check if business has enabled receipt notifications
        // Use merged settings with defaults - defaults to true if not explicitly set to false
        const receiptNotificationsEnabled = emailSettings.receiptNotifications?.enabled === true;
        
        emailStatus.debug.receiptNotificationsEnabled = receiptNotificationsEnabled;
        emailStatus.debug.hasCustomerEmail = !!sale.customerEmail;
        emailStatus.debug.customerEmail = sale.customerEmail || null;
        emailStatus.debug.emailSettingsExists = !!emailSettings;
        emailStatus.debug.receiptNotificationsExists = !!emailSettings?.receiptNotifications;
        emailStatus.debug.receiptNotificationsEnabledValue = emailSettings?.receiptNotifications?.enabled;
        
        logger.debug(`📧 Receipt notifications enabled: ${receiptNotificationsEnabled}, emailSettings exists: ${!!emailSettings}, receiptNotifications exists: ${!!emailSettings?.receiptNotifications}, enabled value: ${emailSettings?.receiptNotifications?.enabled}`);
        
        if (!receiptNotificationsEnabled) {
          emailStatus.error = 'Receipt notifications disabled in business settings';
          logger.debug('📧 Receipt notifications are disabled in business settings');
        } else {
          // Send receipt to client if email exists (default to true if not set)
          const sendToClients = !emailSettings || emailSettings?.receiptNotifications?.sendToClients !== false;
          emailStatus.debug.sendToClients = sendToClients;
          
          logger.debug(`📧 Email sending check:`, {
            sendToClients,
            hasCustomerEmail: !!sale.customerEmail,
            customerEmail: sale.customerEmail
          });
          if (sendToClients && sale.customerEmail) {
            if (isWalkInSale) {
              emailStatus.error = 'Walk-in customer — receipt email skipped';
              logger.debug('📧 Skipping receipt email for Walk-in sale');
            } else {
            emailStatus.attempted = true;
            logger.debug(`📧 Attempting to send receipt email to: ${sale.customerEmail}`);
            try {
              // Calculate subtotal from items
              const subtotal = sale.items?.reduce((sum, item) => sum + (item.total || 0), 0) || 0;
              
              // Use savedSale (with shareToken) instead of sale
              const saleForEmail = savedSale || sale;
              
              // Generate receipt link using shareToken
              let receiptLink = null;
              if (saleForEmail.shareToken) {
                const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
                receiptLink = `${frontendUrl}/receipt/public/${saleForEmail.billNo}/${saleForEmail.shareToken}`;
                logger.debug(`✅ Receipt link generated: ${receiptLink}`);
                logger.debug(`🔍 ShareToken: ${saleForEmail.shareToken.substring(0, 10)}...`);
              } else {
                logger.error('❌ Sale does not have shareToken, cannot generate receipt link');
                logger.error('❌ Sale data:', {
                  _id: saleForEmail._id,
                  billNo: saleForEmail.billNo,
                  hasShareToken: !!saleForEmail.shareToken
                });
              }
              
              logger.debug(`📧 Calling emailService.sendReceipt with:`, {
                to: saleForEmail.customerEmail,
                clientName: saleForEmail.customerName,
                receiptNumber: saleForEmail.billNo,
                businessName: business?.name,
                hasReceiptLink: !!receiptLink,
                receiptLink: receiptLink || 'NOT GENERATED'
              });
              
              const emailResult = await emailService.sendReceipt({
                to: saleForEmail.customerEmail,
                clientName: saleForEmail.customerName,
                receiptNumber: saleForEmail.billNo,
                receiptData: {
                  businessName: business?.name || 'Business',
                  date: saleForEmail.date ? new Date(saleForEmail.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                  items: saleForEmail.items || [],
                  subtotal: subtotal,
                  tax: saleForEmail.taxAmount || 0,
                  discount: saleForEmail.discount || 0,
                  total: saleForEmail.netTotal || saleForEmail.grossTotal || 0,
                  paymentMethod: saleForEmail.paymentMode || saleForEmail.paymentHistory?.[0]?.method || 'N/A'
                },
                receiptLink: receiptLink
              });
              
              logger.debug(`📧 Email result:`, emailResult);
              
              if (emailResult && emailResult.success !== false) {
                logger.debug(`✅ Receipt email sent to client: ${sale.customerEmail}`);
                emailStatus.sent = true;
              } else {
                logger.error(`❌ Failed to send receipt email to ${sale.customerEmail}:`, emailResult?.error || 'Unknown error');
                logger.error(`❌ Full email result:`, JSON.stringify(emailResult, null, 2));
                emailStatus.error = emailResult?.error || 'Unknown error';
              }
              logEmailMessage({
                businessId: business?._id,
                recipientEmail: saleForEmail.customerEmail,
                messageType: 'receipt',
                result: {
                  success: emailResult && emailResult.success !== false,
                  error: emailResult?.error,
                  data: emailResult?.data,
                },
                subject: `Receipt ${saleForEmail?.billNo || ''}`.trim(),
                provider: emailService?.provider,
                relatedEntityId: (savedSale || sale)?._id,
                relatedEntityType: 'Sale',
              });
            } catch (clientEmailError) {
              logger.error('❌ Error sending receipt email to client:', clientEmailError);
              logger.error('❌ Error details:', {
                message: clientEmailError.message,
                stack: clientEmailError.stack
              });
              emailStatus.error = clientEmailError.message;
            }
            }
          } else {
            emailStatus.error = !sendToClients ? 'Send to clients disabled' : 'No customer email';
          }
        }
        }
      }
    } catch (emailError) {
      logger.error('Error sending receipt email:', emailError);
      emailStatus.error = emailError.message;
      // Don't fail sale creation if email fails
    }

    // Send WhatsApp receipt if enabled
    const whatsappStatus = { sent: false, error: null };
    try {
      logger.debug('📱 [WhatsApp] Starting WhatsApp receipt sending for sale...');
      const whatsappService = require('./services/whatsapp-service');
      await whatsappService.initialize();
      
      logger.debug('📱 [WhatsApp] Service initialized. Enabled:', whatsappService.enabled);
      
      if (whatsappService.enabled) {
        const databaseManager = require('./config/database-manager');
        const mainConnection = await databaseManager.getMainConnection();
        const AdminSettings = mainConnection.model('AdminSettings', require('./models/AdminSettings').schema);
        const Business = mainConnection.model('Business', require('./models/Business').schema);
        const WhatsAppMessageLog = mainConnection.model('WhatsAppMessageLog', require('./models/WhatsAppMessageLog').schema);
        
        const adminSettings = await AdminSettings.getSettings();
        const whatsappEnabled = adminSettings?.notifications?.whatsapp?.enabled === true;
        const adminReceiptNotificationsEnabled = isAdminReceiptNotificationsEnabled(
          adminSettings?.notifications?.whatsapp
        );
        
        logger.debug('📱 [WhatsApp] Admin WhatsApp enabled:', whatsappEnabled);
        logger.debug('📱 [WhatsApp] Admin Receipt Notifications enabled:', adminReceiptNotificationsEnabled);
        
        if (whatsappEnabled && adminReceiptNotificationsEnabled) { // Check admin master switch
          // Use lean() to get plain object so nested objects are accessible
          const business = await Business.findById(req.user.branchId).lean();
          
          // Debug: Log the entire business object structure
          logger.debug('📱 [WhatsApp] Business object structure:', {
            hasBusiness: !!business,
            hasSettings: !!business?.settings,
            settingsKeys: business?.settings ? Object.keys(business.settings) : [],
            hasWhatsappSettings: !!business?.settings?.whatsappNotificationSettings,
            whatsappSettingsEnabled: business?.settings?.whatsappNotificationSettings?.enabled,
            fullBusinessSettings: JSON.stringify(business?.settings, null, 2)
          });
          
          // Access WhatsApp settings from plain object (accessible with lean())
          // Apply defaults if settings don't exist
          const rawWhatsappSettings = business?.settings?.whatsappNotificationSettings;
          const whatsappSettings = getWhatsAppSettingsWithDefaults(rawWhatsappSettings);
          const businessWhatsappEnabled = whatsappSettings.enabled === true;
          const receiptNotificationsEnabled = whatsappSettings.receiptNotifications?.enabled === true;
          const autoSendEnabled = whatsappSettings.receiptNotifications?.autoSendToClients === true;
          
          logger.debug('📱 [WhatsApp] Business settings:', {
            businessWhatsappEnabled,
            receiptNotificationsEnabled,
            autoSendEnabled,
            whatsappSettings: JSON.stringify(whatsappSettings, null, 2)
          });
          
          if (businessWhatsappEnabled && receiptNotificationsEnabled && autoSendEnabled) {
            // Check quiet hours
            const quietHours = adminSettings?.notifications?.whatsapp?.quietHours;
            const inQuietHours = whatsappService.isQuietHours(quietHours);
            
            logger.debug('📱 [WhatsApp] Quiet hours check:', { inQuietHours, quietHours });
            
            if (!inQuietHours) {
              // Get client phone number from sale
              const customerPhone = sale?.customerPhone || sale?.customerMobile;
              
              logger.debug('📱 [WhatsApp] Customer phone from sale:', customerPhone);
              
              if (isWalkInSale) {
                logger.debug('📱 [WhatsApp] Skipping sale receipt for Walk-in customer');
                whatsappStatus.error = 'Walk-in customer — receipt WhatsApp skipped';
              } else if (customerPhone) {
                try {
                  const { canUseAddon: canUseAddonWa } = require('./lib/entitlements');
                  const mainConnectionForWaQuota = await databaseManager.getMainConnection();
                  const BusinessMainWa = mainConnectionForWaQuota.model('Business', require('./models/Business').schema);
                  const freshBusinessWa = await BusinessMainWa.findById(business._id).lean();
                  const useAddonWa = canUseAddonWa(freshBusinessWa, 'whatsapp');
                  const useWalletWa = !useAddonWa && canDeductWhatsApp(freshBusinessWa, 'receipt');
                  if (!useAddonWa && !useWalletWa) {
                    logger.info('📱 [WhatsApp] Sale receipt skipped: quota exhausted, wallet insufficient');
                  } else {
                  const saleForWhatsapp = savedSale || sale;
                  const { Sale } = req.businessModels;
                  const {
                    buildSaleNotificationLinks,
                    resolveReceiptFeedbackLinkForSend,
                  } = require('./lib/feedback-link-helpers');
                  const links = await buildSaleNotificationLinks(
                    Sale,
                    business._id,
                    saleForWhatsapp,
                    'whatsapp'
                  );
                  const whatsappReceiptLink = links.receiptLink;
                  const whatsappFeedbackLink = resolveReceiptFeedbackLinkForSend(
                    freshBusinessWa,
                    whatsappSettings,
                    links.feedbackLink
                  );
                  if (whatsappReceiptLink) {
                    logger.debug(`📱 [WhatsApp] Receipt link generated: ${whatsappReceiptLink}`);
                  } else {
                    logger.warn('⚠️ [WhatsApp] Sale does not have shareToken, receipt link will be null');
                  }
                  if (whatsappFeedbackLink) {
                    logger.debug('📱 [WhatsApp] Feedback link generated for receipt template');
                  }
                  
                  const result = await whatsappService.sendReceipt({
                    to: customerPhone,
                    businessId: business?._id,
                    clientName: sale.customerName || 'Customer',
                    receiptNumber: sale.billNo,
                    receiptData: {
                      businessName: business?.name || 'Business',
                      total: sale.netTotal || sale.grossTotal || 0
                    },
                    receiptLink: whatsappReceiptLink,
                    feedbackLink: whatsappFeedbackLink,
                  });
                  
                  // Log to WhatsAppMessageLog
                  await WhatsAppMessageLog.create({
                    businessId: business._id,
                    recipientPhone: customerPhone,
                    messageType: 'receipt',
                    status: result.success ? 'sent' : 'failed',
                    msg91Response: result.data || null,
                    relatedEntityId: savedSale?._id || sale._id,
                    relatedEntityType: 'Sale',
                    error: result.error || null,
                    timestamp: new Date()
                  });
                  
                  if (result.success) {
                    // Increment WhatsApp quota usage (or deduct wallet)
                    try {
                      if (useWalletWa) {
                        await deductWhatsApp(business._id, 'receipt', {
                          description: 'WhatsApp sale receipt',
                          relatedEntity: { id: savedSale?._id || sale._id, type: 'Sale' },
                        });
                      } else {
                        await BusinessMainWa.updateOne(
                          { _id: business._id },
                          { $inc: { 'plan.addons.whatsapp.used': 1 } }
                        );
                      }
                      logger.debug(`📊 WhatsApp quota incremented for business: ${business._id}`);
                    } catch (quotaError) {
                      logger.error('❌ Error incrementing WhatsApp quota:', quotaError);
                      // Don't fail the sale if quota increment fails
                    }
                    
                    if (result.queued) {
                      logger.debug(`⏳ Sale receipt WhatsApp queued for delivery to client: ${customerPhone}`, {
                        requestId: result.requestId || 'N/A',
                        note: 'Message is queued. Check MSG91 dashboard for delivery status.'
                      });
                      whatsappStatus.sent = true;
                      whatsappStatus.queued = true;
                      whatsappStatus.requestId = result.requestId;
                      whatsappStatus.message = 'Message queued for delivery. Check MSG91 dashboard for status.';
                    } else {
                      logger.debug(`✅ Sale receipt WhatsApp sent to client: ${customerPhone}`);
                      whatsappStatus.sent = true;
                    }
                  } else {
                    logger.error(`❌ Failed to send sale receipt WhatsApp to ${customerPhone}:`, result.error);
                    whatsappStatus.error = result.error;
                  }
                  }
                } catch (whatsappError) {
                  logger.error('❌ Error sending sale receipt WhatsApp to client:', whatsappError);
                  logger.error('❌ Error stack:', whatsappError.stack);
                  whatsappStatus.error = whatsappError.message;
                }
              } else {
                logger.debug('📱 [WhatsApp] No customer phone number found in sale');
                whatsappStatus.error = 'No customer phone number';
              }
            } else {
              logger.debug('📱 [WhatsApp] Quiet hours active, skipping sale receipt message');
              whatsappStatus.error = 'Quiet hours active';
            }
          } else {
            logger.debug('📱 [WhatsApp] Business WhatsApp settings not enabled:', {
              businessWhatsappEnabled,
              receiptNotificationsEnabled,
              autoSendEnabled
            });
            
            // Provide specific error message
            if (!businessWhatsappEnabled) {
              whatsappStatus.error = 'WhatsApp is not enabled for this business. Please enable it in Business Settings → Notifications → WhatsApp.';
            } else if (!receiptNotificationsEnabled) {
              whatsappStatus.error = 'Receipt notifications are not enabled for this business. Please enable them in Business Settings → Notifications → WhatsApp.';
            } else if (!autoSendEnabled) {
              whatsappStatus.error = 'Auto-send receipts is not enabled for this business. Please enable it in Business Settings → Notifications → WhatsApp.';
            } else {
              whatsappStatus.error = 'WhatsApp notifications disabled for this business or receipt type';
            }
          }
        } else {
          if (!whatsappEnabled) {
            logger.debug('📱 [WhatsApp] WhatsApp not enabled at admin level');
            whatsappStatus.error = 'WhatsApp not enabled at admin level';
          } else if (!adminReceiptNotificationsEnabled) {
            logger.debug('📱 [WhatsApp] Receipt notifications not enabled at admin level');
            whatsappStatus.error = 'Receipt notifications not enabled at admin level';
          }
        }
      } else {
        logger.debug('📱 [WhatsApp] WhatsApp service not configured (enabled=false)');
        whatsappStatus.error = 'WhatsApp service not configured';
      }
    } catch (whatsappError) {
      logger.error('❌ [WhatsApp] Error in WhatsApp sending block:', whatsappError);
      logger.error('❌ [WhatsApp] Error stack:', whatsappError.stack);
      whatsappStatus.error = whatsappError.message;
      // Don't fail sale creation if WhatsApp fails
    }

    // Send SMS receipt for sale if enabled
    try {
      const smsService = require('./services/sms-service');
      const { canUseAddon, getEffectiveLimit } = require('./lib/entitlements');
      await smsService.initialize();
      if (smsService.enabled) {
        const databaseManager = require('./config/database-manager');
        const mainConnection = await databaseManager.getMainConnection();
        const AdminSettings = mainConnection.model('AdminSettings', require('./models/AdminSettings').schema);
        const Business = mainConnection.model('Business', require('./models/Business').schema);
        const adminSettings = await AdminSettings.getSettings();
        const smsEnabled = adminSettings?.notifications?.sms?.enabled === true && (adminSettings?.notifications?.sms?.provider === 'msg91' || !!(adminSettings?.notifications?.sms?.msg91AuthKey && String(adminSettings.notifications.sms.msg91AuthKey).trim()));
        if (smsEnabled) {
          let business = await Business.findById(req.user.branchId).lean();
          let canSendSms = canUseAddon(business, 'sms');
          if (!canSendSms) {
            const smsLimit = getEffectiveLimit(business, 'smsMessages');
            if (smsLimit > 0) {
              await Business.updateOne(
                { _id: business._id },
                { $set: { 'plan.addons.sms': { enabled: true, quota: smsLimit, used: business.plan?.addons?.sms?.used ?? 0 } } }
              );
              business = await Business.findById(req.user.branchId).lean();
              canSendSms = true;
            }
          }
          let useWalletForSaleSms = false;
          if (!canSendSms && canDeductSms(business)) {
            canSendSms = true;
            useWalletForSaleSms = true;
          }
          if (canSendSms) {
            const customerPhone = sale?.customerPhone || sale?.customerMobile;
            if (isWalkInSale) {
              logger.debug('📱 [SMS] Sale receipt skipped: Walk-in customer');
            } else if (!customerPhone) {
              logger.debug('📱 [SMS] Sale receipt skipped: no customer phone on bill (customerPhone/customerMobile)');
            }
            if (!isWalkInSale && customerPhone) {
              const saleForSms = savedSale || sale;
              const { Sale } = req.businessModels;
              const { buildSaleNotificationLinks } = require('./lib/feedback-link-helpers');
              const { receiptLink, feedbackLink } = await buildSaleNotificationLinks(
                Sale,
                business._id,
                saleForSms,
                'sms'
              );
              const result = await smsService.sendReceipt({
                to: customerPhone,
                clientName: sale.customerName || 'Customer',
                receiptNumber: sale.billNo,
                receiptData: { businessName: business?.name || 'Business', total: sale.netTotal || sale.grossTotal || 0 },
                receiptLink,
                feedbackLink,
              });
              if (result.success) {
                if (useWalletForSaleSms) {
                  await deductSms(business._id, {
                    description: 'SMS sale receipt',
                    relatedEntity: { id: savedSale?._id || sale?._id, type: 'Sale' },
                  });
                } else {
                  await Business.updateOne(
                    { _id: business._id },
                    { $inc: { 'plan.addons.sms.used': 1 } }
                  );
                }
                logger.debug('📱 [SMS] Sale receipt sent to', customerPhone);
              } else {
                logger.warn('📱 [SMS] Sale receipt failed:', result.error);
              }
              logSmsMessage({
                businessId: business?._id,
                recipientPhone: customerPhone,
                messageType: 'receipt',
                result,
                relatedEntityId: (savedSale || sale)?._id,
                relatedEntityType: 'Sale',
              });
            }
          }
        }
      }
    } catch (smsErr) {
      logger.error('Error sending sale receipt SMS:', smsErr);
    }
    
    logger.debug('📱 [WhatsApp] Final WhatsApp status:', whatsappStatus);
    }); // end setImmediate (fire-and-forget notifications)
  } catch (err) {
    logger.error('❌ Sales creation error:', err);
    logger.error('❌ Error details:', {
      message: err.message,
      name: err.name,
      stack: err.stack,
      validationErrors: err.errors
    });
    res.status(400).json({ 
      success: false, 
      error: err.message,
      details: err.errors || err.message
    });
  }
});

app.get('/api/sales/by-appointment/:appointmentId', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Sale } = req.businessModels;
    const mongoose = require('mongoose');
    const appointmentId = req.params.appointmentId;
    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.json({ success: true, data: null });
    }
    const sale = await Sale.findOne({ appointmentId: new mongoose.Types.ObjectId(appointmentId) }).lean();
    res.json({ success: true, data: sale || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/sales/:id', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Sale } = req.businessModels;
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });
    res.json({ success: true, data: sale });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/sales/:id', authenticateToken, setupBusinessDatabase, requirePermission('sales', 'edit'), async (req, res) => {
    const { Sale } = req.businessModels;
  
  // For standalone MongoDB, transactions are not supported
  // We'll proceed without transactions - operations will still work
  const session = null;
  const useTransactions = false;
  
  logger.debug('⚠️ Running PUT /api/sales/:id without transactions (standalone MongoDB)');

  try {
    const {
      Sale,
      Product,
      InventoryTransaction,
      BillEditHistory,
      BillArchive,
    } = req.businessModels;

    const saleId = req.params.id;
    const updateData = req.body || {};

    const existingSale = session 
      ? await Sale.findById(saleId).session(session)
      : await Sale.findById(saleId);
    if (!existingSale) {
      if (useTransactions && session) {
        await session.abortTransaction();
        session.endSession();
      }
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }

    const previousStatus = String(existingSale.status || '').toLowerCase();
    const oldPaidAmount = Number(existingSale.paymentStatus?.paidAmount || 0);
    const prevDiscount = Number(existingSale.discount || 0);
    const prevDiscountType = String(existingSale.discountType || '');

    // Archive original bill snapshot once per edit
    try {
      if (BillArchive) {
        await BillArchive.create(
          [
            {
              originalBill: existingSale.toObject(),
              billNo: existingSale.billNo,
              saleId: existingSale._id,
              archivedAt: new Date(),
              archivedBy: req.user?._id || req.user?.id || null,
              archivedByName: req.user?.name || req.user?.firstName || '',
              reason: updateData.editReason || 'Bill edited',
            },
          ],
          session ? { session } : {},
        );
      }
    } catch (archiveError) {
      logger.error('⚠️ Failed to archive original bill before edit:', archiveError);
    }

    // Ensure immutable fields are not changed
    const immutableFields = ['billNo', 'customerName', 'customerPhone', 'date', 'time', 'branchId', '_id', 'id'];
    immutableFields.forEach((field) => {
      if (field in updateData && String(updateData[field]) !== String(existingSale[field])) {
        updateData[field] = existingSale[field];
      }
    });

    const originalItems = existingSale.items || [];
    let updatedItems = Array.isArray(updateData.items) ? updateData.items : originalItems;
    // Preserve serviceId and variantKey; recalc staff contribution amounts (tax-exclusive)
    const mongooseSales = require('mongoose');
    const { getItemPreTaxTotal: getItemPreTaxForEdit } = require('./lib/sale-item-pretax');
    if (Array.isArray(updatedItems)) {
      updatedItems = updatedItems.map((item) => {
        const plain = item && typeof item.toObject === 'function' ? item.toObject() : { ...item };
        if (plain.type === 'service' && plain.serviceId && typeof plain.serviceId === 'string' && mongooseSales.Types.ObjectId.isValid(plain.serviceId)) {
          plain.serviceId = new mongooseSales.Types.ObjectId(plain.serviceId);
        }
        if (plain.type === 'prepaid_wallet' && plain.prepaidPlanId && typeof plain.prepaidPlanId === 'string' && mongooseSales.Types.ObjectId.isValid(plain.prepaidPlanId)) {
          plain.prepaidPlanId = new mongooseSales.Types.ObjectId(plain.prepaidPlanId);
        }
        if (plain.variantKey !== undefined) plain.variantKey = plain.variantKey || '';
        const linePreTax = getItemPreTaxForEdit(plain);
        if (plain.staffContributions && Array.isArray(plain.staffContributions)) {
          plain.staffContributions = plain.staffContributions.map((contribution) => ({
            ...contribution,
            amount: (linePreTax * (Number(contribution.percentage) || 0)) / 100,
          }));
        } else {
          const trimmedStaffId = plain.staffId != null ? String(plain.staffId).trim() : '';
          if (trimmedStaffId) {
            const nm = plain.staffName != null ? String(plain.staffName).trim() : '';
            plain.staffContributions = [{
              staffId: trimmedStaffId,
              staffName: nm || 'Staff',
              percentage: 100,
              amount: linePreTax,
            }];
          }
        }

        if (plain.type === 'service') {
          const lineSid = plain.staffId != null ? String(plain.staffId).trim() : '';
          const contribs = plain.staffContributions;
          if (
            lineSid &&
            mongooseSales.Types.ObjectId.isValid(lineSid) &&
            Array.isArray(contribs) &&
            contribs.length === 1
          ) {
            const c0 = contribs[0];
            const cSid = c0?.staffId != null ? String(c0.staffId).trim() : '';
            const pct = Number(c0?.percentage) || 100;
            if (pct === 100 && cSid && cSid !== lineSid) {
              const nm =
                (plain.staffName != null && String(plain.staffName).trim()) ||
                String(c0?.staffName || 'Staff').trim() ||
                'Staff';
              plain.staffContributions = [
                { staffId: lineSid, staffName: nm, percentage: 100, amount: linePreTax },
              ];
            }
          }
        }

        return plain;
      });
    }

    const existingAptIdNorm = normalizeClientAppointmentIdString(existingSale.appointmentId);
    if (existingAptIdNorm && mongooseSales.Types.ObjectId.isValid(existingAptIdNorm)) {
      const { Appointment: AppointmentPut } = req.businessModels;
      updatedItems = await annotateAppointmentLinkedSaleItemsLineSource(
        AppointmentPut,
        existingAptIdNorm,
        updatedItems,
      );
    } else if (Array.isArray(updatedItems)) {
      updatedItems = updatedItems.map((row) => {
        if (!row || typeof row !== 'object') return row;
        const { lineSource, ...rest } = row;
        return rest;
      });
    }

    // Compute per-product quantity differences between original and updated items
    const productDiffMap = new Map();
    const addToDiff = (productId, deltaQty, name) => {
      if (!productId || !deltaQty) return;
      const key = String(productId);
      const existing = productDiffMap.get(key) || { productId, quantityDelta: 0, name };
      existing.quantityDelta += deltaQty;
      productDiffMap.set(key, existing);
    };

    // Original items: treat as negative (we will add updated later)
    originalItems.forEach((item) => {
      if (item.type === 'product' && item.productId) {
        addToDiff(item.productId, -Number(item.quantity || 0), item.name);
      }
    });

    // Updated items: treat as positive
    updatedItems.forEach((item) => {
      if (item.type === 'product' && item.productId) {
        addToDiff(item.productId, Number(item.quantity || 0), item.name);
      }
    });

    const inventoryChangesForHistory = [];

    // Validate and apply inventory changes
    for (const diff of productDiffMap.values()) {
      const { productId, quantityDelta } = diff;
      if (!quantityDelta) continue;

      const product = session
        ? await Product.findById(productId).session(session)
        : await Product.findById(productId);
      if (!product) {
        // Product was deleted - allow keeping it in the bill but mark as unavailable
        // Don't fail the edit, but log a warning
        logger.warn(`⚠️ Product ${productId} (${diff.name}) not found - may have been deleted. Keeping in bill but cannot adjust inventory.`);
        // Skip inventory adjustment for deleted products
        continue;
      }

      // Check if product is active
      if (product.isActive === false) {
        logger.warn(`⚠️ Product ${product.name} is inactive. Proceeding with inventory adjustment.`);
      }

      const previousStock = Number(product.stock || 0);
      let newStock = previousStock;

      // quantityDelta > 0 means more units are now part of the bill (stock should decrease)
      // quantityDelta < 0 means fewer units than before (stock should increase)
      if (quantityDelta > 0) {
        if (previousStock < quantityDelta) {
          if (useTransactions && session) {
            await session.abortTransaction();
            session.endSession();
          }
          return res.status(400).json({
            success: false,
            error: `Insufficient stock for product ${product.name}. Available: ${previousStock}, Required additional: ${quantityDelta}`,
          });
        }
        newStock = previousStock - quantityDelta;
      } else if (quantityDelta < 0) {
        newStock = previousStock + Math.abs(quantityDelta);
      }

      product.stock = newStock;
      await product.save({ session });

      // Create inventory transaction to record the adjustment
      const transaction = new InventoryTransaction({
        productId: product._id,
        productName: product.name,
        transactionType: quantityDelta > 0 ? 'sale' : 'return',
        quantity: quantityDelta > 0 ? -quantityDelta : Math.abs(quantityDelta),
        previousStock,
        newStock,
        unitCost: product.price || 0,
        totalValue: Math.abs(quantityDelta * (product.price || 0)),
        referenceType: 'sale',
        referenceId: existingSale._id.toString(),
        referenceNumber: existingSale.billNo,
        processedBy: req.user?.name || req.user?.firstName || existingSale.staffName || 'System',
        reason: quantityDelta > 0 ? 'Bill edit - additional quantity sold' : 'Bill edit - quantity reduced/returned',
        notes: updateData.editReason || 'Bill edited',
        transactionDate: new Date(),
      });

      const savedTransaction = await transaction.save(session ? { session } : {});

      inventoryChangesForHistory.push({
        productId: product._id,
        quantityChange: quantityDelta,
        previousStock,
        newStock,
        transactionIds: [savedTransaction._id],
      });
    }

    const tipKeysTouched =
      'tip' in updateData ||
      'tipLines' in updateData ||
      'tipStaffId' in updateData ||
      'tipStaffName' in updateData;

    if (tipKeysTouched) {
      const { normalizeSaleTipPayload } = require('./lib/sale-tip-normalize');
      const { Staff: StaffForTipPut } = req.businessModels;
      const existingLines =
        Array.isArray(existingSale.tipLines) && existingSale.tipLines.length > 0
          ? existingSale.tipLines.map((l) => ({
              staffId: l.staffId,
              staffName: l.staffName,
              amount: l.amount,
            }))
          : [];
      const tipPayload = {
        tip: updateData.tip !== undefined ? updateData.tip : existingSale.tip,
        tipStaffId:
          updateData.tipStaffId !== undefined ? updateData.tipStaffId : existingSale.tipStaffId,
        tipStaffName:
          updateData.tipStaffName !== undefined ? updateData.tipStaffName : existingSale.tipStaffName,
        tipLines: updateData.tipLines !== undefined ? updateData.tipLines : existingLines,
      };
      await normalizeSaleTipPayload(tipPayload, StaffForTipPut || null);
      existingSale.tip = tipPayload.tip;
      existingSale.tipStaffId = tipPayload.tipStaffId;
      existingSale.tipStaffName = tipPayload.tipStaffName;
      existingSale.tipLines = tipPayload.tipLines;
      existingSale.markModified('tipLines');
    }

    // Update editable fields on the sale
    const editableRootFields = [
      'items',
      'netTotal',
      'taxAmount',
      'grossTotal',
      'discount',
      'discountType',
      'notes',
      'paymentStatus',
      // Allow changing how money was paid (cash/card/online) without altering amounts received
      'payments',
      'paymentMode',
      'status', // Allow updating status when payments change
      'staffName', // Header staff on bill; keeps sale in sync when invoice staff changes
      'loyaltyPointsRedeemed',
      'loyaltyDiscountAmount',
      'billChangeCreditedToWallet',
    ];

    editableRootFields.forEach((field) => {
      if (field in updateData) {
        if (field === 'paymentStatus') {
          // Only allow adjusting dueDate and totalAmount; keep paidAmount as is
          const currentPaymentStatus = existingSale.paymentStatus || {};
          const incoming = updateData.paymentStatus || {};
          // totalAmount = netTotal (grossTotal + tip) - use incoming when provided so tip removal is reflected
          const totalAmount = incoming.totalAmount != null
            ? Number(incoming.totalAmount)
            : Number(updateData.netTotal ?? updateData.grossTotal ?? currentPaymentStatus.totalAmount);
          existingSale.paymentStatus = {
            ...currentPaymentStatus,
            totalAmount,
            remainingAmount: totalAmount - Number(incoming.paidAmount ?? currentPaymentStatus.paidAmount ?? 0),
            dueDate: incoming.dueDate || currentPaymentStatus.dueDate,
          };
        } else if (field === 'items') {
          existingSale.items = updatedItems;
        } else if (field === 'payments') {
          // Explicitly handle payments array update
          logger.debug('💳 Updating payments array:', updateData.payments);
          if (Array.isArray(updateData.payments)) {
            existingSale.payments = updateData.payments;
            // Mark the array as modified for Mongoose to save it
            existingSale.markModified('payments');
            logger.debug('💳 Updated payments on sale:', existingSale.payments);
          }
        } else if (field === 'paymentMode') {
          // Explicitly handle paymentMode update
          logger.debug('💳 Updating paymentMode:', updateData.paymentMode);
          existingSale.paymentMode = updateData.paymentMode || '';
          logger.debug('💳 Updated paymentMode on sale:', existingSale.paymentMode);
        } else {
          existingSale[field] = updateData[field];
        }
      }
    });

    // Recalculate paidAmount from payments array if payments were updated
    if (updateData.payments && Array.isArray(updateData.payments)) {
      logger.debug('💰 Recalculating payment amounts from payments array:', updateData.payments);
      const newPaidAmount = updateData.payments.reduce((sum, payment) => {
        const amount = Number(payment.amount) || 0;
        logger.debug(`  - Payment: ${payment.mode || payment.type}, Amount: ${amount}`);
        return sum + amount;
      }, 0);
      
      logger.debug('💰 Calculated newPaidAmount:', newPaidAmount);
      // totalAmount = netTotal (grossTotal + tip) so tip removal is reflected
      const totalAmount = Number(updateData.netTotal ?? updateData.paymentStatus?.totalAmount ?? updateData.grossTotal ?? existingSale.paymentStatus?.totalAmount ?? existingSale.grossTotal ?? 0);
      logger.debug('💰 Total amount:', totalAmount);
      
      if (!existingSale.paymentStatus) {
        existingSale.paymentStatus = {
          totalAmount: totalAmount,
          paidAmount: newPaidAmount,
          remainingAmount: totalAmount - newPaidAmount,
          dueDate: new Date(),
        };
      } else {
        existingSale.paymentStatus.paidAmount = newPaidAmount;
        existingSale.paymentStatus.totalAmount = totalAmount;
        existingSale.paymentStatus.remainingAmount = totalAmount - newPaidAmount;
      }
      
      logger.debug('💰 Updated paymentStatus:', existingSale.paymentStatus);
      
      // Update status based on payment
      if (newPaidAmount === 0) {
        existingSale.status = 'unpaid';
      } else if (newPaidAmount >= totalAmount) {
        existingSale.status = 'completed';
      } else {
        existingSale.status = 'partial';
      }
      
      logger.debug('💰 Updated status:', existingSale.status);

      // Sync paymentHistory when payment collected via bill edit (so Dues Collected reflects it)
      if (newPaidAmount > oldPaidAmount) {
        const delta = newPaidAmount - oldPaidAmount;
        const lastPayment = updateData.payments[updateData.payments.length - 1];
        let method = (lastPayment?.mode || lastPayment?.type || 'Cash');
        const m = String(method).toLowerCase();
        if (m.includes('card')) method = 'Card';
        else if (m.includes('online') || m.includes('upi')) method = 'Online';
        else method = 'Cash';
        existingSale.paymentHistory = existingSale.paymentHistory || [];
        existingSale.paymentHistory.push({
          date: new Date(),
          amount: delta,
          method,
          notes: 'Payment collected via bill edit',
          collectedBy: req.user?.name || req.user?.firstName || 'Staff'
        });
        existingSale.paymentStatus.lastPaymentDate = new Date();
        existingSale.markModified('paymentHistory');
      }
    } else {
      // Ensure paymentStatus totalAmount matches grossTotal (when payments not updated)
      if (!existingSale.paymentStatus) {
        existingSale.paymentStatus = {
          totalAmount: Number(existingSale.grossTotal || 0),
          paidAmount: 0,
          remainingAmount: Number(existingSale.grossTotal || 0),
          dueDate: new Date(),
        };
      } else {
        existingSale.paymentStatus.totalAmount = Number(existingSale.grossTotal || existingSale.paymentStatus.totalAmount || 0);
      }
    }

    const rewardPointsSvcPut = require('./services/reward-points-service');
    const rpSettingsPut = await rewardPointsSvcPut.getMergedSettings(req.user.branchId);
    const mergedLoyaltyBody = {
      grossTotal:
        updateData.grossTotal != null ? Number(updateData.grossTotal) : Number(existingSale.grossTotal) || 0,
      loyaltyPointsRedeemed:
        updateData.loyaltyPointsRedeemed != null
          ? Number(updateData.loyaltyPointsRedeemed)
          : Number(existingSale.loyaltyPointsRedeemed) || 0,
      loyaltyDiscountAmount:
        updateData.loyaltyDiscountAmount != null
          ? Number(updateData.loyaltyDiscountAmount)
          : Number(existingSale.loyaltyDiscountAmount) || 0,
    };

    let billEditRefundResult = null;
    if (updateData.refundProcessing) {
      const billRefundSvc = require('./services/bill-refund-service');
      const tipAmount = Number(existingSale.tip) || 0;
      const newTotalAmount =
        Number(updateData.grossTotal ?? existingSale.grossTotal ?? 0) + tipAmount;
      const overpaidAmount = Math.max(
        0,
        Math.round((oldPaidAmount - newTotalAmount) * 100) / 100,
      );
      if (
        !Number.isFinite(Number(updateData.refundProcessing.amount)) ||
        Number(updateData.refundProcessing.amount) <= 0
      ) {
        updateData.refundProcessing.amount = overpaidAmount;
      }
      try {
        billEditRefundResult = await billRefundSvc.processBillEditRefund({
          sale: existingSale,
          refundProcessing: updateData.refundProcessing,
          newTotalAmount,
          previousPaidAmount: oldPaidAmount,
          branchId: req.user.branchId,
          businessModels: req.businessModels,
          staffUser: req.user,
        });
      } catch (refundErr) {
        logger.warn('[bill-refund] Failed:', refundErr?.message || refundErr);
        if (useTransactions && session) {
          try {
            await session.abortTransaction();
          } catch {
            /* ignore */
          }
        }
        if (session) session.endSession();
        return res.status(refundErr.status || 400).json({ success: false, error: refundErr.message });
      }
    }

    const {
      mergePaymentConfiguration: mergePayCfgPut,
      eligibleRedemptionSubtotal: eligibleRedemptionSubtotalPut,
      sumWalletPayments: sumWalletPaymentsPut,
    } = require('./lib/payment-redemption-eligibility');
    const { BusinessSettings: BizSettingsRedeemPut } = req.businessModels;
    let eligibleRewardPut = null;
    if (BizSettingsRedeemPut && !updateData.refundProcessing) {
      const payDocPut = await BizSettingsRedeemPut.findOne().select('paymentConfiguration').lean();
      const payCfgPut = mergePayCfgPut(payDocPut?.paymentConfiguration);
      const itemsForRedeemPut = Array.isArray(existingSale.items) ? existingSale.items : [];
      const mergedDiscountPut =
        updateData.discount != null ? Number(updateData.discount) : Number(existingSale.discount) || 0;
      const redeemOptsPut = { cartDiscountAmount: mergedDiscountPut };
      const eligibleWalletPut = eligibleRedemptionSubtotalPut(itemsForRedeemPut, payCfgPut, 'wallet', redeemOptsPut);
      eligibleRewardPut = eligibleRedemptionSubtotalPut(itemsForRedeemPut, payCfgPut, 'reward', redeemOptsPut);
      const walletPaidPut = sumWalletPaymentsPut(existingSale.payments);
      if (walletPaidPut > eligibleWalletPut + 0.02) {
        return res.status(400).json({
          success: false,
          error:
            'Wallet payment exceeds amount allowed for eligible bill lines (payment configuration).',
        });
      }
      if (payCfgPut.billingRedemption?.allowWalletAndPointsTogether === false) {
        const loyPutEx = Math.floor(Number(mergedLoyaltyBody.loyaltyPointsRedeemed) || 0);
        if (walletPaidPut > 0.02 && loyPutEx > 0) {
          return res.status(400).json({
            success: false,
            error:
              'Use only one of wallet or reward points on this bill (payment configuration).',
          });
        }
      }
    }

    try {
      if (!updateData.refundProcessing) {
        rewardPointsSvcPut.validateSaleLoyaltyBeforeSave(mergedLoyaltyBody, rpSettingsPut, eligibleRewardPut);
      }
    } catch (loyErr) {
      return res.status(loyErr.status || 400).json({ success: false, error: loyErr.message });
    }

    const beforeSnapshot = existingSale.toObject();

    // Mark bill as edited
    existingSale.isEdited = true;
    existingSale.editedAt = new Date();

    // Debug: Log what we're about to save
    logger.debug('💾 About to save sale with:', {
      billNo: existingSale.billNo,
      payments: existingSale.payments,
      paymentMode: existingSale.paymentMode,
      paymentStatus: existingSale.paymentStatus,
      status: existingSale.status
    });

    const savedSale = await existingSale.save(session ? { session } : {});
    
    // Debug: Log what was actually saved
    logger.debug('✅ Sale saved with:', {
      billNo: savedSale.billNo,
      payments: savedSale.payments,
      paymentMode: savedSale.paymentMode,
      paymentStatus: savedSale.paymentStatus,
      status: savedSale.status
    });

    // Mark linked appointment as completed if now fully paid
    if (savedSale.appointmentId && String(savedSale.status).toLowerCase() === 'completed') {
      const { Appointment } = req.businessModels;
      await markAppointmentCompleted(Appointment, savedSale.appointmentId, savedSale, req.businessModels);
      await syncCompletedLinkedAppointmentStaffFromSale(Appointment, savedSale);
    }

    const newStatus = String(savedSale.status || '').toLowerCase();
    if (newStatus === 'completed' && previousStatus !== 'completed') {
      try {
        const autoConsumption = require('./services/auto-consumption');
        await autoConsumption.runAutoConsumptionForSale(savedSale, req.businessModels, { user: req.user });
      } catch (autoConsumptionErr) {
        logger.error('Auto consumption on sale update failed:', autoConsumptionErr);
      }
    }
    if (newStatus === 'cancelled' && previousStatus === 'completed') {
      try {
        const autoConsumption = require('./services/auto-consumption');
        await autoConsumption.reverseConsumptionForBill(savedSale._id, req.businessModels);
      } catch (reversalErr) {
        logger.error('Auto consumption reversal on bill cancel failed:', reversalErr);
      }
      try {
        await rewardPointsSvcPut.reverseSaleLoyalty({
          sale: savedSale,
          branchId: req.user.branchId,
          businessModels: req.businessModels,
          userId: req.user._id,
        });
      } catch (rpRevErr) {
        logger.error('[reward-points] reverse on bill cancel failed:', rpRevErr);
      }
    }
    if (newStatus === 'completed' && previousStatus !== 'completed') {
      try {
        await rewardPointsSvcPut.processSaleCompletionLoyalty({
          savedSale,
          branchId: req.user.branchId,
          businessModels: req.businessModels,
          userId: req.user._id,
        });
      } catch (rpProcErr) {
        logger.error('[reward-points] process on bill completion (edit) failed:', rpProcErr);
      }
    }

    // Record edit history
    try {
      if (BillEditHistory) {
        await BillEditHistory.create(
          [
            {
              saleId: savedSale._id,
              billNo: savedSale.billNo,
              editedBy: req.user?._id || req.user?.id || null,
              editedByName: req.user?.name || req.user?.firstName || '',
              editDate: new Date(),
              editReason: updateData.editReason || 'Bill edited',
              changes: {
                before: beforeSnapshot,
                after: savedSale.toObject(),
                diff: {}, // For now we store full snapshots; diff can be computed later if needed
              },
              inventoryChanges: inventoryChangesForHistory,
              paymentAdjustments: {
                refundAmount: billEditRefundResult?.refundAmount ?? 0,
                additionalAmount: 0,
                refundMethods: billEditRefundResult?.refundMethods ?? [],
              },
            },
          ],
          session ? { session } : {},
        );
      }
    } catch (historyError) {
      logger.error('⚠️ Failed to record bill edit history:', historyError);
    }

    if (useTransactions && session) {
      await session.commitTransaction();
      session.endSession();
    } else if (session) {
      session.endSession();
    }

    scheduleActivityLog(
      {
        businessId: req.user.branchId,
        actorType: tenantActorTypeFromRole(req.user.role),
        actorId: req.user._id,
        action: ACTIVITY_ACTIONS.UPDATE_INVOICE,
        entity: 'sale',
        entityId: savedSale._id,
        summary: `Invoice ${savedSale.billNo || savedSale._id} updated`,
      },
      req
    );
    const newDisc = Number(savedSale.discount || 0);
    const newType = String(savedSale.discountType || '');
    if (prevDiscount !== newDisc || prevDiscountType !== newType) {
      scheduleActivityLog(
        {
          businessId: req.user.branchId,
          actorType: tenantActorTypeFromRole(req.user.role),
          actorId: req.user._id,
          action: ACTIVITY_ACTIONS.INVOICE_DISCOUNT_CHANGED,
          entity: 'sale',
          entityId: savedSale._id,
          summary: `Invoice ${savedSale.billNo || ''}: discount ${prevDiscount} (${prevDiscountType}) → ${newDisc} (${newType})`,
        },
        req
      );
    }

    res.json({ success: true, data: savedSale });
  } catch (err) {
    logger.error('❌ Error updating sale:', err);
    if (useTransactions && session) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    if (session) {
      session.endSession();
    }
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==================== AUTO CONSUMPTION (Service consumption rules & logs) ====================

// List consumption rules (by serviceId or all for branch)
app.get('/api/consumption-rules', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { ServiceConsumptionRule } = req.businessModels;
    const { serviceId } = req.query;
    const branchId = req.user.branchId;
    const query = { branchId };
    if (serviceId) query.serviceId = serviceId;
    const rules = await ServiceConsumptionRule.find(query).populate('productId', 'name baseUnit').populate('serviceId', 'name').lean();
    res.json({ success: true, data: rules });
  } catch (err) {
    logger.error('Error listing consumption rules:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create consumption rule
app.post('/api/consumption-rules', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { ServiceConsumptionRule, Product, Service } = req.businessModels;
    const branchId = req.user.branchId;
    const { serviceId, productId, quantityUsed, unit, isAdjustable, maxAdjustmentPercent, variantKey } = req.body;
    if (!serviceId || !productId || quantityUsed == null || !unit) {
      return res.status(400).json({ success: false, error: 'serviceId, productId, quantityUsed, and unit are required' });
    }
    const product = await Product.findById(productId);
    if (!product || String(product.branchId) !== String(branchId)) {
      return res.status(400).json({ success: false, error: 'Product not found or wrong branch' });
    }
    const service = await Service.findById(serviceId);
    if (!service || String(service.branchId) !== String(branchId)) {
      return res.status(400).json({ success: false, error: 'Service not found or wrong branch' });
    }
    const unitNorm = String(unit).toLowerCase();
    const allowedUnits = ['mg', 'g', 'kg', 'ml', 'l', 'oz', 'pcs', 'pkt'];
    if (!allowedUnits.includes(unitNorm)) {
      return res.status(400).json({ success: false, error: `unit must be one of: ${allowedUnits.join(', ')}` });
    }
    const rule = await ServiceConsumptionRule.create({
      serviceId,
      productId,
      quantityUsed: Number(quantityUsed),
      unit: unitNorm,
      isAdjustable: !!isAdjustable,
      maxAdjustmentPercent: maxAdjustmentPercent != null ? Number(maxAdjustmentPercent) : 20,
      variantKey: (variantKey || '').trim(),
      branchId
    });
    const populated = await ServiceConsumptionRule.findById(rule._id).populate('productId', 'name baseUnit').populate('serviceId', 'name').lean();
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    logger.error('Error creating consumption rule:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update consumption rule
app.put('/api/consumption-rules/:id', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { ServiceConsumptionRule, Product } = req.businessModels;
    const branchId = req.user.branchId;
    const rule = await ServiceConsumptionRule.findOne({ _id: req.params.id, branchId });
    if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });
    const { quantityUsed, unit, isAdjustable, maxAdjustmentPercent, variantKey } = req.body;
    if (quantityUsed != null) rule.quantityUsed = Number(quantityUsed);
    if (unit != null) {
      const unitNorm = String(unit).toLowerCase();
      const allowedUnits = ['mg', 'g', 'kg', 'ml', 'l', 'oz', 'pcs', 'pkt'];
      if (!allowedUnits.includes(unitNorm)) {
        return res.status(400).json({ success: false, error: `unit must be one of: ${allowedUnits.join(', ')}` });
      }
      rule.unit = unitNorm;
    }
    if (isAdjustable !== undefined) rule.isAdjustable = !!isAdjustable;
    if (maxAdjustmentPercent != null) rule.maxAdjustmentPercent = Number(maxAdjustmentPercent);
    if (variantKey !== undefined) rule.variantKey = (variantKey || '').trim();
    await rule.save();
    const populated = await ServiceConsumptionRule.findById(rule._id).populate('productId', 'name baseUnit').populate('serviceId', 'name').lean();
    res.json({ success: true, data: populated });
  } catch (err) {
    logger.error('Error updating consumption rule:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete consumption rule
app.delete('/api/consumption-rules/:id', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { ServiceConsumptionRule } = req.businessModels;
    const branchId = req.user.branchId;
    const rule = await ServiceConsumptionRule.findOneAndDelete({ _id: req.params.id, branchId });
    if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });
    res.json({ success: true });
  } catch (err) {
    logger.error('Error deleting consumption rule:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk create consumption rules for a service
app.post('/api/consumption-rules/bulk', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { ServiceConsumptionRule, Product, Service } = req.businessModels;
    const branchId = req.user.branchId;
    const { serviceId, rules } = req.body; // rules: [{ productId, quantityUsed, unit, isAdjustable?, maxAdjustmentPercent?, variantKey? }]
    if (!serviceId || !Array.isArray(rules) || rules.length === 0) {
      return res.status(400).json({ success: false, error: 'serviceId and non-empty rules array required' });
    }
    const service = await Service.findById(serviceId);
    if (!service || String(service.branchId) !== String(branchId)) {
      return res.status(400).json({ success: false, error: 'Service not found or wrong branch' });
    }
    const created = [];
    for (const r of rules) {
      const { productId, quantityUsed, unit, isAdjustable, maxAdjustmentPercent, variantKey } = r;
      if (!productId || quantityUsed == null || !unit) continue;
      const product = await Product.findById(productId);
      if (!product || String(product.branchId) !== String(branchId)) continue;
      const unitNorm = String(unit).toLowerCase();
      const allowedUnits = ['mg', 'g', 'kg', 'ml', 'l', 'oz', 'pcs', 'pkt'];
      if (!allowedUnits.includes(unitNorm)) continue;
      const rule = await ServiceConsumptionRule.create({
        serviceId,
        productId,
        quantityUsed: Number(quantityUsed),
        unit: unitNorm,
        isAdjustable: !!isAdjustable,
        maxAdjustmentPercent: maxAdjustmentPercent != null ? Number(maxAdjustmentPercent) : 20,
        variantKey: (variantKey || '').trim(),
        branchId
      });
      created.push(rule);
    }
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    logger.error('Error bulk creating consumption rules:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get inventory consumption logs (filtered)
app.get('/api/consumption-logs', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.ADVANCED_INVENTORY), async (req, res) => {
  try {
    const { InventoryConsumptionLog } = req.businessModels;
    const branchId = req.user.branchId;
    const { productId, serviceId, billId, fromDate, toDate, limit } = req.query;
    const query = { branchId };
    if (productId) query.productId = productId;
    if (serviceId) query.serviceId = serviceId;
    if (billId) query.billId = billId;
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }
    const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
    const logs = await InventoryConsumptionLog.find(query).sort({ createdAt: -1 }).limit(limitNum).populate('productId', 'name baseUnit').populate('serviceId', 'name').lean();
    res.json({ success: true, data: logs });
  } catch (err) {
    logger.error('Error listing consumption logs:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk client stats - aggregates totalVisits, totalSpent, lastVisit (batched $match to avoid huge $in arrays)
const BULK_STATS_PHONE_BATCH = 200;
const BULK_STATS_MAX_IDS = 8000;

const chunkArray = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

app.post('/api/clients/bulk-stats', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { clientIds } = req.body;
    if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
      return res.json({ success: true, data: {} });
    }

    const { Sale, Client } = req.businessModels;

    const uniqueIds = [...new Set(
      clientIds.map((id) => String(id || '').trim()).filter(Boolean),
    )].slice(0, BULK_STATS_MAX_IDS);

    const objectIds = uniqueIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (objectIds.length === 0) {
      return res.json({ success: true, data: {} });
    }

    const clients = await Client.find({ _id: { $in: objectIds } }).select('phone').lean();
    const phoneToClientId = {};
    const phones = [];
    for (const c of clients) {
      if (c.phone) {
        phoneToClientId[c.phone] = String(c._id);
        phones.push(c.phone);
      }
    }

    if (phones.length === 0) {
      return res.json({ success: true, data: {} });
    }

    const cancelledStatuses = ['cancelled', 'Cancelled'];
    const buildPipeline = (phoneBatch) => [
      {
        $match: {
          customerPhone: { $in: phoneBatch },
          status: { $nin: cancelledStatuses },
        },
      },
      {
        $group: {
          _id: '$customerPhone',
          totalVisits: { $sum: 1 },
          totalSpent: { $sum: { $ifNull: ['$grossTotal', 0] } },
          lastVisit: { $max: '$date' },
          totalDues: {
            $sum: {
              $cond: [
                { $gt: [{ $ifNull: ['$paymentStatus.remainingAmount', 0] }, 0] },
                { $ifNull: ['$paymentStatus.remainingAmount', 0] },
                0,
              ],
            },
          },
        },
      },
    ];

    const phoneBatches = chunkArray(phones, BULK_STATS_PHONE_BATCH);
    const statsParts = await Promise.all(
      phoneBatches.map((batch) =>
        Sale.aggregate(buildPipeline(batch)).option({ allowDiskUse: true }),
      ),
    );

    const result = {};
    for (const s of statsParts.flat()) {
      const clientId = phoneToClientId[s._id];
      if (clientId) {
        result[clientId] = {
          totalVisits: s.totalVisits,
          totalSpent: s.totalSpent,
          lastVisit: s.lastVisit,
          totalDues: s.totalDues || 0,
        };
      }
    }

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error fetching bulk client stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch client stats' });
  }
});

// Get sales by client phone (exact match only - avoids substring issues with names)
app.get('/api/sales/by-phone/:phone', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone || '').trim();
    
    if (!phone) {
      return res.json({ success: true, data: [], shared: false });
    }
    
    const { Sale } = req.businessModels;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const databaseManager = require('./config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const {
      resolveOwnerShareClientsContext,
    } = require('./lib/share-clients-across-branches');
    const { fetchSharedSalesByPhone } = require('./lib/client-shared-history');

    const shareCtx = await resolveOwnerShareClientsContext(mainConnection, req.user.branchId);
    if (shareCtx?.shareClientsAcrossBranches) {
      const sales = await fetchSharedSalesByPhone({
        mainConnection,
        ownerId: shareCtx.ownerId,
        currentBranchId: req.user.branchId,
        phone,
        limit,
      });
      return res.json({ success: true, data: sales, shared: true });
    }

    const { phoneMatchFilter } = require('./lib/client-shared-history');
    const filter = phoneMatchFilter(phone);
    const sales = filter
      ? await Sale.find(filter).sort({ date: -1 }).limit(limit).lean()
      : [];

    const local = sales.map((s) => ({
      ...s,
      branchId: String(req.user.branchId),
      isCurrentBranch: true,
    }));

    res.json({
      success: true,
      data: local,
      shared: false,
    });
  } catch (error) {
    logger.error('Error fetching sales by client phone:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch client sales'
    });
  }
});

// Get sales by bill number (includes archived/deleted bills so receipts show Cancelled, not missing)
app.get('/api/sales/bill/:billNo', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Sale, BillArchive } = req.businessModels;
    const billNo = req.params.billNo;
    const sale = await Sale.findOne({ billNo });
    if (sale) {
      return res.json({ success: true, data: sale });
    }
    if (!BillArchive) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }
    const arch = await BillArchive.findOne({ billNo }).sort({ archivedAt: -1 }).lean();
    if (!arch || !arch.originalBill) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }
    const ob = arch.originalBill;
    const merged = {
      ...ob,
      _id: arch._id,
      billNo: ob.billNo || billNo,
      status: 'cancelled',
      invoiceDeleted: true,
    };
    return res.json({ success: true, data: merged });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Public endpoint to get sale by bill number and share token (for SMS sharing)
app.get('/api/public/sales/bill/:billNo/:token', async (req, res) => {
  try {
    const { billNo, token } = req.params;
    
    if (!billNo || !token) {
      return res.status(400).json({ 
        success: false, 
        error: 'Bill number and token are required' 
      });
    }

    // Get main connection to iterate through businesses
    const databaseManager = require('./config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('./models/Business').schema);
    const modelFactory = require('./models/model-factory');
    
    // Include suspended tenants so customer receipt links keep working during billing grace.
    const businesses = await Business.find({ status: { $in: ['active', 'suspended'] } });
    
    // Search through each business database
    for (const business of businesses) {
      try {
        const businessDb = await databaseManager.getConnection(business._id, mainConnection);
        const businessModels = modelFactory.createBusinessModels(businessDb);
        const { Sale, BusinessSettings } = businessModels;
        
          // Find sale by billNo and shareToken
        const sale = await Sale.findOne({ 
          billNo: billNo,
          shareToken: token 
        });
        
        if (sale) {
          const { getFeedbackEligibilityForSale } = require('./lib/execute-public-feedback-submit');
          let feedbackEligibility;
          try {
            feedbackEligibility = await getFeedbackEligibilityForSale(businessModels, sale, {
              forInvoicePage: true,
            });
          } catch (feErr) {
            logger.warn('public sale feedback eligibility:', feErr?.message);
            feedbackEligibility = {
              completed: false,
              canSubmit: false,
              alreadySubmitted: false,
              allowResubmission: false,
              submittedRating: null,
            };
          }
          // Found the sale - get business settings
          let businessSettings = await BusinessSettings.findOne();
          if (!businessSettings) {
            // Use business info as fallback
            businessSettings = {
              name: business.name || 'Business',
              address: business.address?.street || '',
              city: business.address?.city || '',
              state: business.address?.state || '',
              zipCode: business.address?.zipCode || '',
              phone: business.contact?.phone || business.phone || '',
              email: business.contact?.email || business.email || '',
              logo: '',
              gstNumber: '',
              currency: 'INR',
              taxRate: 18
            };
          } else {
            // Convert to plain object and include business info
            businessSettings = businessSettings.toObject();
            businessSettings.name = businessSettings.name || business.name || 'Business';
            businessSettings.phone = businessSettings.phone || business.contact?.phone || business.phone || '';
            businessSettings.email = businessSettings.email || business.contact?.email || business.email || '';
          }

          // Custom receipt template only applies for plans that include the
          // `custom_receipt_templates` feature; otherwise drop it so the
          // receipt renders with the default layout.
          try {
            const { hasFeature } = require('./lib/entitlements');
            if (businessSettings.receiptTemplate && !hasFeature(business, 'custom_receipt_templates')) {
              delete businessSettings.receiptTemplate;
            }
          } catch (e) {
            // Be safe: if entitlement check fails, do not expose the template.
            if (businessSettings.receiptTemplate) delete businessSettings.receiptTemplate;
          }

          // Return sale with business settings
          return res.json({ 
            success: true, 
            data: sale,
            businessSettings: businessSettings,
            feedbackEligibility
          });
        }
      } catch (businessError) {
        // Continue searching other businesses if one fails
        logger.error(`Error searching business ${business.name}:`, businessError.message);
        continue;
      }
    }
    
    // Sale not found
    return res.status(404).json({ 
      success: false, 
      error: 'Receipt not found or invalid token' 
    });
  } catch (err) {
    logger.error('Error in public sale endpoint:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve receipt' 
    });
  }
});

const publicInvoiceFeedbackLimiter = require('express-rate-limit')({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many submissions. Please try again later.' },
});

// Public: submit feedback for a receipt (billNo + shareToken — same as invoice link)
app.post(
  '/api/public/sales/bill/:billNo/:token/feedback',
  publicInvoiceFeedbackLimiter,
  async (req, res) => {
    try {
      const { billNo, token } = req.params;
      if (!billNo || !token) {
        return res.status(400).json({ success: false, error: 'Bill number and token are required' });
      }

      const {
        sanitizeReviewText,
        normalizeFeedbackSource,
        executePublicFeedbackSubmit,
      } = require('./lib/execute-public-feedback-submit');

      const rating = Number(req.body?.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res
          .status(400)
          .json({ success: false, error: 'Rating must be between 1 and 5' });
      }

      const reviewText = sanitizeReviewText(req.body?.reviewText);
      const rawSource = req.body?.source;
      const source =
        rawSource != null && String(rawSource).trim() !== ''
          ? normalizeFeedbackSource(rawSource)
          : 'invoice_page';

      const databaseManager = require('./config/database-manager');
      const mainConnection = await databaseManager.getMainConnection();
      const Business = mainConnection.model('Business', require('./models/Business').schema);
      const modelFactory = require('./models/model-factory');
      const businesses = await Business.find({ status: { $in: ['active', 'suspended'] } });

      for (const business of businesses) {
        try {
          const businessDb = await databaseManager.getConnection(business._id, mainConnection);
          const businessModels = modelFactory.createBusinessModels(businessDb);
          const { Sale } = businessModels;
          const sale = await Sale.findOne({ billNo, shareToken: token });
          if (sale) {
            const result = await executePublicFeedbackSubmit({
              businessModels,
              tenantBusinessId: business._id,
              sale,
              rating,
              reviewText,
              source,
            });
            if (!result.success) {
              return res
                .status(result.status || 400)
                .json({ success: false, error: result.error });
            }
            return res.json({ success: true, data: result.data });
          }
        } catch (businessError) {
          logger.error(`Error in public invoice feedback for business ${business.name}:`, businessError.message);
          continue;
        }
      }

      return res.status(404).json({ success: false, error: 'Receipt not found or invalid token' });
    } catch (err) {
      logger.error('Error in public invoice feedback:', err);
      res.status(500).json({ success: false, error: 'Failed to submit feedback' });
    }
  }
);

const publicInvoiceFeedbackSuggestLimiter = require('express-rate-limit')({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

// Public: draft feedback comment from rating + receipt context (billNo + shareToken)
app.post(
  '/api/public/sales/bill/:billNo/:token/suggest-feedback',
  publicInvoiceFeedbackSuggestLimiter,
  async (req, res) => {
    try {
      const { billNo, token } = req.params;
      if (!billNo || !token) {
        return res.status(400).json({ success: false, error: 'Bill number and token are required' });
      }

      const { resolveSuggestedFeedbackComment } = require('./lib/suggest-public-feedback-comment');
      const { isCompletedSale } = require('./lib/execute-public-feedback-submit');

      const rating = Number(req.body?.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, error: 'Rating must be between 1 and 5' });
      }
      if (rating !== 5) {
        return res.status(400).json({
          success: false,
          error: 'AI draft suggestions are only available for 5-star ratings.',
        });
      }

      const { loadPastCompletedServiceNamesForClient } = require('./lib/collect-feedback-suggest-context');
      const databaseManager = require('./config/database-manager');
      const mainConnection = await databaseManager.getMainConnection();
      const Business = mainConnection.model('Business', require('./models/Business').schema);
      const modelFactory = require('./models/model-factory');
      const businesses = await Business.find({ status: { $in: ['active', 'suspended'] } });

      for (const business of businesses) {
        try {
          const businessDb = await databaseManager.getConnection(business._id, mainConnection);
          const businessModels = modelFactory.createBusinessModels(businessDb);
          const { Sale, BusinessSettings } = businessModels;
          const sale = await Sale.findOne({ billNo, shareToken: token }).lean();
          if (sale) {
            if (!isCompletedSale(sale)) {
              return res.status(400).json({
                success: false,
                error: 'Feedback is only available for completed visits.',
              });
            }
            const settings = await BusinessSettings.findOne().lean();
            const businessName = settings?.name || business.name || 'Salon';
            const itemNames = Array.isArray(sale.items)
              ? sale.items.map((it) => String(it.name || '').trim()).filter(Boolean).slice(0, 15)
              : [];

            let pastServiceNames = [];
            if (sale.customerId) {
              pastServiceNames = await loadPastCompletedServiceNamesForClient(Sale, {
                customerId: sale.customerId,
                excludeSaleId: sale._id,
              });
            }

            const { text, source } = await resolveSuggestedFeedbackComment({
              rating,
              businessName,
              itemNames,
              pastServiceNames,
            });

            return res.json({
              success: true,
              data: { text, source },
            });
          }
        } catch (businessError) {
          logger.error(
            `Error in public invoice feedback suggest for business ${business.name}:`,
            businessError.message
          );
          continue;
        }
      }

      return res.status(404).json({ success: false, error: 'Receipt not found or invalid token' });
    } catch (err) {
      logger.error('Error in public invoice feedback suggest:', err);
      res.status(500).json({ success: false, error: 'Failed to generate suggestion' });
    }
  }
);

// Add payment to a sale
app.post(
  '/api/sales/:id/payment',
  authenticateToken,
  setupBusinessDatabase,
  requireStaff,
  validateAll(
    [
      { schema: mongoIdParamSchema, source: 'params' },
      { schema: salePaymentBodySchema, source: 'body' },
    ]
  ),
  async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, method, notes, collectedBy } = req.body;
    const { Sale, Appointment } = req.businessModels;
    
    if (!amount || !method) {
      return res.status(400).json({ 
        success: false, 
        error: 'Amount and payment method are required' 
      });
    }
    
    const sale = await Sale.findById(id);
    if (!sale) {
      return res.status(404).json({ 
        success: false, 
        error: 'Sale not found' 
      });
    }
    
    // Validate payment amount
    if (amount > sale.paymentStatus.remainingAmount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Payment amount cannot exceed remaining balance' 
      });
    }
    
    // Add payment using the model method
    const paymentData = {
      date: new Date(),
      amount: parseFloat(amount),
      method,
      notes: notes || '',
      collectedBy: collectedBy || req.user.name || 'Staff'
    };
    
    const updatedSale = await sale.addPayment(paymentData);

    if (updatedSale.appointmentId && String(updatedSale.status).toLowerCase() === 'completed') {
      await markAppointmentCompleted(Appointment, updatedSale.appointmentId, updatedSale, req.businessModels);
      await syncCompletedLinkedAppointmentStaffFromSale(Appointment, updatedSale);
    }
    
    res.json({ 
      success: true, 
      data: updatedSale,
      message: `Payment of ₹${amount} collected successfully`,
      paymentSummary: updatedSale.getPaymentSummary()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get payment summary for a sale
app.get('/api/sales/:id/payment-summary', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { id } = req.params;
    const { Sale } = req.businessModels;
    const sale = await Sale.findById(id);
    
    if (!sale) {
      return res.status(404).json({ 
        success: false, 
        error: 'Sale not found' 
      });
    }
    
    res.json({ 
      success: true, 
      data: sale.getPaymentSummary(),
      paymentHistory: sale.paymentHistory
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Exchange products within a sale (bill)
app.post(
  '/api/sales/:id/exchange',
  authenticateToken,
  setupBusinessDatabase,
  requireStaff,
  validateAll(
    [
      { schema: mongoIdParamSchema, source: 'params' },
      { schema: saleExchangeBodySchema, source: 'body' },
    ]
  ),
  async (req, res) => {
  const { Sale } = req.businessModels;
  const session = await Sale.startSession();
  session.startTransaction();

  try {
    const {
      Product,
      InventoryTransaction,
      BillEditHistory,
      BillArchive,
    } = req.businessModels;

    const saleId = req.params.id;
    const payload = req.body || {};

    const existingSale = await Sale.findById(saleId).session(session);
    if (!existingSale) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }

    // Validation: Require edit reason for exchange
    if (!payload.editReason || payload.editReason.trim() === '') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: 'Exchange reason is required. Please provide a reason for this exchange.',
      });
    }

    // Validation: Check time limit for exchanges (configurable, default 30 days)
    const billDate = new Date(existingSale.date);
    const daysSinceBill = Math.floor((new Date().getTime() - billDate.getTime()) / (1000 * 60 * 60 * 24));
    const maxExchangeDays = 30; // Can be made configurable per business
    if (daysSinceBill > maxExchangeDays) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: `This bill is ${daysSinceBill} days old. Exchanges are only allowed within ${maxExchangeDays} days of purchase.`,
      });
    }

    let updatedItems = Array.isArray(payload.items) ? payload.items : [...(existingSale.items || [])];

    const { Appointment: AppointmentExchange } = req.businessModels;
    const exchangeAptIdNorm = normalizeClientAppointmentIdString(existingSale.appointmentId);
    if (exchangeAptIdNorm && mongoose.Types.ObjectId.isValid(exchangeAptIdNorm)) {
      updatedItems = await annotateAppointmentLinkedSaleItemsLineSource(
        AppointmentExchange,
        exchangeAptIdNorm,
        updatedItems,
      );
    } else {
      updatedItems = updatedItems.map((row) => {
        const plain = row && typeof row.toObject === 'function' ? row.toObject() : row;
        if (!plain || typeof plain !== 'object') return plain;
        const { lineSource, ...rest } = plain;
        return rest;
      });
    }

    // Archive original bill snapshot once per exchange
    try {
      if (BillArchive) {
        await BillArchive.create(
          [
            {
              originalBill: existingSale.toObject(),
              billNo: existingSale.billNo,
              saleId: existingSale._id,
              archivedAt: new Date(),
              archivedBy: req.user?._id || req.user?.id || null,
              archivedByName: req.user?.name || req.user?.firstName || '',
              reason: payload.editReason || 'Bill exchanged',
            },
          ],
          session ? { session } : {},
        );
      }
    } catch (archiveError) {
      logger.error('⚠️ Failed to archive original bill before exchange:', archiveError);
    }

    const originalItems = existingSale.items || [];

    // Compute product quantity differences
    const productDiffMap = new Map();
    const addToDiff = (productId, deltaQty, name) => {
      if (!productId || !deltaQty) return;
      const key = String(productId);
      const existing = productDiffMap.get(key) || { productId, quantityDelta: 0, name };
      existing.quantityDelta += deltaQty;
      productDiffMap.set(key, existing);
    };

    originalItems.forEach((item) => {
      if (item.type === 'product' && item.productId) {
        addToDiff(item.productId, -Number(item.quantity || 0), item.name);
      }
    });

    updatedItems.forEach((item) => {
      if (item.type === 'product' && item.productId) {
        addToDiff(item.productId, Number(item.quantity || 0), item.name);
      }
    });

    const inventoryChangesForHistory = [];

    for (const diff of productDiffMap.values()) {
      const { productId, quantityDelta } = diff;
      if (!quantityDelta) continue;

      const product = await Product.findById(productId).session(session);
      if (!product) {
        // Product was deleted - allow keeping it in the bill but mark as unavailable
        logger.warn(`⚠️ Product ${productId} (${diff.name}) not found during exchange - may have been deleted. Keeping in bill but cannot adjust inventory.`);
        // Skip inventory adjustment for deleted products
        continue;
      }

      // Check if product is active
      if (product.isActive === false) {
        logger.warn(`⚠️ Product ${product.name} is inactive during exchange. Proceeding with inventory adjustment.`);
      }

      const previousStock = Number(product.stock || 0);
      let newStock = previousStock;

      if (quantityDelta > 0) {
        if (previousStock < quantityDelta) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            error: `Insufficient stock for product ${product.name}. Available: ${previousStock}, Required additional: ${quantityDelta}`,
          });
        }
        newStock = previousStock - quantityDelta;
      } else if (quantityDelta < 0) {
        newStock = previousStock + Math.abs(quantityDelta);
      }

      product.stock = newStock;
      await product.save({ session });

      const transaction = new InventoryTransaction({
        productId: product._id,
        productName: product.name,
        transactionType: quantityDelta > 0 ? 'sale' : 'return',
        quantity: quantityDelta > 0 ? -quantityDelta : Math.abs(quantityDelta),
        previousStock,
        newStock,
        unitCost: product.price || 0,
        totalValue: Math.abs(quantityDelta * (product.price || 0)),
        referenceType: 'sale',
        referenceId: existingSale._id.toString(),
        referenceNumber: existingSale.billNo,
        processedBy: req.user?.name || req.user?.firstName || existingSale.staffName || 'System',
        reason: quantityDelta > 0 ? 'Bill exchange - additional quantity sold' : 'Bill exchange - quantity returned',
        notes: payload.editReason || 'Bill exchanged',
        transactionDate: new Date(),
      });

      const savedTransaction = await transaction.save(session ? { session } : {});

      inventoryChangesForHistory.push({
        productId: product._id,
        quantityChange: quantityDelta,
        previousStock,
        newStock,
        transactionIds: [savedTransaction._id],
      });
    }

    // Update sale with provided financials (frontend is responsible for recalculation)
    const beforeSnapshot = existingSale.toObject();

    existingSale.items = updatedItems;
    if (typeof payload.netTotal === 'number') existingSale.netTotal = payload.netTotal;
    if (typeof payload.taxAmount === 'number') existingSale.taxAmount = payload.taxAmount;
    if (typeof payload.grossTotal === 'number') existingSale.grossTotal = payload.grossTotal;
    if (typeof payload.discount === 'number') existingSale.discount = payload.discount;
    if (payload.discountType) existingSale.discountType = payload.discountType;
    if (payload.notes) existingSale.notes = payload.notes;

    if (!existingSale.paymentStatus) {
      existingSale.paymentStatus = {
        totalAmount: Number(existingSale.grossTotal || 0),
        paidAmount: 0,
        remainingAmount: Number(existingSale.grossTotal || 0),
        dueDate: new Date(),
      };
    } else {
      existingSale.paymentStatus.totalAmount = Number(existingSale.grossTotal || existingSale.paymentStatus.totalAmount || 0);
    }

    const savedSale = await existingSale.save(session ? { session } : {});

    try {
      if (BillEditHistory) {
        await BillEditHistory.create(
          [
            {
              saleId: savedSale._id,
              billNo: savedSale.billNo,
              editedBy: req.user?._id || req.user?.id || null,
              editedByName: req.user?.name || req.user?.firstName || '',
              editDate: new Date(),
              editReason: payload.editReason || 'Bill exchanged',
              changes: {
                before: beforeSnapshot,
                after: savedSale.toObject(),
                diff: {},
              },
              inventoryChanges: inventoryChangesForHistory,
              paymentAdjustments: {
                refundAmount: 0,
                additionalAmount: 0,
                refundMethods: [],
              },
            },
          ],
          session ? { session } : {},
        );
      }
    } catch (historyError) {
      logger.error('⚠️ Failed to record bill exchange history:', historyError);
    }

    await session.commitTransaction();
    session.endSession();

    try {
      const { Appointment } = req.businessModels;
      if (savedSale.appointmentId && String(savedSale.status || '').toLowerCase() === 'completed') {
        await syncCompletedLinkedAppointmentStaffFromSale(Appointment, savedSale);
      }
    } catch (syncErr) {
      logger.error('⚠️ Appointment staff sync after exchange failed:', syncErr);
    }

    res.json({ success: true, data: savedSale });
  } catch (err) {
    logger.error('❌ Error exchanging products in sale:', err);
    try {
      await session.abortTransaction();
    } catch {
      // ignore
    }
    session.endSession();
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get unpaid/overdue bills
app.get('/api/sales/unpaid/overdue', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;
    const { Sale } = req.businessModels;
    
    const unpaidBills = await Sale.find({
      status: { $in: ['unpaid', 'partial', 'overdue', 'Unpaid', 'Partial', 'Overdue'] }
    })
    .sort({ 'paymentStatus.dueDate': 1, date: -1 })
    .skip(skip)
    .limit(parseInt(limit));
    
    const total = await Sale.countDocuments({
      status: { $in: ['unpaid', 'partial', 'overdue', 'Unpaid', 'Partial', 'Overdue'] }
    });
    
    res.json({
      success: true,
      data: unpaidBills,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- EXPENSES API ---
app.get('/api/expenses', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { Expense } = req.businessModels;
    const { page = 1, limit = 100, search, dateFrom, dateTo, category, paymentMethod } = req.query;
    
    let query = {};
    
    // Search filter
    if (search) {
      query.$or = [
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Date range filter
    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = new Date(dateFrom);
      if (dateTo) query.date.$lte = new Date(dateTo);
    }
    
    // Category filter
    if (category && category !== 'all') {
      query.category = category;
    }
    
    // Payment method filter
    if (paymentMethod && paymentMethod !== 'all') {
      query.paymentMode = paymentMethod;
    }
    
    const skip = (page - 1) * limit;
    const expenses = await Expense.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Expense.countDocuments(query);
    
    res.json({
      success: true,
      data: expenses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post(
  '/api/expenses',
  authenticateToken,
  setupBusinessDatabase,
  requireStaff,
  validate(createExpenseBodySchema),
  async (req, res) => {
  try {
    const { Expense } = req.businessModels;
    const { category, paymentMode, description, amount, date, status, vendor, notes, approvedBy } = req.body;
    const expenseData = {
      category,
      paymentMode,
      description: (description || '').trim() || 'No description',
      amount: Number(amount),
      date: date ? new Date(date) : new Date(),
      status: status || 'pending',
      vendor: (vendor || '').trim(),
      notes: (notes || '').trim(),
      approvedBy: (approvedBy || '').trim(),
      createdBy: req.user._id || req.user.id,
      branchId: req.user.branchId
    };
    
    const expense = new Expense(expenseData);
    await expense.save();
    
    res.status(201).json({ success: true, data: expense });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/expenses/:id', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Expense } = req.businessModels;
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ success: false, error: 'Expense not found' });
    res.json({ success: true, data: expense });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put(
  '/api/expenses/:id',
  authenticateToken,
  setupBusinessDatabase,
  requireManager,
  validateAll(
    [
      { schema: mongoIdParamSchema, source: 'params' },
      { schema: updateExpenseBodySchema, source: 'body' },
    ]
  ),
  async (req, res) => {
  try {
    const { Expense } = req.businessModels;
    const expense = await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!expense) return res.status(404).json({ success: false, error: 'Expense not found' });
    res.json({ success: true, data: expense });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete(
  '/api/expenses/:id',
  authenticateToken,
  setupBusinessDatabase,
  requireManager,
  validate(mongoIdParamSchema, 'params'),
  async (req, res) => {
  try {
    const { Expense } = req.businessModels;
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) return res.status(404).json({ success: false, error: 'Expense not found' });
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const RECEIPT_PAPER_SIZES = ["57mm", "80mm", "A5", "A4"];

app.get("/api/settings/general", authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { BusinessSettings } = req.businessModels;
    let settings = await BusinessSettings.findOne();

    if (!settings) {
      settings = new BusinessSettings({ branchId: req.user.branchId });
      await settings.save();
    }

    res.json({
      success: true,
      data: {
        receiptPaperSize: settings.receiptPaperSize || "A4",
        timezone: "Asia/Kolkata",
      },
    });
  } catch (error) {
    logger.error("Get general settings error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

app.put("/api/settings/general", authenticateToken, setupBusinessDatabase, requirePermission('general_settings', 'edit'), async (req, res) => {
  try {
    const { receiptPaperSize } = req.body || {};
    const { BusinessSettings } = req.businessModels;

    if (!RECEIPT_PAPER_SIZES.includes(receiptPaperSize)) {
      return res.status(400).json({
        success: false,
        error: "Invalid receipt template. Choose 57mm, 80mm, A5, or A4.",
      });
    }

    let settings = await BusinessSettings.findOne();
    if (!settings) {
      settings = new BusinessSettings({ branchId: req.user.branchId });
    }

    settings.receiptPaperSize = receiptPaperSize;
    await settings.save();

    res.json({
      success: true,
      data: {
        receiptPaperSize: settings.receiptPaperSize,
        timezone: "Asia/Kolkata",
      },
      message: "General settings updated successfully",
    });
  } catch (error) {
    logger.error("Update general settings error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// --- BUSINESS SETTINGS API ---
app.get("/api/settings/business", authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    
    const { BusinessSettings } = req.businessModels;
    let settings = await BusinessSettings.findOne();
    
    if (!settings) {
      // Create default settings if none exist
      settings = new BusinessSettings({
        name: "Glamour Salon & Spa",
        email: "info@glamoursalon.com",
        phone: "(555) 123-4567",
        website: "www.glamoursalon.com",
        description: "Premium salon and spa services in the heart of the city",
        address: "123 Beauty Street",
        city: "New York",
        state: "NY",
        zipCode: "10001",
        receiptPrefix: "INV",
        invoicePrefix: "INV",
        receiptNumber: 1,
        autoIncrementReceipt: true,
        currency: "INR",
        taxRate: 8.25,
        processingFee: 2.9,
        enableCurrency: true,
        enableTax: true,
        enableProcessingFees: true,
        socialMedia: "@glamoursalon",
        branchId: req.user.branchId
      });
      await settings.save();
    }

    logger.debug('✅ Business settings found:', settings.name);
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    logger.error("Get business settings error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

app.put("/api/settings/business", authenticateToken, setupBusinessDatabase, requirePermission('general_settings', 'edit'), async (req, res) => {
  try {
    logger.debug('📝 Business settings update request received for user:', req.user?.email, 'branchId:', req.user?.branchId);
    logger.debug('📊 Request body size:', JSON.stringify(req.body).length, 'characters');
    
    const { BusinessSettings } = req.businessModels;
    const {
      name,
      email,
      phone,
      website,
      description,
      address,
      city,
      state,
      zipCode,
      googleMapsUrl,
      googleReviewUrl,
      allowFeedbackResubmission,
      socialMedia,
      logo,
      gstNumber,
      showGstOnClientReceipts,
    } = req.body;
    
    logger.debug('🖼️ Logo data length:', logo ? logo.length : 0, 'characters');
    logger.debug('🧾 GST Number:', gstNumber);

    // Validate required fields
    if (!name || !email || !phone || !address || !city || !state || !zipCode) {
      return res.status(400).json({
        success: false,
        error: "Required fields are missing"
      });
    }

    const mapsTrimmed = typeof googleMapsUrl === "string" ? googleMapsUrl.trim() : "";
    let mapsStored = mapsTrimmed;
    if (mapsTrimmed) {
      const isShortSlug = !mapsTrimmed.includes("://") && /^[a-zA-Z0-9_-]+$/.test(mapsTrimmed);
      if (isShortSlug) {
        mapsStored = `https://maps.app.goo.gl/${mapsTrimmed}`;
      } else {
        try {
          const u = new URL(mapsTrimmed);
          if (u.protocol !== "http:" && u.protocol !== "https:") {
            return res.status(400).json({
              success: false,
              error: "Google Maps URL must start with http:// or https://"
            });
          }
        } catch {
          return res.status(400).json({
            success: false,
            error: "Invalid Google Maps URL"
          });
        }
      }
    }

    let googleReviewStored = "";
    const reviewTrimmed =
      typeof googleReviewUrl === "string" ? googleReviewUrl.trim() : "";
    if (reviewTrimmed) {
      try {
        const u = new URL(reviewTrimmed);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          return res.status(400).json({
            success: false,
            error: "Google Review URL must start with http:// or https://"
          });
        }
        googleReviewStored = reviewTrimmed;
      } catch {
        return res.status(400).json({
          success: false,
          error: "Invalid Google Review URL"
        });
      }
    }

    let settings = await BusinessSettings.findOne();
    
    if (!settings) {
      settings = new BusinessSettings();
    }

    const prevLogo = settings.logo || '';

    // Update settings
    settings.name = name;
    settings.email = email;
    settings.phone = phone;
    settings.website = website || "";
    settings.description = description || "";
    settings.address = address;
    settings.city = city;
    settings.state = state;
    settings.zipCode = zipCode;
    settings.googleMapsUrl = mapsStored;
    settings.googleReviewUrl = googleReviewStored;
    settings.allowFeedbackResubmission =
      allowFeedbackResubmission === true || allowFeedbackResubmission === "true";
    settings.socialMedia = socialMedia || "@glamoursalon";
    settings.logo = logo || "";
    settings.gstNumber = gstNumber || "";
    if (typeof showGstOnClientReceipts === "boolean") {
      settings.receiptTemplate = settings.receiptTemplate || {};
      settings.receiptTemplate.showGstNumber = showGstOnClientReceipts;
      settings.markModified("receiptTemplate");
    }

    await settings.save();

    if (req.user?.branchId) {
      try {
        const mainConnection = await require('./config/database-manager').getMainConnection();
        const BusinessModel = mainConnection.model('Business', require('./models/Business').schema);
        await BusinessModel.findByIdAndUpdate(req.user.branchId, {
          $set: { 'settings.gstNumber': settings.gstNumber || '' },
        });
      } catch (syncErr) {
        logger.warn('Failed to sync GST number to main business record:', syncErr.message);
      }
    }

    const newLogo = settings.logo || '';
    if (prevLogo !== newLogo) {
      if (!newLogo) {
        scheduleActivityLog(
          {
            businessId: req.user.branchId,
            actorType: tenantActorTypeFromRole(req.user.role),
            actorId: req.user._id,
            action: ACTIVITY_ACTIONS.BUSINESS_LOGO_REMOVED,
            entity: 'business_settings',
            summary: 'Business logo removed',
          },
          req
        );
      } else {
        scheduleActivityLog(
          {
            businessId: req.user.branchId,
            actorType: tenantActorTypeFromRole(req.user.role),
            actorId: req.user._id,
            action: ACTIVITY_ACTIONS.BUSINESS_LOGO_UPDATED,
            entity: 'business_settings',
            summary: 'Business logo updated',
          },
          req
        );
      }
    }

    logger.debug('✅ Business settings updated for:', settings.name);
    res.json({
      success: true,
      data: settings,
      message: "Business settings updated successfully"
    });
  } catch (error) {
    logger.error("❌ Update business settings error:", error);
    logger.error("❌ Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message
    });
  }
});

// Test endpoint to check authentication
app.get("/api/test-auth", authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: "Authentication working",
    user: {
      id: req.user._id,
      email: req.user.email,
      branchId: req.user.branchId,
      role: req.user.role
    }
  });
});

// Test endpoint to check business database setup
app.get("/api/test-business-db", authenticateToken, setupBusinessDatabase, (req, res) => {
  res.json({
    success: true,
    message: "Business database setup working",
    user: {
      id: req.user._id,
      email: req.user.email,
      branchId: req.user.branchId,
      role: req.user.role
    },
    businessModels: Object.keys(req.businessModels || {})
  });
});

// Test endpoint to verify logging is working
app.post("/api/test-increment", authenticateToken, async (req, res) => {
  logger.debug('🧪 ===== TEST INCREMENT ENDPOINT CALLED =====');
  logger.debug('🧪 User:', req.user);
  res.json({ success: true, message: "Test endpoint working", user: req.user });
});

// API to increment receipt number atomically
app.post("/api/settings/business/increment-receipt", authenticateToken, async (req, res) => {
  try {
    const businessId = req.user?.branchId;
    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID not found in user data'
      });
    }

    let businessConnection;
    try {
      const mainConnection = await databaseManager.getMainConnection();
      businessConnection = await databaseManager.getConnection(businessId, mainConnection);
    } catch (connectionError) {
      logger.error('❌ Error getting business connection:', connectionError);
      return res.status(500).json({
        success: false,
        error: 'Failed to connect to business database',
        details: connectionError.message
      });
    }

    let businessModels;
    try {
      businessModels = modelFactory.createBusinessModels(businessConnection);
    } catch (modelsError) {
      logger.error('❌ Error creating business models:', modelsError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create business models',
        details: modelsError.message
      });
    }

    const { BusinessSettings, Sale } = businessModels;
    
    if (!BusinessSettings) {
      return res.status(500).json({
        success: false,
        error: 'BusinessSettings model not available'
      });
    }
    
    let settings = await BusinessSettings.findOne();
    if (!settings) {
      settings = new BusinessSettings({
        branchId: businessId,
        receiptNumber: 0
      });
      try {
        await settings.save();
      } catch (createError) {
        logger.error('❌ Error creating settings:', createError);
        return res.status(500).json({
          success: false,
          error: 'Failed to create business settings',
          details: createError.message
        });
      }
    } else if (!settings.branchId) {
      settings.branchId = businessId;
      await settings.save();
    }

    // Use findOneAndUpdate with $inc for atomic increment
    const updatedSettings = await BusinessSettings.findOneAndUpdate(
      { _id: settings._id },
      { $inc: { receiptNumber: 1 } },
      { new: true } // Return the updated document
    );

    if (!updatedSettings) {
      logger.error('❌ Failed to atomically increment receipt number');
      return res.status(500).json({
        success: false,
        error: 'Failed to increment receipt number'
      });
    }

    const newReceiptNumber = updatedSettings.receiptNumber;

    const prefix = updatedSettings.invoicePrefix || updatedSettings.receiptPrefix || "INV";
    let formattedReceiptNumber = `${prefix}-${newReceiptNumber.toString().padStart(6, '0')}`;

    let existingSale = await Sale.findOne({ billNo: formattedReceiptNumber });

    if (existingSale) {
      // If duplicate exists, find the next available number
      let nextNumber = newReceiptNumber + 1;
      let nextFormattedNumber = `${prefix}-${nextNumber.toString().padStart(6, '0')}`;

      // Set a reasonable limit to prevent infinite loops
      let attempts = 0;
      const maxAttempts = 1000;

      while (attempts < maxAttempts && await Sale.findOne({ billNo: nextFormattedNumber })) {
        nextNumber++;
        nextFormattedNumber = `${prefix}-${nextNumber.toString().padStart(6, '0')}`;
        attempts++;
      }

      if (attempts >= maxAttempts) {
        logger.error('❌ Could not find available receipt number after', maxAttempts, 'attempts');
        return res.status(500).json({
          success: false,
          error: 'Could not find available receipt number. Please contact support.'
        });
      }

      // Update to the next available number
      await BusinessSettings.findOneAndUpdate(
        { _id: settings._id },
        { receiptNumber: nextNumber }
      );

      formattedReceiptNumber = nextFormattedNumber;
    }

    // Extract the final number from the formatted receipt number
    const finalReceiptNumber = parseInt(formattedReceiptNumber.split('-').pop() || '0');

    res.json({
      success: true,
      data: { 
        receiptNumber: finalReceiptNumber,
        formattedReceiptNumber: formattedReceiptNumber
      },
      message: "Receipt number incremented successfully"
    });
  } catch (error) {
    logger.error("❌ Increment receipt number error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message
    });
  }
});

// POS Settings API
app.get("/api/settings/pos", authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { BusinessSettings } = req.businessModels;
    let settings = await BusinessSettings.findOne();
    
    if (!settings) {
      return res.status(404).json({
        success: false,
        error: "Business settings not found"
      });
    }

    logger.debug('=== POS SETTINGS DEBUG ===')
    logger.debug('Full settings object:', settings)
    logger.debug('settings.invoicePrefix:', settings.invoicePrefix)
    logger.debug('settings.receiptPrefix:', settings.receiptPrefix)
    logger.debug('settings.receiptNumber:', settings.receiptNumber)

    // Return the NEXT receipt number (current + 1) for display
    const nextReceiptNumber = (settings.receiptNumber || 0) + 1;

    res.json({
      success: true,
      data: {
        invoicePrefix: settings.invoicePrefix || "INV",
        receiptNumber: nextReceiptNumber,
        autoResetReceipt: settings.autoResetReceipt || false
      }
    });
  } catch (error) {
    logger.error("Get POS settings error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

app.put("/api/settings/pos", authenticateToken, setupBusinessDatabase, requirePermission('pos_settings', 'edit'), async (req, res) => {
  try {
    const { invoicePrefix, autoResetReceipt } = req.body;

    logger.debug('=== UPDATE POS SETTINGS DEBUG ===')
    logger.debug('Request body:', req.body)
    logger.debug('invoicePrefix from request:', invoicePrefix)
    logger.debug('autoResetReceipt from request:', autoResetReceipt)

    const { BusinessSettings } = req.businessModels;
    let settings = await BusinessSettings.findOne();
    
    if (!settings) {
      return res.status(404).json({
        success: false,
        error: "Business settings not found"
      });
    }

    logger.debug('Settings before update:', {
      invoicePrefix: settings.invoicePrefix,
      receiptPrefix: settings.receiptPrefix,
      receiptNumber: settings.receiptNumber
    })

    // Update POS settings
    settings.invoicePrefix = invoicePrefix || "INV";
    settings.autoResetReceipt = autoResetReceipt || false;

    await settings.save();

    logger.debug('Settings after update:', {
      invoicePrefix: settings.invoicePrefix,
      receiptPrefix: settings.receiptPrefix,
      receiptNumber: settings.receiptNumber
    })

    res.json({
      success: true,
      data: settings,
      message: "POS settings updated successfully"
    });
  } catch (error) {
    logger.error("Update POS settings error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

// Custom Receipt Template settings (gated by the `custom_receipt_templates`
// plan feature). Controls receipt header/footer copy and optional sections.
const RECEIPT_TEMPLATE_DEFAULTS = {
  headerText: "",
  footerText: "",
  showLogo: true,
  showGstNumber: true,
  showStaffName: true,
  showClientInfo: true,
  accentColor: "",
};

app.get("/api/settings/receipt-template", authenticateToken, setupBusinessDatabase, requirePermission('pos_settings', 'view'), gate(FEATURE.CUSTOM_RECEIPT_TEMPLATES), async (req, res) => {
  try {
    const { BusinessSettings } = req.businessModels;
    const settings = await BusinessSettings.findOne();
    const template = (settings && settings.receiptTemplate) || {};
    res.json({
      success: true,
      data: { ...RECEIPT_TEMPLATE_DEFAULTS, ...(template.toObject ? template.toObject() : template) },
    });
  } catch (error) {
    logger.error("Get receipt template error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

app.put("/api/settings/receipt-template", authenticateToken, setupBusinessDatabase, requirePermission('pos_settings', 'edit'), gate(FEATURE.CUSTOM_RECEIPT_TEMPLATES), async (req, res) => {
  try {
    const { BusinessSettings } = req.businessModels;
    const settings = await BusinessSettings.findOne();
    if (!settings) {
      return res.status(404).json({ success: false, error: "Business settings not found" });
    }

    const body = req.body || {};
    const next = { ...RECEIPT_TEMPLATE_DEFAULTS, ...(settings.receiptTemplate || {}) };
    if (typeof body.headerText === "string") next.headerText = body.headerText.slice(0, 500);
    if (typeof body.footerText === "string") next.footerText = body.footerText.slice(0, 500);
    if (typeof body.showLogo === "boolean") next.showLogo = body.showLogo;
    if (typeof body.showGstNumber === "boolean") next.showGstNumber = body.showGstNumber;
    if (typeof body.showStaffName === "boolean") next.showStaffName = body.showStaffName;
    if (typeof body.showClientInfo === "boolean") next.showClientInfo = body.showClientInfo;
    if (typeof body.accentColor === "string") next.accentColor = body.accentColor.slice(0, 32);

    settings.receiptTemplate = next;
    await settings.save();

    res.json({ success: true, data: next, message: "Receipt template updated successfully" });
  } catch (error) {
    logger.error("Update receipt template error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

app.post("/api/settings/pos/reset-sequence", authenticateToken, setupBusinessDatabase, requirePermission('pos_settings', 'manage'), async (req, res) => {
  try {
    const { BusinessSettings } = req.businessModels;
    let settings = await BusinessSettings.findOne();
    
    if (!settings) {
      return res.status(404).json({
        success: false,
        error: "Business settings not found"
      });
    }

    // Reset receipt number to 0 (so next bill will be 1)
    settings.receiptNumber = 0;
    await settings.save();

    res.json({
      success: true,
      data: { receiptNumber: settings.receiptNumber },
      message: "Receipt sequence reset successfully. Next receipt will be 1."
    });
  } catch (error) {
    logger.error("Reset receipt sequence error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

// --- PAYMENT SETTINGS API ---
app.get("/api/settings/payment", authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { BusinessSettings } = req.businessModels;
    let settings = await BusinessSettings.findOne();
    
    // If no settings exist, create default settings
    if (!settings) {
      logger.debug("📝 No business settings found, creating default settings...");
      const branchId = req.user?.branchId;
      
      if (!branchId) {
        return res.status(400).json({
          success: false,
          error: "Business ID not found in user data"
        });
      }
      
      settings = new BusinessSettings({
        name: "EaseMySalon",
        email: req.user?.email || "info@easemysalon.in",
        phone: "",
        website: "",
        description: "",
        address: "",
        city: "",
        state: "",
        zipCode: "",
        receiptPrefix: "INV",
        invoicePrefix: "INV",
        receiptNumber: 1,
        autoIncrementReceipt: true,
        currency: "INR",
        taxRate: 8.25,
        processingFee: 2.9,
        enableCurrency: true,
        enableTax: true,
        enableProcessingFees: true,
        taxType: "gst",
        cgstRate: 9,
        sgstRate: 9,
        igstRate: 18,
        serviceTaxRate: 5,
        membershipTaxRate: 5,
        packageTaxRate: 5,
        prepaidWalletTaxRate: 5,
        productTaxRate: 18,
        essentialProductRate: 5,
        intermediateProductRate: 12,
        standardProductRate: 18,
        luxuryProductRate: 28,
        exemptProductRate: 0,
        taxCategories: [
          { id: "essential", name: "Essential Products", rate: 5 },
          { id: "intermediate", name: "Intermediate Products", rate: 12 },
          { id: "standard", name: "Standard Products", rate: 18 },
          { id: "luxury", name: "Luxury Products", rate: 28 },
          { id: "exempt", name: "Exempt Products", rate: 0 }
        ],
        socialMedia: "",
        logo: "",
        gstNumber: "",
        autoResetReceipt: false,
        resetFrequency: "monthly",
        branchId: branchId,
        paymentConfiguration: require('./lib/payment-redemption-eligibility').mergePaymentConfiguration(null),
      });
      await settings.save();
      logger.debug("✅ Default business settings created");
    }

    const { mergePaymentConfiguration } = require('./lib/payment-redemption-eligibility');
    const paymentConfigurationMerged = mergePaymentConfiguration(settings.paymentConfiguration);

    // Build tax categories array from settings
    let taxCategories = []
    if (settings.taxCategories && Array.isArray(settings.taxCategories) && settings.taxCategories.length > 0) {
      taxCategories = settings.taxCategories
    } else {
      // Fallback: Create categories from individual rate fields (backward compatibility)
      if (settings.essentialProductRate !== undefined) {
        taxCategories.push({ id: "essential", name: "Essential Products", rate: settings.essentialProductRate || 5 })
      }
      if (settings.intermediateProductRate !== undefined) {
        taxCategories.push({ id: "intermediate", name: "Intermediate Products", rate: settings.intermediateProductRate || 12 })
      }
      if (settings.standardProductRate !== undefined) {
        taxCategories.push({ id: "standard", name: "Standard Products", rate: settings.standardProductRate || 18 })
      }
      if (settings.luxuryProductRate !== undefined) {
        taxCategories.push({ id: "luxury", name: "Luxury Products", rate: settings.luxuryProductRate || 28 })
      }
      if (settings.exemptProductRate !== undefined) {
        taxCategories.push({ id: "exempt", name: "Exempt Products", rate: settings.exemptProductRate || 0 })
      }
      
      // If still no categories, use defaults
      if (taxCategories.length === 0) {
        taxCategories = [
          { id: "essential", name: "Essential Products", rate: 5 },
          { id: "intermediate", name: "Intermediate Products", rate: 12 },
          { id: "standard", name: "Standard Products", rate: 18 },
          { id: "luxury", name: "Luxury Products", rate: 28 },
          { id: "exempt", name: "Exempt Products", rate: 0 }
        ]
      }
    }

    res.json({
      success: true,
      data: {
        currency: settings.currency || "INR",
        taxRate: settings.taxRate || 8.25,
        processingFee: settings.processingFee || 2.9,
        enableCurrency: settings.enableCurrency !== false,
        enableTax: settings.enableTax !== false,
        enableProcessingFees: settings.enableProcessingFees !== false,
        taxType: settings.taxType || "gst",
        cgstRate: settings.cgstRate || 9,
        sgstRate: settings.sgstRate || 9,
        igstRate: settings.igstRate || 18,
        serviceTaxRate: settings.serviceTaxRate || 5,
        membershipTaxRate: settings.membershipTaxRate ?? settings.serviceTaxRate ?? 5,
        packageTaxRate: settings.packageTaxRate ?? settings.serviceTaxRate ?? 5,
        prepaidWalletTaxRate: settings.prepaidWalletTaxRate ?? settings.serviceTaxRate ?? 5,
        productTaxRate: settings.productTaxRate || 18,
        essentialProductRate: settings.essentialProductRate || 5,
        intermediateProductRate: settings.intermediateProductRate || 12,
        standardProductRate: settings.standardProductRate || 18,
        luxuryProductRate: settings.luxuryProductRate || 28,
        exemptProductRate: settings.exemptProductRate || 0,
        taxCategories: taxCategories,
        priceInclusiveOfTax: settings.priceInclusiveOfTax !== false,
        paymentConfiguration: paymentConfigurationMerged,
      }
    });
  } catch (error) {
    logger.error("Get payment settings error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

app.put("/api/settings/payment", authenticateToken, setupBusinessDatabase, requirePermission('payment_settings', 'edit'), async (req, res) => {
  try {
    const { 
      currency, 
      taxRate, 
      processingFee, 
      enableCurrency, 
      enableTax, 
      enableProcessingFees,
      taxType,
      cgstRate,
      sgstRate,
      igstRate,
      serviceTaxRate,
      membershipTaxRate,
      packageTaxRate,
      prepaidWalletTaxRate,
      productTaxRate,
      essentialProductRate,
      intermediateProductRate,
      standardProductRate,
      luxuryProductRate,
      exemptProductRate,
      taxCategories,
      priceInclusiveOfTax,
      paymentConfiguration,
    } = req.body;
    const { BusinessSettings } = req.businessModels;

    let settings = await BusinessSettings.findOne();
    
    if (!settings) {
      return res.status(404).json({
        success: false,
        error: "Business settings not found"
      });
    }

    const { mergePaymentConfiguration: mergePayCfg } = require('./lib/payment-redemption-eligibility');

    // Update payment settings
    if (currency !== undefined) settings.currency = currency;
    if (taxRate !== undefined) settings.taxRate = taxRate;
    if (processingFee !== undefined) settings.processingFee = processingFee;
    if (enableCurrency !== undefined) settings.enableCurrency = enableCurrency;
    if (enableTax !== undefined) settings.enableTax = enableTax;
    if (enableProcessingFees !== undefined) settings.enableProcessingFees = enableProcessingFees;
    
    // Update tax settings
    if (taxType !== undefined) settings.taxType = taxType;
    if (cgstRate !== undefined) settings.cgstRate = cgstRate;
    if (sgstRate !== undefined) settings.sgstRate = sgstRate;
    if (igstRate !== undefined) settings.igstRate = igstRate;
    if (serviceTaxRate !== undefined) settings.serviceTaxRate = serviceTaxRate;
    if (membershipTaxRate !== undefined) settings.membershipTaxRate = membershipTaxRate;
    if (packageTaxRate !== undefined) settings.packageTaxRate = packageTaxRate;
    if (prepaidWalletTaxRate !== undefined) settings.prepaidWalletTaxRate = prepaidWalletTaxRate;
    if (productTaxRate !== undefined) settings.productTaxRate = productTaxRate;
    if (essentialProductRate !== undefined) settings.essentialProductRate = essentialProductRate;
    if (intermediateProductRate !== undefined) settings.intermediateProductRate = intermediateProductRate;
    if (standardProductRate !== undefined) settings.standardProductRate = standardProductRate;
    if (luxuryProductRate !== undefined) settings.luxuryProductRate = luxuryProductRate;
    if (exemptProductRate !== undefined) settings.exemptProductRate = exemptProductRate;
    if (taxCategories !== undefined && Array.isArray(taxCategories)) {
      settings.taxCategories = taxCategories;
    }
    if (priceInclusiveOfTax !== undefined) settings.priceInclusiveOfTax = priceInclusiveOfTax;
    if (paymentConfiguration !== undefined && paymentConfiguration !== null && typeof paymentConfiguration === 'object') {
      const existingPayCfg = mergePayCfg(settings.paymentConfiguration);
      settings.paymentConfiguration = mergePayCfg({
        ...existingPayCfg,
        ...paymentConfiguration,
        walletRedemption: {
          ...existingPayCfg.walletRedemption,
          ...(paymentConfiguration.walletRedemption || {}),
        },
        rewardPointRedemption: {
          ...existingPayCfg.rewardPointRedemption,
          ...(paymentConfiguration.rewardPointRedemption || {}),
        },
        billingRedemption: {
          ...existingPayCfg.billingRedemption,
          ...(paymentConfiguration.billingRedemption || {}),
        },
      });
      settings.markModified('paymentConfiguration');
    }

    await settings.save();

    res.json({
      success: true,
      data: {
        ...settings.toObject(),
        paymentConfiguration: mergePayCfg(settings.paymentConfiguration),
      },
      message: "Payment settings updated successfully"
    });
  } catch (error) {
    logger.error("Update payment settings error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

app.delete('/api/sales/:id', authenticateToken, setupBusinessDatabase, requirePermission('sales', 'delete'), async (req, res) => {
  // For standalone MongoDB, transactions are not supported
  // We'll proceed without transactions - operations will still work
  // All operations will execute individually without atomic rollback
  const session = null;
  const useTransactions = false;
  
  logger.debug('⚠️ Running DELETE without transactions (standalone MongoDB)');

  try {
    const {
      Sale,
      Product,
      InventoryTransaction,
      BillArchive,
      MembershipSubscription,
    } = req.businessModels;

    const saleId = req.params.id;
    logger.debug(`🗑️ DELETE /api/sales/${saleId} - Starting deletion process`);
    const sale = session
      ? await Sale.findById(saleId).session(session)
      : await Sale.findById(saleId);
    if (!sale) {
      logger.error(`❌ Sale not found: ${saleId}`);
      if (useTransactions && session) {
        await session.abortTransaction();
        session.endSession();
      }
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }
    logger.debug(`✅ Sale found: ${sale.billNo}, items count: ${sale.items?.length || 0}`);

    if (String(sale.status || '').toLowerCase() === 'completed' && sale.customerId) {
      try {
        const rewardPointsSvcDel = require('./services/reward-points-service');
        await rewardPointsSvcDel.reverseSaleLoyalty({
          sale,
          branchId: req.user.branchId,
          businessModels: req.businessModels,
          userId: req.user._id,
        });
      } catch (rpDelErr) {
        logger.error('[reward-points] reverse on bill delete failed:', rpDelErr);
      }
    }

    // Archive bill before deletion
    const deleteReason = (req.body?.reason || '').trim() || 'Bill deleted';
    try {
      if (BillArchive) {
        await BillArchive.create(
          [
            {
              originalBill: sale.toObject(),
              billNo: sale.billNo,
              saleId: sale._id,
              archivedAt: new Date(),
              archivedBy: req.user?._id || req.user?.id || null,
              archivedByName: req.user?.name || req.user?.firstName || '',
              reason: deleteReason,
            },
          ],
          session ? { session } : {},
        );
      }
    } catch (archiveError) {
      logger.error('⚠️ Failed to archive bill before deletion:', archiveError);
    }

    // Restore inventory for all product items
    const inventoryChanges = [];
    const productItems = (sale.items || []).filter(item => item.type === 'product');
    logger.debug('Bill delete: restoring inventory', {
      billNo: sale.billNo,
      totalItems: (sale.items || []).length,
      productLineCount: productItems.length,
    });

    for (const item of sale.items || []) {
      // Skip if not a product or missing required fields
      if (item.type !== 'product') {
        continue;
      }
      
      if (!item.productId) {
        logger.warn(`  ⚠️ Missing productId for ${item.name}. Trying to find by name...`);
        // Try to find product by name as fallback (case-insensitive, partial match)
        const productByName = session
          ? await Product.findOne({ 
              name: { $regex: new RegExp(`^${item.name}$`, 'i') } 
            }).session(session)
          : await Product.findOne({ 
              name: { $regex: new RegExp(`^${item.name}$`, 'i') } 
            });
        
        if (!productByName) {
          // Try partial match
          const productByPartialName = session
            ? await Product.findOne({ 
                name: { $regex: item.name, $options: 'i' } 
              }).session(session)
            : await Product.findOne({ 
                name: { $regex: item.name, $options: 'i' } 
              });
          
          if (productByPartialName) {
            item.productId = productByPartialName._id;
          } else {
            logger.warn('Bill delete: cannot restore inventory for line (product not found by name)', { itemName: item.name, item });
            continue;
          }
        } else {
          item.productId = productByName._id;
        }
      }
      
      if (!item.quantity || item.quantity <= 0) {
        continue;
      }

      // Convert productId to ObjectId if it's a string
      const mongoose = require('mongoose');
      let productIdToFind = item.productId;
      if (typeof productIdToFind === 'string') {
        if (mongoose.Types.ObjectId.isValid(productIdToFind)) {
          productIdToFind = new mongoose.Types.ObjectId(productIdToFind);
        } else {
          logger.error(`  ❌ Invalid productId format: ${productIdToFind} for item ${item.name}`);
          // Try to find by name as fallback
          const productByName = session
            ? await Product.findOne({ name: item.name }).session(session)
            : await Product.findOne({ name: item.name });
          if (productByName) {
            productIdToFind = productByName._id;
          } else {
            logger.warn(`  ❌ Cannot restore inventory for ${item.name} - invalid productId and product not found by name`);
            continue;
          }
        }
      }

      const product = session
        ? await Product.findById(productIdToFind).session(session)
        : await Product.findById(productIdToFind);
      if (!product) {
        logger.error(`  ❌ Product not found: ${productIdToFind} for item ${item.name}`);
        // Don't abort transaction, just skip this item and continue with others
        logger.warn(`  ⚠️ Skipping inventory restoration for ${item.name} - product not found, continuing with other items`);
        continue;
      }

      const previousStock = Number(product.stock || 0);
      const restoreQty = Number(item.quantity || 0);
      const newStock = previousStock + restoreQty;

      product.stock = newStock;
      await product.save(session ? { session } : {});

      const transaction = new InventoryTransaction({
        productId: product._id,
        productName: product.name,
        transactionType: 'return',
        quantity: restoreQty,
        previousStock,
        newStock,
        unitCost: product.price || 0,
        totalValue: restoreQty * (product.price || 0),
        referenceType: 'sale',
        referenceId: sale._id.toString(),
        referenceNumber: sale.billNo,
        processedBy: req.user?.name || req.user?.firstName || sale.staffName || 'System',
        reason: 'Bill deleted - stock restored',
        notes: 'Bill deleted by admin, inventory restored',
        transactionDate: new Date(),
      });

      const savedTxn = await transaction.save(session ? { session } : {});
      inventoryChanges.push({
        productId: product._id,
        quantityChange: -restoreQty,
        previousStock,
        newStock,
        transactionIds: [savedTxn._id],
      });
    }

    // Deactivate membership if this bill assigned a plan
    if (sale.planToAssignId) {
      const subQuery = { saleId: sale._id, status: 'ACTIVE' };
      const subUpdate = session
        ? MembershipSubscription.updateOne(subQuery, { $set: { status: 'CANCELLED' } }).session(session)
        : MembershipSubscription.updateOne(subQuery, { $set: { status: 'CANCELLED' } });
      await subUpdate;
    }

    let walletRestored = [];
    try {
      const walletSvc = require('./services/client-wallet-service');
      const wr = await walletSvc.reverseWalletRedemptionsForDeletedSale({
        branchId: sale.branchId || req.user.branchId,
        sale,
        businessModels: req.businessModels,
        staffUser: req.user,
        deleteReason,
      });
      walletRestored = wr.restored || [];
    } catch (walletRevErr) {
      logger.error('Bill delete: prepaid wallet reversal failed', walletRevErr);
    }

    if (session) {
      await Sale.findByIdAndDelete(saleId).session(session);
    } else {
      await Sale.findByIdAndDelete(saleId);
    }

    // Remove calendar appointment(s) linked to this invoice (runs after bill row is
    // removed so wallet/inventory bookkeeping stays coherent if this step fails ).
    const { Appointment } = req.businessModels;
    if (sale.appointmentId && Appointment) {
      try {
        const anchor = await Appointment.findOne({
          _id: sale.appointmentId,
          branchId: req.user.branchId,
        })
          .select('_id bookingGroupId')
          .lean();
        if (anchor) {
          if (anchor.bookingGroupId) {
            const delGrp = await Appointment.deleteMany({
              branchId: req.user.branchId,
              bookingGroupId: anchor.bookingGroupId,
            });
            logger.debug('Bill delete: removed booking group appointments', {
              billNo: sale.billNo,
              bookingGroupId: anchor.bookingGroupId,
              deletedCount: delGrp.deletedCount,
            });
          } else {
            await Appointment.findByIdAndDelete(anchor._id);
            logger.debug('Bill delete: removed single linked appointment', {
              billNo: sale.billNo,
              appointmentId: String(anchor._id),
            });
          }
        }
      } catch (aptDelErr) {
        logger.error('Bill delete: sale removed but linked appointment cleanup failed — please remove manually.', aptDelErr);
      }
    }

    if (useTransactions && session) {
      await session.commitTransaction();
      session.endSession();
    } else if (session) {
      session.endSession();
    }

    logger.debug('Bill delete completed', { billNo: sale.billNo, inventoryLinesRestored: inventoryChanges.length });
    if (inventoryChanges.length === 0 && productItems.length > 0) {
      logger.warn('Bill delete: no inventory restored despite product lines; check productId / product records', { billNo: sale.billNo });
    }

    scheduleActivityLog(
      {
        businessId: req.user.branchId,
        actorType: tenantActorTypeFromRole(req.user.role),
        actorId: req.user._id,
        action: ACTIVITY_ACTIONS.DELETE_INVOICE,
        entity: 'sale',
        entityId: sale._id,
        summary: `Invoice ${sale.billNo || sale._id} deleted`,
      },
      req
    );

    const msgParts = [`Inventory restored for ${inventoryChanges.length} product(s).`];
    if (walletRestored.length > 0) {
      const total = walletRestored.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      msgParts.push(
        `Prepaid wallet credited back: ₹${Math.round(total * 100) / 100} (${walletRestored.length} wallet${walletRestored.length === 1 ? '' : 's'}).`
      );
    }

    res.json({
      success: true,
      data: sale,
      inventoryRestored: inventoryChanges.length,
      walletRestored,
      message: `Bill deleted. ${msgParts.join(' ')}`,
    });
  } catch (err) {
    logger.error('❌ Error deleting sale:', err);
    if (useTransactions && session) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    if (session) {
      session.endSession();
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cash Registry Routes
// Note: Specific routes must come before parameterized routes
app.get('/api/cash-registry/petty-cash-summary', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Expense, PettyCashTransaction, CashMovement } = req.businessModels;
    const { date } = req.query;
    const dateStr = date || new Date().toISOString().split('T')[0];
    const endOfDay = getEndOfDayIST(dateStr);

    if (CashMovement && PettyCashTransaction) {
      const { backfillOrphanPettyCashTransfers } = require('./utils/sync-cash-movement-petty-cash');
      await backfillOrphanPettyCashTransfers(
        req.businessModels,
        req.user.branchId,
        req.user._id || req.user.id
      );
    }

    // Total additions (all time up to end of date)
    const additions = await PettyCashTransaction.aggregate([
      { $match: { branchId: req.user.branchId, date: { $lte: endOfDay } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalAdditions = additions[0]?.total ?? 0;

    // Total deductions from expenses (all time up to end of date)
    const pettyCashExpenses = await Expense.find({
      branchId: req.user.branchId,
      paymentMode: 'Petty Cash Wallet',
      date: { $lte: endOfDay }
    });
    const totalDeductions = pettyCashExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    const expectedBalance = Math.max(0, totalAdditions - totalDeductions);
    res.json({
      success: true,
      data: {
        totalAdditions,
        pettyCashExpenses: totalDeductions,
        expectedBalance
      }
    });
  } catch (error) {
    logger.error('Error fetching petty cash summary:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Petty Cash - Add balance
app.post('/api/petty-cash', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { PettyCashTransaction } = req.businessModels;
    const { amount, date } = req.body;
    const amt = Number(amount) || 0;
    if (amt <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be greater than 0' });
    }
    const txDate = date ? new Date(date) : new Date();
    const tx = new PettyCashTransaction({
      type: 'add',
      amount: amt,
      date: txDate,
      createdBy: req.user._id || req.user.id,
      branchId: req.user.branchId
    });
    await tx.save();
    res.status(201).json({ success: true, data: tx });
  } catch (error) {
    logger.error('Error adding petty cash:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Petty Cash - View logs (additions + deductions)
app.get('/api/petty-cash/logs', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Expense, PettyCashTransaction } = req.businessModels;
    const branchId = req.user.branchId;

    const additions = await PettyCashTransaction.find({ branchId })
      .sort({ date: -1 })
      .lean();
    const deductions = await Expense.find({ branchId, paymentMode: 'Petty Cash Wallet' })
      .sort({ date: -1 })
      .lean();

    const logs = [
      ...additions.map(a => ({
        type: 'add',
        amount: a.amount,
        date: a.date,
        label: a.cashMovementId ? 'From cash drawer' : 'Manual add',
      })),
      ...deductions.map(d => ({ type: 'deduct', amount: -d.amount, date: d.date, label: 'Expense' }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ success: true, data: logs });
  } catch (error) {
    logger.error('Error fetching petty cash logs:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

const { CASH_MOVEMENT_TYPES } = require('./models/CashMovement');
const CASH_MOVEMENT_TYPE_DIRECTION = {
  owner_withdrawal: 'out',
  bank_deposit: 'out',
  safe_transfer: 'out',
  petty_cash_transfer: 'out',
  cash_added: 'in',
};

app.get('/api/cash-movements', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { CashMovement } = req.businessModels;
    const branchId = req.user.branchId;
    const { dateFrom, dateTo, status = 'active' } = req.query;

    const query = { branchId };
    if (status && status !== 'all') query.status = status;
    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = new Date(dateFrom);
      if (dateTo) query.date.$lte = new Date(dateTo);
    }

    const movements = await CashMovement.find(query).sort({ date: -1, createdAt: -1 }).lean();
    res.json({ success: true, data: movements });
  } catch (error) {
    logger.error('Error fetching cash movements:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post('/api/cash-movements', authenticateToken, setupBusinessDatabase, requirePermission('cash_registry', 'create'), async (req, res) => {
  try {
    const { syncPettyCashForCashMovement } = require('./utils/sync-cash-movement-petty-cash');
    const { CashMovement } = req.businessModels;
    const { type, direction, amount, date, reason, referenceNo } = req.body;
    const amt = Number(amount);
    if (!type || !CASH_MOVEMENT_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: 'Invalid movement type' });
    }
    if (!amt || amt <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be greater than 0' });
    }

    let resolvedDirection = CASH_MOVEMENT_TYPE_DIRECTION[type];
    if (type === 'other') {
      if (direction !== 'in' && direction !== 'out') {
        return res.status(400).json({ success: false, error: 'Direction must be in or out for other movements' });
      }
      resolvedDirection = direction;
    } else if (!resolvedDirection) {
      return res.status(400).json({ success: false, error: 'Invalid movement type' });
    }

    const movementDate = date ? parseDateIST(date) : new Date();
    const createdByName = req.user.firstName && req.user.lastName
      ? `${req.user.firstName} ${req.user.lastName}`.trim()
      : req.user.email || 'Unknown';

    const movement = new CashMovement({
      branchId: req.user.branchId,
      date: movementDate,
      type,
      direction: resolvedDirection,
      amount: amt,
      reason: (reason || '').trim().slice(0, 500),
      referenceNo: (referenceNo || '').trim().slice(0, 100),
      createdBy: createdByName,
      userId: req.user.id,
      status: 'active',
    });
    await movement.save();
    await syncPettyCashForCashMovement(
      req.businessModels,
      movement,
      req.user._id || req.user.id
    );
    res.status(201).json({ success: true, data: movement });
  } catch (error) {
    logger.error('Error creating cash movement:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

async function assertCashMovementEditable(req, movement) {
  const { CashRegistry } = req.businessModels;
  if (!CashRegistry || !movement?.date) return;
  const branchId = req.user.branchId;
  const startOfDay = getStartOfDayIST(movement.date);
  const endOfDay = getEndOfDayIST(movement.date);
  const verifiedClosing = await CashRegistry.findOne({
    branchId,
    shiftType: 'closing',
    date: { $gte: startOfDay, $lt: endOfDay },
    isVerified: true,
  })
    .select('_id')
    .lean();
  if (verifiedClosing && req.user.role !== 'admin') {
    const err = new Error('This day is verified and locked. Only an admin can change cash movements.');
    err.statusCode = 409;
    throw err;
  }
}

app.put('/api/cash-movements/:id', authenticateToken, setupBusinessDatabase, requirePermission('cash_registry', 'manage'), async (req, res) => {
  try {
    const { syncPettyCashForCashMovement } = require('./utils/sync-cash-movement-petty-cash');
    const { CashMovement } = req.businessModels;
    const { type, direction, amount, date, reason, referenceNo } = req.body;
    const movement = await CashMovement.findOne({ _id: req.params.id, branchId: req.user.branchId });
    if (!movement) {
      return res.status(404).json({ success: false, error: 'Cash movement not found' });
    }
    if (movement.status === 'void') {
      return res.status(400).json({ success: false, error: 'Cannot edit a voided movement. Record a new one instead.' });
    }

    await assertCashMovementEditable(req, movement);

    const amt = Number(amount);
    if (!type || !CASH_MOVEMENT_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: 'Invalid movement type' });
    }
    if (!amt || amt <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be greater than 0' });
    }

    let resolvedDirection = CASH_MOVEMENT_TYPE_DIRECTION[type];
    if (type === 'other') {
      if (direction !== 'in' && direction !== 'out') {
        return res.status(400).json({ success: false, error: 'Direction must be in or out for other movements' });
      }
      resolvedDirection = direction;
    } else if (!resolvedDirection) {
      return res.status(400).json({ success: false, error: 'Invalid movement type' });
    }

    movement.type = type;
    movement.direction = resolvedDirection;
    movement.amount = amt;
    if (date) movement.date = parseDateIST(date);
    movement.reason = (reason || '').trim().slice(0, 500);
    movement.referenceNo = (referenceNo || '').trim().slice(0, 100);
    await movement.save();
    await syncPettyCashForCashMovement(
      req.businessModels,
      movement,
      req.user._id || req.user.id
    );
    res.json({ success: true, data: movement });
  } catch (error) {
    if (error.statusCode === 409) {
      return res.status(409).json({ success: false, error: error.message });
    }
    logger.error('Error updating cash movement:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

app.delete('/api/cash-movements/:id', authenticateToken, setupBusinessDatabase, requirePermission('cash_registry', 'manage'), async (req, res) => {
  try {
    const { syncPettyCashForCashMovement } = require('./utils/sync-cash-movement-petty-cash');
    const { CashMovement } = req.businessModels;
    const movement = await CashMovement.findOne({ _id: req.params.id, branchId: req.user.branchId });
    if (!movement) {
      return res.status(404).json({ success: false, error: 'Cash movement not found' });
    }
    if (movement.status === 'void') {
      return res.json({ success: true, data: movement, message: 'Already voided' });
    }

    await assertCashMovementEditable(req, movement);

    const voidedBy = req.user.firstName && req.user.lastName
      ? `${req.user.firstName} ${req.user.lastName}`.trim()
      : req.user.email || 'Unknown';
    movement.status = 'void';
    movement.voidedAt = new Date();
    movement.voidedBy = voidedBy;
    await movement.save();
    await syncPettyCashForCashMovement(
      req.businessModels,
      movement,
      req.user._id || req.user.id
    );
    res.json({ success: true, data: movement });
  } catch (error) {
    if (error.statusCode === 409) {
      return res.status(409).json({ success: false, error: error.message });
    }
    logger.error('Error voiding cash movement:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.get('/api/cash-registry/summary/dashboard', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    
    const { CashRegistry, Sale, Expense } = req.businessModels;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get today's cash registry summary
    const todaySummary = await CashRegistry.findOne({
      date: { $gte: today, $lt: tomorrow },
      shiftType: 'closing'
    });

    // Get total sales for today
    const todaySales = await Sale.find({
      createdAt: { $gte: today, $lt: tomorrow }
    });

    const totalSales = todaySales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);

    // Get total expenses for today
    const todayExpenses = await Expense.find({
      date: { $gte: today, $lt: tomorrow }
    });

    const totalExpenses = todayExpenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);

    res.json({
      success: true,
      data: {
        todaySummary: todaySummary || null,
        totalSales,
        totalExpenses,
        netCash: totalSales - totalExpenses
      }
    });
  } catch (error) {
    logger.error('Error fetching cash registry summary:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/cash-registry', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { CashRegistry } = req.businessModels;
    const { page = 1, limit = 50, dateFrom, dateTo, shiftType, search } = req.query;
    
    const query = {};
    
    // Date range filtering
    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = new Date(dateFrom);
      if (dateTo) query.date.$lte = new Date(dateTo);
    }
    
    // Shift type filtering
    if (shiftType) {
      query.shiftType = shiftType;
    }
    
    // Search filtering
    if (search) {
      query.$or = [
        { createdBy: { $regex: search, $options: 'i' } },
        { balanceDifferenceReason: { $regex: search, $options: 'i' } },
        { onlineCashDifferenceReason: { $regex: search, $options: 'i' } }
      ];
    }
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { date: -1, createdAt: -1 }
    };
    
    const cashRegistries = await CashRegistry.find(query)
      .sort(options.sort)
      .limit(options.limit)
      .skip((options.page - 1) * options.limit);
    
    const total = await CashRegistry.countDocuments(query);
    
    res.json({
      success: true,
      data: cashRegistries,
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        pages: Math.ceil(total / options.limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching cash registries:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error'
    });
  }
});

app.get('/api/cash-registry/:id', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { CashRegistry } = req.businessModels;
    const cashRegistry = await CashRegistry.findById(req.params.id);
    if (!cashRegistry) {
      return res.status(404).json({ message: 'Cash registry entry not found' });
    }
    res.json(cashRegistry);
  } catch (error) {
    logger.error('Error fetching cash registry:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/cash-registry', authenticateToken, setupBusinessDatabase, requirePermission('cash_registry', 'create'), async (req, res) => {
  try {
    const { CashRegistry, Sale, Expense, CashMovement } = req.businessModels;
    const {
      date,
      shiftType,
      denominations,
      notes,
      openingBalance,
      closingBalance,
      onlineCash,
      posCash,
      pettyCashOpeningBalance,
      pettyCashClosingBalance,
      createdBy
    } = req.body;
    
    // Calculate totals from denominations
    const totalBalance = denominations.reduce((sum, denom) => sum + denom.total, 0);
    
    // For opening shift, set opening balance
    // For closing shift, calculate cash flow from other sources
    let cashCollected = 0;
    let expenseValue = 0;
    let cashBalance = 0;
    let balanceDifference = 0;
    let onlinePosDifference = 0;
    /** CRM Card+Online total for closing day (persisted on the row); derived from Sale when Sale model exists */
    let onlineCashToSave = Number(onlineCash) || 0;
    let openingBalanceStored = Number(openingBalance) || 0;

    // Parse date in IST (Asia/Kolkata) - all dates use IST
    const dateObj = parseDateIST(date);
    
    if (shiftType === 'closing') {
      const branchId = req.user.branchId;
      const {
        computeDayCashLedger,
        computeDayCashMovements,
        computeExpectedCashBalance,
        computeDayOnlineSales,
        resolveOpeningBalanceForRegistryDay,
      } = require('./utils/cash-registry-ledger');

      const ledger = (Sale && Expense)
        ? await computeDayCashLedger({ Sale, Expense, branchId, registryDate: dateObj })
        : { cashCollected: 0, expenseValue: 0 };
      cashCollected = ledger.cashCollected;
      expenseValue = ledger.expenseValue;

      const { cashIn, cashOut } = CashMovement
        ? await computeDayCashMovements({ CashMovement, branchId, registryDate: dateObj })
        : { cashIn: 0, cashOut: 0 };

      let effectiveOpening = Number(openingBalance) || 0;
      if (!effectiveOpening) {
        effectiveOpening = await resolveOpeningBalanceForRegistryDay({
          CashRegistry,
          branchId,
          registryDate: dateObj,
          closingDocFallback: 0,
        });
      }

      const closingTotalPhysical = Number(closingBalance) || totalBalance;

      cashBalance = computeExpectedCashBalance({
        opening: effectiveOpening,
        cashCollected,
        expenseValue,
        cashIn,
        cashOut,
      });
      balanceDifference = closingTotalPhysical - cashBalance;
      const posCashNum = Number(posCash) || 0;
      let totalOnlineSales = Number(onlineCash) || 0;
      if (Sale) {
        totalOnlineSales = await computeDayOnlineSales({
          Sale,
          branchId,
          registryDate: dateObj,
        });
      }
      onlinePosDifference = posCashNum - totalOnlineSales;
      onlineCashToSave = totalOnlineSales;
      openingBalanceStored = effectiveOpening;
    }
    
    const cashRegistry = new CashRegistry({
      date: dateObj,
      shiftType,
      createdBy: createdBy || `${req.user.firstName} ${req.user.lastName}`.trim() || req.user.email,
      userId: req.user.id,
      branchId: req.user.branchId,
      denominations,
      openingBalance: shiftType === 'opening' ? totalBalance : openingBalanceStored,
      closingBalance: shiftType === 'closing' ? totalBalance : 0,
      cashCollected,
      expenseValue,
      cashBalance,
      balanceDifference,
      balanceDifferenceReason: balanceDifference !== 0 ? 'Manual adjustment required' : 'Balanced',
      onlineCash: shiftType === 'closing' ? onlineCashToSave : 0,
      posCash: shiftType === 'closing' ? posCash : 0,
      onlinePosDifference,
      onlineCashDifferenceReason: onlinePosDifference !== 0 ? 'Difference detected' : 'Balanced',
      pettyCashOpeningBalance: shiftType === 'opening' ? (pettyCashOpeningBalance ?? 0) : 0,
      pettyCashClosingBalance: shiftType === 'closing' ? (pettyCashClosingBalance ?? 0) : 0,
      notes,
      branchId: req.user.branchId
    });
    
    await cashRegistry.save();
    res.status(201).json({
      success: true,
      data: cashRegistry,
      message: 'Cash registry entry created successfully'
    });
  } catch (error) {
    logger.error('Error creating cash registry:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      details: error
    });
  }
});

app.put('/api/cash-registry/:id', authenticateToken, setupBusinessDatabase, requirePermission('cash_registry', 'edit'), async (req, res) => {
  try {
    const {
      denominations,
      notes,
      closingBalance,
      onlineCash,
      posCash,
      balanceDifferenceReason,
      onlineCashDifferenceReason
    } = req.body;
    const { CashRegistry, Sale, Expense, CashMovement } = req.businessModels;
    
    const cashRegistry = await CashRegistry.findById(req.params.id);
    if (!cashRegistry) {
      return res.status(404).json({ message: 'Cash registry entry not found' });
    }
    
    // Only allow updates to certain fields
    const updates = {
      denominations,
      notes,
      balanceDifferenceReason,
      onlineCashDifferenceReason
    };
    
    if (cashRegistry.shiftType === 'closing') {
      updates.closingBalance = closingBalance;
      updates.posCash = posCash;

      const {
        computeDayCashLedger,
        computeDayCashMovements,
        computeExpectedCashBalance,
        computeDayOnlineSales,
        resolveOpeningBalanceForRegistryDay,
      } = require('./utils/cash-registry-ledger');
      const branchId = cashRegistry.branchId || req.user.branchId;
      const { cashCollected, expenseValue } = (Sale && Expense)
        ? await computeDayCashLedger({
          Sale,
          Expense,
          branchId,
          registryDate: cashRegistry.date,
        })
        : { cashCollected: cashRegistry.cashCollected, expenseValue: cashRegistry.expenseValue };

      const { cashIn, cashOut } = CashMovement
        ? await computeDayCashMovements({
          CashMovement,
          branchId,
          registryDate: cashRegistry.date,
        })
        : { cashIn: 0, cashOut: 0 };

      const resolvedOpening = (Sale && Expense)
        ? await resolveOpeningBalanceForRegistryDay({
          CashRegistry,
          branchId,
          registryDate: cashRegistry.date,
          closingDocFallback: cashRegistry.openingBalance,
        })
        : Number(cashRegistry.openingBalance) || 0;

      updates.cashCollected = cashCollected;
      updates.expenseValue = expenseValue;
      updates.openingBalance = resolvedOpening;
      const cashBalance = computeExpectedCashBalance({
        opening: resolvedOpening,
        cashCollected,
        expenseValue,
        cashIn,
        cashOut,
      });
      updates.cashBalance = cashBalance;
      updates.balanceDifference = closingBalance - cashBalance;
      const posCashNum = Number(posCash) || 0;
      let totalOnlineSales = Number(onlineCash) || 0;
      if (Sale) {
        totalOnlineSales = await computeDayOnlineSales({
          Sale,
          branchId,
          registryDate: cashRegistry.date,
        });
      }
      updates.onlineCash = totalOnlineSales;
      updates.onlinePosDifference = posCashNum - totalOnlineSales;
    }
    
    const updatedCashRegistry = await CashRegistry.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );
    
    res.json(updatedCashRegistry);
  } catch (error) {
    logger.error('Error updating cash registry:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/cash-registry/:id/difference-reason', authenticateToken, setupBusinessDatabase, requirePermission('cash_registry', 'edit'), async (req, res) => {
  try {
    const { CashRegistry } = req.businessModels;
    const { type, reason, note } = req.body;
    const updatedBy = req.user.firstName && req.user.lastName ?
      `${req.user.firstName} ${req.user.lastName}`.trim() : req.user.email || 'Unknown User';

    const cashRegistry = await CashRegistry.findById(req.params.id);
    if (!cashRegistry) {
      return res.status(404).json({ message: 'Cash registry entry not found' });
    }

    const updates = {};
    if (type === 'cash') {
      updates.balanceDifferenceReason = reason || '';
      updates.balanceDifferenceNote = note || '';
      updates.balanceDifferenceUpdatedAt = new Date();
      updates.balanceDifferenceUpdatedBy = updatedBy;
    } else if (type === 'online') {
      updates.onlineCashDifferenceReason = reason || '';
      updates.onlineCashDifferenceNote = note || '';
      updates.onlineCashDifferenceUpdatedAt = new Date();
      updates.onlineCashDifferenceUpdatedBy = updatedBy;
    } else {
      return res.status(400).json({ message: 'Invalid type. Use "cash" or "online"' });
    }

    const updated = await CashRegistry.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );
    res.json(updated);
  } catch (error) {
    logger.error('Error updating difference reason:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/cash-registry/:id/verify', authenticateToken, setupBusinessDatabase, requirePermission('cash_registry', 'manage'), async (req, res) => {
  try {
    const { CashRegistry, Sale, Expense, CashMovement } = req.businessModels;
    const { verificationNotes, balanceDifferenceReason, balanceDifferenceNote, onlineCashDifferenceReason, onlineCashDifferenceNote } = req.body;
    const updatedBy = req.user.firstName && req.user.lastName ?
      `${req.user.firstName} ${req.user.lastName}`.trim() : req.user.email || 'Unknown User';

    const cashRegistry = await CashRegistry.findById(req.params.id);
    if (!cashRegistry) {
      return res.status(404).json({ message: 'Cash registry entry not found' });
    }

    const negligible = (n) => Math.abs(Number(n) || 0) < 0.01;

    let hasBalanceDifference = !negligible(cashRegistry.balanceDifference);
    let hasOnlinePosDifference = !negligible(cashRegistry.onlinePosDifference);
    let ledgerRefresh = {};

    // Recompute cash collected / expenses from Sales + Expenses for this date so
    // verify matches the report (stale cashCollected on the row caused false ₹difference).
    if (cashRegistry.shiftType === 'closing' && Sale && Expense) {
      const {
        computeDayCashLedger,
        computeDayCashMovements,
        computeExpectedCashBalance,
        computeDayOnlineSales,
        resolveOpeningBalanceForRegistryDay,
      } = require('./utils/cash-registry-ledger');
      const branchId = cashRegistry.branchId || req.user.branchId;
      const { cashCollected, expenseValue } = await computeDayCashLedger({
        Sale,
        Expense,
        branchId,
        registryDate: cashRegistry.date,
      });
      const { cashIn, cashOut } = CashMovement
        ? await computeDayCashMovements({
          CashMovement,
          branchId,
          registryDate: cashRegistry.date,
        })
        : { cashIn: 0, cashOut: 0 };
      const resolvedOpening = await resolveOpeningBalanceForRegistryDay({
        CashRegistry,
        branchId,
        registryDate: cashRegistry.date,
        closingDocFallback: cashRegistry.openingBalance,
      });
      const closingBal = Number(cashRegistry.closingBalance) || 0;
      const posCashNum = Number(cashRegistry.posCash) || 0;
      const totalOnlineSales = await computeDayOnlineSales({
        Sale,
        branchId,
        registryDate: cashRegistry.date,
      });
      const cashBalance = computeExpectedCashBalance({
        opening: resolvedOpening,
        cashCollected,
        expenseValue,
        cashIn,
        cashOut,
      });
      const balanceDifference = closingBal - cashBalance;
      const onlinePosDifference = posCashNum - totalOnlineSales;

      hasBalanceDifference = !negligible(balanceDifference);
      hasOnlinePosDifference = !negligible(onlinePosDifference);

      ledgerRefresh = {
        openingBalance: resolvedOpening,
        cashCollected,
        expenseValue,
        cashBalance,
        balanceDifference,
        onlineCash: totalOnlineSales,
        onlinePosDifference,
      };
    }

    if (hasBalanceDifference && !balanceDifferenceReason?.trim()) {
      return res.status(400).json({
        message: 'Reason for Cash Difference is required when there is a cash difference'
      });
    }
    if (hasOnlinePosDifference && !onlineCashDifferenceReason?.trim()) {
      return res.status(400).json({
        message: 'Reason for Online Cash Difference is required when there is an online difference'
      });
    }

    // Build verification notes from reasons if not provided
    const builtNotes = verificationNotes || [
      hasBalanceDifference && balanceDifferenceReason && `Cash: ${balanceDifferenceReason}`,
      hasOnlinePosDifference && onlineCashDifferenceReason && `Online: ${onlineCashDifferenceReason}`
    ].filter(Boolean).join('; ') || 'Verified';

    // Update verification fields (+ refresh ledger totals on closing rows)
    const updates = {
      ...ledgerRefresh,
      isVerified: true,
      verifiedBy: updatedBy,
      verifiedAt: new Date(),
      verificationNotes: builtNotes,
      status: 'verified'
    };

    // Update difference reasons if provided
    if (balanceDifferenceReason !== undefined) {
      updates.balanceDifferenceReason = balanceDifferenceReason;
      updates.balanceDifferenceNote = balanceDifferenceNote || '';
      updates.balanceDifferenceUpdatedAt = new Date();
      updates.balanceDifferenceUpdatedBy = updatedBy;
    }
    if (onlineCashDifferenceReason !== undefined) {
      updates.onlineCashDifferenceReason = onlineCashDifferenceReason;
      updates.onlineCashDifferenceNote = onlineCashDifferenceNote || '';
      updates.onlineCashDifferenceUpdatedAt = new Date();
      updates.onlineCashDifferenceUpdatedBy = updatedBy;
    }
    
    const verifiedCashRegistry = await CashRegistry.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );
    
    // Trigger daily summary email if notification is set to "after verification"
    const branchId = req.user.branchId;
    if (branchId && verifiedCashRegistry?.date) {
      const { sendDailySummaryForDate } = require('./utils/daily-summary-sender');
      const targetDate = new Date(verifiedCashRegistry.date);
      targetDate.setHours(0, 0, 0, 0);
      sendDailySummaryForDate(branchId, branchId, targetDate).catch(err => {
        logger.error('Failed to send daily summary after verification:', err);
      });
    }
    
    res.json(verifiedCashRegistry);
  } catch (error) {
    logger.error('Error verifying cash registry:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/cash-registry/:id', authenticateToken, setupBusinessDatabase, requirePermission('cash_registry', 'delete'), async (req, res) => {
  try {
    const { CashRegistry } = req.businessModels;
    const cashRegistry = await CashRegistry.findById(req.params.id);
    if (!cashRegistry) {
      return res.status(404).json({ message: 'Cash registry entry not found' });
    }

    // Ensure entry belongs to user's branch
    const userBranchId = req.user.branchId?.toString?.();
    const entryBranchId = cashRegistry.branchId?.toString?.();
    if (userBranchId && entryBranchId && userBranchId !== entryBranchId) {
      return res.status(403).json({
        message: 'You do not have permission to delete this cash registry entry.',
      });
    }

    // Only allow deletion of unverified entries, unless user is admin or manager
    const canDeleteVerified = ['admin', 'manager'].includes(req.user.role);
    if (cashRegistry.isVerified && !canDeleteVerified) {
      return res.status(400).json({
        message: 'Cannot delete verified cash registry entries. Only administrators or managers can delete verified entries.',
      });
    }

    await CashRegistry.findByIdAndDelete(req.params.id);
    res.json({ message: 'Cash registry entry deleted successfully' });
  } catch (error) {
    logger.error('Error deleting cash registry:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Commission Profiles API — Incentive Management (target, service, and item profiles).

// Get all commission profiles
app.get('/api/commission-profiles', authenticateToken, setupBusinessDatabase, requirePermission('staff_incentive', 'view'), INCENTIVE_MANAGEMENT, async (req, res) => {
  try {
    const { CommissionProfile } = req.businessModels;
    const commissionProfiles = await CommissionProfile.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      data: commissionProfiles
    });
  } catch (error) {
    logger.error('Error fetching commission profiles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch commission profiles'
    });
  }
});

// Create commission profile
app.post('/api/commission-profiles', authenticateToken, setupBusinessDatabase, requirePermission('staff_incentive', 'create'), INCENTIVE_MANAGEMENT, async (req, res) => {
  try {
    const { CommissionProfile } = req.businessModels;
    const profile = await CommissionProfile.create({
      ...req.body,
      createdBy: req.user?._id
    });

    res.status(201).json({
      success: true,
      data: profile
    });
  } catch (error) {
    logger.error('Error creating commission profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create commission profile'
    });
  }
});

// Update commission profile
app.put('/api/commission-profiles/:id', authenticateToken, setupBusinessDatabase, requirePermission('staff_incentive', 'edit'), INCENTIVE_MANAGEMENT, async (req, res) => {
  try {
    const { CommissionProfile } = req.businessModels;
    const { id } = req.params;

    const updatedProfile = await CommissionProfile.findByIdAndUpdate(
      id,
      {
      ...req.body,
        updatedBy: req.user?._id,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!updatedProfile) {
      return res.status(404).json({
        success: false,
        error: 'Commission profile not found'
      });
    }

    res.json({
      success: true,
      data: updatedProfile
    });
  } catch (error) {
    logger.error('Error updating commission profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update commission profile'
    });
  }
});

// Delete commission profile
app.delete('/api/commission-profiles/:id', authenticateToken, setupBusinessDatabase, requirePermission('staff_incentive', 'delete'), INCENTIVE_MANAGEMENT, async (req, res) => {
  try {
    const { CommissionProfile } = req.businessModels;
    const { id } = req.params;

    const deletedProfile = await CommissionProfile.findByIdAndDelete(id);

    if (!deletedProfile) {
      return res.status(404).json({
        success: false,
        error: 'Commission profile not found'
      });
    }

    res.json({
      success: true,
      message: 'Commission profile deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting commission profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete commission profile'
    });
  }
});

// Get inventory transactions
app.get('/api/inventory-transactions', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { productId, transactionType, startDate, endDate, page = 1, limit = 50 } = req.query;
    const { InventoryTransaction } = req.businessModels;
    
    const filter = {};
    if (productId) filter.productId = productId;
    if (transactionType) filter.transactionType = transactionType;
    if (startDate || endDate) {
      filter.transactionDate = {};
      if (startDate) filter.transactionDate.$gte = new Date(startDate);
      if (endDate) filter.transactionDate.$lte = new Date(endDate);
    }

    const transactions = await InventoryTransaction.find(filter)
      .populate('productId', 'name sku category')
      .sort({ transactionDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await InventoryTransaction.countDocuments(filter);

    res.json({
      success: true,
      data: transactions,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    logger.error('Error fetching inventory transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inventory transactions'
    });
  }
});

// ==================== Report Export Endpoints ====================

function respondReportExportError(res, error, fallbackMessage, logLabel) {
  if (error && error.code === 'PLATFORM_EMAIL_DISABLED') {
    return res.status(403).json({
      success: false,
      error: error.message || 'Operational emails are disabled for this business by the platform.',
      code: 'PLATFORM_EMAIL_DISABLED',
    });
  }
  logger.error(logLabel, error);
  return res.status(500).json({
    success: false,
    error: error?.message || fallbackMessage,
  });
}

// Export products report (emailed to admin)
app.post('/api/reports/export/products', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.DATA_EXPORT), async (req, res) => {
  try {
    const { format = 'xlsx', filters = {} } = req.body;
    
    const { exportProductsReport } = require('./utils/report-exporter');
    const result = await exportProductsReport({
      branchId: req.user.branchId,
      format,
      filters
    });
    
    res.json({
      success: true,
      message: result.message || 'Products report has been generated and sent to admin email(s)'
    });
  } catch (error) {
    respondReportExportError(
      res,
      error,
      'Failed to export products report',
      'Error exporting products report:',
    );
  }
});

// Export services catalog report (emailed to admin) — used by Settings → Services export
app.post('/api/reports/export/services', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.DATA_EXPORT), async (req, res) => {
  try {
    const { format = 'xlsx', filters = {} } = req.body;

    const { exportServicesReport } = require('./utils/report-exporter');
    const result = await exportServicesReport({
      branchId: req.user.branchId,
      format,
      filters
    });

    res.json({
      success: true,
      message: result.message || 'Services report has been generated and sent to admin email(s)'
    });
  } catch (error) {
    respondReportExportError(
      res,
      error,
      'Failed to export services report',
      'Error exporting services catalog report:',
    );
  }
});

// Export sales report (emailed to admin)
app.post('/api/reports/export/sales', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.DATA_EXPORT), async (req, res) => {
  try {
    const { format = 'xlsx', filters = {} } = req.body;
    
    const { exportSalesReport } = require('./utils/report-exporter');
    const result = await exportSalesReport({
      branchId: req.user.branchId,
      format,
      filters
    });
    
    res.json({
      success: true,
      message: result.message || 'Sales report has been generated and sent to admin email(s)'
    });
  } catch (error) {
    respondReportExportError(
      res,
      error,
      'Failed to export sales report',
      'Error exporting sales report:',
    );
  }
});

// Export summary report (emailed to admin)
app.post('/api/reports/export/summary', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.DATA_EXPORT), async (req, res) => {
  try {
    const { format = 'xlsx', filters = {} } = req.body;
    const { exportSummaryReport } = require('./utils/report-exporter');
    const result = await exportSummaryReport({
      branchId: req.user.branchId,
      format,
      filters
    });
    res.json({
      success: true,
      message: result.message || 'Summary report has been generated and sent to admin email(s)'
    });
  } catch (error) {
    respondReportExportError(
      res,
      error,
      'Failed to export summary report',
      'Error exporting summary report:',
    );
  }
});

// Export staff performance report (emailed to admin)
app.post('/api/reports/export/staff-performance', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.DATA_EXPORT), async (req, res) => {
  try {
    const { format = 'xlsx', filters = {}, data = [] } = req.body;
    const { exportStaffPerformanceReport } = require('./utils/report-exporter');
    const result = await exportStaffPerformanceReport({
      branchId: req.user.branchId,
      format,
      filters,
      data: Array.isArray(data) ? data : []
    });
    res.json({
      success: true,
      message: result.message || 'Staff performance report has been generated and sent to admin email(s)'
    });
  } catch (error) {
    respondReportExportError(
      res,
      error,
      'Failed to export staff performance report',
      'Error exporting staff performance report:',
    );
  }
});

// Export service list report (emailed to admin)
app.post('/api/reports/export/service-list', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.DATA_EXPORT), async (req, res) => {
  try {
    const { format = 'xlsx', filters = {} } = req.body;
    const { exportServiceListReport } = require('./utils/report-exporter');
    const result = await exportServiceListReport({
      branchId: req.user.branchId,
      format,
      filters
    });
    res.json({
      success: true,
      message: result.message || 'Service list report has been generated and sent to admin email(s)'
    });
  } catch (error) {
    respondReportExportError(
      res,
      error,
      'Failed to export service list report',
      'Error exporting service list report:',
    );
  }
});

// Export product list report (emailed to admin)
app.post('/api/reports/export/product-list', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.DATA_EXPORT), async (req, res) => {
  try {
    const { format = 'xlsx', filters = {} } = req.body;
    const { exportProductListReport } = require('./utils/report-exporter');
    const result = await exportProductListReport({
      branchId: req.user.branchId,
      format,
      filters
    });
    res.json({
      success: true,
      message: result.message || 'Product list report has been generated and sent to admin email(s)'
    });
  } catch (error) {
    respondReportExportError(
      res,
      error,
      'Failed to export product list report',
      'Error exporting product list report:',
    );
  }
});

// Get appointment list for report (with filters)
app.get('/api/reports/appointment-list', authenticateToken, setupBusinessDatabase, requireStaff, reportCacheMiddleware, async (req, res) => {
  try {
    const { Appointment, Client, Sale } = req.businessModels;
    const { dateFrom, dateTo, dateFilterType = 'appointment_date', status, showWalkIn } = req.query;

    const query = {};
    if (dateFrom && dateTo) {
      const fromStr = String(dateFrom);
      const toStr = String(dateTo);
      if (dateFilterType === 'created_date') {
        query.createdAt = {
          $gte: new Date(fromStr + 'T00:00:00.000Z'),
          $lte: new Date(toStr + 'T23:59:59.999Z')
        };
      } else {
        query.date = { $gte: fromStr, $lte: toStr };
      }
    }
    if (status && status !== 'all') {
      if (status === 'new') {
        query.status = { $in: ['scheduled', 'confirmed'] };
      } else {
        const statusMap = { arrived: 'arrived', started: 'service_started', completed: 'completed', cancelled: 'cancelled' };
        const dbStatus = statusMap[status] || status;
        query.status = dbStatus;
      }
    }
    if (showWalkIn === 'false' || showWalkIn === false) {
      query.$nor = [{ leadSource: new RegExp('^walk-in$', 'i') }];
    }

    const rawAppointments = await Appointment.find(query).sort({ date: -1, time: -1 }).limit(5000).lean();
    const clientIds = [...new Set(rawAppointments.map((a) => a.clientId).filter(Boolean))];
    const clients = clientIds.length ? await Client.find({ _id: { $in: clientIds } }).select('name').lean() : [];
    const clientMap = new Map(clients.map((c) => [c._id.toString(), c.name || '—']));

    const appointmentIds = rawAppointments.map((a) => a._id);
    const sales = appointmentIds.length ? await Sale.find({ appointmentId: { $in: appointmentIds } }).lean() : [];
    const saleByAppointmentId = new Map(sales.map((s) => [s.appointmentId?.toString(), s]));

    const rows = rawAppointments.map((apt) => {
      const sale = saleByAppointmentId.get(apt._id.toString());
      const totalAmount = sale?.paymentStatus?.totalAmount ?? sale?.grossTotal ?? 0;
      const paidAmount = sale?.paymentStatus?.paidAmount ?? 0;
      const paymentStatus = totalAmount <= 0 ? '—' : paidAmount >= totalAmount ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';
      const statusLabel = { scheduled: 'New', confirmed: 'New', arrived: 'Arrived', service_started: 'Started', completed: 'Completed', cancelled: 'Cancelled' }[apt.status] || apt.status;
      return {
        id: apt._id,
        customerName: clientMap.get(apt.clientId?.toString()) || '—',
        createdAt: apt.createdAt,
        startDate: apt.date,
        startTime: apt.time,
        price: apt.price ?? 0,
        status: statusLabel,
        paymentStatus,
        isWalkIn: false
      };
    });

    // When showWalkIn is true, add standalone sales (no appointmentId) as walk-in rows
    if (showWalkIn !== 'false' && showWalkIn !== false) {
      const saleQuery = {
        $or: [{ appointmentId: null }, { appointmentId: { $exists: false } }],
        'items.type': 'service'
      };
      if (dateFrom && dateTo) {
        const fromStr = String(dateFrom).split('T')[0];
        const toStr = String(dateTo).split('T')[0];
        if (dateFilterType === 'created_date') {
          saleQuery.createdAt = {
            $gte: new Date(fromStr + 'T00:00:00.000Z'),
            $lte: new Date(toStr + 'T23:59:59.999Z')
          };
        } else {
          saleQuery.date = { $gte: new Date(fromStr + 'T00:00:00.000Z'), $lte: new Date(toStr + 'T23:59:59.999Z') };
        }
      }
      if (status && status !== 'all') {
        if (status === 'cancelled') {
          saleQuery.status = { $in: ['cancelled', 'Cancelled'] };
        } else if (status === 'completed') {
          saleQuery.status = { $in: ['completed', 'Completed'] };
        }
        // new, arrived, started don't apply to sales - walk-ins are typically completed
      }
      const walkInSales = await Sale.find(saleQuery).sort({ date: -1, time: -1 }).limit(5000).lean();
      walkInSales.forEach((sale) => {
        const saleDate = sale.date ? new Date(sale.date) : null;
        const dateStr = saleDate ? saleDate.toISOString().slice(0, 10) : '';
        const totalAmount = sale.paymentStatus?.totalAmount ?? sale.grossTotal ?? 0;
        const paidAmount = sale.paymentStatus?.paidAmount ?? 0;
        const paymentStatus = totalAmount <= 0 ? '—' : paidAmount >= totalAmount ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';
        const statusStr = String(sale.status || '').toLowerCase();
        const statusLabel = statusStr === 'cancelled' ? 'Cancelled' : statusStr === 'completed' ? 'Completed' : 'Completed';
        rows.push({
          id: 'sale-' + sale._id,
          customerName: sale.customerName || '—',
          createdAt: sale.createdAt,
          startDate: dateStr,
          startTime: sale.time || '',
          price: sale.grossTotal ?? 0,
          status: statusLabel,
          paymentStatus,
          isWalkIn: true,
          billNo: sale.billNo
        });
      });
      rows.sort((a, b) => {
        const dA = a.startDate + (a.startTime || '');
        const dB = b.startDate + (b.startTime || '');
        return dB.localeCompare(dA);
      });
    }

    const totalValue = rows.reduce((sum, r) => sum + (r.price || 0), 0);
    res.json({
      success: true,
      data: rows,
      summary: { count: rows.length, totalValue }
    });
  } catch (error) {
    logger.error('Error fetching appointment list:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch appointment list'
    });
  }
});

// Get unpaid/part-paid bills for report (includes dues settled column + merged dues-only rows when status=all)
app.get('/api/reports/unpaid-part-paid', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.ADVANCED_REPORTS), reportCacheMiddleware, async (req, res) => {
  try {
    const { Sale } = req.businessModels;
    const { dateFrom, dateTo, status } = req.query;
    const branchId = req.user.branchId;
    const { fetchUnpaidPartPaidReportData } = require('./lib/unpaid-part-paid-report');
    const { rows, summary } = await fetchUnpaidPartPaidReportData({
      Sale,
      branchId,
      dateFrom,
      dateTo,
      status: status != null ? String(status) : 'all'
    });
    res.json({
      success: true,
      data: rows,
      summary
    });
  } catch (error) {
    logger.error('Error fetching unpaid/part-paid:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch unpaid/part-paid bills'
    });
  }
});

// Get deleted invoices (archived bills) for report
app.get('/api/reports/deleted-invoices', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.ADVANCED_REPORTS), reportCacheMiddleware, async (req, res) => {
  try {
    const { archivedAtRangeFromParams } = require('./utils/archived-date-query');
    const { BillArchive } = req.businessModels;
    const { date, dateFrom, dateTo } = req.query;
    const query = {};
    const range = archivedAtRangeFromParams({ dateFrom, dateTo, date });
    if (range) {
      query.archivedAt = range;
    }
    const archives = await BillArchive.find(query).sort({ archivedAt: -1 }).limit(5000).lean();
    const rows = archives.map((a) => ({
      id: a._id,
      billNo: a.billNo || a.originalBill?.billNo || '—',
      customerName: a.originalBill?.customerName || '—',
      date: a.archivedAt,
      reason: a.reason || '—',
      cancelledBy: a.archivedByName || '—',
      grossTotal: a.originalBill?.grossTotal ?? 0,
      originalBill: a.originalBill
    }));
    const totalValue = rows.reduce((sum, r) => sum + (r.grossTotal || 0), 0);
    res.json({
      success: true,
      data: rows,
      summary: { count: rows.length, totalValue }
    });
  } catch (error) {
    logger.error('Error fetching deleted invoices:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch deleted invoices'
    });
  }
});

// Export unpaid/part-paid report (emailed to admin only)
app.post('/api/reports/export/unpaid-part-paid', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.DATA_EXPORT), gate(FEATURE.ADVANCED_REPORTS), async (req, res) => {
  try {
    const { format = 'xlsx', filters = {} } = req.body;
    const { exportUnpaidPartPaidReport } = require('./utils/report-exporter');
    const result = await exportUnpaidPartPaidReport({
      branchId: req.user.branchId,
      format,
      filters
    });
    res.json({
      success: true,
      message: result.message || 'Unpaid/Part-Paid report has been sent to admin email(s)'
    });
  } catch (error) {
    respondReportExportError(
      res,
      error,
      'Failed to export unpaid/part-paid report',
      'Error exporting unpaid/part-paid report:',
    );
  }
});

// Export deleted invoices report (emailed to admin only)
app.post('/api/reports/export/deleted-invoices', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.DATA_EXPORT), gate(FEATURE.ADVANCED_REPORTS), async (req, res) => {
  try {
    const { format = 'xlsx', filters = {} } = req.body;
    const { exportDeletedInvoicesReport } = require('./utils/report-exporter');
    const result = await exportDeletedInvoicesReport({
      branchId: req.user.branchId,
      format,
      filters
    });
    res.json({
      success: true,
      message: result.message || 'Deleted invoice report has been sent to admin email(s)'
    });
  } catch (error) {
    respondReportExportError(
      res,
      error,
      'Failed to export deleted invoice report',
      'Error exporting deleted invoice report:',
    );
  }
});

// Export appointment list report (emailed to admin only)
app.post('/api/reports/export/appointment-list', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.DATA_EXPORT), async (req, res) => {
  try {
    const { format = 'xlsx', filters = {} } = req.body;
    const { exportAppointmentListReport } = require('./utils/report-exporter');
    const result = await exportAppointmentListReport({
      branchId: req.user.branchId,
      format,
      filters
    });
    res.json({
      success: true,
      message: result.message || 'Appointment list report has been sent to admin email(s)'
    });
  } catch (error) {
    respondReportExportError(
      res,
      error,
      'Failed to export appointment list report',
      'Error exporting appointment list report:',
    );
  }
});

// Tip payouts (for Staff Tip report - Mark as Paid)
app.get('/api/reports/tip-payouts', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.ADVANCED_REPORTS), reportCacheMiddleware, async (req, res) => {
  try {
    const { TipPayout } = req.businessModels;
    const { dateFrom, dateTo } = req.query;
    const query = {};
    if (dateFrom || dateTo) {
      query.paidAt = {};
      if (dateFrom) query.paidAt.$gte = new Date(dateFrom);
      if (dateTo) { const d = new Date(dateTo); d.setHours(23, 59, 59, 999); query.paidAt.$lte = d; }
    }
    const payouts = await TipPayout.find(query).sort({ paidAt: -1 }).lean();
    res.json({ success: true, data: payouts });
  } catch (error) {
    logger.error('Error fetching tip payouts:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch tip payouts' });
  }
});

app.post('/api/reports/tip-payouts', authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.ADVANCED_REPORTS), async (req, res) => {
  try {
    const { TipPayout } = req.businessModels;
    const { staffId, staffName, amount, dateFrom, dateTo } = req.body;
    if (!staffId || !staffName || amount == null || amount < 0) {
      return res.status(400).json({ success: false, error: 'staffId, staffName and amount (>= 0) are required' });
    }
    const branchId = req.user.branchId;
    const payout = await TipPayout.create({
      staffId,
      staffName,
      amount: Number(amount),
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      branchId
    });
    res.json({ success: true, data: payout });
  } catch (error) {
    logger.error('Error creating tip payout:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to create tip payout' });
  }
});

// ==================== GDPR Compliance Endpoints ====================

// Export user data (GDPR Right to Data Portability)
app.get('/api/gdpr/export/:userId', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { userId } = req.params
    const { User, Client, Sale, Appointment, Product, Service, Expense, Receipt, CashRegistry } = req.businessModels

    // Verify user can only export their own data (unless admin)
    if (req.user.role !== 'admin' && req.user._id?.toString() !== userId && req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only export your own data'
      })
    }

    // Find user
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      })
    }

    // Collect all user-related data
    const exportData = {
      exportDate: new Date().toISOString(),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      // If user is business owner/admin, include business data
      businessData: null,
      personalData: {
        profile: {
          firstName: user.firstName,
          lastName: user.lastName,
          mobile: user.mobile,
          avatar: user.avatar
        }
      },
      // Sales created by this user
      salesCreated: [],
      // Appointments assigned to this user
      appointments: [],
      // Clients (if user has access)
      clients: [],
      metadata: {
        exportVersion: '1.0',
        gdprCompliant: true
      }
    }

    // Get sales created by this user
    try {
      const sales = await Sale.find({ createdBy: userId }).lean()
      exportData.salesCreated = sales.map(sale => ({
        id: sale._id,
        date: sale.date,
        clientName: sale.clientName,
        total: sale.grossTotal,
        items: sale.items,
        paymentMode: sale.paymentMode
      }))
    } catch (err) {
      logger.error('Error fetching sales:', err)
    }

    // Get appointments assigned to this user
    try {
      const appointments = await Appointment.find({ 
        $or: [
          { assignedStaff: userId },
          { createdBy: userId }
        ]
      })
        .limit(10000)
        .lean()
      exportData.appointments = appointments.map(apt => ({
        id: apt._id,
        clientName: apt.clientName,
        serviceName: apt.serviceName,
        date: apt.date,
        time: apt.time,
        status: apt.status
      }))
    } catch (err) {
      logger.error('Error fetching appointments:', err)
    }

    // If admin/owner, include business-wide data
    if (req.user.role === 'admin' || req.user.role === 'manager') {
      try {
        const Business = req.businessModels.Business
        const business = await Business.findOne({ _id: req.user.businessId })
        if (business) {
          exportData.businessData = {
            businessName: business.name,
            businessCode: business.code,
            address: business.address,
            phone: business.phone,
            email: business.email
          }
        }
      } catch (err) {
        logger.error('Error fetching business data:', err)
      }
    }

    // Generate export file and send via email to admin
    try {
      const emailService = require('./services/email-service');
      
      // Ensure email service is initialized
      if (!emailService.initialized) {
        await emailService.initialize();
      }
      
      // Check if email service is enabled
      if (emailService.enabled) {
        // Get Business from main database
        const databaseManager = require('./config/database-manager');
        const mainConnection = await databaseManager.getMainConnection();
        const Business = mainConnection.model('Business', require('./models/Business').schema);
        const business = await Business.findById(req.user.branchId);
        if (!business) {
          return res.status(400).json({ success: false, error: 'Business not found' });
        }
        if (isPlatformEmailDisabled(business)) {
          return res.status(403).json({
            success: false,
            error: 'Email notifications are disabled for this business by the platform administrator.'
          });
        }
        const emailSettings = business.settings?.emailNotificationSettings;
        
        // Generate JSON file from export data
        const exportFileName = `export-${user.name || user.email || userId}-${new Date().toISOString().split('T')[0]}.json`;
        const exportFileContent = JSON.stringify(exportData, null, 2);
        const exportFileBuffer = Buffer.from(exportFileContent, 'utf-8');
        
        // Get admin users to send export to
        const User = mainConnection.model('User', require('./models/User').schema);
        const adminUsers = await User.find({
          branchId: req.user.branchId,
          role: 'admin',
          email: { $exists: true, $ne: '' }
        }).lean();
        
        // If no admin users found, try to get the requesting user if they're admin
        let recipients = [...adminUsers];
        if (recipients.length === 0 && req.user.role === 'admin' && req.user.email) {
          recipients.push({
            email: req.user.email,
            name: req.user.name || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
            role: 'admin'
          });
        }
        
        // Send export file to admin recipients only
        if (recipients.length === 0) {
          logger.debug(`⚠️ No admin email found to send export to`);
          return res.status(400).json({
            success: false,
            error: 'No admin email found. Please ensure at least one admin user has an email address configured.'
          });
        }
        
        // Prepare attachment
        const attachment = {
          filename: exportFileName,
          content: exportFileBuffer.toString('base64')
        };
        
        // Send export file to all recipients
        for (const recipient of recipients) {
          try {
            logger.debug(`📧 Sending export file to ${recipient.role}: ${recipient.email}`);
            const exportEmailResult = await emailService.sendExportReady({
              to: recipient.email,
              exportType: 'User Data Export',
              businessName: business?.name || 'Business',
              attachments: [attachment]
            });
            logger.debug(`✅ Export file sent to ${recipient.email}`);
            logEmailMessage({
              businessId: business?._id,
              recipientEmail: recipient.email,
              messageType: 'system',
              result: {
                success: exportEmailResult ? exportEmailResult.success !== false : true,
                error: exportEmailResult?.error,
                data: exportEmailResult?.data,
              },
              subject: 'User Data Export Ready',
              provider: emailService?.provider,
            });
          } catch (emailError) {
            logEmailMessage({
              businessId: business?._id,
              recipientEmail: recipient.email,
              messageType: 'system',
              result: { success: false, error: emailError?.message || String(emailError) },
              subject: 'User Data Export Ready',
              provider: emailService?.provider,
            });
            logger.error(`❌ Error sending export file to ${recipient.email}:`, emailError);
            logger.error(`❌ Error details:`, {
              message: emailError.message,
              stack: emailError.stack
            });
          }
        }
      } else {
        logger.debug(`⚠️ Email service is disabled, cannot send export file`);
        return res.status(400).json({
          success: false,
          error: 'Email service is disabled. Please enable email service to receive export files.'
        });
      }
    } catch (emailError) {
      logger.error('Error sending export file:', emailError);
      return res.status(500).json({
        success: false,
        error: 'Failed to send export file via email. Please try again later.'
      });
    }

    // Return success message instead of data
    res.json({
      success: true,
      message: 'Export file has been generated and sent to admin email(s)',
      data: {
        exportDate: exportData.exportDate,
        user: {
          id: exportData.user.id,
          name: exportData.user.name,
          email: exportData.user.email
        }
      }
    })
  } catch (error) {
    logger.error('Error exporting user data:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to export user data'
    })
  }
})

// Delete user data (GDPR Right to Erasure / Right to be Forgotten)
app.delete('/api/gdpr/delete/:userId', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { userId } = req.params
    const { User, Client, Sale, Appointment } = req.businessModels

    // Verify user can only delete their own data (unless admin)
    if (req.user.role !== 'admin' && req.user._id?.toString() !== userId && req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own account'
      })
    }

    // Prevent deletion of last admin
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      })
    }

    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin', businessId: user.businessId })
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete the last admin user. Please assign another admin first.'
        })
      }
    }

    // Mark user for deletion (soft delete with 30-day retention as per GDPR)
    const deletionDate = new Date()
    deletionDate.setDate(deletionDate.getDate() + 30) // 30 days retention

    await User.findByIdAndUpdate(userId, {
      deletedAt: new Date(),
      deletionScheduledFor: deletionDate,
      email: `deleted_${Date.now()}_${user.email}`, // Anonymize email
      name: 'Deleted User',
      isDeleted: true
    })

    // Anonymize sales created by this user (keep for business records but remove personal identifiers)
    await Sale.updateMany(
      { createdBy: userId },
      { 
        $set: { 
          createdBy: null,
          staffName: 'Deleted User'
        }
      }
    )

    // Remove appointments assigned to this user
    await Appointment.deleteMany({ assignedStaff: userId })

    res.json({
      success: true,
      message: 'Account marked for deletion. Data will be permanently deleted within 30 days.',
      deletionDate: deletionDate.toISOString()
    })
  } catch (error) {
    logger.error('Error deleting user data:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete user data'
    })
  }
})

// Get consent status
app.get('/api/gdpr/consent/:userId', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { userId } = req.params
    const { Staff } = req.businessModels

    if (!Staff) {
      return res.status(500).json({
        success: false,
        error: 'Staff model not available'
      })
    }

    if (req.user.role !== 'admin' && req.user._id?.toString() !== userId && req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      })
    }

    const staff = await Staff.findById(userId).select('consentPreferences consentUpdatedAt')
    res.json({
      success: true,
      data: {
        consent: staff?.consentPreferences || null,
        lastUpdated: staff?.consentUpdatedAt || null
      }
    })
  } catch (error) {
    logger.error('Error fetching consent status:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch consent status',
      message: error.message
    })
  }
})

// Update consent
app.post('/api/gdpr/consent/:userId', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { userId } = req.params
    const { consent } = req.body
    const { Staff } = req.businessModels

    if (!Staff) {
      return res.status(500).json({
        success: false,
        error: 'Staff model not available'
      })
    }

    if (req.user.role !== 'admin' && req.user._id?.toString() !== userId && req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      })
    }

    await Staff.findByIdAndUpdate(userId, {
      consentPreferences: consent,
      consentUpdatedAt: new Date()
    })

    res.json({
      success: true,
      message: 'Consent preferences updated'
    })
  } catch (error) {
    logger.error('Error updating consent:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update consent'
    })
  }
})

// Email service status check
app.get('/api/email-service/status', authenticateToken, async (req, res) => {
  try {
    const emailService = require('./services/email-service');
    
    // Ensure email service is initialized
    if (!emailService.initialized) {
      await emailService.initialize();
    }
    
    res.json({
      success: true,
      data: {
        initialized: emailService.initialized,
        enabled: emailService.enabled,
        provider: emailService.provider,
        hasConfig: !!emailService.config
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Something went wrong!'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Start server

const server = app.listen(PORT, '0.0.0.0', async () => {
  // Stamp default-on email policy for existing businesses (one-time per DB)
  try {
    const databaseManager = require('./config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('./models/Business').schema);
    const { migrateBusinessEmailDefaultsV1 } = require('./lib/migrate-business-email-defaults-v1');
    await migrateBusinessEmailDefaultsV1(Business);
  } catch (migrateErr) {
    logger.error('Business email defaults migration failed:', migrateErr);
  }

  logger.debug(`🚀 EaseMySalon Backend running on port ${PORT}`);
  logger.debug(`📊 Health check: http://localhost:${PORT}/health / http://localhost:${PORT}/api/health (also /api/v1/health)`);
  logger.debug(`🔐 API base: http://localhost:${PORT}/api — versioned alias: http://localhost:${PORT}/api/v1`);
  // Old initialization functions disabled for multi-tenant architecture
  // Admin users should be created via create-admin.js script
  // await initializeDefaultUsers();
  // await initializeBusinessSettings();
  
  // Setup cron job for inactivity checking (disabled - module not yet created)
  // setupInactivityChecker();
  
  // Setup email scheduler jobs
  const { setupEmailScheduler } = require('./jobs/email-scheduler');
  setupEmailScheduler();

  const { setupBranchManagementJobs } = require('./jobs/branch-management-nightly');
  setupBranchManagementJobs();

  const { startClientWalletExpiryJob } = require('./jobs/client-wallet-expiry-job');
  startClientWalletExpiryJob();

  const { startTenantActivityLogRetentionJob } = require('./jobs/tenant-activity-log-retention');
  startTenantActivityLogRetentionJob();

  // Setup WhatsApp appointment reminder cron job (every 30 min)
  const { setupAppointmentReminderJob } = require('./jobs/appointment-reminder');
  setupAppointmentReminderJob();

  // Gupshup: partner-token warm-up + per-app health refresh (12h).
  try {
    const { start: startGupshupTokenRefresh } = require('./jobs/gupshup-token-refresh');
    startGupshupTokenRefresh();
    logger.debug('⏰ Gupshup token refresh job scheduled');
  } catch (err) {
    logger.warn('⚠️  Gupshup token refresh could not be scheduled:', err?.message || err);
  }

  // WhatsApp campaign scheduler: polls every minute for due campaigns.
  try {
    const { start: startWaCampaignScheduler } = require('./jobs/whatsapp-campaign-scheduler');
    startWaCampaignScheduler();
    logger.debug('⏰ WhatsApp campaign scheduler started');
  } catch (err) {
    logger.warn('⚠️  WhatsApp campaign scheduler could not be started:', err?.message || err);
  }

  // Google Business Profile integration jobs
  try {
    const { setupGmbJobs } = require('./jobs/gmb-jobs-bootstrap');
    setupGmbJobs();
  } catch (err) {
    logger.warn('⚠️  GMB jobs could not be scheduled:', err?.message || err);
  }
  
  // Initialize email service on server start
  const emailService = require('./services/email-service');
  emailService.initialize().catch(err => {
    logger.error('⚠️  Failed to initialize email service:', err.message);
  });
});

const { registerGracefulShutdown } = require('./utils/shutdown');
const { closeRedis } = require('./lib/redis');
const { closeCampaignQueue } = require('./lib/whatsapp-campaign-queue');
const { closeLegacyCampaignQueue } = require('./lib/legacy-campaign-queue');
if (process.env.WHATSAPP_CAMPAIGN_WORKER_INLINE === '1') {
  const { startCampaignWorker } = require('./lib/whatsapp-campaign-queue');
  startCampaignWorker();
}
if (process.env.LEGACY_CAMPAIGN_WORKER_INLINE === '1') {
  const { startLegacyCampaignWorker } = require('./lib/legacy-campaign-queue');
  startLegacyCampaignWorker();
}
registerGracefulShutdown(server, [
  { name: 'rate-limit-redis', close: shutdownRateLimitInfrastructure },
  { name: 'shared-redis', close: closeRedis },
  { name: 'whatsapp-campaign-queue', close: closeCampaignQueue },
  { name: 'legacy-campaign-queue', close: closeLegacyCampaignQueue },
  {
    name: 'tenant-database-connections',
    close: () => databaseManager.closeAllConnections(),
  },
]);

// Setup inactivity checker cron job
function setupInactivityChecker() {
  // Run every day at 2 AM
  cron.schedule('0 2 * * *', async () => {
    logger.debug('🕐 Running daily inactivity check...');
    const { checkInactiveBusinesses } = require('./inactivity-checker');
    await checkInactiveBusinesses();
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });
  
  logger.debug('⏰ Inactivity checker scheduled to run daily at 2 AM IST');
}

