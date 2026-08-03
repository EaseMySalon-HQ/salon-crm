/**
 * Split tip amounts across Cash / Card / Online proportionally to how the bill was paid.
 * Mirrors lib/tip-payment-allocation.ts for server-side aggregates.
 */

function classifyPaymentModeLabel(mode) {
  const m = String(mode || '').toLowerCase();
  if (!m) return null;
  if (m.includes('card')) return 'card';
  if (m.includes('online') || m.includes('upi')) return 'online';
  if (m.includes('cash')) return 'cash';
  return null;
}

function getSalePaymentAmountsByMode(sale) {
  const amounts = { cash: 0, card: 0, online: 0 };

  const add = (mode, amt) => {
    const bucket = classifyPaymentModeLabel(mode);
    if (bucket && amt > 0.005) amounts[bucket] += amt;
  };

  for (const p of sale.payments || []) {
    add(p.mode || p.type || '', Number(p.amount) || 0);
  }
  for (const ph of sale.paymentHistory || []) {
    add(ph.method || '', Number(ph.amount) || 0);
  }

  const total = amounts.cash + amounts.card + amounts.online;
  if (total > 0.005) return amounts;

  const paid =
    typeof sale.paymentStatus?.paidAmount === 'number' && sale.paymentStatus.paidAmount > 0
      ? sale.paymentStatus.paidAmount
      : Number(sale.grossTotal) || 0;
  const bucket = classifyPaymentModeLabel(sale.paymentMode || '');
  if (bucket && paid > 0.005) amounts[bucket] = paid;
  return amounts;
}

function allocateTipByPaymentModes(sale, tipAmount) {
  if (tipAmount <= 0.005) {
    return { cash: 0, card: 0, online: 0 };
  }

  const explicit = classifyPaymentModeLabel(sale.tipPaymentMode || '');
  if (explicit) {
    return {
      cash: explicit === 'cash' ? tipAmount : 0,
      card: explicit === 'card' ? tipAmount : 0,
      online: explicit === 'online' ? tipAmount : 0,
    };
  }

  const amounts = getSalePaymentAmountsByMode(sale);
  const total = amounts.cash + amounts.card + amounts.online;
  if (total <= 0.005) {
    return { cash: 0, card: 0, online: 0 };
  }
  return {
    cash: (tipAmount * amounts.cash) / total,
    card: (tipAmount * amounts.card) / total,
    online: (tipAmount * amounts.online) / total,
  };
}

module.exports = {
  classifyPaymentModeLabel,
  getSalePaymentAmountsByMode,
  allocateTipByPaymentModes,
};
