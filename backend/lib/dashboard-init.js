/**
 * Aggregated payload for GET /api/dashboard/init — single round-trip for CRM dashboard.
 * Uses counts/aggregations; avoids full product/service lists and client-side merge pagination.
 */

const mongoose = require('mongoose');
const {
  getTodayIST,
  getStartOfDayIST,
  getEndOfDayIST,
  parseDateIST,
  parseTimeToMinutes,
} = require('../utils/date-utils');

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * @param {object} params
 * @param {import('mongoose').Types.ObjectId} params.branchId
 * @param {object} params.businessModels - req.businessModels from setupBusinessDatabase
 * @param {object} params.user - req.user (tenant)
 * @returns {Promise<object>} payload under { success, data }
 */
async function buildDashboardInitPayload({ branchId, businessModels, user }) {
  const {
    Service,
    Product,
    Staff,
    Client,
    Appointment,
    Receipt,
    Sale,
    MembershipSubscription,
    BusinessSettings,
  } = businessModels;

  const bid = branchId instanceof mongoose.Types.ObjectId ? branchId : new mongoose.Types.ObjectId(String(branchId));

  const todayStr = getTodayIST();
  const todayStart = getStartOfDayIST(todayStr);
  const todayEnd = getEndOfDayIST(todayStr);
  const year = parseInt(todayStr.slice(0, 4), 10);
  const yearStartStr = `${year}-01-01`;
  const yearEndStr = `${year}-12-31`;
  const yearStartDate = getStartOfDayIST(yearStartStr);
  const yearEndDate = getEndOfDayIST(yearEndStr);

  // --- Parallel independent queries ---
  const [
    businessSettingsLean,
    totalClients,
    totalServicesCount,
    totalProductsCount,
    totalStaff,
    totalAppointmentsAllTime,
    totalReceiptsCount,
    receiptRevenueAgg,
    membershipBlock,
    todaysCompletedRevenueAgg,
    todaysAppointmentCount,
    serviceAgg,
    productAgg,
    appointmentsByMonth,
    salesRevenueByMonth,
    todayAppointmentsDocs,
    upcomingCandidates,
  ] = await Promise.all([
    // Business DB is tenant-scoped; single settings document per tenant.
    BusinessSettings.findOne().select('name currency').lean(),
    Client.countDocuments({ branchId: bid }),
    Service.countDocuments({ branchId: bid }),
    Product.countDocuments({ branchId: bid }),
    Staff.countDocuments({ branchId: bid }),
    Appointment.countDocuments({ branchId: bid }),
    Receipt.countDocuments({ branchId: bid }),
    Receipt.aggregate([
      { $match: { branchId: bid } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$total', 0] } } } },
    ]),
    (async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const in30 = new Date(today);
      in30.setDate(in30.getDate() + 30);
      const totalActiveMembers = await MembershipSubscription.countDocuments({
        branchId: bid,
        status: 'ACTIVE',
        expiryDate: { $gte: today },
      });
      const activeSubscriptions = await MembershipSubscription.find({
        branchId: bid,
        status: 'ACTIVE',
        expiryDate: { $gte: today },
      })
        .populate('planId', 'price')
        .lean();
      const membershipRevenue = activeSubscriptions.reduce((sum, sub) => sum + (sub.planId?.price || 0), 0);
      const membersExpiringIn30Days = await MembershipSubscription.countDocuments({
        branchId: bid,
        status: 'ACTIVE',
        expiryDate: { $gte: today, $lte: in30 },
      });
      return { totalActiveMembers, membershipRevenue, membersExpiringIn30Days };
    })(),
    Sale.aggregate([
      {
        $match: {
          branchId: bid,
          date: { $gte: todayStart, $lte: todayEnd },
          status: { $regex: /^completed$/i },
        },
      },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$grossTotal', 0] } } } },
    ]),
    Appointment.countDocuments({ branchId: bid, date: todayStr }),
    Service.aggregate([
      { $match: { branchId: bid } },
      {
        $group: {
          _id: null,
          totalServices: { $sum: 1 },
          averagePrice: { $avg: { $ifNull: ['$price', 0] } },
          averageDuration: { $avg: { $ifNull: ['$duration', 0] } },
        },
      },
    ]),
    Product.aggregate([
      { $match: { branchId: bid } },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          lowStockCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$stock', null] },
                    {
                      $lt: [
                        '$stock',
                        { $ifNull: ['$minimumStock', 10] },
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
          totalValue: {
            $sum: {
              $multiply: [
                { $ifNull: ['$price', 0] },
                { $ifNull: ['$stock', 0] },
              ],
            },
          },
          categoriesArr: { $addToSet: '$category' },
        },
      },
    ]),
    Appointment.aggregate([
      {
        $match: {
          branchId: bid,
          date: { $gte: yearStartStr, $lte: yearEndStr },
        },
      },
      {
        $project: {
          month: { $toInt: { $substr: ['$date', 5, 2] } },
        },
      },
      { $group: { _id: '$month', count: { $sum: 1 } } },
    ]),
    Sale.aggregate([
      {
        $match: {
          branchId: bid,
          date: { $gte: yearStartDate, $lte: yearEndDate },
          $nor: [{ status: /cancelled/i }],
        },
      },
      {
        $group: {
          _id: { $month: '$date' },
          revenue: { $sum: { $ifNull: ['$grossTotal', 0] } },
        },
      },
    ]),
    Appointment.find({ branchId: bid, date: todayStr })
      .populate('clientId', 'name phone email')
      .populate('serviceId', 'name price duration')
      .sort({ time: 1 })
      .limit(80)
      .lean(),
    Appointment.find({
      branchId: bid,
      date: { $gte: todayStr },
      status: { $nin: ['cancelled', 'missed'] },
    })
      .populate('clientId', 'name phone email')
      .populate('serviceId', 'name price duration')
      .sort({ date: 1, time: 1 })
      .limit(120)
      .lean(),
  ]);

  const receiptTotal = receiptRevenueAgg[0]?.total || 0;
  const todaysCompletedRevenue = todaysCompletedRevenueAgg[0]?.total || 0;

  const svc = serviceAgg[0] || {};
  const serviceAggregates = {
    totalServices: svc.totalServices || 0,
    averagePrice: Math.round(svc.averagePrice || 0),
    averageDuration: Math.round(svc.averageDuration || 0),
  };

  const pr = productAgg[0] || {};
  const categoriesSet = new Set((pr.categoriesArr || []).filter(Boolean));
  const productAggregates = {
    totalProducts: pr.totalProducts || 0,
    lowStockCount: pr.lowStockCount || 0,
    totalValue: Math.round(pr.totalValue || 0),
    categories: categoriesSet.size,
  };

  const apptByMonthMap = {};
  for (const row of appointmentsByMonth) {
    if (row._id >= 1 && row._id <= 12) apptByMonthMap[row._id - 1] = row.count;
  }
  const revByMonthMap = {};
  for (const row of salesRevenueByMonth) {
    const m = row._id;
    if (m >= 1 && m <= 12) revByMonthMap[m - 1] = row.revenue;
  }

  const chart = MONTH_NAMES.map((name, monthIndex) => ({
    monthIndex,
    name,
    appointments: apptByMonthMap[monthIndex] || 0,
    revenue: revByMonthMap[monthIndex] || 0,
  }));

  const mapAppointmentLean = (a) => ({
    _id: a._id,
    date: a.date,
    time: a.time,
    status: a.status,
    price: a.price,
    duration: a.duration,
    clientId: a.clientId
      ? { _id: a.clientId._id, name: a.clientId.name, phone: a.clientId.phone, email: a.clientId.email }
      : null,
    serviceId: a.serviceId
      ? { _id: a.serviceId._id, name: a.serviceId.name, price: a.serviceId.price, duration: a.serviceId.duration }
      : null,
  });

  const today = todayAppointmentsDocs.map(mapAppointmentLean);

  /** IST-aware appointment instant for sorting/filtering (no date-fns on backend). */
  function appointmentInstant(a) {
    if (a.startAt) return new Date(a.startAt).getTime();
    if (!a.date || !a.time) return 0;
    try {
      const day = parseDateIST(a.date);
      const mins = parseTimeToMinutes(a.time);
      return day.getTime() + mins * 60 * 1000;
    } catch {
      return 0;
    }
  }

  const todayStartMs = getStartOfDayIST(todayStr).getTime();
  const upcomingSorted = upcomingCandidates
    .map((a) => ({ doc: a, t: appointmentInstant(a) }))
    .filter((x) => x.t >= todayStartMs)
    .sort((a, b) => a.t - b.t)
    .slice(0, 8)
    .map((x) => mapAppointmentLean(x.doc));

  const data = {
    business: {
      name: businessSettingsLean?.name || 'EaseMySalon',
      currency: businessSettingsLean?.currency || 'INR',
    },
    user: user
      ? {
          _id: user._id || user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          branchId: user.branchId,
        }
      : null,
    todayStats: {
      totalClients,
      totalServices: totalServicesCount,
      totalProducts: totalProductsCount,
      totalStaff,
      totalAppointmentsAllTime,
      totalReceipts: totalReceiptsCount,
      totalRevenueFromReceipts: receiptTotal,
      todaysAppointmentCount,
      todaysCompletedRevenue,
    },
    membership: membershipBlock,
    appointments: {
      today,
      recentUpcoming: upcomingSorted,
      stats: {},
    },
    chart,
    serviceAggregates,
    productAggregates,
    alerts: [],
    quickMetrics: {},
  };

  return { success: true, data };
}

/**
 * Appointments slice only (optional GET /api/dashboard/appointments-summary).
 */
async function buildAppointmentsSummary({ branchId, businessModels }) {
  const full = await buildDashboardInitPayload({ branchId, businessModels, user: null });
  return { success: true, data: { appointments: full.data.appointments } };
}

module.exports = {
  buildDashboardInitPayload,
  buildAppointmentsSummary,
};
