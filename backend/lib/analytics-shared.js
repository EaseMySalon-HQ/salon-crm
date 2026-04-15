/**
 * Shared helpers for analytics tab APIs (IST, branch-scoped).
 */

const mongoose = require('mongoose');
const {
  parseDateIST,
  getStartOfDayIST,
  getEndOfDayIST,
  getTodayIST,
  toDateStringIST,
} = require('../utils/date-utils');

const MAX_RANGE_DAYS = 731;
const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PIE_COLORS = ['#adfa1d', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4', '#64748b'];

const CANCELLED_NOR = [{ status: /cancelled/i }];

const MAX_SPAN_DAILY = 31;
const MAX_SPAN_WEEKLY = 35;

function toObjectId(branchId) {
  return branchId instanceof mongoose.Types.ObjectId
    ? branchId
    : new mongoose.Types.ObjectId(String(branchId));
}

function addCalendarDays(ymd, deltaDays) {
  const d = parseDateIST(ymd);
  const n = new Date(d.getTime() + deltaDays * 86400000);
  return toDateStringIST(n);
}

function eachDayInclusive(fromStr, toStr) {
  const out = [];
  let cur = fromStr;
  while (cur <= toStr) {
    out.push(cur);
    if (cur === toStr) break;
    cur = addCalendarDays(cur, 1);
  }
  return out;
}

function daysInclusive(fromStr, toStr) {
  const a = parseDateIST(fromStr);
  const b = parseDateIST(toStr);
  return Math.floor((b - a) / 86400000) + 1;
}

function pickBucketType(fromStr, toStr) {
  const n = daysInclusive(fromStr, toStr);
  if (n <= 14) return 'day';
  if (n <= 90) return 'week';
  return 'month';
}

function resolveBucketType(query, dateFromStr, dateToStr) {
  const n = daysInclusive(dateFromStr, dateToStr);
  const raw = typeof query.bucket === 'string' ? query.bucket.trim().toLowerCase() : '';
  const requested = raw === 'day' || raw === 'week' || raw === 'month' ? raw : null;

  if (!requested) {
    return pickBucketType(dateFromStr, dateToStr);
  }

  const allowDay = n <= MAX_SPAN_DAILY;
  const allowWeek = n <= MAX_SPAN_WEEKLY;

  if (requested === 'day') {
    if (allowDay) return 'day';
    if (allowWeek) return 'week';
    return 'month';
  }
  if (requested === 'week') {
    if (allowWeek) return 'week';
    return 'month';
  }
  if (requested === 'month') {
    return 'month';
  }
  return pickBucketType(dateFromStr, dateToStr);
}

function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return `${MONTH_NAMES_SHORT[m - 1]} ${y}`;
}

function shortDayLabel(ymd) {
  const [, m, d] = ymd.split('-').map(Number);
  if (!m || !d) return ymd;
  return `${MONTH_NAMES_SHORT[m - 1]} ${d}`;
}

function bucketSeries(dailyRows, bucketType) {
  if (bucketType === 'day') {
    return dailyRows.map((r) => ({
      key: r.date,
      name: shortDayLabel(r.date),
      revenue: r.revenue,
      expenses: r.expenses,
      profit: r.revenue - r.expenses,
    }));
  }
  if (bucketType === 'week') {
    const out = [];
    for (let i = 0; i < dailyRows.length; i += 7) {
      const chunk = dailyRows.slice(i, i + 7);
      if (chunk.length === 0) continue;
      const revenue = chunk.reduce((s, x) => s + x.revenue, 0);
      const expenses = chunk.reduce((s, x) => s + x.expenses, 0);
      const a = chunk[0].date;
      const b = chunk[chunk.length - 1].date;
      out.push({
        key: `week-${a}`,
        name: `${shortDayLabel(a)}–${shortDayLabel(b)}`,
        revenue,
        expenses,
        profit: revenue - expenses,
      });
    }
    return out;
  }
  const monthMap = new Map();
  for (const r of dailyRows) {
    const ym = r.date.slice(0, 7);
    if (!monthMap.has(ym)) {
      monthMap.set(ym, { revenue: 0, expenses: 0 });
    }
    const m = monthMap.get(ym);
    m.revenue += r.revenue;
    m.expenses += r.expenses;
  }
  return [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, v]) => ({
      key: ym,
      name: monthLabel(ym),
      revenue: v.revenue,
      expenses: v.expenses,
      profit: v.revenue - v.expenses,
    }));
}

function bucketNewClientsSeries(dailyNewMap, days, bucketType) {
  const dailyRows = days.map((d) => ({
    date: d,
    newClients: dailyNewMap[d] || 0,
  }));
  if (bucketType === 'day') {
    return dailyRows.map((r) => ({
      key: r.date,
      name: shortDayLabel(r.date),
      newClients: r.newClients,
    }));
  }
  if (bucketType === 'week') {
    const out = [];
    for (let i = 0; i < dailyRows.length; i += 7) {
      const chunk = dailyRows.slice(i, i + 7);
      if (chunk.length === 0) continue;
      const newClients = chunk.reduce((s, x) => s + x.newClients, 0);
      const a = chunk[0].date;
      const b = chunk[chunk.length - 1].date;
      out.push({
        key: `week-${a}`,
        name: `${shortDayLabel(a)}–${shortDayLabel(b)}`,
        newClients,
      });
    }
    return out;
  }
  const monthMap = new Map();
  for (const r of dailyRows) {
    const ym = r.date.slice(0, 7);
    monthMap.set(ym, (monthMap.get(ym) || 0) + r.newClients);
  }
  return [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, v]) => ({
      key: ym,
      name: monthLabel(ym),
      newClients: v,
    }));
}

/**
 * @param {Record<string, number>} dailyMap
 * @param {string[]} days
 * @param {'day'|'week'|'month'} bucketType
 * @param {string} fieldKey
 */
function bucketSingleNumericSeries(dailyMap, days, bucketType, fieldKey) {
  const dailyRows = days.map((d) => ({
    date: d,
    v: dailyMap[d] || 0,
  }));
  if (bucketType === 'day') {
    return dailyRows.map((r) => ({
      key: r.date,
      name: shortDayLabel(r.date),
      [fieldKey]: r.v,
    }));
  }
  if (bucketType === 'week') {
    const out = [];
    for (let i = 0; i < dailyRows.length; i += 7) {
      const chunk = dailyRows.slice(i, i + 7);
      if (chunk.length === 0) continue;
      const val = chunk.reduce((s, x) => s + x.v, 0);
      const a = chunk[0].date;
      const b = chunk[chunk.length - 1].date;
      out.push({
        key: `week-${a}`,
        name: `${shortDayLabel(a)}–${shortDayLabel(b)}`,
        [fieldKey]: val,
      });
    }
    return out;
  }
  const monthMap = new Map();
  for (const r of dailyRows) {
    const ym = r.date.slice(0, 7);
    monthMap.set(ym, (monthMap.get(ym) || 0) + r.v);
  }
  return [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, v]) => ({
      key: ym,
      name: monthLabel(ym),
      [fieldKey]: v,
    }));
}

function computePreviousPeriodRange(dateFromStr, dateToStr) {
  const n = daysInclusive(dateFromStr, dateToStr);
  const prevToStr = addCalendarDays(dateFromStr, -1);
  const prevFromStr = addCalendarDays(prevToStr, -(n - 1));
  return { prevFromStr, prevToStr };
}

function pctChange(current, previous) {
  if (previous == null || Number.isNaN(previous)) return null;
  if (previous === 0) return current > 0 ? 100 : current < 0 ? -100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function resolveDateRange(query) {
  const todayStr = getTodayIST();
  let dateFromStr = typeof query.dateFrom === 'string' ? query.dateFrom.trim() : '';
  let dateToStr = typeof query.dateTo === 'string' ? query.dateTo.trim() : '';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFromStr)) {
    dateFromStr = addCalendarDays(todayStr, -364);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateToStr)) {
    dateToStr = todayStr;
  }

  if (dateFromStr > dateToStr) {
    const t = dateFromStr;
    dateFromStr = dateToStr;
    dateToStr = t;
  }

  const span = daysInclusive(dateFromStr, dateToStr);
  if (span > MAX_RANGE_DAYS) {
    const err = new Error(`Date range cannot exceed ${MAX_RANGE_DAYS} days`);
    err.code = 'INVALID_RANGE';
    throw err;
  }

  const startDate = getStartOfDayIST(dateFromStr);
  const endDate = getEndOfDayIST(dateToStr);

  return {
    dateFromStr,
    dateToStr,
    startDate,
    endDate,
  };
}

module.exports = {
  toObjectId,
  addCalendarDays,
  eachDayInclusive,
  daysInclusive,
  resolveDateRange,
  computePreviousPeriodRange,
  pctChange,
  resolveBucketType,
  pickBucketType,
  bucketSeries,
  bucketNewClientsSeries,
  bucketSingleNumericSeries,
  MAX_RANGE_DAYS,
  CANCELLED_NOR,
  MONTH_NAMES_SHORT,
  PIE_COLORS,
};
