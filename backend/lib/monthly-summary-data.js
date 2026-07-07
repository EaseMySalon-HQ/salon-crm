'use strict';

const {
  getStartOfDayIST,
  getEndOfDayIST,
  toDateStringIST,
  formatInIST,
  parseDateIST,
  getPreviousMonthRangeIST,
  getMonthRangeFromKey,
  getPreviousMonthKey,
  getSameMonthLastYearKey,
  lastNMonthKeys,
} = require('../utils/date-utils');

const REVENUE_MILESTONES = [
  { threshold: 500000, label: '₹5L' },
  { threshold: 1000000, label: '₹10L' },
  { threshold: 2000000, label: '₹20L' },
  { threshold: 5000000, label: '₹50L' },
];
const BILL_MILESTONES = [100, 300, 500, 1000, 2000];

function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function netRevenueFromSales(sales) {
  return round2(
    sales.reduce((sum, s) => sum + (s.netTotal ?? s.grossTotal ?? s.totalAmount ?? 0), 0)
  );
}

function sumRevenueByCategory(sales) {
  const out = { services: 0, products: 0, packages: 0, membership: 0, prepaid: 0 };
  sales.forEach((s) => {
    (s.items || []).forEach((item) => {
      const amt =
        Number(item.total) ||
        Number(item.lineTotal) ||
        (Number(item.price) || 0) * (Number(item.quantity) || 1) ||
        0;
      const type = String(item.type || '').toLowerCase();
      if (type === 'service') out.services += amt;
      else if (type === 'product') out.products += amt;
      else if (type === 'package') out.packages += amt;
      else if (type === 'membership') out.membership += amt;
      else if (type === 'prepaid_wallet' || type === 'prepaid') out.prepaid += amt;
    });
  });
  return {
    services: round2(out.services),
    products: round2(out.products),
    packages: round2(out.packages),
    membership: round2(out.membership),
    prepaid: round2(out.prepaid),
  };
}

function monthShortLabel(monthKey) {
  return formatInIST(parseDateIST(`${monthKey}-01`), { month: 'short' });
}

function linearForecastFromSeries(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return 0;
  if (nums.length === 1) return round2(nums[0]);
  const n = nums.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += i;
    sumY += nums[i];
    sumXY += i * nums[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return round2(nums[n - 1]);
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return round2(Math.max(0, intercept + slope * n));
}

function pickFastestGrowingCategory(current, previous) {
  if (!previous) return '';
  const keys = ['services', 'products', 'packages', 'membership', 'prepaid'];
  const labels = {
    services: 'Services',
    products: 'Products',
    packages: 'Packages',
    membership: 'Membership',
    prepaid: 'Prepaid',
  };
  let best = '';
  let bestPct = -Infinity;
  keys.forEach((k) => {
    const cur = Number(current[k]) || 0;
    const prev = Number(previous[k]) || 0;
    if (prev <= 0 && cur <= 0) return;
    const pct = prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0;
    if (pct > bestPct) {
      bestPct = pct;
      best = labels[k];
    }
  });
  return best;
}

async function detectMilestones(MonthlySummary, branchId, monthKey, totals) {
  const milestones = [];
  const prior = await MonthlySummary.find({ branchId, monthKey: { $lt: monthKey } })
    .select('monthTotalRevenue monthTotalBills')
    .lean();

  for (const { threshold, label } of REVENUE_MILESTONES) {
    if (totals.monthTotalRevenue >= threshold) {
      const everBefore = prior.some((p) => (p.monthTotalRevenue || 0) >= threshold);
      if (!everBefore) {
        milestones.push({
          type: 'revenue',
          message: `Crossed ${label} in monthly revenue for the first time!`,
        });
        break;
      }
    }
  }

  for (const threshold of BILL_MILESTONES) {
    if (totals.monthTotalBills >= threshold) {
      const everBefore = prior.some((p) => (p.monthTotalBills || 0) >= threshold);
      if (!everBefore) {
        milestones.push({
          type: 'bills',
          message: `🏅 Milestone: Crossed ${threshold.toLocaleString('en-IN')} bills this month!`,
        });
        break;
      }
    }
  }

  return milestones;
}

async function aggregateTopClients(Sale, Client, branchId, dateFrom, dateTo, limit = 5) {
  const sales = await Sale.find({
    branchId,
    date: { $gte: dateFrom, $lte: dateTo },
    status: { $nin: ['cancelled', 'Cancelled'] },
    clientId: { $exists: true, $ne: null },
  })
    .select('clientId netTotal grossTotal totalAmount')
    .lean();

  const map = new Map();
  sales.forEach((s) => {
    const id = String(s.clientId);
    const amt = s.netTotal ?? s.grossTotal ?? s.totalAmount ?? 0;
    const prev = map.get(id) || { totalSpend: 0, visitCount: 0 };
    prev.totalSpend += amt;
    prev.visitCount += 1;
    map.set(id, prev);
  });

  const topIds = [...map.entries()]
    .sort((a, b) => b[1].totalSpend - a[1].totalSpend)
    .slice(0, limit);

  if (!topIds.length) return [];

  const clients = await Client.find({ _id: { $in: topIds.map(([id]) => id) } })
    .select('name firstName lastName')
    .lean();
  const nameById = new Map(
    clients.map((c) => [
      String(c._id),
      c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Client',
    ])
  );

  return topIds.map(([id, stats]) => ({
    name: nameById.get(id) || 'Client',
    totalSpend: round2(stats.totalSpend),
    visitCount: stats.visitCount,
  }));
}

async function aggregateCustomerHealth(Sale, Client, branchId, monthRange, prevMonthRange) {
  const [curSales, prevSales] = await Promise.all([
    Sale.find({
      branchId,
      date: { $gte: monthRange.start, $lte: monthRange.end },
      status: { $nin: ['cancelled', 'Cancelled'] },
      clientId: { $exists: true, $ne: null },
    })
      .select('clientId')
      .lean(),
    Sale.find({
      branchId,
      date: { $gte: prevMonthRange.start, $lte: prevMonthRange.end },
      status: { $nin: ['cancelled', 'Cancelled'] },
      clientId: { $exists: true, $ne: null },
    })
      .select('clientId')
      .lean(),
  ]);

  const curIds = new Set(curSales.map((s) => String(s.clientId)));
  const prevIds = new Set(prevSales.map((s) => String(s.clientId)));

  let churnedCustomers = 0;
  prevIds.forEach((id) => {
    if (!curIds.has(id)) churnedCustomers += 1;
  });

  const newCustomersThisMonth = await Client.countDocuments({
    branchId,
    createdAt: { $gte: monthRange.start, $lte: monthRange.end },
  });

  let returningCustomers = 0;
  if (curIds.size) {
    const returning = await Client.countDocuments({
      _id: { $in: [...curIds] },
      branchId,
      createdAt: { $lt: monthRange.start },
    });
    returningCustomers = returning;
  }

  return { newCustomersThisMonth, returningCustomers, churnedCustomers };
}

async function computeMonthlyAggregate(businessModels, branchId, monthKey) {
  const { Sale, Appointment, Expense, Feedback, ClientConsentEvent, Client } = businessModels;
  const monthRange = getMonthRangeFromKey(monthKey);
  const prevKey = getPreviousMonthKey(monthKey);
  const prevRange = getMonthRangeFromKey(prevKey);

  const sales = await Sale.find({
    branchId,
    date: { $gte: monthRange.start, $lte: monthRange.end },
    status: { $nin: ['cancelled', 'Cancelled'] },
  }).lean();

  const cancelledSales = await Sale.find({
    branchId,
    date: { $gte: monthRange.start, $lte: monthRange.end },
    status: { $in: ['cancelled', 'Cancelled'] },
  })
    .select('netTotal grossTotal totalAmount')
    .lean();

  const monthTotalRevenue = netRevenueFromSales(sales);
  const monthTotalBills = sales.length;
  const revenueByCategory = sumRevenueByCategory(sales);
  const cancelledBillsTotal = round2(
    cancelledSales.reduce((s, r) => s + (r.netTotal ?? r.grossTotal ?? r.totalAmount ?? 0), 0)
  );

  const monthTotalAppointments = await Appointment.countDocuments({
    branchId,
    date: { $gte: monthRange.startYmd, $lte: monthRange.endYmd },
  });

  const [topClients, customerHealth, feedbackReceivedCount, consentFormReceivedCount] =
    await Promise.all([
      aggregateTopClients(Sale, Client, branchId, monthRange.start, monthRange.end, 5),
      aggregateCustomerHealth(Sale, Client, branchId, monthRange, prevRange),
      Feedback
        ? Feedback.countDocuments({
            branchId,
            submittedAt: { $gte: monthRange.start, $lte: monthRange.end },
          })
        : 0,
      ClientConsentEvent
        ? ClientConsentEvent.countDocuments({
            branchId,
            createdAt: { $gte: monthRange.start, $lte: monthRange.end },
          })
        : 0,
    ]);

  let expenseTotal = null;
  let netProfit = null;
  if (Expense) {
    const expenses = await Expense.find({
      branchId,
      date: { $gte: monthRange.start, $lte: monthRange.end },
      status: { $in: ['approved', 'pending'] },
    })
      .select('amount')
      .lean();
    expenseTotal = round2(expenses.reduce((s, e) => s + (e.amount || 0), 0));
    netProfit = round2(monthTotalRevenue - expenseTotal);
  }

  return {
    monthKey,
    monthName: monthRange.monthName,
    year: monthRange.year,
    monthTotalRevenue,
    monthTotalBills,
    monthTotalAppointments,
    revenueByCategory,
    topClients,
    ...customerHealth,
    expenseTotal,
    netProfit,
    cancelledBillsTotal,
    feedbackReceivedCount,
    consentFormReceivedCount,
  };
}

async function loadHistoricalRevenue(MonthlySummary, businessModels, branchId, monthKeys) {
  const cached = await MonthlySummary.find({
    branchId,
    monthKey: { $in: monthKeys },
  })
    .select('monthKey monthTotalRevenue')
    .lean();
  const byKey = new Map(cached.map((c) => [c.monthKey, c.monthTotalRevenue]));

  const series = [];
  for (const key of monthKeys) {
    if (byKey.has(key)) {
      series.push({ monthKey: key, label: monthShortLabel(key), revenue: byKey.get(key) });
    } else {
      const agg = await computeMonthlyAggregate(businessModels, branchId, key);
      series.push({ monthKey: key, label: monthShortLabel(key), revenue: agg.monthTotalRevenue });
    }
  }
  return series;
}

/**
 * Build monthly summary payload (cached in monthly_summaries).
 */
async function buildMonthlySummaryData(businessModels, branchId, options = {}) {
  const { MonthlySummary } = businessModels;
  const period =
    options.monthKey != null
      ? getMonthRangeFromKey(options.monthKey)
      : getPreviousMonthRangeIST(options.referenceDate || new Date());
  const monthKey = period.monthKey || options.monthKey;

  if (!options.forceRefresh) {
    const cached = await MonthlySummary.findOne({ branchId, monthKey }).lean();
    if (cached) {
      return {
        ...cached,
        branchId: String(branchId),
        branchName: options.branchName || '',
      };
    }
  }

  const current = await computeMonthlyAggregate(businessModels, branchId, monthKey);

  const prevKey = getPreviousMonthKey(monthKey);
  let previousMonthTotalRevenue = 0;
  let prevCategory = null;
  const prevCached = await MonthlySummary.findOne({ branchId, monthKey: prevKey })
    .select('monthTotalRevenue revenueByCategory')
    .lean();
  if (prevCached) {
    previousMonthTotalRevenue = prevCached.monthTotalRevenue;
    prevCategory = prevCached.revenueByCategory;
  } else {
    const prevAgg = await computeMonthlyAggregate(businessModels, branchId, prevKey);
    previousMonthTotalRevenue = prevAgg.monthTotalRevenue;
    prevCategory = prevAgg.revenueByCategory;
    await MonthlySummary.findOneAndUpdate(
      { branchId, monthKey: prevKey },
      {
        branchId,
        ...prevAgg,
        previousMonthTotalRevenue: 0,
        computedAt: new Date(),
      },
      { upsert: true }
    );
  }

  const yoyKey = getSameMonthLastYearKey(monthKey);
  let sameMonthLastYearRevenue = null;
  const yoyCached = await MonthlySummary.findOne({ branchId, monthKey: yoyKey })
    .select('monthTotalRevenue')
    .lean();
  if (yoyCached) {
    sameMonthLastYearRevenue = yoyCached.monthTotalRevenue;
  } else {
    try {
      const yoyAgg = await computeMonthlyAggregate(businessModels, branchId, yoyKey);
      sameMonthLastYearRevenue = yoyAgg.monthTotalRevenue;
      await MonthlySummary.findOneAndUpdate(
        { branchId, monthKey: yoyKey },
        { branchId, ...yoyAgg, previousMonthTotalRevenue: 0, computedAt: new Date() },
        { upsert: true }
      );
    } catch {
      sameMonthLastYearRevenue = null;
    }
  }

  const monthlyRevenueGoal =
    options.monthlyRevenueGoal != null && options.monthlyRevenueGoal > 0
      ? options.monthlyRevenueGoal
      : options.revenueTargetMonthly > 0
        ? options.revenueTargetMonthly
        : round2(previousMonthTotalRevenue * 1.1);

  const last6Keys = lastNMonthKeys(monthKey, 6);
  const last6MonthsRevenue = await loadHistoricalRevenue(
    MonthlySummary,
    businessModels,
    branchId,
    last6Keys
  );

  const forecastKeys = lastNMonthKeys(monthKey, 3);
  const forecastSeries = last6MonthsRevenue.filter((r) => forecastKeys.includes(r.monthKey));
  const nextMonthForecast = linearForecastFromSeries(forecastSeries.map((r) => r.revenue));

  const milestones = await detectMilestones(MonthlySummary, branchId, monthKey, current);
  const fastestGrowingCategory = pickFastestGrowingCategory(current.revenueByCategory, prevCategory);

  const doc = {
    branchId,
    ...current,
    previousMonthTotalRevenue,
    sameMonthLastYearRevenue,
    monthlyRevenueGoal,
    last6MonthsRevenue,
    nextMonthForecast,
    milestones,
    fastestGrowingCategory,
    computedAt: new Date(),
  };

  await MonthlySummary.findOneAndUpdate({ branchId, monthKey }, doc, { upsert: true });

  return {
    ...doc,
    branchId: String(branchId),
    branchName: options.branchName || '',
  };
}

async function precomputeMonthlySummariesForBusiness(business, mainConnection, monthKey) {
  const databaseManager = require('../config/database-manager');
  const modelFactory = require('../models/model-factory');
  const businessDb = await databaseManager.getConnection(business._id, mainConnection);
  const businessModels = modelFactory.createBusinessModels(businessDb);
  const goal =
    business.settings?.revenueTarget?.monthly ||
    business.settings?.emailNotificationSettings?.monthlySummary?.revenueGoal;

  return buildMonthlySummaryData(businessModels, business._id, {
    monthKey,
    branchName: business.name || '',
    forceRefresh: true,
    monthlyRevenueGoal: goal > 0 ? goal : undefined,
    revenueTargetMonthly: business.settings?.revenueTarget?.monthly,
  });
}

module.exports = {
  buildMonthlySummaryData,
  computeMonthlyAggregate,
  precomputeMonthlySummariesForBusiness,
  linearForecastFromSeries,
  monthShortLabel,
};
