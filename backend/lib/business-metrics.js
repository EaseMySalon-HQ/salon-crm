/**
 * Per-tenant metrics (staff count, invoice count, revenue) for admin business list.
 * Each business has its own database; we minimize round-trips per tenant and cap concurrent tenant work.
 */

const pLimit = require('p-limit');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { logger } = require('../utils/logger');

const METRICS_CONCURRENCY = Math.min(
  5,
  Math.max(3, parseInt(process.env.BUSINESS_METRICS_CONCURRENCY || '4', 10) || 4)
);

const COMPLETED_STATUSES = ['completed', 'Completed'];

/**
 * One Sale aggregation: total invoice count + revenue for completed sales (replaces count + separate aggregate).
 * @param {import('mongoose').Model} Sale
 */
async function aggregateSaleMetrics(Sale) {
  const rows = await Sale.aggregate([
    {
      $facet: {
        invoicesCount: [{ $count: 'c' }],
        revenue: [
          { $match: { status: { $in: COMPLETED_STATUSES } } },
          { $group: { _id: null, total: { $sum: '$grossTotal' } } },
        ],
      },
    },
  ])
    .option({ allowDiskUse: true })
    .exec();

  const facet = rows && rows[0];
  const invoicesCount = facet?.invoicesCount?.[0]?.c ?? 0;
  const revenueRaw = facet?.revenue?.[0]?.total;
  const revenue = typeof revenueRaw === 'number' && !Number.isNaN(revenueRaw) ? revenueRaw : 0;
  return { invoicesCount, revenue };
}

/**
 * Two DB operations per tenant: Staff count + Sale $facet (parallel).
 * @param {import('mongoose').Connection} conn
 */
async function fetchMetricsForTenantConnection(conn) {
  const { Staff, Sale } = modelFactory.getCachedBusinessModels(conn);
  const [usersCount, saleMetrics] = await Promise.all([
    Staff.countDocuments().exec(),
    aggregateSaleMetrics(Sale),
  ]);
  return {
    usersCount: usersCount || 0,
    invoicesCount: saleMetrics.invoicesCount || 0,
    revenue: saleMetrics.revenue || 0,
  };
}

/**
 * Get users count, invoices count, and revenue for one business (tenant DB).
 * @param {string} businessCode - Business code (e.g. BIZ0001) or ObjectId string
 * @param {object} mainConnection - Main DB connection (for code lookup when needed)
 * @returns {Promise<{ usersCount: number, invoicesCount: number, revenue: number }>}
 */
async function getBusinessMetrics(businessCode, mainConnection) {
  const result = { usersCount: 0, invoicesCount: 0, revenue: 0 };
  if (!businessCode) return result;

  let conn;
  try {
    conn = await databaseManager.getConnection(businessCode, mainConnection);
    return await fetchMetricsForTenantConnection(conn);
  } catch (err) {
    logger.warn(`[business-metrics] ${businessCode}:`, err.message);
  }
  return result;
}

function businessKey(b) {
  return b.code || (b._id && b._id.toString()) || '';
}

/**
 * Attach metrics and nextBilling to business documents from the main DB.
 * Deduplicates tenant lookups by code; bounded concurrency (no unbounded Promise.all).
 * @param {Array} businesses
 * @param {object} mainConnection
 */
async function attachMetricsToBusinesses(businesses, mainConnection) {
  if (!Array.isArray(businesses) || businesses.length === 0) return;

  const uniqueKeys = [...new Set(businesses.map(businessKey).filter(Boolean))];
  const limit = pLimit(METRICS_CONCURRENCY);
  const metricsByKey = new Map();

  await Promise.all(
    uniqueKeys.map((key) =>
      limit(async () => {
        const m = await getBusinessMetrics(key, mainConnection);
        metricsByKey.set(key, m);
      })
    )
  );

  businesses.forEach((b) => {
    const key = businessKey(b);
    const m = metricsByKey.get(key) || {};
    b.usersCount = m.usersCount ?? 0;
    b.invoicesCount = m.invoicesCount ?? 0;
    b.revenue = m.revenue ?? 0;
    b.nextBillingDate = b.plan?.renewalDate || b.plan?.trialEndsAt || null;
  });
}

const IST_ZONE = 'Asia/Kolkata';

const istCalendarDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getNextBillingFromPlan(plan) {
  if (!plan) return null;
  return plan.renewalDate || plan.trialEndsAt || null;
}

/**
 * True when the next-billing calendar day in IST is strictly before today's calendar day in IST.
 * Matches how "Next billing" is shown as a date (not a precise instant).
 */
function isNextBillingCalendarDayBeforeTodayInIST(nextBillingDate) {
  if (!nextBillingDate) return false;
  const billDay = istCalendarDayFormatter.format(new Date(nextBillingDate));
  const today = istCalendarDayFormatter.format(new Date());
  return billDay < today;
}

/**
 * Set status to suspended when still "active" but next billing date has passed (IST calendar days).
 * No next billing date = leave as-is (manual / unmanaged billing).
 */
async function syncOverdueBillingSuspensions(businesses, BusinessModel) {
  if (!Array.isArray(businesses) || businesses.length === 0 || !BusinessModel) return;

  const idsToSuspend = [];
  for (const b of businesses) {
    if (b.status !== 'active') continue;
    const next = getNextBillingFromPlan(b.plan);
    if (!next) continue;
    if (!isNextBillingCalendarDayBeforeTodayInIST(next)) continue;
    idsToSuspend.push(b._id);
    b.status = 'suspended';
  }
  if (idsToSuspend.length === 0) return;

  await BusinessModel.updateMany(
    { _id: { $in: idsToSuspend }, status: 'active' },
    { $set: { status: 'suspended', updatedAt: new Date() } }
  ).exec();
}

async function syncAllOverdueBillingSuspensions(BusinessModel) {
  if (!BusinessModel) return;
  const active = await BusinessModel.find({ status: 'active' }).select('_id plan status').lean();
  await syncOverdueBillingSuspensions(active, BusinessModel);
}

module.exports = {
  getBusinessMetrics,
  attachMetricsToBusinesses,
  syncOverdueBillingSuspensions,
  syncAllOverdueBillingSuspensions,
};
