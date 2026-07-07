'use strict';

const {
  enrichSalesWithServiceIdsFromCatalog,
  enrichSalesWithProductIdsFromCatalog,
  calculateSaleCommission,
} = require('./commission-profile-calculator');
const { mergeAttendancePayrollSettings } = require('./attendance-payroll-settings');

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Detailed commission breakdown for one staff member in a date range.
 */
async function buildStaffCommissionBreakdown(businessModels, branchId, staffId, range) {
  const { Sale, Staff, CommissionProfile, Service, Product, BusinessSettings } = businessModels;

  const staff = await Staff.findOne({ _id: staffId, branchId })
    .select('_id name commissionProfileIds')
    .lean();
  if (!staff) return null;

  const profileIds = (staff.commissionProfileIds || []).map(String);
  const [sales, commissionProfiles, services, products, settingsDoc] = await Promise.all([
    Sale.find({
      branchId,
      date: { $gte: range.start, $lte: range.end },
      status: { $nin: ['cancelled', 'Cancelled'] },
    })
      .select('billNo date staffId staffName items customerName paymentStatus status')
      .sort({ date: -1 })
      .lean(),
    CommissionProfile.find({ isActive: true }).lean(),
    Service.find({ isActive: { $ne: false } }).select('_id name').lean(),
    Product.find({ isActive: { $ne: false } }).select('_id name').lean(),
    BusinessSettings
      ? BusinessSettings.findOne().select('attendancePayroll').lean()
      : Promise.resolve(null),
  ]);

  const commissionSettings = mergeAttendancePayrollSettings(settingsDoc?.attendancePayroll).payroll.commission;

  const staffProfiles = commissionProfiles.filter((p) =>
    profileIds.includes(String(p._id ?? p.id ?? ''))
  );
  if (staffProfiles.length === 0) {
    return {
      staffId: String(staffId),
      staffName: staff.name || '',
      totalCommission: 0,
      profileBreakdown: [],
      sales: [],
    };
  }

  const salesCopy = sales.map((s) => ({
    ...s,
    items: Array.isArray(s.items) ? s.items.map((item) => ({ ...item })) : [],
  }));
  enrichSalesWithServiceIdsFromCatalog(salesCopy, services);
  enrichSalesWithProductIdsFromCatalog(salesCopy, products);

  const staffName = staff.name || '';
  const saleRows = [];
  let totalCommission = 0;
  const profileMap = new Map();

  for (const sale of salesCopy) {
    const result = calculateSaleCommission(
      sale,
      staffProfiles,
      String(staffId),
      staffName,
      commissionSettings
    );
    if (!result || result.totalCommission <= 0) continue;

    totalCommission += result.totalCommission;
    saleRows.push({
      billNo: sale.billNo || '',
      date: sale.date,
      customerName: sale.customerName || '',
      revenue: round2(result.totalRevenue),
      commission: round2(result.totalCommission),
      serviceCommission: round2(result.serviceCommission),
      productCommission: round2(result.productCommission),
      profileBreakdown: result.profileBreakdown || [],
    });

    for (const pb of result.profileBreakdown || []) {
      const key = pb.profileId || pb.profileName;
      const existing = profileMap.get(key);
      if (existing) {
        existing.commission += pb.commission || 0;
        existing.revenue += pb.revenue || 0;
        existing.itemCount += pb.itemCount || 0;
      } else {
        profileMap.set(key, { ...pb });
      }
    }
  }

  return {
    staffId: String(staffId),
    staffName,
    totalCommission: round2(totalCommission),
    profileBreakdown: Array.from(profileMap.values()),
    sales: saleRows,
  };
}

module.exports = {
  buildStaffCommissionBreakdown,
};
