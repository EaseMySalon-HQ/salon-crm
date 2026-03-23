/**
 * Shared helpers for GET /api/sales and GET /api/sales/summary — DB-side filters, pagination, aggregates.
 */

const { getStartOfDayIST, getEndOfDayIST } = require('../utils/date-utils');

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 10000;

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} mode - Cash | Card | Online
 */
function buildPaymentModeCondition(mode) {
  if (!mode || mode === 'all') return null;
  const safe = escapeRegex(mode);
  return {
    $or: [
      { payments: { $elemMatch: { mode } } },
      {
        $and: [
          {
            $or: [
              { payments: { $exists: false } },
              { payments: { $size: 0 } },
            ],
          },
          {
            $or: [
              { paymentMode: mode },
              { paymentMode: { $regex: `^${safe}(,|\\s|$)`, $options: 'i' } },
              { paymentMode: { $regex: `,\\s*${safe}(,|\\s|$)`, $options: 'i' } },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Build Mongo match for sales list / summary / count.
 * @param {import('mongoose').Types.ObjectId} branchId
 * @param {Record<string, string | undefined>} q - req.query
 */
function buildSalesListMatch(branchId, q) {
  const {
    date,
    dateFrom,
    dateTo,
    status,
    paymentMode,
    search,
    tipStaffId,
  } = q;

  let df = dateFrom || date;
  let dt = dateTo || date;
  if (date && !dateFrom && !dateTo) {
    df = date;
    dt = date;
  }

  const parts = [{ branchId: branchId }];

  if (status && status !== 'all') {
    if (status === 'cancelled') {
      parts.push({ status: { $in: ['cancelled', 'Cancelled'] } });
    } else {
      const st = String(status).toLowerCase();
      const variants =
        st === 'completed'
          ? ['completed', 'Completed']
          : st === 'partial'
            ? ['partial', 'Partial']
            : st === 'unpaid'
              ? ['unpaid', 'Unpaid']
              : [status];
      parts.push({ status: { $in: variants } });
    }
  } else {
    parts.push({ status: { $nin: ['cancelled', 'Cancelled'] } });
  }

  if (df || dt) {
    const dateRange = {};
    if (df) dateRange.$gte = getStartOfDayIST(df);
    if (dt) dateRange.$lte = getEndOfDayIST(dt);
    parts.push({
      $or: [
        { date: dateRange },
        { paymentHistory: { $elemMatch: { date: dateRange } } },
      ],
    });
  }

  const pm = buildPaymentModeCondition(paymentMode);
  if (pm) parts.push(pm);

  if (search && String(search).trim()) {
    const re = escapeRegex(String(search).trim());
    parts.push({
      $or: [
        { customerName: { $regex: re, $options: 'i' } },
        { billNo: { $regex: re, $options: 'i' } },
        { staffName: { $regex: re, $options: 'i' } },
      ],
    });
  }

  if (tipStaffId && tipStaffId !== 'all') {
    const mongoose = require('mongoose');
    const tid = mongoose.Types.ObjectId.isValid(tipStaffId)
      ? new mongoose.Types.ObjectId(tipStaffId)
      : tipStaffId;
    parts.push({
      $and: [{ tip: { $gt: 0 } }, { tipStaffId: tid }],
    });
  }

  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

/**
 * @param {Record<string, string>} query - req.query
 * @returns {{ limit: number, page: number, skip: number }}
 */
function parseSalesListPagination(query) {
  const limitRaw = parseInt(String(query.limit ?? ''), 10);
  const limit = Number.isFinite(limitRaw) && limitRaw >= 1
    ? Math.min(limitRaw, MAX_LIMIT)
    : DEFAULT_LIMIT;
  const page = Math.max(parseInt(String(query.page ?? ''), 10) || 1, 1);
  const skip = (page - 1) * limit;
  return { limit, page, skip };
}

/**
 * Mark isEdited when BillEditHistory exists but sale document was not updated.
 * @param {object[]} sales - lean docs
 * @param {import('mongoose').Model} BillEditHistoryModel
 */
async function mergeEditedFlagsFromHistory(sales, BillEditHistoryModel) {
  if (!BillEditHistoryModel || !sales.length) return;
  const saleIds = sales.map((s) => s._id);
  const editedIds = await BillEditHistoryModel.distinct('saleId', { saleId: { $in: saleIds } });
  const set = new Set(editedIds.map((id) => id.toString()));
  for (const sale of sales) {
    if (!sale.isEdited && set.has(sale._id.toString())) {
      sale.isEdited = true;
    }
  }
}

function getOutstandingBalance(sale) {
  const rem = sale.paymentStatus?.remainingAmount;
  if (typeof rem === 'number' && !Number.isNaN(rem)) return Math.max(0, rem);
  const total = sale.grossTotal || 0;
  const paid =
    sale.paymentStatus?.paidAmount ??
    (sale.payments || []).reduce((s, p) => s + (p.amount || 0), 0) ??
    0;
  return Math.max(0, total - paid);
}

/**
 * Aggregate totals from lean sale docs (same rules as sales-report frontend).
 * @param {object} sale
 * @param {object} acc - mutable accumulator
 */
function accumulateSaleSummary(sale, acc) {
  acc.totalRevenue += sale.grossTotal || 0;
  acc.tips += sale.tip || 0;

  const st = String(sale.status || '').toLowerCase();
  if (st === 'completed') acc.completedSales += 1;
  if (st === 'partial') acc.partialSales += 1;
  if (st === 'unpaid') acc.unpaidSales += 1;
  if (st === 'unpaid' || st === 'partial') {
    acc.unpaidValue += getOutstandingBalance(sale);
  }

  let cashAmt = 0;
  let isAllCash = false;
  if (sale.payments && sale.payments.length > 0) {
    const cashPayments = sale.payments.filter((p) =>
      String(p.mode || p.type || '')
        .toLowerCase()
        .includes('cash')
    );
    const hasNonCash = sale.payments.some((p) => {
      const m = String(p.mode || p.type || '').toLowerCase();
      return m.includes('card') || m.includes('online') || m.includes('upi');
    });
    cashAmt = cashPayments.reduce((s, p) => s + (p.amount || 0), 0);
    isAllCash = cashAmt > 0 && !hasNonCash;
  } else {
    const pm = String(sale.paymentMode || '').toLowerCase();
    cashAmt =
      pm.includes('cash') && !pm.includes('card') && !pm.includes('online')
        ? sale.netTotal || 0
        : 0;
    isAllCash = cashAmt > 0;
  }
  const tip = sale.tip || 0;
  acc.cashCollected += cashAmt - (isAllCash ? tip : 0);

  if (sale.payments && sale.payments.length > 0) {
    acc.onlineCash += sale.payments
      .filter((p) => p.mode === 'Card' || p.mode === 'Online')
      .reduce((s, p) => s + (p.amount || 0), 0);
  } else if (sale.paymentMode === 'Card' || sale.paymentMode === 'Online') {
    acc.onlineCash += sale.netTotal || 0;
  }
}

/**
 * Stream all matching sales (projection) and compute summary — memory-safe via cursor.
 * @param {import('mongoose').Model} Sale
 * @param {object} match
 * @returns {Promise<object>}
 */
async function computeSalesSummaryTotals(Sale, match) {
  const projection = {
    grossTotal: 1,
    payments: 1,
    paymentMode: 1,
    tip: 1,
    status: 1,
    paymentStatus: 1,
    netTotal: 1,
  };
  const acc = {
    totalRevenue: 0,
    cashCollected: 0,
    onlineCash: 0,
    unpaidValue: 0,
    tips: 0,
    completedSales: 0,
    partialSales: 0,
    unpaidSales: 0,
  };
  const cursor = Sale.find(match).select(projection).lean().cursor();
  for await (const doc of cursor) {
    accumulateSaleSummary(doc, acc);
  }
  return acc;
}

/**
 * @deprecated Use buildSalesListMatch — kept for any internal caller expecting old signature
 */
function buildSalesListFilter(branchId, dateFrom, dateTo) {
  return buildSalesListMatch(branchId, { dateFrom, dateTo });
}

module.exports = {
  buildSalesListFilter,
  buildSalesListMatch,
  parseSalesListPagination,
  mergeEditedFlagsFromHistory,
  computeSalesSummaryTotals,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
