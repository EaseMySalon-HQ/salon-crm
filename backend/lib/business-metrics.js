/**
 * Fetch per-business metrics from business-specific DB (staff count, sale count, revenue).
 * Used by admin business list for Users, Invoices, Revenue columns.
 */

const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { logger } = require('../utils/logger');

/**
 * Get users count, invoices count, and revenue for one business.
 * @param {string} businessCode - Business code (e.g. BIZ0001)
 * @param {object} mainConnection - Main DB connection (for getConnection lookup if needed)
 * @returns {Promise<{ usersCount: number, invoicesCount: number, revenue: number }>}
 */
async function getBusinessMetrics(businessCode, mainConnection) {
  const result = { usersCount: 0, invoicesCount: 0, revenue: 0 };
  if (!businessCode) return result;

  let conn;
  try {
    conn = await databaseManager.getConnection(businessCode, mainConnection);
    const models = modelFactory.createBusinessModels(conn);
    const Staff = models.Staff;
    const Sale = models.Sale;

    const [usersCount, invoicesCount, revenueArr] = await Promise.all([
      Staff.countDocuments(),
      Sale.countDocuments(),
      Sale.aggregate([
        { $match: { status: { $in: ['completed', 'Completed'] } } },
        { $group: { _id: null, total: { $sum: '$grossTotal' } } },
      ]).option({ allowDiskUse: true }),
    ]);
    const revenueResult = revenueArr && revenueArr[0] && typeof revenueArr[0].total === 'number' ? revenueArr[0].total : 0;

    result.usersCount = usersCount || 0;
    result.invoicesCount = invoicesCount || 0;
    result.revenue = revenueResult || 0;
  } catch (err) {
    logger.warn(`[business-metrics] ${businessCode}:`, err.message);
  }
  return result;
}

/**
 * Attach metrics and nextBilling to an array of business documents (from main DB).
 * Mutates each item to add usersCount, invoicesCount, revenue, nextBillingDate.
 * @param {Array} businesses - Array of business docs (with code, plan)
 * @param {object} mainConnection - Main DB connection
 */
async function attachMetricsToBusinesses(businesses, mainConnection) {
  if (!Array.isArray(businesses) || businesses.length === 0) return;

  const metrics = await Promise.all(
    businesses.map((b) => getBusinessMetrics(b.code || b._id?.toString(), mainConnection))
  );

  businesses.forEach((b, i) => {
    const m = metrics[i] || {};
    b.usersCount = m.usersCount ?? 0;
    b.invoicesCount = m.invoicesCount ?? 0;
    b.revenue = m.revenue ?? 0;
    b.nextBillingDate = b.plan?.renewalDate || b.plan?.trialEndsAt || null;
  });
}

module.exports = { getBusinessMetrics, attachMetricsToBusinesses };
