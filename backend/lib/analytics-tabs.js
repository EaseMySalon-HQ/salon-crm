/**
 * Per-tab analytics payloads for `/api/analytics/*` (branch-scoped, IST).
 */

const mongoose = require('mongoose');
const { getStartOfDayIST, getEndOfDayIST, parseDateIST, toDateStringIST } = require('../utils/date-utils');
const { aggregateStaffAnalyticsFromSales, aggregateStaffDailyFromSales } = require('./staff-line-revenue');
const {
  toObjectId,
  eachDayInclusive,
  resolveDateRange,
  computePreviousPeriodRange,
  pctChange,
  resolveBucketType,
  bucketSeries,
  bucketNewClientsSeries,
  bucketSingleNumericSeries,
  CANCELLED_NOR,
  PIE_COLORS,
  addCalendarDays,
} = require('./analytics-shared');

/** IST calendar days from earlier YYYY-MM-DD to later (inclusive span difference). */
function istCalendarDaysFromTo(earlierYmd, laterYmd) {
  const a = parseDateIST(earlierYmd).getTime();
  const b = parseDateIST(laterYmd).getTime();
  return Math.round((b - a) / 86400000);
}

/** @param {Record<string, unknown>} query */
function parseStaffLineType(query) {
  const raw = typeof query.lineType === 'string' ? query.lineType.trim().toLowerCase() : '';
  const allowed = ['all', 'service', 'product', 'membership', 'package'];
  if (allowed.includes(raw)) return raw;
  return 'all';
}

function buildRevenueInsights({ comparison, revenueBreakdown, totals, averages }) {
  const insights = [];
  const r = comparison?.revenuePct;
  const e = comparison?.expensesPct;
  const n = comparison?.netPct;
  if (r != null) {
    if (r >= 10) insights.push(`Revenue is up ${r}% vs the prior period—momentum is strong.`);
    else if (r <= -10) insights.push(`Revenue is down ${Math.abs(r)}% vs the prior period—review pricing, fills, and marketing.`);
    else if (r > 0) insights.push(`Revenue edged up ${r}% vs the prior period.`);
    else if (r < 0) insights.push(`Revenue is slightly down (${r}%) vs the prior period.`);
  }
  if (e != null && e >= 15) {
    insights.push(`Expenses rose ${e}% vs the prior period—review approvals and recurring costs.`);
  }
  if (n != null && n <= -15) {
    insights.push(`Net is down ${Math.abs(n)}% vs the prior period—watch expense timing and margins.`);
  }
  const svc = revenueBreakdown?.service ?? 0;
  const prod = revenueBreakdown?.product ?? 0;
  const mem = revenueBreakdown?.membership ?? 0;
  const pkg = revenueBreakdown?.package ?? 0;
  const oth = revenueBreakdown?.other ?? 0;
  const lineSum = svc + prod + mem + pkg + oth;
  if (lineSum > 0 && svc > prod * 1.5) {
    insights.push(`Services drive most of line-item revenue (${Math.round((svc / lineSum) * 100)}%).`);
  } else if (lineSum > 0 && prod > svc) {
    insights.push(`Product lines lead line-item mix—ensure retail stock matches demand.`);
  }
  const ab = averages?.avgBillValue ?? 0;
  if (ab > 0 && averages?.completedBillCount > 5) {
    insights.push(`Average bill size is ${ab.toFixed(0)}—upsell add-ons if below your target.`);
  }
  return insights.slice(0, 8);
}

function tabMeta({ branchId, businessModels, query }) {
  const { BusinessSettings } = businessModels;
  const bid = toObjectId(branchId);
  const { dateFromStr, dateToStr, startDate, endDate } = resolveDateRange(query);
  const bucketType = resolveBucketType(query, dateFromStr, dateToStr);
  const days = eachDayInclusive(dateFromStr, dateToStr);
  const { prevFromStr, prevToStr } = computePreviousPeriodRange(dateFromStr, dateToStr);
  const prevStartDate = getStartOfDayIST(prevFromStr);
  const prevEndDate = getEndOfDayIST(prevToStr);

  const salesMatch = {
    branchId: bid,
    date: { $gte: startDate, $lte: endDate },
    $nor: CANCELLED_NOR,
  };

  const expenseMatch = {
    branchId: bid,
    date: { $gte: startDate, $lte: endDate },
    status: { $in: ['approved', 'pending'] },
  };

  const prevSalesMatch = {
    branchId: bid,
    date: { $gte: prevStartDate, $lte: prevEndDate },
    $nor: CANCELLED_NOR,
  };

  const prevExpenseMatch = {
    branchId: bid,
    date: { $gte: prevStartDate, $lte: prevEndDate },
    status: { $in: ['approved', 'pending'] },
  };

  return {
    bid,
    dateFromStr,
    dateToStr,
    startDate,
    endDate,
    bucketType,
    days,
    prevFromStr,
    prevToStr,
    prevStartDate,
    prevEndDate,
    salesMatch,
    expenseMatch,
    prevSalesMatch,
    prevExpenseMatch,
    businessSettingsPromise: BusinessSettings.findOne().select('name currency').lean(),
  };
}

/**
 * Sale line items are $group'd by serviceId/productId when set, else by __name__ + line name.
 * Lines with an id and lines without can share the same display name → duplicate rows in analytics.
 */
function normalizeLineItemLabel(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isAnalyticsObjectIdKey(id) {
  const t = String(id || '');
  return t.length === 24 && mongoose.Types.ObjectId.isValid(t) && !t.startsWith('__');
}

/**
 * @param {Array<{ id: string, name: string, revenue: number, units: number, bookings?: number }>} rows
 * @param {Map<string, string>} nameById
 * @param {Map<string, number>|null} bookingMap - null for product lines (no bookings)
 * @param {number|null|undefined} maxMergedRows - undefined = 50; null or Infinity = no cap
 */
function mergeLineItemRowsByNormalizedName(rows, nameById, bookingMap, maxMergedRows) {
  const byNorm = new Map();
  for (const row of rows) {
    const nk = normalizeLineItemLabel(row.name);
    if (!nk) continue;
    let cur = byNorm.get(nk);
    if (!cur) {
      const sids = new Set();
      if (isAnalyticsObjectIdKey(row.id)) sids.add(String(row.id));
      byNorm.set(nk, { row: { ...row }, sids });
      continue;
    }
    cur.row.revenue = Math.round((cur.row.revenue + row.revenue) * 100) / 100;
    cur.row.units = Math.round((cur.row.units + row.units) * 1000) / 1000;
    if (isAnalyticsObjectIdKey(row.id)) cur.sids.add(String(row.id));
    if (
      isAnalyticsObjectIdKey(row.id) &&
      (!isAnalyticsObjectIdKey(cur.row.id) || row.revenue > cur.row.revenue)
    ) {
      cur.row.id = row.id;
      cur.row.name = row.name;
    }
  }
  const out = [];
  for (const { row, sids } of byNorm.values()) {
    if (bookingMap) {
      let bookings = 0;
      for (const sid of sids) {
        bookings += bookingMap.get(sid) || 0;
      }
      row.bookings = bookings;
    }
    const primarySid = isAnalyticsObjectIdKey(row.id) ? String(row.id) : [...sids][0];
    if (primarySid && nameById.has(primarySid)) {
      row.name = nameById.get(primarySid);
    }
    out.push(row);
  }
  out.sort((a, b) => b.revenue - a.revenue);
  const cap = maxMergedRows === undefined ? 50 : maxMergedRows;
  if (cap === null || cap === Infinity) return out;
  return out.slice(0, cap);
}

async function buildAnalyticsRevenueTab({ branchId, businessModels, query = {} }) {
  const {
    Sale,
    Expense,
  } = businessModels;

  const ctx = tabMeta({ branchId, businessModels, query });
  const {
    days,
    dateFromStr,
    dateToStr,
    bucketType,
    salesMatch,
    expenseMatch,
    prevSalesMatch,
    prevExpenseMatch,
    prevFromStr,
    prevToStr,
    businessSettingsPromise,
  } = ctx;

  const [
    businessSettingsLean,
    dailyRevenueAgg,
    dailyExpenseAgg,
    itemTypeAgg,
    prevRevenueRow,
    prevExpenseRow,
    saleStatsRow,
  ] = await Promise.all([
    businessSettingsPromise,
    Sale.aggregate([
      { $match: salesMatch },
      {
        $project: {
          day: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'Asia/Kolkata' } },
          grossTotal: { $ifNull: ['$grossTotal', 0] },
        },
      },
      { $group: { _id: '$day', revenue: { $sum: '$grossTotal' } } },
    ]),
    Expense.aggregate([
      { $match: expenseMatch },
      {
        $project: {
          day: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'Asia/Kolkata' } },
          amount: { $ifNull: ['$amount', 0] },
        },
      },
      { $group: { _id: '$day', expenses: { $sum: '$amount' } } },
    ]),
    Sale.aggregate([
      { $match: salesMatch },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.type',
          total: { $sum: { $ifNull: ['$items.total', 0] } },
        },
      },
    ]),
    Sale.aggregate([
      { $match: prevSalesMatch },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$grossTotal', 0] } } } },
    ]),
    Expense.aggregate([
      { $match: prevExpenseMatch },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$amount', 0] } } } },
    ]),
    Sale.aggregate([
      { $match: salesMatch },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: { $ifNull: ['$grossTotal', 0] } },
          billCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  const revenueByDay = {};
  for (const row of dailyRevenueAgg) {
    if (row._id) revenueByDay[row._id] = row.revenue || 0;
  }
  const expenseByDay = {};
  for (const row of dailyExpenseAgg) {
    if (row._id) expenseByDay[row._id] = row.expenses || 0;
  }

  const dailyRows = days.map((d) => ({
    date: d,
    revenue: revenueByDay[d] || 0,
    expenses: expenseByDay[d] || 0,
  }));

  const revenueSeries = bucketSeries(dailyRows, bucketType);

  const totalRevenue = dailyRows.reduce((s, r) => s + r.revenue, 0);
  const totalExpenses = dailyRows.reduce((s, r) => s + r.expenses, 0);
  const totalProfit = totalRevenue - totalExpenses;

  const prevRevenue = prevRevenueRow[0]?.total || 0;
  const prevExpense = prevExpenseRow[0]?.total || 0;
  const prevProfit = prevRevenue - prevExpense;

  const comparison = {
    previousPeriod: { dateFrom: prevFromStr, dateTo: prevToStr },
    revenuePct: pctChange(totalRevenue, prevRevenue),
    expensesPct: pctChange(totalExpenses, prevExpense),
    netPct: pctChange(totalProfit, prevProfit),
  };

  const revenueBreakdown = {
    service: 0,
    product: 0,
    membership: 0,
    package: 0,
    other: 0,
  };
  for (const row of itemTypeAgg) {
    const t = String(row._id || 'other').toLowerCase();
    const v = row.total || 0;
    if (t === 'service') revenueBreakdown.service += v;
    else if (t === 'product') revenueBreakdown.product += v;
    else if (t === 'membership') revenueBreakdown.membership += v;
    else if (t === 'package') revenueBreakdown.package += v;
    else revenueBreakdown.other += v;
  }

  const lineItemsTotal =
    revenueBreakdown.service +
    revenueBreakdown.product +
    revenueBreakdown.membership +
    revenueBreakdown.package +
    revenueBreakdown.other;

  const ss = saleStatsRow[0] || {};
  const completedBillCount = ss.billCount || 0;
  const avgBillValue = completedBillCount > 0 ? totalRevenue / completedBillCount : 0;

  const averages = {
    avgBillValue: Math.round(avgBillValue * 100) / 100,
    completedBillCount,
  };

  const insights = buildRevenueInsights({
    comparison,
    revenueBreakdown,
    totals: { totalRevenue, totalExpenses, totalProfit },
    averages,
  });

  const data = {
    business: {
      name: businessSettingsLean?.name || 'EaseMySalon',
      currency: businessSettingsLean?.currency || 'INR',
    },
    meta: {
      dateFrom: dateFromStr,
      dateTo: dateToStr,
      bucket: bucketType,
      daysInRange: days.length,
    },
    comparison,
    revenue: {
      series: revenueSeries,
      totals: {
        totalRevenue,
        totalExpenses,
        totalProfit,
      },
      breakdown: {
        ...revenueBreakdown,
        lineItemsTotal,
      },
    },
    averages,
    insights,
  };

  return { success: true, data };
}

async function buildAnalyticsServicesTab({ branchId, businessModels, query = {} }) {
  const {
    Service,
    Sale,
    Appointment,
  } = businessModels;

  const ctx = tabMeta({ branchId, businessModels, query });
  const {
    bid,
    days,
    dateFromStr,
    dateToStr,
    bucketType,
    salesMatch,
    prevSalesMatch,
    prevFromStr,
    prevToStr,
    businessSettingsPromise,
  } = ctx;

  const [
    businessSettingsLean,
    totalServicesCatalog,
    serviceLinesAgg,
    appointmentCountsAgg,
    dailyServiceAgg,
    prevServiceLineAgg,
  ] = await Promise.all([
    businessSettingsPromise,
    Service.countDocuments({ branchId: bid }),
    Sale.aggregate([
      { $match: salesMatch },
      { $unwind: '$items' },
      { $match: { 'items.type': 'service' } },
      {
        $group: {
          _id: {
            $cond: [
              { $ne: [{ $ifNull: ['$items.serviceId', null] }, null] },
              { $toString: '$items.serviceId' },
              { $concat: ['__name__', '$items.name'] },
            ],
          },
          revenue: { $sum: { $ifNull: ['$items.total', 0] } },
          units: { $sum: { $ifNull: ['$items.quantity', 0] } },
          name: { $first: '$items.name' },
        },
      },
      { $sort: { revenue: -1 } },
    ]),
    Appointment.aggregate([
      {
        $match: {
          branchId: bid,
          date: { $gte: dateFromStr, $lte: dateToStr },
          status: { $nin: ['cancelled', 'missed'] },
        },
      },
      {
        $group: {
          _id: '$serviceId',
          bookings: { $sum: 1 },
        },
      },
    ]),
    Sale.aggregate([
      { $match: salesMatch },
      { $unwind: '$items' },
      { $match: { 'items.type': 'service' } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'Asia/Kolkata' },
          },
          serviceRevenue: { $sum: { $ifNull: ['$items.total', 0] } },
        },
      },
    ]),
    Sale.aggregate([
      { $match: prevSalesMatch },
      { $unwind: '$items' },
      { $match: { 'items.type': 'service' } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$items.total', 0] } } } },
    ]),
  ]);

  const bookingMap = new Map(appointmentCountsAgg.map((r) => [String(r._id), r.bookings || 0]));

  const serviceKeys = serviceLinesAgg
    .map((r) => r._id)
    .filter((k) => k && !String(k).startsWith('__name__'));
  const objectIds = [];
  for (const k of serviceKeys) {
    if (mongoose.Types.ObjectId.isValid(String(k)) && String(k).length === 24) {
      try {
        objectIds.push(new mongoose.Types.ObjectId(String(k)));
      } catch {
        /* ignore */
      }
    }
  }
  const nameById = new Map();
  if (objectIds.length) {
    const svcDocs = await Service.find({ _id: { $in: objectIds } }).select('name').lean();
    for (const s of svcDocs) {
      nameById.set(String(s._id), s.name || 'Service');
    }
  }

  let topServices = serviceLinesAgg.map((row) => {
    const key = row._id != null ? String(row._id) : '';
    const isNameKey = key.startsWith('__name__');
    const sid = !isNameKey && mongoose.Types.ObjectId.isValid(key) ? key : null;
    const displayName = sid ? nameById.get(sid) || row.name || 'Service' : row.name || 'Service';
    const bookings = sid ? bookingMap.get(sid) || 0 : 0;
    return {
      id: sid || key,
      name: displayName,
      revenue: Math.round((row.revenue || 0) * 100) / 100,
      units: row.units || 0,
      bookings,
    };
  });

  topServices = mergeLineItemRowsByNormalizedName(topServices, nameById, bookingMap, null);

  const serviceRevenueSum = topServices.reduce((s, t) => s + t.revenue, 0) || 1;
  const topForPie = topServices.slice(0, 8).map((s, idx) => ({
    ...s,
    percentOfServiceRevenue: Math.round((s.revenue / serviceRevenueSum) * 1000) / 10,
    color: PIE_COLORS[idx % PIE_COLORS.length],
  }));
  const allServicesBreakdown = topServices.map((s, idx) => ({
    id: s.id,
    name: s.name,
    revenue: s.revenue,
    units: s.units,
    bookings: s.bookings,
    percentOfServiceRevenue: Math.round((s.revenue / serviceRevenueSum) * 1000) / 10,
    color: PIE_COLORS[idx % PIE_COLORS.length],
  }));

  const serviceByDay = {};
  for (const row of dailyServiceAgg) {
    if (row._id) serviceByDay[row._id] = row.serviceRevenue || 0;
  }
  const serviceTrends = bucketSingleNumericSeries(serviceByDay, days, bucketType, 'serviceRevenue');

  const totalServiceLineRevenue = Math.round(serviceRevenueSum * 100) / 100;
  const prevServiceRevenue = prevServiceLineAgg[0]?.total || 0;

  const data = {
    business: {
      name: businessSettingsLean?.name || 'EaseMySalon',
      currency: businessSettingsLean?.currency || 'INR',
    },
    meta: {
      dateFrom: dateFromStr,
      dateTo: dateToStr,
      bucket: bucketType,
      daysInRange: days.length,
    },
    comparison: {
      previousPeriod: { dateFrom: prevFromStr, dateTo: prevToStr },
      serviceRevenuePct: pctChange(totalServiceLineRevenue, prevServiceRevenue),
    },
    services: {
      totalServicesCatalog,
      topServices: topForPie,
      allServicesBreakdown,
      totalServiceLineRevenue,
      serviceTrends,
    },
  };

  return { success: true, data };
}

async function buildAnalyticsClientsTab({ branchId, businessModels, query = {} }) {
  const {
    Client,
    Sale,
  } = businessModels;

  const ctx = tabMeta({ branchId, businessModels, query });
  const {
    bid,
    days,
    dateFromStr,
    dateToStr,
    bucketType,
    salesMatch,
    startDate,
    endDate,
    prevStartDate,
    prevEndDate,
    prevFromStr,
    prevToStr,
    businessSettingsPromise,
  } = ctx;

  const clientColl = Client.collection.collectionName;
  const saleWithCustomer = {
    ...salesMatch,
    customerId: { $exists: true, $ne: null },
  };

  const active30StartStr = addCalendarDays(dateToStr, -29);
  const active30Start = getStartOfDayIST(active30StartStr);
  const active30Match = {
    branchId: bid,
    $nor: CANCELLED_NOR,
    customerId: { $exists: true, $ne: null },
    date: { $gte: active30Start, $lte: endDate },
  };

  const lastSaleMatch = {
    branchId: bid,
    $nor: CANCELLED_NOR,
    customerId: { $exists: true, $ne: null },
  };

  const [
    businessSettingsLean,
    newClientsDailyAgg,
    newClientsInRange,
    prevNewClients,
    customerMixRow,
    periodRevenueRow,
    totalClientProfiles,
    visitRetentionRow,
    lastSaleAgg,
    topClientsRaw,
    activeLast30Row,
  ] = await Promise.all([
    businessSettingsPromise,
    Client.aggregate([
      {
        $match: {
          branchId: bid,
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $project: {
          day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } },
        },
      },
      { $group: { _id: '$day', count: { $sum: 1 } } },
    ]),
    Client.countDocuments({
      branchId: bid,
      createdAt: { $gte: startDate, $lte: endDate },
    }),
    Client.countDocuments({
      branchId: bid,
      createdAt: { $gte: prevStartDate, $lte: prevEndDate },
    }),
    Sale.aggregate([
      {
        $match: saleWithCustomer,
      },
      { $group: { _id: '$customerId' } },
      {
        $lookup: {
          from: clientColl,
          localField: '_id',
          foreignField: '_id',
          as: 'cl',
        },
      },
      { $unwind: { path: '$cl', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          isNewInPeriod: {
            $cond: [
              {
                $and: [
                  { $ne: ['$cl', null] },
                  { $gte: ['$cl.createdAt', startDate] },
                  { $lte: ['$cl.createdAt', endDate] },
                ],
              },
              true,
              false,
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          distinctBuyers: { $sum: 1 },
          newBuyersWithSale: { $sum: { $cond: ['$isNewInPeriod', 1, 0] } },
        },
      },
    ]),
    Sale.aggregate([
      { $match: saleWithCustomer },
      { $group: { _id: null, totalRevenue: { $sum: { $ifNull: ['$grossTotal', 0] } } } },
    ]),
    Client.countDocuments({ branchId: bid }),
    Sale.aggregate([
      { $match: saleWithCustomer },
      { $group: { _id: '$customerId', visits: { $sum: 1 } } },
      {
        $group: {
          _id: null,
          visits1: { $sum: { $cond: [{ $eq: ['$visits', 1] }, 1, 0] } },
          visits2to3: {
            $sum: {
              $cond: [{ $and: [{ $gte: ['$visits', 2] }, { $lte: ['$visits', 3] }] }, 1, 0],
            },
          },
          visits4plus: { $sum: { $cond: [{ $gte: ['$visits', 4] }, 1, 0] } },
        },
      },
    ]),
    Sale.aggregate([
      { $match: lastSaleMatch },
      { $group: { _id: '$customerId', lastSale: { $max: '$date' } } },
    ]),
    Sale.aggregate([
      { $match: saleWithCustomer },
      { $group: { _id: '$customerId', totalSpend: { $sum: { $ifNull: ['$grossTotal', 0] } } } },
      { $sort: { totalSpend: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: clientColl,
          localField: '_id',
          foreignField: '_id',
          as: 'cl',
        },
      },
      { $unwind: { path: '$cl', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          clientId: { $toString: '$_id' },
          name: { $ifNull: ['$cl.name', 'Client'] },
          phone: { $ifNull: ['$cl.phone', ''] },
          totalSpend: '$totalSpend',
        },
      },
    ]),
    Sale.aggregate([
      { $match: active30Match },
      { $group: { _id: '$customerId' } },
      { $count: 'n' },
    ]),
  ]);

  const newClientsByDay = {};
  for (const row of newClientsDailyAgg) {
    if (row._id) newClientsByDay[row._id] = row.count || 0;
  }
  const newClientsSeries = bucketNewClientsSeries(newClientsByDay, days, bucketType);

  const cm = customerMixRow[0] || {};
  const distinctBuyers = cm.distinctBuyers || 0;
  const newBuyersWithSale = cm.newBuyersWithSale || 0;
  const returningBuyersWithSale = Math.max(0, distinctBuyers - newBuyersWithSale);
  const repeatRatePct =
    distinctBuyers > 0
      ? Math.round((returningBuyersWithSale / distinctBuyers) * 1000) / 10
      : null;

  const periodRevenue = periodRevenueRow[0]?.totalRevenue || 0;
  const avgRevenuePerBuyingClient =
    distinctBuyers > 0 ? Math.round((periodRevenue / distinctBuyers) * 100) / 100 : null;

  const conversionRatePct =
    totalClientProfiles > 0
      ? Math.round((distinctBuyers / totalClientProfiles) * 10000) / 100
      : null;

  const activeClientsLast30Days = activeLast30Row[0]?.n || 0;

  const vr = visitRetentionRow[0] || {};
  const visitRetention = {
    visits1: vr.visits1 || 0,
    visits2to3: vr.visits2to3 || 0,
    visits4plus: vr.visits4plus || 0,
  };

  const refYmd = dateToStr;
  let recencyActive = 0;
  let recencyAtRisk = 0;
  let recencyLost = 0;
  for (const row of lastSaleAgg) {
    const lastYmd = toDateStringIST(row.lastSale);
    const daysSince = istCalendarDaysFromTo(lastYmd, refYmd);
    if (daysSince <= 30) recencyActive += 1;
    else if (daysSince <= 60) recencyAtRisk += 1;
    else recencyLost += 1;
  }

  const buyerIds = lastSaleAgg.map((r) => r._id);
  const neverPurchasedCount =
    buyerIds.length > 0
      ? await Client.countDocuments({ branchId: bid, _id: { $nin: buyerIds } })
      : totalClientProfiles;

  const topClientsBySpend = topClientsRaw.map((r) => ({
    clientId: r.clientId,
    name: r.name || 'Client',
    phone: typeof r.phone === 'string' ? r.phone : '',
    totalSpend: Math.round((r.totalSpend || 0) * 100) / 100,
  }));

  const comparison = {
    previousPeriod: { dateFrom: prevFromStr, dateTo: prevToStr },
    newClientsPct: pctChange(newClientsInRange, prevNewClients),
  };

  const data = {
    business: {
      name: businessSettingsLean?.name || 'EaseMySalon',
      currency: businessSettingsLean?.currency || 'INR',
    },
    meta: {
      dateFrom: dateFromStr,
      dateTo: dateToStr,
      bucket: bucketType,
      daysInRange: days.length,
    },
    comparison,
    clients: {
      newProfilesInRange: newClientsInRange,
      newClientsSeries,
      mix: {
        distinctBuyersWithSale: distinctBuyers,
        newBuyersWithSale,
        returningBuyersWithSale,
        repeatRatePct,
      },
      insights: {
        totalClientProfiles,
        avgRevenuePerBuyingClient,
        conversionRatePct,
        activeClientsLast30Days,
      },
      visitRetention,
      recency: {
        active0to30Days: recencyActive,
        atRisk30to60Days: recencyAtRisk,
        lostOver60Days: recencyLost,
        neverPurchased: neverPurchasedCount,
        asOfDate: dateToStr,
      },
      topClientsBySpend,
    },
  };

  return { success: true, data };
}

async function buildAnalyticsProductsTab({ branchId, businessModels, query = {} }) {
  const { Sale } = businessModels;

  const ctx = tabMeta({ branchId, businessModels, query });
  const {
    days,
    dateFromStr,
    dateToStr,
    bucketType,
    salesMatch,
    prevSalesMatch,
    prevFromStr,
    prevToStr,
    businessSettingsPromise,
  } = ctx;

  const [
    businessSettingsLean,
    topProductsAgg,
    dailyProductAgg,
    prevProductAgg,
    totalsAgg,
  ] = await Promise.all([
    businessSettingsPromise,
    Sale.aggregate([
      { $match: salesMatch },
      { $unwind: '$items' },
      { $match: { 'items.type': 'product' } },
      {
        $group: {
          _id: {
            $cond: [
              { $ne: [{ $ifNull: ['$items.productId', null] }, null] },
              { $toString: '$items.productId' },
              { $concat: ['__name__', '$items.name'] },
            ],
          },
          revenue: { $sum: { $ifNull: ['$items.total', 0] } },
          units: { $sum: { $ifNull: ['$items.quantity', 0] } },
          name: { $first: '$items.name' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 50 },
    ]),
    Sale.aggregate([
      { $match: salesMatch },
      { $unwind: '$items' },
      { $match: { 'items.type': 'product' } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'Asia/Kolkata' },
          },
          productRevenue: { $sum: { $ifNull: ['$items.total', 0] } },
        },
      },
    ]),
    Sale.aggregate([
      { $match: prevSalesMatch },
      { $unwind: '$items' },
      { $match: { 'items.type': 'product' } },
      {
        $group: {
          _id: null,
          revenue: { $sum: { $ifNull: ['$items.total', 0] } },
          units: { $sum: { $ifNull: ['$items.quantity', 0] } },
        },
      },
    ]),
    Sale.aggregate([
      { $match: salesMatch },
      { $unwind: '$items' },
      { $match: { 'items.type': 'product' } },
      {
        $group: {
          _id: null,
          revenue: { $sum: { $ifNull: ['$items.total', 0] } },
          units: { $sum: { $ifNull: ['$items.quantity', 0] } },
        },
      },
    ]),
  ]);

  const productByDay = {};
  for (const row of dailyProductAgg) {
    if (row._id) productByDay[row._id] = row.productRevenue || 0;
  }
  const productTrends = bucketSingleNumericSeries(productByDay, days, bucketType, 'productRevenue');

  const trow = totalsAgg[0] || {};
  const totalProductRevenue = Math.round((trow.revenue || 0) * 100) / 100;
  const totalUnitsSold = Math.round(trow.units || 0);

  const prevRow = prevProductAgg[0] || {};
  const prevRevenue = prevRow.revenue || 0;
  const prevUnits = prevRow.units || 0;

  let topProducts = topProductsAgg.map((row) => {
    const key = row._id != null ? String(row._id) : '';
    return {
      id: key,
      name: row.name || 'Product',
      revenue: Math.round((row.revenue || 0) * 100) / 100,
      units: row.units || 0,
    };
  });

  topProducts = mergeLineItemRowsByNormalizedName(topProducts, new Map(), null).map((row, idx) => ({
    ...row,
    color: PIE_COLORS[idx % PIE_COLORS.length],
  }));

  const data = {
    business: {
      name: businessSettingsLean?.name || 'EaseMySalon',
      currency: businessSettingsLean?.currency || 'INR',
    },
    meta: {
      dateFrom: dateFromStr,
      dateTo: dateToStr,
      bucket: bucketType,
      daysInRange: days.length,
    },
    comparison: {
      previousPeriod: { dateFrom: prevFromStr, dateTo: prevToStr },
      productRevenuePct: pctChange(totalProductRevenue, prevRevenue),
      unitsSoldPct: pctChange(totalUnitsSold, prevUnits),
    },
    products: {
      totalProductRevenue,
      totalUnitsSold,
      topProducts,
      productTrends,
    },
  };

  return { success: true, data };
}

async function buildAnalyticsStaffTab({ branchId, businessModels, query = {} }) {
  const { Sale, Staff } = businessModels;

  const ctx = tabMeta({ branchId, businessModels, query });
  const {
    bid,
    dateFromStr,
    dateToStr,
    salesMatch,
    prevSalesMatch,
    prevFromStr,
    prevToStr,
    businessSettingsPromise,
  } = ctx;

  const lineType = parseStaffLineType(query);
  const aggOpts = lineType === 'all' ? {} : { lineType };

  const [businessSettingsLean, staffList, currentSales, prevSales] = await Promise.all([
    businessSettingsPromise,
    Staff.find({ branchId: bid }).select('_id name').lean(),
    Sale.find(salesMatch).select('items staffName staffId').lean(),
    Sale.find(prevSalesMatch).select('items staffName staffId').lean(),
  ]);

  const allowedStaffIds = new Set(staffList.map((s) => String(s._id)));
  const nameById = new Map(staffList.map((s) => [String(s._id), s.name || 'Staff']));

  const currentMap = aggregateStaffAnalyticsFromSales(currentSales, allowedStaffIds, aggOpts);
  const prevMap = aggregateStaffAnalyticsFromSales(prevSales, allowedStaffIds, aggOpts);

  const totalStaffRevenue = [...currentMap.values()].reduce((sum, r) => sum + r.revenue, 0);
  const prevTotal = [...prevMap.values()].reduce((sum, r) => sum + r.revenue, 0);

  const daysInRange = Math.max(1, ctx.days.length);

  const staffTop = staffList
    .map((s) => {
      const sid = String(s._id);
      const m = currentMap.get(sid);
      const prevRow = prevMap.get(sid);
      const revenue = m ? Math.round(m.revenue * 100) / 100 : 0;
      const bills = m ? m.billIds.size : 0;
      const serviceUnits = m ? Math.round(m.serviceUnits * 1000) / 1000 : 0;
      const serviceRevenue = m ? Math.round(m.serviceRevenue * 100) / 100 : 0;
      const attributedUnits = m ? Math.round(m.attributedUnits * 1000) / 1000 : 0;
      const prevRev = prevRow ? Math.round(prevRow.revenue * 100) / 100 : 0;
      const avgBillValue = bills > 0 ? Math.round((revenue / bills) * 100) / 100 : 0;
      const avgRevenuePerService = serviceUnits > 0 ? Math.round((serviceRevenue / serviceUnits) * 100) / 100 : 0;
      const servicesPerDay = Math.round((serviceUnits / daysInRange) * 1000) / 1000;
      return {
        staffId: sid,
        staffName: nameById.get(sid) || 'Staff',
        revenue,
        bills,
        serviceUnits,
        serviceRevenue,
        attributedUnits,
        avgBillValue,
        avgRevenuePerService,
        servicesPerDay,
        revenueTrendPct: pctChange(revenue, prevRev),
      };
    })
    .sort((a, b) => b.revenue - a.revenue || String(a.staffName).localeCompare(String(b.staffName)));

  const totalServiceRevenue = staffTop.reduce((s, r) => s + r.serviceRevenue, 0);
  const totalServiceUnits = staffTop.reduce((s, r) => s + r.serviceUnits, 0);
  const withBills = staffTop.filter((r) => r.bills > 0);
  const meanAvgBillValue =
    withBills.length > 0
      ? Math.round((withBills.reduce((s, r) => s + r.avgBillValue, 0) / withBills.length) * 100) / 100
      : 0;
  const blendedAvgRevenuePerService =
    totalServiceUnits > 0 ? Math.round((totalServiceRevenue / totalServiceUnits) * 100) / 100 : 0;
  const meanServicesPerDay =
    staffTop.length > 0
      ? Math.round((staffTop.reduce((s, r) => s + r.servicesPerDay, 0) / staffTop.length) * 1000) / 1000
      : 0;

  const data = {
    business: {
      name: businessSettingsLean?.name || 'EaseMySalon',
      currency: businessSettingsLean?.currency || 'INR',
    },
    meta: {
      dateFrom: dateFromStr,
      dateTo: dateToStr,
      bucket: ctx.bucketType,
      daysInRange: ctx.days.length,
      lineType,
    },
    comparison: {
      previousPeriod: { dateFrom: prevFromStr, dateTo: prevToStr },
      staffAttributedRevenuePct: pctChange(totalStaffRevenue, prevTotal),
    },
    staff: {
      totalAttributedRevenue: Math.round((totalStaffRevenue || 0) * 100) / 100,
      top: staffTop,
      insights: {
        meanAvgBillValue,
        blendedAvgRevenuePerService,
        meanServicesPerDay,
      },
    },
  };

  return { success: true, data };
}

/**
 * Staff drill-down: filtered attributed revenue trend + service-line revenue/units (IST buckets).
 */
async function buildAnalyticsStaffDrillDown({ branchId, businessModels, query = {}, staffId }) {
  const { Staff, Sale } = businessModels;
  const ctx = tabMeta({ branchId, businessModels, query });
  const {
    bid,
    days,
    dateFromStr,
    dateToStr,
    bucketType,
    salesMatch,
    businessSettingsPromise,
  } = ctx;

  const rawId = typeof staffId === 'string' ? staffId.trim() : staffId != null ? String(staffId) : '';
  if (!rawId || !mongoose.Types.ObjectId.isValid(rawId)) {
    const err = new Error('Invalid staff id');
    err.code = 'INVALID_STAFF';
    throw err;
  }

  const lineType = parseStaffLineType(query);
  const aggOpts = lineType === 'all' ? {} : { lineType };

  const [businessSettingsLean, staffDoc, sales] = await Promise.all([
    businessSettingsPromise,
    Staff.findOne({ _id: rawId, branchId: bid }).select('name').lean(),
    Sale.find(salesMatch).select('items staffName staffId date').lean(),
  ]);

  if (!staffDoc) {
    const err = new Error('Staff not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const allowed = new Set([String(staffDoc._id)]);
  const { dailyAttributed, dailyServiceRevenue, dailyServiceUnits } = aggregateStaffDailyFromSales(
    sales,
    String(staffDoc._id),
    allowed,
    aggOpts
  );

  const attributedTrend = bucketSingleNumericSeries(dailyAttributed, days, bucketType, 'value').map((p) => ({
    key: p.key,
    name: p.name,
    value: p.value,
  }));

  const serviceRevenueTrend = bucketSingleNumericSeries(dailyServiceRevenue, days, bucketType, 'value').map(
    (p) => ({
      key: p.key,
      name: p.name,
      value: p.value,
    })
  );

  const serviceUnitsTrend = bucketSingleNumericSeries(dailyServiceUnits, days, bucketType, 'value').map((p) => ({
    key: p.key,
    name: p.name,
    value: p.value,
  }));

  const data = {
    business: {
      name: businessSettingsLean?.name || 'EaseMySalon',
      currency: businessSettingsLean?.currency || 'INR',
    },
    meta: {
      dateFrom: dateFromStr,
      dateTo: dateToStr,
      bucket: bucketType,
      daysInRange: days.length,
      lineType,
    },
    staff: {
      staffId: String(staffDoc._id),
      staffName: staffDoc.name || 'Staff',
      attributedRevenueTrend: attributedTrend,
      serviceRevenueTrend,
      serviceUnitsTrend,
    },
  };

  return { success: true, data };
}

module.exports = {
  buildAnalyticsRevenueTab,
  buildAnalyticsServicesTab,
  buildAnalyticsClientsTab,
  buildAnalyticsProductsTab,
  buildAnalyticsStaffTab,
  buildAnalyticsStaffDrillDown,
};
