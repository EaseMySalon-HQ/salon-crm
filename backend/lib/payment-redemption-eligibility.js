/**
 * Per-salon redemption caps: which line types (Sale.items) wallet / reward points may apply to.
 * prepaid_wallet lines are excluded (purchase of credit, not a redeemable basket line).
 */

const DEFAULT_PAYMENT_CONFIGURATION = {
  walletRedemption: {
    enabled: true,
    services: true,
    products: true,
    packages: true,
    memberships: true,
  },
  rewardPointRedemption: {
    enabled: true,
    services: true,
    products: true,
    packages: true,
    memberships: true,
  },
  billingRedemption: {
    allowRedemptionInBilling: true,
    allowWalletAndPointsTogether: true,
  },
};

/** Normalize billing flags; migrate legacy `allowWalletAndRewardPoints`. */
function normalizeBillingRedemption(rawBilling) {
  const d = DEFAULT_PAYMENT_CONFIGURATION.billingRedemption;
  const r = rawBilling && typeof rawBilling === "object" ? rawBilling : {};
  let allowRedemptionInBilling = r.allowRedemptionInBilling;
  if (allowRedemptionInBilling === undefined) {
    if (r.allowWalletAndRewardPoints === false) allowRedemptionInBilling = false;
    else allowRedemptionInBilling = true;
  } else {
    allowRedemptionInBilling = allowRedemptionInBilling !== false;
  }
  let allowWalletAndPointsTogether = r.allowWalletAndPointsTogether;
  if (allowWalletAndPointsTogether === undefined) allowWalletAndPointsTogether = true;
  else allowWalletAndPointsTogether = allowWalletAndPointsTogether !== false;
  return {
    allowRedemptionInBilling,
    allowWalletAndPointsTogether,
  };
}

function mergePaymentConfiguration(raw) {
  const d = DEFAULT_PAYMENT_CONFIGURATION;
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    walletRedemption: { ...d.walletRedemption, ...(r.walletRedemption || {}) },
    rewardPointRedemption: { ...d.rewardPointRedemption, ...(r.rewardPointRedemption || {}) },
    billingRedemption: normalizeBillingRedemption(r.billingRedemption),
  };
}

/**
 * @param {Array<{ type?: string, total?: number }>} items
 * @param {object} config merged or raw paymentConfiguration
 * @param {'wallet'|'reward'} kind
 */
function eligibleRedemptionSubtotal(items, config, kind) {
  const c = mergePaymentConfiguration(config);
  if (!c.billingRedemption || c.billingRedemption.allowRedemptionInBilling === false) {
    return 0;
  }
  const group = kind === "wallet" ? c.walletRedemption : c.rewardPointRedemption;
  if (!group || group.enabled === false) {
    return 0;
  }
  let sum = 0;
  for (const item of items || []) {
    const t = String(item.type || "").toLowerCase();
    if (t === "prepaid_wallet") continue;
    let ok = false;
    if (t === "service") ok = !!group.services;
    else if (t === "product") ok = !!group.products;
    else if (t === "package") ok = !!group.packages;
    else if (t === "membership") ok = !!group.memberships;
    if (ok) sum += Number(item.total) || 0;
  }
  return sum;
}

/** Sum amounts where payment mode is Wallet (case-insensitive). */
function sumWalletPayments(payments) {
  let w = 0;
  for (const p of payments || []) {
    const mode = String(p.mode || p.type || "").toLowerCase();
    if (mode === "wallet") w += Number(p.amount) || 0;
  }
  return w;
}

/** True when sale cannot use wallet and reward redemption on the same bill. */
function isMutualExclusiveRedemption(config) {
  const c = mergePaymentConfiguration(config);
  return c.billingRedemption.allowWalletAndPointsTogether === false;
}

module.exports = {
  DEFAULT_PAYMENT_CONFIGURATION,
  mergePaymentConfiguration,
  eligibleRedemptionSubtotal,
  sumWalletPayments,
  isMutualExclusiveRedemption,
};
