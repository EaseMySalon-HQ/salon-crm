/**
 * Mirrors lib/staff-line-revenue.ts — tax-exclusive line splits for staff analytics (Node).
 */

const { toDateStringIST } = require('../utils/date-utils');

/**
 * @param {import('mongoose').Types.ObjectId | string} bid
 */
function getLineGrossTotal(item) {
  const t = Number(item.total);
  if (Number.isFinite(t) && t >= 0) return t;
  return (Number(item.price) || 0) * (Number(item.quantity) || 1);
}

/**
 * Tax-exclusive line amount (staff revenue is never based on tax).
 * @param {Record<string, unknown>} item
 */
function getLinePreTaxTotal(item) {
  const qty = Number(item.quantity) || 1;
  const pex = Number(item.priceExcludingGST);
  if (Number.isFinite(pex) && pex >= 0) {
    return pex * qty;
  }

  const total = Number(item.total);
  const lineTax = Number(item.taxAmount);
  if (Number.isFinite(total) && total >= 0 && Number.isFinite(lineTax) && lineTax >= 0) {
    return Math.max(0, total - lineTax);
  }

  const rate = Number(item.taxRate) || 0;
  if (rate > 0 && Number.isFinite(total) && total > 0) {
    return total / (1 + rate / 100);
  }

  const price = Number(item.price) || 0;
  const disc = Number(item.discount) || 0;
  const baseAfterDiscount = price * qty * (1 - disc / 100);

  if (Number.isFinite(total) && total >= 0) {
    return total;
  }

  return Math.max(0, baseAfterDiscount);
}

/**
 * @param {Record<string, unknown>} c
 * @param {number} linePreTax
 * @param {number} lineGross
 * @param {number} contributorCount
 */
function revenueForOneContribution(c, linePreTax, lineGross, contributorCount) {
  const pct = Number(c.percentage);
  if (Number.isFinite(pct) && pct > 0) {
    return (linePreTax * pct) / 100;
  }
  const amt = Number(c.amount);
  if (Number.isFinite(amt) && amt > 0 && Number.isFinite(lineGross) && lineGross > 0) {
    return (amt / lineGross) * linePreTax;
  }
  return contributorCount > 0 ? linePreTax / contributorCount : linePreTax;
}

/**
 * Split tax-exclusive line revenue across staff on the line.
 * @param {Record<string, unknown>} item
 * @param {{ staffId?: string; staffName?: string }} [saleFallback]
 * @returns {{ staffId: string; staffName?: string; revenue: number }[]}
 */
function splitLineRevenueByStaff(item, saleFallback) {
  const linePreTax = getLinePreTaxTotal(item);
  const lineGross = getLineGrossTotal(item);
  const contribs = item.staffContributions;
  const n = contribs?.length ?? 0;

  if (contribs && n > 0) {
    const out = [];
    for (const c of contribs) {
      const sid = c.staffId != null ? String(c.staffId).trim() : '';
      if (!sid) continue;
      const revenue = revenueForOneContribution(c, linePreTax, lineGross, n);
      if (revenue > 0) out.push({ staffId: sid, staffName: c.staffName, revenue });
    }
    return out;
  }

  if (item.staffId != null && String(item.staffId).trim() !== '') {
    return [
      {
        staffId: String(item.staffId),
        staffName: item.staffName,
        revenue: linePreTax,
      },
    ];
  }

  if (saleFallback?.staffId != null && String(saleFallback.staffId).trim() !== '') {
    return [
      {
        staffId: String(saleFallback.staffId),
        staffName: saleFallback.staffName,
        revenue: linePreTax,
      },
    ];
  }

  return [];
}

/**
 * Same rules as staff-performance-report `applySaleToStaffPerformanceMaps`: only staffIds in
 * `allowedStaffIdSet` receive credit. Revenue is tax-exclusive per line.
 * @param {Array<Record<string, unknown>>} sales
 * @param {Set<string>} allowedStaffIdSet
 * @param {{ lineType?: 'all' | 'service' | 'product' | 'membership' | 'package' }} [options]
 * @returns {Map<string, { revenue: number; billIds: Set<string>; serviceRevenue: number; serviceUnits: number; attributedUnits: number }>}
 */
function aggregateStaffAnalyticsFromSales(sales, allowedStaffIdSet, options = {}) {
  const lineTypeFilter = options.lineType && options.lineType !== 'all' ? String(options.lineType).toLowerCase() : null;

  const map = new Map();

  function ensure(sid) {
    if (!map.has(sid)) {
      map.set(sid, {
        revenue: 0,
        billIds: new Set(),
        serviceRevenue: 0,
        serviceUnits: 0,
        attributedUnits: 0,
      });
    }
    return map.get(sid);
  }

  for (const sale of sales) {
    const items = sale.items;
    if (!items || !Array.isArray(items)) continue;

    const saleFallback = {
      staffId: sale.staffId != null ? String(sale.staffId) : '',
      staffName: sale.staffName,
    };
    const staffSeenInSale = new Set();

    for (const item of items) {
      const lineType = String(item.type || '').toLowerCase();
      if (lineTypeFilter && lineType !== lineTypeFilter) continue;

      const splits = splitLineRevenueByStaff(item, saleFallback);
      if (splits.length === 0) continue;

      const qty = Number(item.quantity) || 1;
      const n = Math.max(1, splits.length);

      for (const { staffId, revenue } of splits) {
        if (!staffId || revenue <= 0) continue;
        if (!allowedStaffIdSet.has(staffId)) continue;

        const row = ensure(staffId);
        row.revenue += revenue;
        row.attributedUnits += qty / n;

        if (!staffSeenInSale.has(staffId)) {
          staffSeenInSale.add(staffId);
          row.billIds.add(String(sale._id));
        }

        if (lineType === 'service') {
          row.serviceRevenue += revenue;
          row.serviceUnits += qty / n;
        }
      }
    }
  }

  return map;
}

/**
 * Per-calendar-day (IST) metrics for one staff member. `dailyAttributed` respects `lineType`
 * (same as the staff tab). Service maps always use service lines only.
 * @param {Array<Record<string, unknown>>} sales
 * @param {string} staffId
 * @param {Set<string>} allowedStaffIdSet
 * @param {{ lineType?: 'all' | 'service' | 'product' | 'membership' | 'package' }} [options]
 * @returns {{ dailyAttributed: Record<string, number>, dailyServiceRevenue: Record<string, number>, dailyServiceUnits: Record<string, number> }}
 */
function aggregateStaffDailyFromSales(sales, staffId, allowedStaffIdSet, options = {}) {
  const lineTypeFilter = options.lineType && options.lineType !== 'all' ? String(options.lineType).toLowerCase() : null;
  const target = String(staffId).trim();
  if (!target || !allowedStaffIdSet.has(target)) {
    return { dailyAttributed: {}, dailyServiceRevenue: {}, dailyServiceUnits: {} };
  }

  /** @type {Record<string, number>} */
  const dailyAttributed = {};
  /** @type {Record<string, number>} */
  const dailyServiceRevenue = {};
  /** @type {Record<string, number>} */
  const dailyServiceUnits = {};

  for (const sale of sales) {
    const items = sale.items;
    if (!items || !Array.isArray(items)) continue;
    const rawDate = sale.date;
    if (rawDate == null) continue;
    const d = toDateStringIST(rawDate instanceof Date ? rawDate : new Date(rawDate));
    if (!d || d.length < 10) continue;

    const saleFallback = {
      staffId: sale.staffId != null ? String(sale.staffId) : '',
      staffName: sale.staffName,
    };

    for (const item of items) {
      const lineType = String(item.type || '').toLowerCase();
      const splits = splitLineRevenueByStaff(item, saleFallback);
      if (splits.length === 0) continue;

      const qty = Number(item.quantity) || 1;
      const n = Math.max(1, splits.length);

      for (const { staffId: sid, revenue } of splits) {
        if (!sid || revenue <= 0) continue;
        const sidStr = String(sid);
        if (sidStr !== target) continue;
        if (!allowedStaffIdSet.has(sidStr)) continue;

        if (!lineTypeFilter || lineType === lineTypeFilter) {
          dailyAttributed[d] = (dailyAttributed[d] || 0) + revenue;
        }

        if (lineType === 'service') {
          dailyServiceRevenue[d] = (dailyServiceRevenue[d] || 0) + revenue;
          dailyServiceUnits[d] = (dailyServiceUnits[d] || 0) + qty / n;
        }
      }
    }
  }

  return { dailyAttributed, dailyServiceRevenue, dailyServiceUnits };
}

module.exports = {
  getLineGrossTotal,
  getLinePreTaxTotal,
  splitLineRevenueByStaff,
  aggregateStaffAnalyticsFromSales,
  aggregateStaffDailyFromSales,
};
