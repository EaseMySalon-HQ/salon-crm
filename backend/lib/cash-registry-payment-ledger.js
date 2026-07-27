'use strict';

/**
 * Cash register totals use checkout `payments` for invoice-day collections and
 * `paymentHistory` for later due settlements. `Sale.addPayment` also appends to
 * `payments`, so checkout helpers subtract paymentHistory card/online/cash first.
 */

function sumPaymentHistoryByMethod(sale, { cash = false, cardOnline = false }) {
  let total = 0;
  (sale.paymentHistory || []).forEach((ph) => {
    if (!ph) return;
    const method = String(ph.method || '').toLowerCase();
    if (cash && method === 'cash') {
      total += Number(ph.amount) || 0;
    } else if (cardOnline && (method === 'card' || method === 'online')) {
      total += Number(ph.amount) || 0;
    }
  });
  return total;
}

function sumPaymentsCardOnline(sale) {
  let total = 0;
  (sale.payments || []).forEach((p) => {
    const mode = p.mode || p.type || '';
    if (mode === 'Card' || mode === 'Online') {
      total += Number(p.amount) || 0;
      return;
    }
    const m = String(mode).toLowerCase();
    if (m.includes('card')) total += Number(p.amount) || 0;
    else if (m.includes('online') || m.includes('upi')) total += Number(p.amount) || 0;
  });
  return total;
}

function sumPaymentsCash(sale) {
  let total = 0;
  (sale.payments || []).forEach((p) => {
    const m = String(p.mode || p.type || '').toLowerCase();
    if (m.includes('cash') && !m.includes('card') && !m.includes('online')) {
      total += Number(p.amount) || 0;
    }
  });
  return total;
}

/** Card/Online collected at checkout (invoice day), excluding due settlements in paymentHistory. */
function checkoutCardOnlineAmount(sale) {
  if (sale.payments && sale.payments.length > 0) {
    const fromPayments = sumPaymentsCardOnline(sale);
    const historyDup = sumPaymentHistoryByMethod(sale, { cardOnline: true });
    return Math.max(0, fromPayments - historyDup);
  }

  const pm = sale.paymentMode || '';
  if (pm === 'Card' || pm === 'Online') {
    const paid =
      typeof sale.paymentStatus?.paidAmount === 'number'
        ? Math.max(0, sale.paymentStatus.paidAmount)
        : Number(sale.netTotal || sale.grossTotal || 0) || 0;
    const historyDup = sumPaymentHistoryByMethod(sale, { cardOnline: true });
    return Math.max(0, paid - historyDup);
  }
  return 0;
}

/** Cash collected at checkout (invoice day), excluding due settlements in paymentHistory. */
function checkoutCashAmount(sale) {
  if (sale.payments && sale.payments.length > 0) {
    const fromPayments = sumPaymentsCash(sale);
    const historyDup = sumPaymentHistoryByMethod(sale, { cash: true });
    return Math.max(0, fromPayments - historyDup);
  }

  const pm = String(sale.paymentMode || '').toLowerCase();
  if (pm.includes('cash') && !pm.includes('card') && !pm.includes('online')) {
    const paid =
      typeof sale.paymentStatus?.paidAmount === 'number'
        ? Math.max(0, sale.paymentStatus.paidAmount)
        : Number(sale.netTotal || sale.grossTotal || 0) || 0;
    const historyDup = sumPaymentHistoryByMethod(sale, { cash: true });
    return Math.max(0, paid - historyDup);
  }
  return 0;
}

function sumPaymentsCardOnlineBreakdown(sale) {
  let card = 0;
  let online = 0;
  (sale.payments || []).forEach((p) => {
    const mode = p.mode || p.type || '';
    const amt = Number(p.amount) || 0;
    if (mode === 'Card') card += amt;
    else if (mode === 'Online') online += amt;
    else {
      const m = String(mode).toLowerCase();
      if (m.includes('card')) card += amt;
      else if (m.includes('online') || m.includes('upi')) online += amt;
    }
  });
  return { card, online };
}

function sumPaymentHistoryCardOnlineBreakdown(sale) {
  let card = 0;
  let online = 0;
  (sale.paymentHistory || []).forEach((ph) => {
    if (!ph) return;
    const method = String(ph.method || '').toLowerCase();
    const amt = Number(ph.amount) || 0;
    if (method === 'card') card += amt;
    else if (method === 'online') online += amt;
  });
  return { card, online };
}

function checkoutCardOnlineBreakdown(sale) {
  if (sale.payments && sale.payments.length > 0) {
    const fromPayments = sumPaymentsCardOnlineBreakdown(sale);
    const historyDup = sumPaymentHistoryCardOnlineBreakdown(sale);
    return {
      card: Math.max(0, fromPayments.card - historyDup.card),
      online: Math.max(0, fromPayments.online - historyDup.online),
    };
  }

  const pm = String(sale.paymentMode || '').toLowerCase();
  const paid =
    typeof sale.paymentStatus?.paidAmount === 'number'
      ? Math.max(0, sale.paymentStatus.paidAmount)
      : Number(sale.netTotal || sale.grossTotal || 0) || 0;
  const historyDup = sumPaymentHistoryCardOnlineBreakdown(sale);
  if (pm.includes('card')) {
    return { card: Math.max(0, paid - historyDup.card - historyDup.online), online: 0 };
  }
  if (pm.includes('online') || pm.includes('upi')) {
    return { card: 0, online: Math.max(0, paid - historyDup.online - historyDup.card) };
  }
  return { card: 0, online: 0 };
}

function paymentHistoryCardOnlineBreakdownInRange(sale, startOfDay, endOfDay) {
  let card = 0;
  let online = 0;
  (sale.paymentHistory || []).forEach((ph) => {
    if (!ph) return;
    const method = String(ph.method || '').toLowerCase();
    const phDate = ph.date ? new Date(ph.date) : null;
    if (!phDate || phDate < startOfDay || phDate >= endOfDay) return;
    const amt = Number(ph.amount) || 0;
    if (method === 'card') card += amt;
    else if (method === 'online') online += amt;
  });
  return { card, online };
}

function paymentHistoryCardOnlineInRange(sale, startOfDay, endOfDay) {
  const b = paymentHistoryCardOnlineBreakdownInRange(sale, startOfDay, endOfDay);
  return b.card + b.online;
}

function paymentHistoryCashInRange(sale, startOfDay, endOfDay) {
  let total = 0;
  (sale.paymentHistory || []).forEach((ph) => {
    if (!ph) return;
    if (String(ph.method || '').toLowerCase() !== 'cash') return;
    const phDate = ph.date ? new Date(ph.date) : null;
    if (phDate && phDate >= startOfDay && phDate < endOfDay) {
      total += Number(ph.amount) || 0;
    }
  });
  return total;
}

module.exports = {
  sumPaymentHistoryByMethod,
  sumPaymentsCardOnline,
  sumPaymentsCash,
  checkoutCardOnlineAmount,
  checkoutCashAmount,
  checkoutCardOnlineBreakdown,
  paymentHistoryCardOnlineInRange,
  paymentHistoryCardOnlineBreakdownInRange,
  paymentHistoryCashInRange,
};
