'use strict';

const {
  getStartOfDayIST,
  getEndOfDayIST,
  toDateStringIST,
  formatWeekRangeIST,
  weekdayShortIST,
  getPreviousMonSunWeekIST,
} = require('../utils/date-utils');

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

function itemLineAmount(item) {
  return (
    Number(item.total) ||
    Number(item.lineTotal) ||
    (Number(item.price) || 0) * (Number(item.quantity) || 1) ||
    0
  );
}

function enumerateWeekDays(weekStartDate) {
  const days = [];
  const start = getStartOfDayIST(weekStartDate);
  for (let i = 0; i < 7; i += 1) {
    const ymd = toDateStringIST(new Date(start.getTime() + i * 86400000));
    days.push({ date: ymd, dayLabel: weekdayShortIST(ymd) });
  }
  return days;
}

function groupSalesByDay(sales, weekDays) {
  const byDay = new Map(weekDays.map((d) => [d.date, []]));
  sales.forEach((s) => {
    const ymd = s.date ? toDateStringIST(s.date) : null;
    if (ymd && byDay.has(ymd)) byDay.get(ymd).push(s);
  });
  return byDay;
}

function aggregateTopServices(sales, limit = 3) {
  const map = new Map();
  sales.forEach((s) => {
    (s.items || []).forEach((item) => {
      if (String(item.type || '').toLowerCase() !== 'service') return;
      const name = (item.name || item.serviceName || 'Service').trim();
      const amt = itemLineAmount(item);
      const qty = Number(item.quantity) || 1;
      const prev = map.get(name) || { name, revenue: 0, count: 0 };
      prev.revenue += amt;
      prev.count += qty;
      map.set(name, prev);
    });
  });
  return [...map.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
    .map((r) => ({ name: r.name, revenue: round2(r.revenue), count: r.count }));
}

function aggregateStaffLeaderboard(sales, limit = 3) {
  const map = new Map();
  const billStaff = new Set();

  sales.forEach((s) => {
    const saleStaff = new Set();
    (s.items || []).forEach((item) => {
      if (item.staffContributions?.length) {
        item.staffContributions.forEach((c) => {
          const id = String(c.staffId || c.staffName || '');
          if (!id) return;
          const name = c.staffName || 'Staff';
          const prev = map.get(id) || { name, billsHandled: 0, revenueGenerated: 0 };
          prev.revenueGenerated += Number(c.amount) || 0;
          map.set(id, prev);
          saleStaff.add(id);
        });
      } else if (item.staffId || item.staffName) {
        const id = String(item.staffId || item.staffName);
        const name = item.staffName || 'Staff';
        const amt = itemLineAmount(item);
        const prev = map.get(id) || { name, billsHandled: 0, revenueGenerated: 0 };
        prev.revenueGenerated += amt;
        map.set(id, prev);
        saleStaff.add(id);
      }
    });
    if (s.staffId) saleStaff.add(String(s.staffId));
    saleStaff.forEach((id) => {
      billStaff.add(id);
      const row = map.get(id);
      if (row) row.billsHandled += 1;
    });
  });

  const rows = [...map.values()]
    .filter((r) => r.revenueGenerated > 0)
    .sort((a, b) => b.revenueGenerated - a.revenueGenerated)
    .slice(0, limit)
    .map((r) => ({
      name: r.name,
      billsHandled: r.billsHandled,
      revenueGenerated: round2(r.revenueGenerated),
    }));

  return rows;
}

function pickBestAndSlowestDay(dailyRevenue) {
  if (!dailyRevenue.length) {
    return {
      bestDay: { date: '', dayLabel: '', revenue: 0 },
      slowestDay: { date: '', dayLabel: '', revenue: 0 },
    };
  }
  let best = dailyRevenue[0];
  let slowest = dailyRevenue[0];
  dailyRevenue.forEach((d) => {
    if (d.netRevenue > best.netRevenue) best = d;
    if (d.netRevenue < slowest.netRevenue) slowest = d;
  });
  return {
    bestDay: { date: best.date, dayLabel: best.dayLabel, revenue: best.netRevenue },
    slowestDay: { date: slowest.date, dayLabel: slowest.dayLabel, revenue: slowest.netRevenue },
  };
}

async function countWeeksSinceBest(WeeklySummary, branchId, weekStartDate, weekTotalRevenue) {
  const past = await WeeklySummary.find({
    branchId,
    weekStartDate: { $lt: weekStartDate },
  })
    .sort({ weekStartDate: -1 })
    .limit(52)
    .select('weekStartDate weekTotalRevenue')
    .lean();

  for (let i = 0; i < past.length; i += 1) {
    if (past[i].weekTotalRevenue >= weekTotalRevenue) {
      return i + 1;
    }
  }
  return past.length + 1;
}

async function computeWeeklyAggregate(businessModels, branchId, weekStartDate, weekEndDate) {
  const { Sale, Appointment, Client } = businessModels;
  const dateFrom = getStartOfDayIST(weekStartDate);
  const dateTo = getEndOfDayIST(weekEndDate);

  const sales = await Sale.find({
    branchId,
    status: { $nin: ['cancelled', 'Cancelled'] },
    date: { $gte: dateFrom, $lte: dateTo },
  }).lean();

  const weekDays = enumerateWeekDays(weekStartDate);
  const byDay = groupSalesByDay(sales, weekDays);
  const dailyRevenue = weekDays.map(({ date, dayLabel }) => {
    const daySales = byDay.get(date) || [];
    return {
      date,
      dayLabel,
      netRevenue: netRevenueFromSales(daySales),
      bills: daySales.length,
    };
  });

  const weekTotalRevenue = round2(dailyRevenue.reduce((s, d) => s + d.netRevenue, 0));
  const weekTotalBills = dailyRevenue.reduce((s, d) => s + d.bills, 0);

  const appointments = await Appointment.find({
    branchId,
    date: { $gte: weekStartDate, $lte: weekEndDate },
  })
    .select('status clientId')
    .lean();

  const appointmentFunnel = {
    booked: appointments.length,
    completed: appointments.filter((a) => a.status === 'completed').length,
    cancelled: appointments.filter((a) =>
      ['cancelled', 'cancelled_at_billing'].includes(a.status)
    ).length,
    noShow: appointments.filter((a) => a.status === 'missed').length,
  };

  const clientIds = [
    ...new Set(
      sales.map((s) => (s.clientId ? String(s.clientId) : null)).filter(Boolean)
    ),
  ];

  let newCustomers = 0;
  let returningCustomers = 0;
  if (clientIds.length) {
    const clients = await Client.find({ branchId, _id: { $in: clientIds } })
      .select('createdAt')
      .lean();
    clients.forEach((c) => {
      const created = c.createdAt ? new Date(c.createdAt) : null;
      if (created && created >= dateFrom && created <= dateTo) newCustomers += 1;
      else if (created && created < dateFrom) returningCustomers += 1;
    });
  }

  const { bestDay, slowestDay } = pickBestAndSlowestDay(dailyRevenue);
  const topServices = aggregateTopServices(sales, 3);
  const staffLeaderboard = aggregateStaffLeaderboard(sales, 3);

  return {
    weekStartDate,
    weekEndDate,
    weekTotalRevenue,
    weekTotalBills,
    weekTotalAppointments: appointmentFunnel.booked,
    dailyRevenue,
    bestDay,
    slowestDay,
    topServices,
    newCustomers,
    returningCustomers,
    appointmentFunnel,
    staffLeaderboard,
  };
}

function getWeekBeforeMonSun(weekStartDate) {
  const start = getStartOfDayIST(weekStartDate);
  const prevEndMs = start.getTime() - 86400000;
  const prevStartMs = prevEndMs - 6 * 86400000;
  return {
    weekStartDate: toDateStringIST(new Date(prevStartMs)),
    weekEndDate: toDateStringIST(new Date(prevEndMs)),
  };
}

/**
 * Build weekly summary payload for email (with cache in weekly_summaries).
 */
async function buildWeeklySummaryData(businessModels, branchId, options = {}) {
  const { WeeklySummary } = businessModels;
  const { weekStartDate, weekEndDate } =
    options.weekStartDate && options.weekEndDate
      ? { weekStartDate: options.weekStartDate, weekEndDate: options.weekEndDate }
      : getPreviousMonSunWeekIST(options.referenceDate || new Date());

  if (!options.forceRefresh) {
    const cached = await WeeklySummary.findOne({ branchId, weekStartDate }).lean();
    if (cached) {
      const weeksSinceBest =
        cached.weeksSinceBest ??
        (await countWeeksSinceBest(WeeklySummary, branchId, weekStartDate, cached.weekTotalRevenue));
      return {
        ...cached,
        branchId: String(branchId),
        branchName: options.branchName || '',
        weekRangeFormatted: formatWeekRangeIST(weekStartDate, weekEndDate),
        weeksSinceBest,
      };
    }
  }

  const current = await computeWeeklyAggregate(businessModels, branchId, weekStartDate, weekEndDate);

  const prevWeek = getWeekBeforeMonSun(weekStartDate);
  let previousWeekTotalRevenue = 0;
  const prevCached = await WeeklySummary.findOne({
    branchId,
    weekStartDate: prevWeek.weekStartDate,
  })
    .select('weekTotalRevenue')
    .lean();
  if (prevCached) {
    previousWeekTotalRevenue = prevCached.weekTotalRevenue;
  } else {
    const prevAgg = await computeWeeklyAggregate(
      businessModels,
      branchId,
      prevWeek.weekStartDate,
      prevWeek.weekEndDate
    );
    previousWeekTotalRevenue = prevAgg.weekTotalRevenue;
    await WeeklySummary.findOneAndUpdate(
      { branchId, weekStartDate: prevWeek.weekStartDate },
      { branchId, ...prevAgg, previousWeekTotalRevenue: 0, computedAt: new Date() },
      { upsert: true }
    );
  }

  const weeklyRevenueGoal =
    options.weeklyRevenueGoal != null && options.weeklyRevenueGoal > 0
      ? options.weeklyRevenueGoal
      : round2(previousWeekTotalRevenue * 1.1);

  const weeksSinceBest = await countWeeksSinceBest(
    WeeklySummary,
    branchId,
    weekStartDate,
    current.weekTotalRevenue
  );

  const doc = {
    branchId,
    ...current,
    previousWeekTotalRevenue,
    weeklyRevenueGoal,
    weeksSinceBest,
    computedAt: new Date(),
  };

  await WeeklySummary.findOneAndUpdate({ branchId, weekStartDate }, doc, { upsert: true });

  return {
    ...doc,
    branchId: String(branchId),
    branchName: options.branchName || '',
    weekRangeFormatted: formatWeekRangeIST(weekStartDate, weekEndDate),
    weeksSinceBest,
  };
}

module.exports = {
  buildWeeklySummaryData,
  computeWeeklyAggregate,
  getPreviousMonSunWeekIST,
  enumerateWeekDays,
};
