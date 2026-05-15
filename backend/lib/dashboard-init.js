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
  toDateStringIST,
} = require('../utils/date-utils');

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * @param {object} params
 * @param {import('mongoose').Types.ObjectId} params.branchId
 * @param {object} params.businessModels - req.businessModels from setupBusinessDatabase
 * @param {object} params.user - req.user (tenant)
 * @returns {Promise<object>} payload under { success, data }
 */
async function buildDashboardInitPayload({
  branchId,
  businessModels,
  user,
  chartRange = 'year',
  metricsRange = 'today',
}) {
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
  const month = parseInt(todayStr.slice(5, 7), 10);
  const yearStartStr = `${year}-01-01`;
  const yearEndStr = `${year}-12-31`;
  const yearStartDate = getStartOfDayIST(yearStartStr);
  const yearEndDate = getEndOfDayIST(yearEndStr);
  const thisMonthStartStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonthStartDateProbe = parseDateIST(thisMonthStartStr);
  nextMonthStartDateProbe.setMonth(nextMonthStartDateProbe.getMonth() + 1);
  const nextMonthStartStr = toDateStringIST(nextMonthStartDateProbe);
  const thisMonthEndProbe = parseDateIST(nextMonthStartStr);
  thisMonthEndProbe.setDate(thisMonthEndProbe.getDate() - 1);
  const thisMonthEndStr = toDateStringIST(thisMonthEndProbe);
  const prevMonthEndProbe = parseDateIST(thisMonthStartStr);
  prevMonthEndProbe.setDate(prevMonthEndProbe.getDate() - 1);
  const prevMonthEndStr = toDateStringIST(prevMonthEndProbe);
  const prevMonthStartProbe = parseDateIST(prevMonthEndStr);
  prevMonthStartProbe.setDate(1);
  const prevMonthStartStr = toDateStringIST(prevMonthStartProbe);
  const thisMonthStartDate = getStartOfDayIST(thisMonthStartStr);
  const thisMonthEndDate = getEndOfDayIST(thisMonthEndStr);
  const prevMonthStartDate = getStartOfDayIST(prevMonthStartStr);
  const prevMonthEndDate = getEndOfDayIST(prevMonthEndStr);
  const metricsRangeType = metricsRange === 'last7days' ? 'last7days' : 'today';
  const metricsEndStr = todayStr;
  const metricsStartProbe = parseDateIST(todayStr);
  if (metricsRangeType === 'last7days') {
    metricsStartProbe.setDate(metricsStartProbe.getDate() - 6);
  }
  const metricsStartStr = toDateStringIST(metricsStartProbe);
  const metricsStartDate = getStartOfDayIST(metricsStartStr);
  const metricsEndDate = getEndOfDayIST(metricsEndStr);

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
    metricsAppointmentCount,
    metricsAppointmentStatusAgg,
    serviceAgg,
    productAgg,
    appointmentsByMonth,
    salesRevenueByMonth,
    clientRetentionAgg,
    currentMonthServiceLines,
    previousMonthServiceLines,
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
    Sale.countDocuments({
      branchId: bid,
      date: { $gte: metricsStartDate, $lte: metricsEndDate },
      status: { $regex: /^completed$/i },
    }),
    Sale.aggregate([
      {
        $match: {
          branchId: bid,
          date: { $gte: metricsStartDate, $lte: metricsEndDate },
          status: { $regex: /^completed$/i },
        },
      },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$grossTotal', 0] } } } },
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
    Appointment.countDocuments({ branchId: bid, date: { $gte: metricsStartStr, $lte: metricsEndStr } }),
    Appointment.aggregate([
      {
        $match: {
          branchId: bid,
          date: { $gte: metricsStartStr, $lte: metricsEndStr },
        },
      },
      {
        $group: {
          _id: {
            $toLower: {
              $ifNull: ['$status', 'scheduled'],
            },
          },
          count: { $sum: 1 },
        },
      },
    ]),
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
        $lookup: {
          from: 'services',
          localField: 'additionalServiceIds',
          foreignField: '_id',
          as: 'additionalServices',
        },
      },
      {
        $project: {
          month: { $toInt: { $substr: ['$date', 5, 2] } },
          serviceValue: {
            $add: [
              { $ifNull: ['$price', 0] },
              {
                $sum: {
                  $map: {
                    input: { $ifNull: ['$additionalServices', []] },
                    as: 'svc',
                    in: { $ifNull: ['$$svc.price', 0] },
                  },
                },
              },
              {
                $sum: {
                  $map: {
                    input: { $ifNull: ['$addOnLineItems', []] },
                    as: 'addon',
                    in: { $ifNull: ['$$addon.price', 0] },
                  },
                },
              },
            ],
          },
        },
      },
      { $group: { _id: '$month', serviceValue: { $sum: '$serviceValue' } } },
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
    Sale.aggregate([
      {
        $match: {
          branchId: bid,
          customerId: { $exists: true, $ne: null },
          $nor: [{ status: /cancelled/i }],
        },
      },
      { $group: { _id: '$customerId', visits: { $sum: 1 } } },
      {
        $group: {
          _id: null,
          totalClientsWithSale: { $sum: 1 },
          returningClients: {
            $sum: {
              $cond: [{ $gt: ['$visits', 1] }, 1, 0],
            },
          },
        },
      },
    ]),
    Sale.aggregate([
      {
        $match: {
          branchId: bid,
          date: { $gte: thisMonthStartDate, $lte: thisMonthEndDate },
          $nor: [{ status: /cancelled/i }],
        },
      },
      { $unwind: '$items' },
      { $match: { 'items.type': 'service' } },
      {
        $project: {
          serviceId: '$items.serviceId',
          serviceName: { $ifNull: ['$items.name', 'Service'] },
          quantity: { $ifNull: ['$items.quantity', 1] },
          lineTotal: { $ifNull: ['$items.total', 0] },
          staffContributions: { $ifNull: ['$items.staffContributions', []] },
          legacyStaffId: { $ifNull: ['$items.staffId', ''] },
          legacyStaffName: { $ifNull: ['$items.staffName', { $ifNull: ['$staffName', 'Unassigned'] }] },
        },
      },
    ]),
    Sale.aggregate([
      {
        $match: {
          branchId: bid,
          date: { $gte: prevMonthStartDate, $lte: prevMonthEndDate },
          $nor: [{ status: /cancelled/i }],
        },
      },
      { $unwind: '$items' },
      { $match: { 'items.type': 'service' } },
      {
        $project: {
          serviceId: '$items.serviceId',
          serviceName: { $ifNull: ['$items.name', 'Service'] },
          quantity: { $ifNull: ['$items.quantity', 1] },
          lineTotal: { $ifNull: ['$items.total', 0] },
          staffContributions: { $ifNull: ['$items.staffContributions', []] },
          legacyStaffId: { $ifNull: ['$items.staffId', ''] },
          legacyStaffName: { $ifNull: ['$items.staffName', { $ifNull: ['$staffName', 'Unassigned'] }] },
        },
      },
    ]),
    Appointment.find({ branchId: bid, date: todayStr })
      .populate('clientId', 'name phone email')
      .populate('serviceId', 'name price duration')
      .populate('staffId', 'name')
      .populate('staffAssignments.staffId', 'name')
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
      .populate('staffId', 'name')
      .populate('staffAssignments.staffId', 'name')
      .sort({ date: 1, time: 1 })
      .limit(120)
      .lean(),
  ]);

  const receiptTotal = receiptRevenueAgg[0]?.total || 0;
  const todaysCompletedRevenue = receiptTotal;
  const todaysAppointmentCount = metricsAppointmentCount || 0;
  const appointmentStatusCounts = {
    scheduled: 0,
    confirmed: 0,
    arrived: 0,
    service_started: 0,
    completed: 0,
  };
  for (const row of metricsAppointmentStatusAgg || []) {
    const key = String(row?._id || '').trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(appointmentStatusCounts, key)) {
      appointmentStatusCounts[key] = Number(row?.count) || 0;
    }
  }
  const retentionBase = clientRetentionAgg[0]?.totalClientsWithSale || 0;
  const retentionReturning = clientRetentionAgg[0]?.returningClients || 0;
  const retentionOneTime = Math.max(0, retentionBase - retentionReturning);
  const clientRetentionRate = retentionBase > 0
    ? Math.round((retentionReturning / retentionBase) * 1000) / 10
    : 0;

  const serviceMapCurrent = new Map();
  for (const row of currentMonthServiceLines || []) {
    const sid = row?.serviceId ? String(row.serviceId) : '';
    const rawName = String(row?.serviceName || 'Service').trim();
    const key = sid || `name:${rawName.toLowerCase()}`;
    const existing = serviceMapCurrent.get(key) || { serviceName: rawName, thisMonth: 0 };
    existing.thisMonth += Math.max(0, Number(row?.quantity) || 0);
    if (!existing.serviceName || existing.serviceName === 'Service') existing.serviceName = rawName || 'Service';
    serviceMapCurrent.set(key, existing);
  }
  const serviceMapPrevious = new Map();
  for (const row of previousMonthServiceLines || []) {
    const sid = row?.serviceId ? String(row.serviceId) : '';
    const rawName = String(row?.serviceName || 'Service').trim();
    const key = sid || `name:${rawName.toLowerCase()}`;
    serviceMapPrevious.set(key, (serviceMapPrevious.get(key) || 0) + Math.max(0, Number(row?.quantity) || 0));
  }
  const topServices = [...serviceMapCurrent.entries()]
    .map(([key, v]) => ({
      id: key,
      serviceName: v.serviceName || 'Service',
      thisMonth: Math.round((v.thisMonth || 0) * 100) / 100,
      lastMonth: Math.round((serviceMapPrevious.get(key) || 0) * 100) / 100,
    }))
    .sort((a, b) => b.thisMonth - a.thisMonth)
    .slice(0, 5);

  function buildStaffRevenueMap(rows) {
    const map = new Map();
    for (const row of rows || []) {
      const lineTotal = Math.max(0, Number(row?.lineTotal) || 0);
      const contributions = Array.isArray(row?.staffContributions) ? row.staffContributions : [];
      if (contributions.length > 0) {
        for (const c of contributions) {
          const sid = String(c?.staffId || '').trim();
          const sname = String(c?.staffName || 'Unassigned').trim() || 'Unassigned';
          const key = sid || `name:${sname.toLowerCase()}`;
          const amountFromContribution = Number(c?.amount);
          const percentage = Number(c?.percentage);
          const amount = Number.isFinite(amountFromContribution)
            ? Math.max(0, amountFromContribution)
            : Number.isFinite(percentage)
              ? Math.max(0, (lineTotal * percentage) / 100)
              : 0;
          const existing = map.get(key) || { staffName: sname, amount: 0 };
          existing.amount += amount;
          if (!existing.staffName || existing.staffName === 'Unassigned') existing.staffName = sname;
          map.set(key, existing);
        }
      } else {
        const sid = String(row?.legacyStaffId || '').trim();
        const sname = String(row?.legacyStaffName || 'Unassigned').trim() || 'Unassigned';
        const key = sid || `name:${sname.toLowerCase()}`;
        const existing = map.get(key) || { staffName: sname, amount: 0 };
        existing.amount += lineTotal;
        if (!existing.staffName || existing.staffName === 'Unassigned') existing.staffName = sname;
        map.set(key, existing);
      }
    }
    return map;
  }

  const staffCurrent = buildStaffRevenueMap(currentMonthServiceLines || []);
  const staffPrevious = buildStaffRevenueMap(previousMonthServiceLines || []);
  const topStaff = [...staffCurrent.entries()]
    .map(([key, v]) => ({
      id: key,
      staffName: v.staffName || 'Unassigned',
      thisMonth: Math.round((v.amount || 0) * 100) / 100,
      lastMonth: Math.round((staffPrevious.get(key)?.amount || 0) * 100) / 100,
    }))
    .sort((a, b) => b.thisMonth - a.thisMonth)
    .slice(0, 5);

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

  const apptValueByMonthMap = {};
  for (const row of appointmentsByMonth) {
    if (row._id >= 1 && row._id <= 12) apptValueByMonthMap[row._id - 1] = row.serviceValue || 0;
  }
  const revByMonthMap = {};
  for (const row of salesRevenueByMonth) {
    const m = row._id;
    if (m >= 1 && m <= 12) {
      revByMonthMap[m - 1] = row.revenue;
    }
  }

  let chart = MONTH_NAMES.map((name, monthIndex) => ({
    monthIndex,
    name,
    appointments: apptValueByMonthMap[monthIndex] || 0,
    revenue: revByMonthMap[monthIndex] || 0,
  }));

  if (chartRange === 'last7days' || chartRange === 'last30days') {
    const endYmd = todayStr;
    const span = chartRange === 'last7days' ? 7 : 30;
    const endDate = parseDateIST(endYmd);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (span - 1));
    const startYmd = toDateStringIST(startDate);
    const rangeStart = getStartOfDayIST(startYmd);
    const rangeEnd = getEndOfDayIST(endYmd);

    const salesByDayRows = await Sale.aggregate([
      {
        $match: {
          branchId: bid,
          date: { $gte: rangeStart, $lte: rangeEnd },
          $nor: [{ status: /cancelled/i }],
        },
      },
      {
        $project: {
          day: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'Asia/Kolkata' } },
          grossTotal: { $ifNull: ['$grossTotal', 0] },
        },
      },
      {
        $group: {
          _id: '$day',
          revenue: { $sum: '$grossTotal' },
          salesCount: { $sum: 1 },
        },
      },
    ]);
    const appointmentsByDayRows = await Appointment.aggregate([
      {
        $match: {
          branchId: bid,
          date: { $gte: startYmd, $lte: endYmd },
        },
      },
      {
        $lookup: {
          from: 'services',
          localField: 'additionalServiceIds',
          foreignField: '_id',
          as: 'additionalServices',
        },
      },
      {
        $project: {
          day: '$date',
          serviceValue: {
            $add: [
              { $ifNull: ['$price', 0] },
              {
                $sum: {
                  $map: {
                    input: { $ifNull: ['$additionalServices', []] },
                    as: 'svc',
                    in: { $ifNull: ['$$svc.price', 0] },
                  },
                },
              },
              {
                $sum: {
                  $map: {
                    input: { $ifNull: ['$addOnLineItems', []] },
                    as: 'addon',
                    in: { $ifNull: ['$$addon.price', 0] },
                  },
                },
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: '$day',
          serviceValue: { $sum: '$serviceValue' },
        },
      },
    ]);

    const salesByDay = new Map();
    for (const row of salesByDayRows) {
      if (!row || !row._id) continue;
      salesByDay.set(String(row._id), {
        revenue: Number(row.revenue) || 0,
      });
    }
    const appointmentsByDay = new Map();
    for (const row of appointmentsByDayRows) {
      if (!row || !row._id) continue;
      appointmentsByDay.set(String(row._id), {
        appointments: Number(row.serviceValue) || 0,
      });
    }

    const days = [];
    for (let d = parseDateIST(startYmd); d <= parseDateIST(endYmd); d.setDate(d.getDate() + 1)) {
      days.push(toDateStringIST(d));
    }

    chart = days.map((ymd) => {
      const m = Number(ymd.slice(5, 7));
      const day = Number(ymd.slice(8, 10));
      const shortName = `${MONTH_NAMES[m - 1]} ${day}`;
      const salesRow = salesByDay.get(ymd);
      const appointmentRow = appointmentsByDay.get(ymd);
      return {
        monthIndex: null,
        name: shortName,
        appointments: appointmentRow?.appointments || 0,
        revenue: salesRow?.revenue || 0,
      };
    });
  }

  const mapAppointmentLean = (a) => {
    const primaryAssignment = Array.isArray(a.staffAssignments)
      ? a.staffAssignments.find((as) => String(as?.role || '').toLowerCase() === 'primary') || a.staffAssignments[0]
      : null;
    const primaryStaffName =
      a?.staffId?.name ||
      primaryAssignment?.staffId?.name ||
      '';

    return {
      _id: a._id,
      date: a.date,
      time: a.time,
      status: a.status,
      price: a.price,
      duration: a.duration,
      staffName: primaryStaffName,
      clientId: a.clientId
        ? { _id: a.clientId._id, name: a.clientId.name, phone: a.clientId.phone, email: a.clientId.email }
        : null,
      serviceId: a.serviceId
        ? { _id: a.serviceId._id, name: a.serviceId.name, price: a.serviceId.price, duration: a.serviceId.duration }
        : null,
    };
  };

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
      clientRetentionRate,
      retentionTotalClientsWithSale: retentionBase,
      retentionReturningClients: retentionReturning,
      retentionOneTimeClients: retentionOneTime,
      appointmentStatusCounts,
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
    topPerformers: {
      topServices,
      topStaff,
      currentMonthRange: { from: thisMonthStartStr, to: thisMonthEndStr },
      previousMonthRange: { from: prevMonthStartStr, to: prevMonthEndStr },
    },
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
