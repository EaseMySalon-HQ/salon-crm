/** Mirrors backend/lib/payment-redemption-eligibility.js for POS UI. */

export type PaymentRedemptionLine = { type?: string; total?: number }

export type WalletRedemptionFlags = {
  enabled?: boolean
  services?: boolean
  products?: boolean
  packages?: boolean
  memberships?: boolean
}

export type BillingRedemptionSettings = {
  /** When false, no wallet or reward redemption during billing. */
  allowRedemptionInBilling?: boolean
  /** When false, customer may use wallet OR reward points on a bill, not both. */
  allowWalletAndPointsTogether?: boolean
  /** @deprecated Migrated in mergePaymentConfiguration to allowRedemptionInBilling */
  allowWalletAndRewardPoints?: boolean
}

export type PaymentConfiguration = {
  walletRedemption: WalletRedemptionFlags
  rewardPointRedemption: WalletRedemptionFlags
  billingRedemption: BillingRedemptionSettings
}

export const DEFAULT_PAYMENT_CONFIGURATION: PaymentConfiguration = {
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
}

function normalizeBillingRedemption(rawBilling: BillingRedemptionSettings | null | undefined): BillingRedemptionSettings {
  const d = DEFAULT_PAYMENT_CONFIGURATION.billingRedemption
  const r = rawBilling && typeof rawBilling === "object" ? rawBilling : {}
  let allowRedemptionInBilling = r.allowRedemptionInBilling
  if (allowRedemptionInBilling === undefined) {
    if (r.allowWalletAndRewardPoints === false) allowRedemptionInBilling = false
    else allowRedemptionInBilling = true
  } else {
    allowRedemptionInBilling = allowRedemptionInBilling !== false
  }
  let allowWalletAndPointsTogether = r.allowWalletAndPointsTogether
  if (allowWalletAndPointsTogether === undefined) allowWalletAndPointsTogether = true
  else allowWalletAndPointsTogether = allowWalletAndPointsTogether !== false
  return {
    allowRedemptionInBilling,
    allowWalletAndPointsTogether,
  }
}

export function mergePaymentConfiguration(raw: Partial<PaymentConfiguration> | null | undefined): PaymentConfiguration {
  const d = DEFAULT_PAYMENT_CONFIGURATION
  const r = raw && typeof raw === "object" ? raw : {}
  return {
    walletRedemption: { ...d.walletRedemption, ...(r.walletRedemption || {}) },
    rewardPointRedemption: { ...d.rewardPointRedemption, ...(r.rewardPointRedemption || {}) },
    billingRedemption: normalizeBillingRedemption(r.billingRedemption),
  }
}

export function eligibleRedemptionSubtotal(
  items: PaymentRedemptionLine[] | null | undefined,
  config: PaymentConfiguration | Partial<PaymentConfiguration> | null | undefined,
  kind: "wallet" | "reward"
): number {
  const c = mergePaymentConfiguration(config as PaymentConfiguration)
  if (!c.billingRedemption || c.billingRedemption.allowRedemptionInBilling === false) {
    return 0
  }
  const group = kind === "wallet" ? c.walletRedemption : c.rewardPointRedemption
  if (group.enabled === false) {
    return 0
  }
  let sum = 0
  for (const item of items || []) {
    const t = String(item.type || "").toLowerCase()
    if (t === "prepaid_wallet") continue
    let ok = false
    if (t === "service") ok = !!group.services
    else if (t === "product") ok = !!group.products
    else if (t === "package") ok = !!group.packages
    else if (t === "membership") ok = !!group.memberships
    if (ok) sum += Number(item.total) || 0
  }
  return sum
}

export function isMutualExclusiveRedemption(config: PaymentConfiguration | Partial<PaymentConfiguration> | null | undefined): boolean {
  const c = mergePaymentConfiguration(config as PaymentConfiguration)
  return c.billingRedemption.allowWalletAndPointsTogether === false
}

/** Labels for enabled line types in a redemption group (helper text). */
export function enabledRedemptionTypeLabels(group: WalletRedemptionFlags | undefined): string[] {
  if (!group || group.enabled === false) return []
  const labels: string[] = []
  if (group.services) labels.push("Services")
  if (group.products) labels.push("Products")
  if (group.packages) labels.push("Packages")
  if (group.memberships) labels.push("Memberships")
  return labels
}
