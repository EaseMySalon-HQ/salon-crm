/**
 * Build staff incentive rows for a date range (used by monthly email job).
 */

const { getPreviousMonthRangeIST } = require('../utils/date-utils');
const {
  enrichSalesWithServiceIdsFromCatalog,
  enrichSalesWithProductIdsFromCatalog,
  calculateAllStaffCommission,
} = require('./commission-profile-calculator');
const {
  mergeAttendancePayrollSettings,
} = require('./attendance-payroll-settings');

/**
 * @param {object} businessModels
 * @param {string|import('mongoose').Types.ObjectId} branchId
 * @param {{ start?: Date, end?: Date, startYmd?: string, endYmd?: string, periodLabel?: string }} [range]
 */
async function buildStaffIncentiveSummaryForRange(businessModels, branchId, range) {
  const period = range?.start && range?.end
    ? {
        start: range.start,
        end: range.end,
        startYmd: range.startYmd,
        endYmd: range.endYmd,
        periodLabel: range.periodLabel || `${range.startYmd} – ${range.endYmd}`,
      }
    : getPreviousMonthRangeIST();

  const { Sale, Staff, CommissionProfile, Service, Product, BusinessSettings } = businessModels;

  const [sales, staffMembers, commissionProfiles, services, products, settingsDoc] = await Promise.all([
    Sale.find({
      branchId,
      date: { $gte: period.start, $lte: period.end },
      status: { $nin: ['cancelled', 'Cancelled'] },
    })
      .select('billNo date staffId staffName items customerId customerName paymentStatus status')
      .lean(),
    Staff.find({ branchId, isActive: true })
      .select('_id firstName lastName name commissionProfileIds')
      .lean(),
    CommissionProfile.find({ isActive: true }).lean(),
    Service.find({ isActive: { $ne: false } }).select('_id name').lean(),
    Product.find({ isActive: { $ne: false } }).select('_id name').lean(),
    BusinessSettings
      ? BusinessSettings.findOne().select('attendancePayroll').lean()
      : Promise.resolve(null),
  ]);

  const salesCopy = sales.map((s) => ({
    ...s,
    items: Array.isArray(s.items) ? s.items.map((item) => ({ ...item })) : [],
  }));

  enrichSalesWithServiceIdsFromCatalog(salesCopy, services);
  enrichSalesWithProductIdsFromCatalog(salesCopy, products);

  const commissionSettings = mergeAttendancePayrollSettings(settingsDoc?.attendancePayroll).payroll.commission;

  const rows = calculateAllStaffCommission(salesCopy, staffMembers, commissionProfiles, commissionSettings).map((row) => ({
    staffId: row.staffId,
    staffName: row.staffName,
    totalRevenue: row.totalRevenue,
    serviceRevenue: row.serviceRevenue,
    productRevenue: row.productRevenue,
    serviceCommission: row.serviceCommission,
    productCommission: row.productCommission,
    totalCommission: row.totalCommission,
    totalTransactions: row.totalTransactions,
    effectiveCommissionRate: row.effectiveCommissionRate,
    profileBreakdown: row.profileBreakdown,
  }));

  const totalRevenue = rows.reduce((sum, r) => sum + (r.totalRevenue || 0), 0);
  const totalCommission = rows.reduce((sum, r) => sum + (r.totalCommission || 0), 0);

  return {
    period,
    rows,
    totals: {
      staffCount: rows.length,
      totalRevenue,
      totalCommission,
      billCount: sales.length,
    },
  };
}

module.exports = {
  buildStaffIncentiveSummaryForRange,
  getPreviousMonthRangeIST,
};
