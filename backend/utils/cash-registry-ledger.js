const { getStartOfDayIST, getEndOfDayIST } = require('./date-utils');
const { billChangeCreditedToWalletCashAddition } = require('./bill-change-wallet-cash');
const {
  checkoutCardOnlineAmount,
  checkoutCashAmount,
  paymentHistoryCardOnlineInRange,
  paymentHistoryCashInRange,
} = require('../lib/cash-registry-payment-ledger');

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
    let cashAmt = checkoutCashAmount(sale);
    let isAllCash = false;
    if (sale.payments && sale.payments.length > 0) {
      const hasNonCash = (sale.payments || []).some((p) => {
        const m = (p.mode || p.type || '').toLowerCase();
        return m.includes('card') || m.includes('online') || m.includes('upi');
      });
      isAllCash = cashAmt > 0 && !hasNonCash;
    } else if (cashAmt > 0.005) {
      isAllCash = true;
    }
    cashAmt += billChangeCreditedToWalletCashAddition(sale);
    const tip = sale.tip || 0;
    cashFromNewBills += cashAmt - (isAllCash ? tip : 0);
  });

  let cashFromDueCollected = 0;
  salesWithDuesToday.forEach((sale) => {
    cashFromDueCollected += paymentHistoryCashInRange(sale, startOfDay, endOfDay);
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

/**
 * Cash movements for drawer reconciliation (not expenses).
 *
 * @param {object} opts
 * @param {import('mongoose').Model} opts.CashMovement
 * @param {import('mongoose').Types.ObjectId|string} opts.branchId
 * @param {Date|string} opts.registryDate
 * @returns {Promise<{ cashIn: number, cashOut: number }>}
 */
async function computeDayCashMovements({ CashMovement, branchId, registryDate }) {
  if (!CashMovement) return { cashIn: 0, cashOut: 0 };
  const startOfDay = getStartOfDayIST(registryDate);
  const endOfDay = getEndOfDayIST(registryDate);

  const movements = await CashMovement.find({
    branchId,
    date: { $gte: startOfDay, $lt: endOfDay },
    status: 'active',
  }).lean();

  let cashIn = 0;
  let cashOut = 0;
  movements.forEach((m) => {
    const amt = Number(m.amount) || 0;
    if (m.direction === 'in') cashIn += amt;
    else cashOut += amt;
  });
  return { cashIn, cashOut };
}

/**
 * Expected physical cash in drawer for reconciliation.
 */
function computeExpectedCashBalance({
  opening = 0,
  cashCollected = 0,
  expenseValue = 0,
  cashIn = 0,
  cashOut = 0,
}) {
  return (
    Number(opening) +
    Number(cashCollected) -
    Number(expenseValue) +
    Number(cashIn) -
    Number(cashOut)
  );
}

/**
 * Card + Online totals for one IST calendar day — aligned with cash-registry-report
 * getEntryOnlineSales (invoice-day Card/Online + paymentHistory Card/Online on payment date).
 *
 * @param {object} opts
 * @param {import('mongoose').Model} opts.Sale
 * @param {import('mongoose').Types.ObjectId|string} opts.branchId
 * @param {Date|string} opts.registryDate
 * @returns {Promise<number>}
 */
async function computeDayOnlineSales({ Sale, branchId, registryDate }) {
  if (!Sale) return 0;
  const startOfDay = getStartOfDayIST(registryDate);
  const endOfDay = getEndOfDayIST(registryDate);

  const salesToday = await Sale.find({
    branchId,
    date: { $gte: startOfDay, $lt: endOfDay },
    status: { $nin: ['cancelled', 'Cancelled'] },
  }).lean();

  const salesWithOnlineDuesToday = await Sale.find({
    branchId,
    paymentHistory: {
      $elemMatch: {
        date: { $gte: startOfDay, $lt: endOfDay },
      },
    },
    status: { $nin: ['cancelled', 'Cancelled'] },
  }).lean();

  let total = 0;
  const todayIds = new Set(salesToday.map((s) => s._id.toString()));

  salesToday.forEach((sale) => {
    total += checkoutCardOnlineAmount(sale);
    total += paymentHistoryCardOnlineInRange(sale, startOfDay, endOfDay);
  });

  salesWithOnlineDuesToday.forEach((sale) => {
    if (!todayIds.has(sale._id.toString())) {
      total += paymentHistoryCardOnlineInRange(sale, startOfDay, endOfDay);
    }
  });

  return total;
}

module.exports = {
  computeDayCashLedger,
  computeDayCashMovements,
  computeExpectedCashBalance,
  computeDayOnlineSales,
  resolveOpeningBalanceForRegistryDay,
};
