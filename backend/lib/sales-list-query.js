/**
 * Shared helpers for GET /api/sales — index-friendly filter, pagination, edit flags.
 */

const { getStartOfDayIST, getEndOfDayIST } = require('../utils/date-utils');

const DEFAULT_LIMIT = 5000;
const MAX_LIMIT = 10000;

/**
 * @param {import('mongoose').Types.ObjectId} branchId
 * @param {string} [dateFrom]
 * @param {string} [dateTo]
 */
function buildSalesListFilter(branchId, dateFrom, dateTo) {
  const query = {
    branchId,
    status: { $nin: ['cancelled', 'Cancelled'] },
  };
  if (dateFrom || dateTo) {
    const dateRange = {};
    if (dateFrom) dateRange.$gte = getStartOfDayIST(dateFrom);
    if (dateTo) dateRange.$lte = getEndOfDayIST(dateTo);
    query.$or = [
      { date: dateRange },
      { paymentHistory: { $elemMatch: { date: dateRange } } },
    ];
  }
  return query;
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
 * Uses indexed { saleId: { $in } } — never global distinct.
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

module.exports = {
  buildSalesListFilter,
  parseSalesListPagination,
  mergeEditedFlagsFromHistory,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
