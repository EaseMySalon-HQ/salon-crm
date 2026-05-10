/**
 * Cash handed over at POS but credited to prepaid wallet (`billChangeCreditedToWallet`).
 * Add to cash-register totals only — bill revenue stays on service/product totals.
 */
export function billChangeCreditedToWalletCashAddition(sale: {
  billChangeCreditedToWallet?: unknown
} | null | undefined): number {
  const n = Number(sale?.billChangeCreditedToWallet)
  return Number.isFinite(n) && n > 0 ? n : 0
}
