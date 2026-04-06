/**
 * Unpaid / Part-Paid report: unpaid + part-paid bills, plus fully paid bills only when at least one
 * payment was recorded in paymentHistory (due collection or bill-edit) — not checkout-only full pay.
 * Date filter (when set): invoice date in range OR a paymentHistory entry in range.
 * Each row includes duesSettledInPeriod = sum of paymentHistory in the selected date range (or all history if no range).
 */

/**
 * API sends IST bounds from the client (e.g. 2026-04-05T00:00:00+05:30). Do NOT use only YYYY-MM-DD
 * with UTC midnight — that mis-classifies IST invoice dates (e.g. 6 Apr IST stored as 5 Apr UTC).
 */
function parseDateRangeBounds(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return { rangeStart: null, rangeEnd: null };
  let ds = String(dateFrom).trim();
  let de = String(dateTo).trim();
  if (ds.includes(' ') && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(ds)) {
    ds = ds.replace(' ', '+');
    de = de.replace(' ', '+');
  }
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  let rangeStart;
  let rangeEnd;
  if (dateOnly.test(ds) && dateOnly.test(de)) {
    rangeStart = new Date(`${ds}T00:00:00+05:30`);
    rangeEnd = new Date(`${de}T23:59:59.999+05:30`);
  } else {
    rangeStart = new Date(ds);
    rangeEnd = new Date(de);
  }
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
    return { rangeStart: null, rangeEnd: null };
  }
  return { rangeStart, rangeEnd };
}

function sumPaymentHistoryInRange(s, rangeStart, rangeEnd) {
  let sum = 0;
  (s.paymentHistory || []).forEach((ph) => {
    const d = ph.date ? new Date(ph.date) : null;
    if (!d || Number.isNaN(d.getTime())) return;
    if (rangeStart && rangeEnd) {
      if (d >= rangeStart && d <= rangeEnd) sum += ph.amount || 0;
    } else {
      sum += ph.amount || 0;
    }
  });
  return sum;
}

function rowFromSale(s, { rangeStart, rangeEnd, thirtyDaysAgo }) {
  const totalAmount = s.paymentStatus?.totalAmount ?? s.grossTotal ?? 0;
  const paidAmount = s.paymentStatus?.paidAmount ?? 0;
  const remainingAmount = s.paymentStatus?.remainingAmount ?? Math.max(0, totalAmount - paidAmount);
  const duesSettledInPeriod = sumPaymentHistoryInRange(s, rangeStart, rangeEnd);
  const dueDate = s.paymentStatus?.dueDate ? new Date(s.paymentStatus.dueDate) : null;
  const isOverdue = dueDate && dueDate < thirtyDaysAgo && remainingAmount > 0;
  let statusLabel = 'Unpaid';
  if (paidAmount >= totalAmount) statusLabel = 'Full Paid';
  else if (paidAmount > 0) statusLabel = 'Part Paid';
  else if (isOverdue) statusLabel = 'Overdue';
  else statusLabel = 'Unpaid';
  if (!isOverdue && paidAmount < totalAmount && dueDate && dueDate < thirtyDaysAgo) statusLabel = 'Overdue';
  return {
    id: s._id,
    billNo: s.billNo,
    customerName: s.customerName || '—',
    customerPhone: s.customerPhone || '',
    date: s.date,
    invoiceAmount: totalAmount,
    outstandingAmount: remainingAmount,
    duesSettledInPeriod,
    status: statusLabel
  };
}

/**
 * @param {object} opts
 * @param {import('mongoose').Model} opts.Sale
 * @param {import('mongoose').Types.ObjectId} [opts.branchId]
 * @param {string} [opts.dateFrom]
 * @param {string} [opts.dateTo]
 * @param {string} [opts.status] all | unpaid | part_paid | overdue
 */
async function fetchUnpaidPartPaidReportData({ Sale, branchId, dateFrom, dateTo, status }) {
  const st = String(status || 'all').toLowerCase();
  const effectiveStatus = st === 'dues_settled' ? 'all' : st;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { rangeStart, rangeEnd } =
    dateFrom && dateTo ? parseDateRangeBounds(dateFrom, dateTo) : { rangeStart: null, rangeEnd: null };

  const baseOpts = { rangeStart, rangeEnd, thirtyDaysAgo };

  const paidLtTotalExpr = {
    $lt: [
      { $ifNull: ['$paymentStatus.paidAmount', 0] },
      { $ifNull: ['$paymentStatus.totalAmount', 999999999] }
    ]
  };

  const paidGteTotalExpr = {
    $gte: [
      { $ifNull: ['$paymentStatus.paidAmount', 0] },
      { $ifNull: ['$paymentStatus.totalAmount', 0] }
    ]
  };

  const unpaidQuery = {
    status: { $nin: ['cancelled', 'Cancelled'] },
    ...(branchId ? { branchId } : {}),
  };

  if (!effectiveStatus || effectiveStatus === 'all') {
    /** Full paid only if paymentHistory has entries (due collection / bill edit); checkout-only has no history. */
    unpaidQuery.$or = [{ $expr: paidLtTotalExpr }, { $and: [{ 'paymentHistory.0': { $exists: true } }, { $expr: paidGteTotalExpr }] }];
  } else if (effectiveStatus === 'unpaid') {
    unpaidQuery.$expr = paidLtTotalExpr;
    unpaidQuery['paymentStatus.paidAmount'] = 0;
  } else if (effectiveStatus === 'part_paid') {
    unpaidQuery.$expr = paidLtTotalExpr;
    unpaidQuery['paymentStatus.paidAmount'] = { $gt: 0 };
  } else if (effectiveStatus === 'overdue') {
    unpaidQuery.$and = [
      { 'paymentStatus.dueDate': { $lt: thirtyDaysAgo } },
      {
        $or: [
          { 'paymentStatus.remainingAmount': { $gt: 0 } },
          { $expr: { $lt: ['$paymentStatus.paidAmount', '$paymentStatus.totalAmount'] } }
        ]
      }
    ];
  } else {
    unpaidQuery.$or = [{ $expr: paidLtTotalExpr }, { $and: [{ 'paymentHistory.0': { $exists: true } }, { $expr: paidGteTotalExpr }] }];
  }
  if (rangeStart && rangeEnd) {
    const dateOrDuePaymentInRange = {
      $or: [
        { date: { $gte: rangeStart, $lte: rangeEnd } },
        { paymentHistory: { $elemMatch: { date: { $gte: rangeStart, $lte: rangeEnd } } } }
      ]
    };
    if (unpaidQuery.$and) {
      unpaidQuery.$and.push(dateOrDuePaymentInRange);
    } else {
      unpaidQuery.$and = [dateOrDuePaymentInRange];
    }
  }

  const unpaidSales = await Sale.find(unpaidQuery).sort({ date: -1 }).limit(5000).lean();

  const rows = unpaidSales.map((s) => rowFromSale(s, baseOpts));
  const totalOutstanding = rows.reduce((sum, r) => sum + (r.outstandingAmount || 0), 0);
  const totalDuesSettled = rows.reduce((sum, r) => sum + (r.duesSettledInPeriod || 0), 0);

  return {
    rows,
    summary: {
      count: rows.length,
      totalOutstanding,
      totalDuesSettled
    }
  };
}

module.exports = {
  fetchUnpaidPartPaidReportData,
  sumPaymentHistoryInRange,
  rowFromSale
};
