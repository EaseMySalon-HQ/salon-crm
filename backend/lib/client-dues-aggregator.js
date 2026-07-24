'use strict';

const CANCELLED_SALE_STATUSES = ['cancelled', 'Cancelled'];

/**
 * Sum outstanding bill dues (Sale.paymentStatus.remainingAmount) by customer phone.
 * @returns {Map<string, number>} phone → total dues
 */
async function aggregateDuesByPhone(Sale, branchId) {
  if (!Sale) return new Map();
  const match = {
    status: { $nin: CANCELLED_SALE_STATUSES },
    customerPhone: { $exists: true, $nin: [null, ''] },
    'paymentStatus.remainingAmount': { $gt: 0 },
  };
  if (branchId) match.branchId = branchId;

  const rows = await Sale.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$customerPhone',
        totalDues: { $sum: { $ifNull: ['$paymentStatus.remainingAmount', 0] } },
      },
    },
  ]);

  const out = new Map();
  for (const row of rows) {
    const phone = String(row._id || '').trim();
    const dues = Number(row.totalDues);
    if (phone && Number.isFinite(dues) && dues > 0) {
      out.set(phone, dues);
    }
  }
  return out;
}

function formatDuesAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '0';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

module.exports = { aggregateDuesByPhone, formatDuesAmount, CANCELLED_SALE_STATUSES };
