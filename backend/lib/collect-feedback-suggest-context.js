'use strict';

const mongoose = require('mongoose');

/**
 * Deduplicated **service** names from this client's prior completed bills (same tenant Sale model).
 * Omits the current sale. Walk-in / unidentified clients return [].
 */
async function loadPastCompletedServiceNamesForClient(SaleModel, { customerId, excludeSaleId }) {
  const maxSalesScanned = Number(process.env.FEEDBACK_SUGGEST_PAST_SALES_SCAN) || 24;
  const maxNames = Number(process.env.FEEDBACK_SUGGEST_PAST_SERVICE_NAMES_MAX) || 40;

  if (!customerId || !mongoose.Types.ObjectId.isValid(String(customerId))) {
    return [];
  }

  const cid = new mongoose.Types.ObjectId(String(customerId));
  const exclude = excludeSaleId && mongoose.Types.ObjectId.isValid(String(excludeSaleId))
    ? new mongoose.Types.ObjectId(String(excludeSaleId))
    : null;

  const since = new Date();
  since.setFullYear(since.getFullYear() - 2);

  const q = {
    customerId: cid,
    date: { $gte: since },
    $or: [{ status: 'completed' }, { status: 'Completed' }],
  };
  if (exclude) q._id = { $ne: exclude };

  const sales = await SaleModel.find(q).sort({ date: -1 }).limit(maxSalesScanned).select({ items: 1 }).lean();

  const out = [];
  const seen = new Set();
  for (const s of sales) {
    const items = Array.isArray(s.items) ? s.items : [];
    for (const it of items) {
      const ty = String(it.type || '').toLowerCase();
      if (ty !== 'service') continue;
      const n = String(it.name || '').replace(/\s+/g, ' ').trim();
      const key = n.toLowerCase();
      if (!n || seen.has(key)) continue;
      seen.add(key);
      out.push(n);
      if (out.length >= maxNames) return out;
    }
  }
  return out;
}

module.exports = { loadPastCompletedServiceNamesForClient };
