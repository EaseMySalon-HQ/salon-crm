const { getStartOfDayIST, getEndOfDayIST } = require('./date-utils');

/**
 * Closing rows are often saved with openingBalance: 0 from the client modal; the real opening
 * is on the same-day opening shift. Use that for expected cash = opening + collected - expenses.
 *
 * @param {object} opts
 * @param {import('mongoose').Model} opts.CashRegistry
 * @param {import('mongoose').Types.ObjectId|string} opts.branchId
 * @param {Date|string} opts.registryDate
 * @param {number} [opts.closingDocFallback]
 */
async function resolveOpeningBalanceForRegistryDay({
  CashRegistry,
  branchId,
  registryDate,
  closingDocFallback = 0,
}) {
  if (!CashRegistry) return Number(closingDocFallback) || 0;
  const startOfDay = getStartOfDayIST(registryDate);
  const endOfDay = getEndOfDayIST(registryDate);

  const openingRow = await CashRegistry.findOne({
    branchId,
    shiftType: 'opening',
    date: { $gte: startOfDay, $lt: endOfDay },
  })
    .sort({ createdAt: 1 })
    .select('openingBalance')
    .lean();

  if (openingRow && openingRow.openingBalance != null) {
    return Number(openingRow.openingBalance) || 0;
  }
  return Number(closingDocFallback) || 0;
}

/**
 * Same cash-in / cash-out rules as POST /api/cash-registry (closing).
 * Keeps verify and UI summaries aligned when new sales land after the closing doc was saved.
 *
 * @param {object} opts
 * @param {import('mongoose').Model} opts.Sale
 * @param {import('mongoose').Model} opts.Expense
 * @param {import('mongoose').Types.ObjectId|string} opts.branchId
 * @param {Date|string} opts.registryDate - Cash registry row date
 * @returns {Promise<{ cashCollected: number, expenseValue: number }>}
 */
async function computeDayCashLedger({ Sale, Expense, branchId, registryDate }) {
  const startOfDay = getStartOfDayIST(registryDate);
  const endOfDay = getEndOfDayIST(registryDate);

  const salesToday = await Sale.find({
    branchId,
    date: { $gte: startOfDay, $lt: endOfDay },
    status: { $nin: ['cancelled', 'Cancelled'] },
  }).lean();

  const salesWithDuesToday = await Sale.find({
    branchId,
    paymentHistory: {
      $elemMatch: {
        date: { $gte: startOfDay, $lt: endOfDay },
        method: 'Cash',
      },
    },
    status: { $nin: ['cancelled', 'Cancelled'] },
  }).lean();

  let cashFromNewBills = 0;
  salesToday.forEach((sale) => {
    let cashAmt = 0;
    let isAllCash = false;
    if (sale.payments && sale.payments.length > 0) {
      sale.payments.forEach((p) => {
        const m = (p.mode || p.type || '').toLowerCase();
        if (m.includes('cash')) cashAmt += p.amount || 0;
      });
      const hasNonCash = (sale.payments || []).some((p) => {
        const m = (p.mode || p.type || '').toLowerCase();
        return m.includes('card') || m.includes('online') || m.includes('upi');
      });
      isAllCash = cashAmt > 0 && !hasNonCash;
    } else {
      const pm = (sale.paymentMode || '').toLowerCase();
      if (pm.includes('cash') && !pm.includes('card') && !pm.includes('online')) {
        cashAmt = sale.netTotal || sale.grossTotal || 0;
        isAllCash = true;
      }
    }
    const tip = sale.tip || 0;
    cashFromNewBills += cashAmt - (isAllCash ? tip : 0);
  });

  let cashFromDueCollected = 0;
  salesWithDuesToday.forEach((sale) => {
    (sale.paymentHistory || []).forEach((ph) => {
      if (!ph || (ph.method || '').toLowerCase() !== 'cash') return;
      const phDate = ph.date ? new Date(ph.date) : null;
      if (phDate && phDate >= startOfDay && phDate < endOfDay) {
        cashFromDueCollected += ph.amount || 0;
      }
    });
  });

  const cashCollected = cashFromNewBills + cashFromDueCollected;

  const expenses = await Expense.find({
    ...(branchId && { branchId }),
    date: { $gte: startOfDay, $lt: endOfDay },
    paymentMode: 'Cash',
    status: { $in: ['approved', 'pending'] },
  });

  const expenseValue = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  return { cashCollected, expenseValue };
}

module.exports = { computeDayCashLedger, resolveOpeningBalanceForRegistryDay };
