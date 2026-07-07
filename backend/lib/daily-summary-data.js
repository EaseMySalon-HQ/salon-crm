'use strict';

const { billChangeCreditedToWalletCashAddition } = require('../utils/bill-change-wallet-cash');
const {
  getStartOfDayIST,
  getEndOfDayIST,
  toDateStringIST,
  formatInIST,
} = require('../utils/date-utils');

function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function sumSalePaymentsByMode(salesInRange) {
  let cash = 0;
  let online = 0;
  let card = 0;

  salesInRange.forEach((s) => {
    let cashAmt = 0;
    let isAllCash = false;
    if (s.payments && s.payments.length) {
      s.payments.forEach((p) => {
        const amt = p.amount || 0;
        const mode = String(p.mode || '').toLowerCase();
        if (mode === 'cash') {
          cash += amt;
          cashAmt += amt;
        } else if (mode === 'online') online += amt;
        else if (mode === 'card') card += amt;
      });
      const hasNonCash = (s.payments || []).some((p) => {
        const m = String(p.mode || '').toLowerCase();
        return m === 'card' || m === 'online' || m === 'wallet' || m === 'reward point' || m === 'reward';
      });
      isAllCash = cashAmt > 0 && !hasNonCash;
    } else {
      const amt = s.grossTotal || s.netTotal || 0;
      const pm = String(s.paymentMode || '').toLowerCase();
      if (pm === 'cash') {
        cash += amt;
        cashAmt = amt;
        isAllCash = true;
      } else if (pm === 'online') online += amt;
      else if (pm === 'card') card += amt;
    }
    const walletCashAdd = billChangeCreditedToWalletCashAddition(s);
    cash += walletCashAdd;
    cashAmt += walletCashAdd;
    if (isAllCash && (s.tip || 0) > 0) cash -= s.tip || 0;
  });

  return { cash: round2(cash), online: round2(online), card: round2(card) };
}

function sumRevenueByCategory(salesInRange) {
  const out = { services: 0, products: 0, packages: 0, membership: 0, prepaid: 0 };
  salesInRange.forEach((s) => {
    (s.items || []).forEach((item) => {
      const amt =
        Number(item.total) ||
        Number(item.lineTotal) ||
        (Number(item.price) || 0) * (Number(item.quantity) || 1) ||
        0;
      const type = String(item.type || '').toLowerCase();
      if (type === 'service') out.services += amt;
      else if (type === 'product') out.products += amt;
      else if (type === 'package') out.packages += amt;
      else if (type === 'membership') out.membership += amt;
      else if (type === 'prepaid_wallet' || type === 'prepaid') out.prepaid += amt;
    });
  });
  return {
    services: round2(out.services),
    products: round2(out.products),
    packages: round2(out.packages),
    membership: round2(out.membership),
    prepaid: round2(out.prepaid),
  };
}

function sumDuesCollected(sales, dateFrom, dateTo) {
  let duesCollected = 0;
  sales.forEach((s) => {
    (s.paymentHistory || []).forEach((ph) => {
      const d = ph.date ? new Date(ph.date) : null;
      if (d && d >= dateFrom && d <= dateTo) duesCollected += ph.amount || 0;
    });
  });
  return round2(duesCollected);
}

function netRevenueFromSales(salesInRange) {
  return round2(
    salesInRange.reduce((sum, s) => sum + (s.netTotal ?? s.grossTotal ?? s.totalAmount ?? 0), 0)
  );
}

function grossRevenueFromSales(salesInRange) {
  return round2(
    salesInRange.reduce((sum, s) => sum + (s.grossTotal ?? s.totalAmount ?? s.netTotal ?? 0), 0)
  );
}

function filterSalesInInvoiceRange(sales, dateFrom, dateTo) {
  return sales.filter((s) => {
    const d = s.date ? new Date(s.date) : null;
    return d && d >= dateFrom && d <= dateTo;
  });
}

async function countAppointmentsForDay(Appointment, branchId, ymd) {
  if (!Appointment) return 0;
  return Appointment.countDocuments({
    branchId,
    date: ymd,
    status: { $nin: ['cancelled', 'cancelled_at_billing', 'missed'] },
  });
}

async function countCancelledBills(Sale, branchId, dateFrom, dateTo) {
  return Sale.countDocuments({
    branchId,
    date: { $gte: dateFrom, $lte: dateTo },
    status: { $in: ['cancelled', 'Cancelled'] },
  });
}

async function countFeedbackForDay(Feedback, branchId, dateFrom, dateTo) {
  if (!Feedback) return 0;
  return Feedback.countDocuments({
    branchId,
    submittedAt: { $gte: dateFrom, $lte: dateTo },
  });
}

async function countConsentEventsForDay(ClientConsentEvent, branchId, dateFrom, dateTo) {
  if (!ClientConsentEvent) return 0;
  return ClientConsentEvent.countDocuments({
    branchId,
    createdAt: { $gte: dateFrom, $lte: dateTo },
  });
}

async function netRevenueForRange(Sale, branchId, dateFrom, dateTo) {
  const sales = await Sale.find({
    branchId,
    date: { $gte: dateFrom, $lte: dateTo },
    status: { $nin: ['cancelled', 'Cancelled'] },
  })
    .select('netTotal grossTotal totalAmount')
    .lean();
  return netRevenueFromSales(sales);
}

/**
 * Build all metrics for the daily summary email for one branch and calendar day (IST).
 *
 * @param {object} businessModels
 * @param {string|import('mongoose').Types.ObjectId} branchId
 * @param {Date|string} targetDate - YYYY-MM-DD or Date
 * @param {{ branchName?: string }} [options]
 */
async function buildDailySummaryData(businessModels, branchId, targetDate, options = {}) {
  const {
    Sale,
    Receipt,
    CashRegistry,
    Expense,
    Appointment,
    Feedback,
    ClientConsentEvent,
  } = businessModels;

  const ymd =
    typeof targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)
      ? targetDate
      : toDateStringIST(targetDate);

  const dateFrom = getStartOfDayIST(ymd);
  const dateTo = getEndOfDayIST(ymd);
  const dateFormatted = formatInIST(dateFrom, { day: 'numeric', month: 'long', year: 'numeric' });

  const invoiceDateRange = { $gte: dateFrom, $lte: dateTo };
  const sales = await Sale.find({
    branchId,
    status: { $nin: ['cancelled', 'Cancelled'] },
    $or: [{ date: invoiceDateRange }, { paymentHistory: { $elemMatch: { date: invoiceDateRange } } }],
  }).lean();

  const salesInRange = filterSalesInInvoiceRange(sales, dateFrom, dateTo);
  const todayBills = salesInRange.length;
  const todayNetRevenue = netRevenueFromSales(salesInRange);
  const todayGrossRevenue = grossRevenueFromSales(salesInRange);
  const revenueByCategory = sumRevenueByCategory(salesInRange);
  const paymentMode = sumSalePaymentsByMode(salesInRange);
  const averageBillValue = todayBills > 0 ? round2(todayNetRevenue / todayBills) : 0;

  const receipts = await Receipt.find({
    branchId,
    date: { $gte: ymd, $lte: toDateStringIST(new Date(dateTo.getTime() + 1)) },
  }).lean();

  const closingRegistry = await CashRegistry.findOne({
    branchId,
    date: { $gte: dateFrom, $lte: dateTo },
    shiftType: 'closing',
  })
    .sort({ date: -1 })
    .lean();

  const cashExpenses = await Expense.find({
    branchId,
    date: { $gte: dateFrom, $lte: dateTo },
    paymentMode: 'Cash',
    status: { $in: ['approved', 'pending'] },
  }).lean();

  const duesCollected = sumDuesCollected(sales, dateFrom, dateTo);
  const cashExpense = round2(cashExpenses.reduce((sum, e) => sum + (e.amount || 0), 0));
  const tipFromSales = salesInRange.reduce((sum, s) => sum + (s.tip || 0), 0);
  const tipFromReceipts = receipts.reduce((sum, r) => sum + (r.tip || 0), 0);
  const tipCollected = round2(tipFromSales + tipFromReceipts);
  const cashBalance = round2(closingRegistry?.cashBalance ?? 0);

  const [todayAppointments, todayCancelledBills, feedbackReceived, consentFormReceived] =
    await Promise.all([
      countAppointmentsForDay(Appointment, branchId, ymd),
      countCancelledBills(Sale, branchId, dateFrom, dateTo),
      countFeedbackForDay(Feedback, branchId, dateFrom, dateTo),
      countConsentEventsForDay(ClientConsentEvent, branchId, dateFrom, dateTo),
    ]);

  // Yesterday (IST)
  const yesterdayStart = new Date(dateFrom.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayYmd = toDateStringIST(yesterdayStart);
  const yesterdayFrom = getStartOfDayIST(yesterdayYmd);
  const yesterdayTo = getEndOfDayIST(yesterdayYmd);
  const yesterdayNetRevenue = await netRevenueForRange(Sale, branchId, yesterdayFrom, yesterdayTo);

  // Trailing 7 calendar days before today (not including today)
  const trailingDays = [];
  for (let i = 1; i <= 7; i += 1) {
    const d = new Date(dateFrom.getTime() - i * 24 * 60 * 60 * 1000);
    trailingDays.push(toDateStringIST(d));
  }
  let trailingSum = 0;
  for (const dayYmd of trailingDays) {
    const from = getStartOfDayIST(dayYmd);
    const to = getEndOfDayIST(dayYmd);
    trailingSum += await netRevenueForRange(Sale, branchId, from, to);
  }
  const last7DayAvgRevenue = round2(trailingSum / 7);

  // Month to date (IST calendar month)
  const monthStartYmd = `${ymd.slice(0, 7)}-01`;
  const monthFrom = getStartOfDayIST(monthStartYmd);
  const monthSales = await Sale.find({
    branchId,
    date: { $gte: monthFrom, $lte: dateTo },
    status: { $nin: ['cancelled', 'Cancelled'] },
  })
    .select('netTotal grossTotal totalAmount')
    .lean();
  const monthToDateRevenue = netRevenueFromSales(monthSales);
  const monthToDateBills = monthSales.length;

  return {
    branchId: String(branchId),
    branchName: options.branchName || '',
    date: ymd,
    dateFormatted,
    todayBills,
    todayAppointments,
    todayCancelledBills,
    todayNetRevenue,
    todayGrossRevenue,
    revenueByCategory,
    paymentMode,
    averageBillValue,
    duesCollected,
    cashExpense,
    tipCollected,
    cashBalance,
    feedbackReceived,
    consentFormReceived,
    yesterdayNetRevenue,
    last7DayAvgRevenue,
    monthToDateRevenue,
    monthToDateBills,
  };
}

module.exports = {
  buildDailySummaryData,
  /** exported for tests */
  generateInsightInputsFromData: (data) => ({
    todayNetRevenue: data.todayNetRevenue,
    last7DayAvgRevenue: data.last7DayAvgRevenue,
    todayAppointments: data.todayAppointments,
    todayBills: data.todayBills,
  }),
};
