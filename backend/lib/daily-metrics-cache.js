/**
 * Pre-aggregated daily_metrics read path for branch-management dashboards.
 * Past days come from the main DB cache; today and missing days are computed live
 * via tenant fan-out and upserted back into the cache.
 */

const mongoose = require('mongoose');
const { fanOut } = require('./branch-fanout');
const { extendedMetricsForBranch, getDailyMetricModel } = require('./branch-management-phase2-routes');
const { ymd, COMPLETED } = require('./branch-management-helpers');

function toObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return id;
  }
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Inclusive list of YYYY-MM-DD strings between two Date midnights. */
function enumerateYmdDates(start, end) {
  const dates = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= endDay) {
    dates.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/** Sum daily rows into range-level KPIs (one row per date). */
function aggregateDailyRows(rows) {
  let revenue = 0;
  let appointments = 0;
  let completedAppointments = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  let utilSum = 0;
  const seen = new Set();

  for (const row of rows || []) {
    if (!row?.date || seen.has(row.date)) continue;
    seen.add(row.date);
    revenue += Number(row.revenue) || 0;
    appointments += Number(row.appointments) || 0;
    completedAppointments += Number(row.completedAppointments) || 0;
    if (row.avgRating != null) {
      ratingSum += Number(row.avgRating);
      ratingCount += 1;
    }
    utilSum += Number(row.capacityUtilizationPct) || 0;
  }

  const dayCount = seen.size;
  return {
    revenue,
    appointments,
    completedAppointments,
    avgTicketSize: completedAppointments > 0 ? Math.round(revenue / completedAppointments) : 0,
    avgRating: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
    capacityUtilizationPct: dayCount > 0 ? Math.round(utilSum / dayCount) : 0,
  };
}

/** Merge cached + live rows; live wins on duplicate dates. */
function mergeDailyRowsByDate(cachedRows, liveRows) {
  const byDate = new Map();
  for (const row of cachedRows || []) {
    if (row?.date) byDate.set(row.date, row);
  }
  for (const row of liveRows || []) {
    if (row?.date) byDate.set(row.date, row);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** Dates without cache, plus today (always refreshed). */
function datesNeedingLiveFetch(allDates, cachedDates, todayYmd) {
  const cached = new Set(cachedDates);
  return allDates.filter((d) => !cached.has(d) || d === todayYmd);
}

/** Roll daily rows up into chart buckets (daily / weekly / monthly). */
function buildSeriesMapFromDailyRows(rows, buckets, granularity, valueField, bucketKeyOf) {
  const map = {};
  for (const b of buckets) map[b.key] = 0;

  for (const row of rows || []) {
    const key = bucketKeyOf(`${row.date}T00:00:00`, granularity);
    if (key == null || map[key] === undefined) continue;
    map[key] += Number(row[valueField]) || 0;
  }
  return map;
}

async function loadCachedDailyMetrics(mainConnection, branchIds, fromYmd, toYmd) {
  const DailyMetric = getDailyMetricModel(mainConnection);
  const docs = await DailyMetric.find({
    branchId: { $in: branchIds.map(toObjectId) },
    date: { $gte: fromYmd, $lte: toYmd },
  }).lean();

  const byBranch = new Map();
  for (const id of branchIds) byBranch.set(String(id), []);
  for (const doc of docs) {
    const bid = String(doc.branchId);
    if (!byBranch.has(bid)) byBranch.set(bid, []);
    byBranch.get(bid).push({
      branchId: bid,
      date: doc.date,
      revenue: doc.revenue ?? 0,
      appointments: doc.appointments ?? 0,
      completedAppointments: doc.completedAppointments ?? 0,
      avgRating: doc.avgRating ?? null,
      capacityUtilizationPct: doc.capacityUtilizationPct ?? 0,
    });
  }
  return byBranch;
}

async function dailyMetricForBranch({ models, branch }, dateStr) {
  const { Sale, Appointment } = models;
  const branchId = toObjectId(branch.id);
  const dayStart = new Date(`${dateStr}T00:00:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999`);

  const [revenueAgg, appointments, completedAppointments, extra] = await Promise.all([
    Sale.aggregate([
      { $match: { branchId, date: { $gte: dayStart, $lte: dayEnd }, status: COMPLETED } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$grossTotal', 0] } } } },
    ]),
    Appointment.countDocuments({
      branchId,
      date: dateStr,
      status: { $ne: 'cancelled' },
    }),
    Appointment.countDocuments({ branchId, date: dateStr, status: COMPLETED }),
    extendedMetricsForBranch(
      { models, branch },
      { start: dayStart, end: dayEnd, ymd: (d) => ymd(d) }
    ),
  ]);

  return {
    branchId: branch.id,
    date: dateStr,
    revenue: revenueAgg[0]?.total || 0,
    appointments,
    completedAppointments,
    avgRating: extra.avgRating,
    capacityUtilizationPct: extra.capacityUtilizationPct,
  };
}

async function dailyMetricsForBranchDates(ctx, dateStrs) {
  const rows = [];
  for (const dateStr of dateStrs || []) {
    rows.push(await dailyMetricForBranch(ctx, dateStr));
  }
  return rows;
}

async function upsertDailyMetrics(mainConnection, rows) {
  if (!rows?.length) return;
  const DailyMetric = getDailyMetricModel(mainConnection);
  await Promise.all(
    rows.map((row) =>
      DailyMetric.updateOne(
        { branchId: toObjectId(row.branchId), date: row.date },
        {
          $set: {
            branchId: toObjectId(row.branchId),
            date: row.date,
            revenue: row.revenue ?? 0,
            appointments: row.appointments ?? 0,
            completedAppointments: row.completedAppointments ?? 0,
            avgRating: row.avgRating ?? null,
            capacityUtilizationPct: row.capacityUtilizationPct ?? 0,
          },
        },
        { upsert: true }
      )
    )
  );
}

async function pointInTimeCountsForBranch({ models }) {
  const { Staff, Client } = models;
  const [staff, clients] = await Promise.all([
    Staff.countDocuments({ isActive: true }),
    Client.countDocuments({}),
  ]);
  return { staff, clients };
}

/**
 * Hybrid cache + live fetch for all branches in a date range.
 * Returns merged daily rows per branch and cache coverage metadata.
 */
async function resolveAllBranchesDailyRows(mainConnection, branchList, range, ymdFn = ymd) {
  const fromYmd = ymdFn(range.start);
  const toYmd = ymdFn(range.end);
  const todayYmd = ymdFn(new Date());
  const allDates = enumerateYmdDates(range.start, range.end);
  const branchIds = branchList.map((b) => b.id);

  const cacheByBranch = await loadCachedDailyMetrics(mainConnection, branchIds, fromYmd, toYmd);

  const branchesNeedingFetch = [];
  const fetchDatesByBranch = new Map();
  let cachedBranchDays = 0;

  for (const branch of branchList) {
    const cachedRows = cacheByBranch.get(branch.id) || [];
    const cachedDateSet = new Set(cachedRows.map((r) => r.date));
    cachedBranchDays += allDates.filter((d) => cachedDateSet.has(d) && d !== todayYmd).length;
    const needFetch = datesNeedingLiveFetch(allDates, cachedRows.map((r) => r.date), todayYmd);
    if (needFetch.length > 0) {
      branchesNeedingFetch.push(branch);
      fetchDatesByBranch.set(branch.id, needFetch);
    }
  }

  const liveByBranch = new Map();
  const fetchErrors = new Map();

  if (branchesNeedingFetch.length > 0) {
    const fetchResults = await fanOut(mainConnection, branchesNeedingFetch, (ctx) =>
      dailyMetricsForBranchDates(ctx, fetchDatesByBranch.get(ctx.branch.id) || [])
    );
    const rowsToUpsert = [];
    for (const r of fetchResults) {
      if (r.error) {
        fetchErrors.set(r.branchId, r.error);
        continue;
      }
      if (r.data) {
        liveByBranch.set(r.branchId, r.data);
        rowsToUpsert.push(...r.data);
      }
    }
    await upsertDailyMetrics(mainConnection, rowsToUpsert);
  }

  const rowsByBranch = new Map();
  for (const branch of branchList) {
    const cachedRows = cacheByBranch.get(branch.id) || [];
    const liveRows = liveByBranch.get(branch.id) || [];
    rowsByBranch.set(branch.id, mergeDailyRowsByDate(cachedRows, liveRows));
  }

  const totalBranchDays = branchList.length * allDates.length;
  let source = 'cache';
  if (cachedBranchDays === 0 && branchesNeedingFetch.length > 0) source = 'live';
  else if (branchesNeedingFetch.length > 0) source = 'hybrid';

  return {
    rowsByBranch,
    fetchErrors,
    cacheCoverage: {
      totalBranchDays,
      cachedBranchDays,
      liveBranchDays: totalBranchDays - cachedBranchDays,
      source,
    },
  };
}

/** Cache-backed series map for revenue or appointments. */
async function resolveBranchSeriesFromCache(
  mainConnection,
  branchList,
  range,
  granularity,
  buckets,
  bucketKeyOf,
  valueField,
  ymdFn = ymd
) {
  const { rowsByBranch, fetchErrors, cacheCoverage } = await resolveAllBranchesDailyRows(
    mainConnection,
    branchList,
    range,
    ymdFn
  );

  const series = branchList.map((branch) => {
    const rows = rowsByBranch.get(branch.id) || [];
    const map = buildSeriesMapFromDailyRows(rows, buckets, granularity, valueField, bucketKeyOf);
    return {
      branchId: branch.id,
      branchName: branch.name,
      error: fetchErrors.get(branch.id) || null,
      data: buckets.map((b) => map[b.key] || 0),
    };
  });

  return { series, cacheCoverage };
}

module.exports = {
  enumerateYmdDates,
  aggregateDailyRows,
  mergeDailyRowsByDate,
  datesNeedingLiveFetch,
  buildSeriesMapFromDailyRows,
  loadCachedDailyMetrics,
  dailyMetricForBranch,
  dailyMetricsForBranchDates,
  upsertDailyMetrics,
  pointInTimeCountsForBranch,
  resolveAllBranchesDailyRows,
  resolveBranchSeriesFromCache,
};
